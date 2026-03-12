'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useControls } from 'leva';

/* ────────────────────────────────────────────
   Vertex shader — fullscreen quad
   ──────────────────────────────────────────── */
const VERT = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/* ────────────────────────────────────────────
   Fragment shader — one "generation" of JPEG loss
   ──────────────────────────────────────────── */
const FRAG = `
precision mediump float;

varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_resolution;

uniform float u_blockSize;
uniform float u_blockStrength;
uniform float u_chromaSub;
uniform float u_bandLevels;
uniform float u_ringing;
uniform float u_brightnessDrift;
uniform float u_noiseAmount;
uniform float u_sharpness;

vec3 rgb2ycbcr(vec3 c) {
  float Y  =  0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  float Cb = -0.169 * c.r - 0.331 * c.g + 0.500 * c.b + 0.5;
  float Cr =  0.500 * c.r - 0.419 * c.g - 0.081 * c.b + 0.5;
  return vec3(Y, Cb, Cr);
}

vec3 ycbcr2rgb(vec3 c) {
  float Y  = c.x;
  float Cb = c.y - 0.5;
  float Cr = c.z - 0.5;
  float r = Y + 1.402 * Cr;
  float g = Y - 0.344 * Cb - 0.714 * Cr;
  float b = Y + 1.772 * Cb;
  return vec3(r, g, b);
}

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = v_uv;
  vec2 px = 1.0 / u_resolution;

  vec2 blockUV = floor(uv * u_resolution / u_blockSize) * u_blockSize / u_resolution;
  vec3 original = texture2D(u_tex, uv).rgb;
  vec3 blockSample = texture2D(u_tex, blockUV + (u_blockSize * 0.5) * px).rgb;
  vec3 blurred = mix(original, blockSample, u_blockStrength * 0.5);
  vec3 ycbcr = rgb2ycbcr(blurred);

  float chromaBlock = u_blockSize * (1.0 + u_chromaSub);
  vec2 chromaUV = floor(uv * u_resolution / chromaBlock) * chromaBlock / u_resolution
                  + (chromaBlock * 0.5) * px;
  vec3 chromaSample = rgb2ycbcr(texture2D(u_tex, chromaUV).rgb);
  ycbcr.y = mix(ycbcr.y, chromaSample.y, u_chromaSub);
  ycbcr.z = mix(ycbcr.z, chromaSample.z, u_chromaSub);

  float levels = max(u_bandLevels, 4.0);
  ycbcr.x = floor(ycbcr.x * levels + 0.5) / levels;
  float chromaLevels = max(levels * 0.5, 3.0);
  ycbcr.y = floor(ycbcr.y * chromaLevels + 0.5) / chromaLevels;
  ycbcr.z = floor(ycbcr.z * chromaLevels + 0.5) / chromaLevels;

  vec3 color = ycbcr2rgb(ycbcr);

  if (u_ringing > 0.0 || u_sharpness > 0.0) {
    vec3 left  = texture2D(u_tex, uv - vec2(px.x, 0.0)).rgb;
    vec3 right = texture2D(u_tex, uv + vec2(px.x, 0.0)).rgb;
    vec3 up    = texture2D(u_tex, uv - vec2(0.0, px.y)).rgb;
    vec3 down  = texture2D(u_tex, uv + vec2(0.0, px.y)).rgb;
    vec3 laplacian = original * 4.0 - left - right - up - down;
    color += laplacian * u_sharpness * 0.15;
    float edgeMag = length(laplacian);
    float ripple = sin(edgeMag * 40.0) * u_ringing * 0.03;
    color += vec3(ripple);
  }

  color += vec3(u_brightnessDrift * 0.005);

  if (u_noiseAmount > 0.0) {
    float n = (rand(uv + color.rg) - 0.5) * u_noiseAmount * 0.02;
    color += vec3(n);
  }

  vec2 blockPos = fract(uv * u_resolution / u_blockSize);
  float edge = 1.0 - smoothstep(0.0, 0.08, min(blockPos.x, blockPos.y));
  edge += 1.0 - smoothstep(0.0, 0.08, min(1.0 - blockPos.x, 1.0 - blockPos.y));
  color -= vec3(edge * u_blockStrength * 0.02);

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

/* ──── Helpers ──── */

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader) {
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function createFBO(gl: WebGLRenderingContext, w: number, h: number) {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { fbo, tex };
}

/* ──── Uniform location cache type ──── */
interface Uniforms {
  u_resolution: WebGLUniformLocation | null;
  u_blockSize: WebGLUniformLocation | null;
  u_blockStrength: WebGLUniformLocation | null;
  u_chromaSub: WebGLUniformLocation | null;
  u_bandLevels: WebGLUniformLocation | null;
  u_ringing: WebGLUniformLocation | null;
  u_sharpness: WebGLUniformLocation | null;
  u_brightnessDrift: WebGLUniformLocation | null;
  u_noiseAmount: WebGLUniformLocation | null;
  u_tex: WebGLUniformLocation | null;
}

/* ──── Lightweight DOM-to-canvas capture ──── */
function capturePageToCanvas(target: HTMLCanvasElement) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  target.width = w;
  target.height = h;
  const ctx = target.getContext('2d')!;

  // White background
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);

  // Walk every visible text node in the document
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
      const el = node.parentElement;
      if (!el) return NodeFilter.FILTER_REJECT;
      // Skip leva UI
      if (el.closest('[class*="leva"]')) return NodeFilter.FILTER_REJECT;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0')
        return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const range = document.createRange();
  let textNode: Node | null;

  while ((textNode = walker.nextNode())) {
    const text = textNode.textContent || '';
    if (!text.trim()) continue;

    const el = textNode.parentElement!;
    const cs = getComputedStyle(el);

    // Get the exact rendered position of this text node
    range.selectNodeContents(textNode);
    const rects = range.getClientRects();
    if (rects.length === 0) continue;

    ctx.save();
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    ctx.fillStyle = cs.color;
    ctx.textBaseline = 'top';

    const fontSize = parseFloat(cs.fontSize);

    for (const rect of rects) {
      if (rect.width === 0 || rect.height === 0) continue;
      // CSS centres the em-square within the line box.
      // When line-height < font-size the line box is shorter, so the
      // em-square top sits above rect.top.  Shift up by the difference.
      const shift = (rect.height - fontSize) / 2; // negative when lh < fs
      ctx.fillText(text, rect.left, rect.top + shift);
    }
    ctx.restore();
  }
}

/* ════════════════════════════════════════════
   Component
   ════════════════════════════════════════════ */
export default function JpegFilter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const uniformsRef = useRef<Uniforms | null>(null);
  const fboARef = useRef<{ fbo: WebGLFramebuffer; tex: WebGLTexture } | null>(null);
  const fboBRef = useRef<{ fbo: WebGLFramebuffer; tex: WebGLTexture } | null>(null);
  const srcTexRef = useRef<WebGLTexture | null>(null);
  const rafRef = useRef(0);

  const controls = useControls('JPEG Loss', {
    enabled: { value: false, label: 'Enabled' },
    generations: { value: 0, min: 0, max: 40, step: 1, label: 'Generations' },
    blockSize: { value: 2, min: 2, max: 32, step: 1, label: 'Block Size' },
    blockStrength: { value: 0.13, min: 0, max: 1, step: 0.01, label: 'Block Strength' },
    chromaSub: { value: 0.5, min: 0, max: 1, step: 0.01, label: 'Chroma Subsample' },
    bandLevels: { value: 64, min: 4, max: 256, step: 1, label: 'Color Levels' },
    ringing: { value: 0.3, min: 0, max: 1, step: 0.01, label: 'Ringing' },
    sharpness: { value: 1.74, min: 0, max: 2, step: 0.01, label: 'Sharpness' },
    brightnessDrift: { value: 0.3, min: -2, max: 2, step: 0.01, label: 'Brightness Drift' },
    noiseAmount: { value: 2.0, min: 0, max: 2, step: 0.01, label: 'Noise' },
  });

  const controlsRef = useRef(controls);
  controlsRef.current = controls;

  /* ---- Capture: lightweight 2D canvas render ---- */
  const capture = useCallback(() => {
    const gl = glRef.current;
    if (!gl) return;

    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement('canvas');
    }

    capturePageToCanvas(offscreenRef.current);

    if (!srcTexRef.current) {
      srcTexRef.current = gl.createTexture();
    }
    gl.bindTexture(gl.TEXTURE_2D, srcTexRef.current);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, offscreenRef.current);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }, []);

  /* ---- Init WebGL ---- */
  const initGL = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
    if (!gl) return;
    glRef.current = gl;

    const vs = createShader(gl, gl.VERTEX_SHADER, VERT);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const program = createProgram(gl, vs, fs);
    if (!program) return;
    programRef.current = program;

    // Cache uniform locations once
    uniformsRef.current = {
      u_resolution: gl.getUniformLocation(program, 'u_resolution'),
      u_blockSize: gl.getUniformLocation(program, 'u_blockSize'),
      u_blockStrength: gl.getUniformLocation(program, 'u_blockStrength'),
      u_chromaSub: gl.getUniformLocation(program, 'u_chromaSub'),
      u_bandLevels: gl.getUniformLocation(program, 'u_bandLevels'),
      u_ringing: gl.getUniformLocation(program, 'u_ringing'),
      u_sharpness: gl.getUniformLocation(program, 'u_sharpness'),
      u_brightnessDrift: gl.getUniformLocation(program, 'u_brightnessDrift'),
      u_noiseAmount: gl.getUniformLocation(program, 'u_noiseAmount'),
      u_tex: gl.getUniformLocation(program, 'u_tex'),
    };

    // Fullscreen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Ping-pong FBOs
    fboARef.current = createFBO(gl, w, h);
    fboBRef.current = createFBO(gl, w, h);
  }, []);

  /* ---- Render loop ---- */
  const render = useCallback(() => {
    const gl = glRef.current;
    const program = programRef.current;
    const canvas = canvasRef.current;
    const u = uniformsRef.current;
    const fboA = fboARef.current;
    const fboB = fboBRef.current;

    if (!gl || !program || !canvas || !u || !fboA || !fboB) {
      rafRef.current = requestAnimationFrame(render);
      return;
    }

    // Skip when disabled — clear to transparent so page shows through
    if (!controlsRef.current.enabled) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      rafRef.current = requestAnimationFrame(render);
      return;
    }

    // Re-capture every frame (cheap now — just 2D canvas draw)
    capture();
    const srcTex = srcTexRef.current;
    if (!srcTex) {
      rafRef.current = requestAnimationFrame(render);
      return;
    }

    const c = controlsRef.current;
    gl.useProgram(program);

    // Set uniforms (cached locations)
    gl.uniform2f(u.u_resolution, canvas.width, canvas.height);
    gl.uniform1f(u.u_blockSize, c.blockSize);
    gl.uniform1f(u.u_blockStrength, c.blockStrength);
    gl.uniform1f(u.u_chromaSub, c.chromaSub);
    gl.uniform1f(u.u_bandLevels, c.bandLevels);
    gl.uniform1f(u.u_ringing, c.ringing);
    gl.uniform1f(u.u_sharpness, c.sharpness);
    gl.uniform1f(u.u_brightnessDrift, c.brightnessDrift);
    gl.uniform1f(u.u_noiseAmount, c.noiseAmount);
    gl.uniform1i(u.u_tex, 0);
    gl.activeTexture(gl.TEXTURE0);

    const gens = c.generations;

    if (gens === 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else {
      let readTex = srcTex;
      const fbos = [fboA, fboB];

      for (let i = 0; i < gens; i++) {
        const isLast = i === gens - 1;
        const writeFbo = isLast ? null : fbos[i % 2].fbo;

        gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.bindTexture(gl.TEXTURE_2D, readTex);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        if (!isLast) {
          readTex = fbos[i % 2].tex;
        }
      }
    }

    rafRef.current = requestAnimationFrame(render);
  }, [capture]);

  /* ---- Lifecycle ---- */
  useEffect(() => {
    initGL();
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [initGL, render]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 50,
        pointerEvents: 'none',
      }}
    />
  );
}
