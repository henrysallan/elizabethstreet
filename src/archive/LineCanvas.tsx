'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useControls, button } from 'leva';

interface ActiveLine {
  startX: number;
  startY: number;
  angle: number;
  targetLength: number;
  currentLength: number;
  prevX: number;
  prevY: number;
}

export default function LineCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const startTimeRef = useRef<number | null>(null);
  const activeLineRef = useRef<ActiveLine | null>(null);
  const letterPixelsRef = useRef<{ x: number; y: number }[]>([]);
  const isRunningRef = useRef(false);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const controls = useControls('Line Drawing', {
    lineLength: { value: 80, min: 10, max: 500, step: 1, label: 'Line Length' },
    speed: { value: 2, min: 0.1, max: 20, step: 0.1, label: 'Speed (px/frame)' },
    duration: { value: 15, min: 1, max: 120, step: 1, label: 'Duration (s)' },
    branchMin: { value: 0.3, min: 0, max: 1, step: 0.01, label: 'Branch Point Min' },
    branchMax: { value: 0.8, min: 0, max: 1, step: 0.01, label: 'Branch Point Max' },
  });

  const controlsRef = useRef(controls);
  controlsRef.current = controls;

  /** Render text to an offscreen canvas and collect all pixels inside the letter paths. */
  const sampleLetterPixels = useCallback(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const offCtx = offscreen.getContext('2d')!;

    // Query the actual DOM elements so the offscreen text matches the visible text exactly.
    const h1 = document.querySelector('h1');
    const emailLink = document.querySelector('a[href^="mailto:"]');

    if (h1) {
      const rect = h1.getBoundingClientRect();
      const cs = getComputedStyle(h1);
      offCtx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      offCtx.fillStyle = 'black';
      offCtx.textBaseline = 'top';
      offCtx.textAlign = 'center';
      offCtx.fillText(h1.textContent || '', rect.left + rect.width / 2, rect.top);
    }

    if (emailLink) {
      const rect = emailLink.getBoundingClientRect();
      const cs = getComputedStyle(emailLink);
      offCtx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      offCtx.fillStyle = 'black';
      offCtx.textBaseline = 'top';
      offCtx.textAlign = 'center';
      offCtx.fillText(emailLink.textContent || '', rect.left + rect.width / 2, rect.top);
    }

    // Walk every pixel; alpha > 128 ⇒ inside a letter glyph.
    const imageData = offCtx.getImageData(0, 0, width, height);
    const pixels: { x: number; y: number }[] = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (imageData.data[i + 3] > 128) {
          pixels.push({ x, y });
        }
      }
    }

    letterPixelsRef.current = pixels;
  }, []);

  /** (Re)start the whole animation from scratch. */
  const startAnimation = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Cancel anything already running.
    isRunningRef.current = false;
    cancelAnimationFrame(animationRef.current);

    // Size the canvas to the viewport (retina-aware).
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctxRef.current = ctx;

    // Clear.
    ctx.clearRect(0, 0, width, height);

    // Line style.
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.5;
    ctx.lineCap = 'round';

    // Build the pixel lookup table.
    sampleLetterPixels();

    if (letterPixelsRef.current.length === 0) {
      console.warn('No letter pixels found – is the text visible?');
      return;
    }

    // Reset state.
    startTimeRef.current = null;
    activeLineRef.current = null;
    isRunningRef.current = true;

    /* ---- helpers ---- */

    function randomLetterPixel() {
      const px = letterPixelsRef.current;
      return px[Math.floor(Math.random() * px.length)];
    }

    function createLine(sx: number, sy: number) {
      const angle = Math.random() * Math.PI * 2;
      const { lineLength } = controlsRef.current;
      activeLineRef.current = {
        startX: sx,
        startY: sy,
        angle,
        targetLength: lineLength,
        currentLength: 0,
        prevX: sx,
        prevY: sy,
      };
    }

    /* ---- frame loop ---- */

    function animate(timestamp: number) {
      if (!isRunningRef.current) return;

      // First frame – seed from a random letter pixel.
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
        const p = randomLetterPixel();
        createLine(p.x, p.y);
      }

      const elapsed = (timestamp - startTimeRef.current) / 1000;
      const { duration, speed, branchMin, branchMax } = controlsRef.current;

      if (elapsed > duration) {
        isRunningRef.current = false;
        return;
      }

      const line = activeLineRef.current;
      if (!line) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const dc = ctxRef.current!;
      line.currentLength += speed;

      if (line.currentLength >= line.targetLength) {
        // Draw the final segment.
        const endX = line.startX + Math.cos(line.angle) * line.targetLength;
        const endY = line.startY + Math.sin(line.angle) * line.targetLength;
        dc.beginPath();
        dc.moveTo(line.prevX, line.prevY);
        dc.lineTo(endX, endY);
        dc.stroke();

        // Pick the next branch point along this line.
        const lo = Math.min(branchMin, branchMax);
        const hi = Math.max(branchMin, branchMax);
        const t = lo + Math.random() * (hi - lo);
        const bx = line.startX + Math.cos(line.angle) * line.targetLength * t;
        const by = line.startY + Math.sin(line.angle) * line.targetLength * t;
        createLine(bx, by);
      } else {
        // Draw the next incremental segment.
        const cx = line.startX + Math.cos(line.angle) * line.currentLength;
        const cy = line.startY + Math.sin(line.angle) * line.currentLength;
        dc.beginPath();
        dc.moveTo(line.prevX, line.prevY);
        dc.lineTo(cx, cy);
        dc.stroke();
        line.prevX = cx;
        line.prevY = cy;
      }

      animationRef.current = requestAnimationFrame(animate);
    }

    animationRef.current = requestAnimationFrame(animate);
  }, [sampleLetterPixels]);

  // Kick off the animation once fonts are ready.
  useEffect(() => {
    document.fonts.ready.then(() => {
      startAnimation();
    });
    return () => {
      isRunningRef.current = false;
      cancelAnimationFrame(animationRef.current);
    };
  }, [startAnimation]);

  // Restart button lives in its own Leva folder so it sits below the sliders.
  useControls({ restart: button(() => document.fonts.ready.then(() => startAnimation())) });

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    />
  );
}
