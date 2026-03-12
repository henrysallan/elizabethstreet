'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useControls, Leva } from 'leva';
import styles from './WordCycler.module.css';

const DEFAULT_TEXT = `a creative era used to be ten years. today, it is six months. (pause) the faster time moves, the easier it is to see what moves with us. (pause) our human desires. (pause) the way I want to dance in a crowd with her. (pause) to hear a new sound. (pause) the music changes. i’ve been here before but the music was different and it felt like only a week ago. (pause) the years speed by. but I’ll be in a crowded room dancing the same way my dad did before me. (pause) so I invest in the room. (pause) yesterday’s song won’t be here tomorrow, but a song will be. (pause) so i need this room. (pause) Elizabeth Street Partners (pause) Elizabeth Street Partners (pause) Elizabeth Street Partners. (pause) elizabeth street partners invests in cultural evolution. the innate compulsion to progress taste and the ways we experience it..`;

const GRID_LEVELS = [1, 3, 4, 5, 6, 7, 8];

// 300 WPM = 200ms per word. Ramp from slow to full speed over first 7 words.
const START_DELAY = 600; // ms per word at the beginning
const END_DELAY = 125;   // ms per word at full speed (300 WPM)
const RAMP_WORDS = 12;    // number of words to ramp over
const PAUSE_MS = 250;    // duration of a (pause) token

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

  const { text, pauseLength } = useControls({
    text: { value: DEFAULT_TEXT, label: 'Text' },
    pauseLength: { value: 930, min: 50, max: 2000, step: 10, label: 'Pause Length (ms)' },
  });

  const words = useMemo(() => {
    const t = text.trim();
    const raw = t.length > 0 ? t : DEFAULT_TEXT;
    // Split on whitespace but keep "(pause)" as a single token
    return raw.split(/\s+/).reduce<string[]>((acc, w) => {
      if (w.toLowerCase() === '(pause)') {
        acc.push('(pause)');
      } else if (w.length > 0) {
        acc.push(w);
      }
      return acc;
    }, []);
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
    // Ramp from START_DELAY to END_DELAY over the first RAMP_WORDS words
    if (i >= RAMP_WORDS) return END_DELAY;
    const t = i / RAMP_WORDS; // 0 → 1
    return START_DELAY + (END_DELAY - START_DELAY) * t;
  }, []);

  const pauseLengthRef = useRef(pauseLength);
  pauseLengthRef.current = pauseLength;

  const step = useCallback(() => {
    // Peek ahead: if the next word is a (pause), skip the blank gap
    // and hold the current word on screen for the pause duration.
    const nextIdx = (indexRef.current + 1) % wordsRef.current.length;
    const nextWord = wordsRef.current[nextIdx];

    if (nextWord === '(pause)') {
      indexRef.current = nextIdx;
      // Keep visible — no flash
      timeoutRef.current = setTimeout(step, pauseLengthRef.current);
      return;
    }

    // Normal: swap word instantly, no blank gap
    indexRef.current = nextIdx;
    setIndex(indexRef.current);
    timeoutRef.current = setTimeout(step, displayTime(indexRef.current));
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

            // (pause) tokens render as empty space
            if (word === '(pause)') {
              return <div key={cellIdx} className={styles.cell}>&nbsp;</div>;
            }

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
