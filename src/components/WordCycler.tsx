'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useControls, Leva } from 'leva';
import styles from './WordCycler.module.css';

const DEFAULT_TEXT = `We are the opening of the aperture before the light has decided what it is. Capital as séance — a summoning architecture for work that refuses its own legibility. The construction of a dark corridor between what trembles at the threshold and what the market will only recognize in retrospect as having always been there. We move resources toward the unresolved image. Toward the practitioner whose output is less a product than a disturbance in the field — a fold in the surface where something leaks through from the adjacent possible. The fund is a tuning fork. The fund is the room the tuning fork is struck inside of. We are interested exclusively in the projects that cannot yet survive contact with language, that degrade the moment you build a deck about them, that only exist in full fidelity inside the fever of their own making. What we capitalize is the gap. The specific and unrepeatable gap between a person and the thing they are reaching toward in the dark. We have no thesis. We have a frequency.`;

const GRID_LEVELS = [1, 3, 4, 5, 6, 7, 8];

// RSVP timing: ~100ms display + ~20ms blank gap = 120ms SOA at full speed.
// We start slow and ramp into RSVP range.
const START_DELAY = 600; // ms per word at the beginning
const END_DELAY = 200;   // ms per word at full speed
const GAP_MS = 20;       // blank gap between words (backward-masking interval)

/** 1 char: highlight it. ≤4 chars: 2nd letter. Longer: 3rd letter. */
function getHighlightIdx(word: string) {
  if (word.length <= 1) return 0;
  return word.length <= 4 ? 1 : 2;
}

export default function WordCycler() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [levelIdx, setLevelIdx] = useState(0);
  const [levaHidden, setLevaHidden] = useState(true);
  const indexRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const { text } = useControls({ text: { value: DEFAULT_TEXT, label: 'Text' } });

  const words = useMemo(() => {
    const t = text.trim();
    return t.length > 0 ? t.split(/\s+/) : DEFAULT_TEXT.split(/\s+/);
  }, [text]);

  const wordsRef = useRef(words);
  wordsRef.current = words;

  // Toggle Leva panel with "L" key (only when not typing in an input)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'l' || e.key === 'L') {
        setLevaHidden((h) => !h);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Reset index when text changes
  useEffect(() => {
    indexRef.current = 0;
    setIndex(0);
  }, [words]);

  /** Get the word at position i, wrapping around. */
  const getWord = useCallback((i: number) => {
    const w = wordsRef.current;
    return w[((i % w.length) + w.length) % w.length];
  }, []);

  const gridSize = GRID_LEVELS[levelIdx];
  const totalCells = gridSize * gridSize;
  const centerCell = Math.floor(totalCells / 2);

  const displayTime = useCallback((i: number) => {
    // First 4 words: slow. Words 5–14: ramp down. 15+: full speed.
    if (i < 4) return START_DELAY;
    if (i < 14) {
      const t = (i - 4) / 10; // 0 → 1 over 10 words
      return START_DELAY + (END_DELAY - START_DELAY) * t;
    }
    return END_DELAY;
  }, []);

  const step = useCallback(() => {
    // Show blank gap
    setVisible(false);
    timeoutRef.current = setTimeout(() => {
      // Advance word and show it
      indexRef.current = (indexRef.current + 1) % wordsRef.current.length;
      setIndex(indexRef.current);
      setVisible(true);
      timeoutRef.current = setTimeout(step, displayTime(indexRef.current));
    }, GAP_MS);
  }, [displayTime]);

  useEffect(() => {
    timeoutRef.current = setTimeout(step, displayTime(0));
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [step, displayTime]);

  const handleMore = () => {
    setLevelIdx((i) => Math.min(i + 1, GRID_LEVELS.length - 1));
  };

  const handleLess = () => {
    setLevelIdx((i) => Math.max(i - 1, 0));
  };

  // Build the grid: center cell = current index, others fill around it.
  const startWordIdx = index - centerCell;

  return (
    <>
      <Leva hidden={levaHidden} />
      <div className={styles.wrapper}>
        <div
          className={styles.grid}
          style={{
            gridTemplateColumns: `repeat(${gridSize}, auto)`,
            gridTemplateRows: `repeat(${gridSize}, auto)`,
            visibility: visible ? 'visible' : 'hidden',
          }}
        >
          {Array.from({ length: totalCells }, (_, cellIdx) => {
            const word = getWord(startWordIdx + cellIdx);
            const isCenter = cellIdx === centerCell;

            if (isCenter) {
              const midIdx = getHighlightIdx(word);
              const before = word.slice(0, midIdx);
              const middle = word[midIdx];
              const after = word.slice(midIdx + 1);

              return (
                <div key={cellIdx} className={styles.centerCell}>
                  <span className={styles.before}>{before}</span>
                  <span className={styles.middle}>{middle}</span>
                  <span className={styles.after}>{after}</span>
                </div>
              );
            }

            return (
              <div key={cellIdx} className={styles.cell}>
                {word}
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.buttons}>
        <button onClick={handleLess} className={styles.btn} disabled={levelIdx === 0}>
          less
        </button>
        <button onClick={handleMore} className={styles.btn} disabled={levelIdx === GRID_LEVELS.length - 1}>
          more
        </button>
      </div>
    </>
  );
}
