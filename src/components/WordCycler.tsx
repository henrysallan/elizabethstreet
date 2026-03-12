'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useControls, Leva } from 'leva';
import styles from './WordCycler.module.css';

const DEFAULT_TEXT = `a creative era used to be ten years. (pause) today, it is six months. (pause) the faster time moves, the easier it is to see what moves with us. (pause) our human desires. (pause) the way I want to dance in a crowd with her. (pause) to hear a new sound. (pause) the music changes. i’ve been here before but the music was different and it felt like only a week ago. (pause) the years speed by. but I’ll be in a crowded room dancing the same way my dad did before me. (pause) so I invest in the room. (pause) yesterday’s song won’t be here tomorrow, but a song will be. (pause) so i need this room. (pause) Elizabeth Street Partners (pause) Elizabeth Street Partners (pause) Elizabeth Street Partners. (pause) elizabeth street partners invests in cultural evolution. (pause) (pause) the innate compulsion to progress taste and the ways we experience it. a creative era used to be ten years. today, it is six months. (pause) the faster time moves, the easier it is to see what moves with us. (pause) our human desires. (pause) the way I want to dance in a crowd with her. (pause) to hear a new sound. (pause) the music changes. i’ve been here before but the music was different and it felt like only a week ago. (pause) the years speed by. but I’ll be in a crowded room dancing the same way my dad did before me. (pause) so I invest in the room. (pause) yesterday’s song won’t be here tomorrow, but a song will be. (pause) so i need this room. (pause) Elizabeth Street Partners (pause) Elizabeth Street Partners (pause) Elizabeth Street Partners. (pause) elizabeth street partners invests in cultural evolution. the innate compulsion to progress taste and the ways we experience it.`;

const GRID_LEVELS = [1, 3, 4, 5, 6, 7, 8];

// 5 progressive speed tiers (WPM). Text is split into 5 equal chunks.
// Each chunk runs at the corresponding WPM.
const CHUNK_WPM = [300, 360, 450, 600, 600];
const NUM_CHUNKS = CHUNK_WPM.length;
// Convert WPM → ms per word: 60000 / WPM
const CHUNK_MS = CHUNK_WPM.map((wpm) => Math.round(60000 / wpm));
// Pause durations also get shorter per chunk
const CHUNK_PAUSE = [500, 380, 280, 190, 120];
// Sentence-end pause durations per tier (shorter than explicit pauses)
const CHUNK_SENTENCE_PAUSE = [260, 200, 150, 100, 70];
const RAMP_WORDS = 7; // ramp-up over first N words of each chunk
const RAMP_START = 600; // starting ms for the ramp

/** Does a word end a sentence? (.  !  ?  — but not mid-word punctuation) */
function isSentenceEnd(word: string) {
  return /[.!?]+["'""'')*\]]*$/.test(word);
}

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

  const { text } = useControls({
    text: { value: DEFAULT_TEXT, label: 'Text' },
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

  /**
   * Build a map from word index → speed tier (0–4).
   * Speed only changes at pause boundaries so we never shift mid-sentence.
   * Segments (text between pauses) are distributed evenly across 5 tiers.
   */
  const tierMap = useMemo(() => {
    // Identify segment boundaries: a new segment starts at index 0,
    // after every (pause) token, and after every sentence-ending word.
    const segStarts: number[] = [0];
    for (let i = 0; i < words.length; i++) {
      if (words[i] === '(pause)' && i + 1 < words.length) {
        segStarts.push(i + 1);
      } else if (isSentenceEnd(words[i]) && i + 1 < words.length && words[i + 1] !== '(pause)') {
        // Sentence end that isn't already followed by a (pause)
        segStarts.push(i + 1);
      }
    }
    const numSegs = segStarts.length;
    // Distribute segments as evenly as possible across NUM_CHUNKS tiers
    const segsPerTier = numSegs / NUM_CHUNKS;

    // For each segment, figure out which tier it belongs to
    const map = new Array<number>(words.length).fill(0);
    for (let s = 0; s < numSegs; s++) {
      const tier = Math.min(Math.floor(s / segsPerTier), NUM_CHUNKS - 1);
      const start = segStarts[s];
      const end = s + 1 < numSegs ? segStarts[s + 1] : words.length;
      for (let j = start; j < end; j++) {
        map[j] = tier;
      }
    }
    return map;
  }, [words]);

  const displayTime = useCallback(
    (i: number) => {
      const wrappedIdx = ((i % words.length) + words.length) % words.length;
      const tier = tierMap[wrappedIdx];
      const target = CHUNK_MS[tier];
      // Ramp only at the very start (first 7 real words of the whole text)
      if (tier === 0) {
        // Count real words before this index
        let realCount = 0;
        for (let j = 0; j < wrappedIdx; j++) {
          if (words[j] !== '(pause)') realCount++;
        }
        if (realCount < RAMP_WORDS) {
          const t = realCount / RAMP_WORDS;
          return Math.round(RAMP_START + (target - RAMP_START) * t);
        }
      }
      return target;
    },
    [tierMap, words],
  );

  const getPauseDuration = useCallback(
    (i: number) => {
      const wrappedIdx = ((i % words.length) + words.length) % words.length;
      return CHUNK_PAUSE[tierMap[wrappedIdx]];
    },
    [tierMap, words],
  );

  const getSentencePauseDuration = useCallback(
    (i: number) => {
      const wrappedIdx = ((i % words.length) + words.length) % words.length;
      return CHUNK_SENTENCE_PAUSE[tierMap[wrappedIdx]];
    },
    [tierMap, words],
  );

  const step = useCallback(() => {
    // Peek ahead: if the next word is a (pause), skip the blank gap
    // and hold the current word on screen for the pause duration.
    const nextIdx = (indexRef.current + 1) % wordsRef.current.length;
    const nextWord = wordsRef.current[nextIdx];
    const currentWord = wordsRef.current[indexRef.current];

    if (nextWord === '(pause)') {
      indexRef.current = nextIdx;
      // Keep visible — no flash. Use chunk-aware pause duration.
      timeoutRef.current = setTimeout(step, getPauseDuration(nextIdx));
      return;
    }

    // Sentence-end: hold the current word briefly, then advance
    if (currentWord !== '(pause)' && isSentenceEnd(currentWord)) {
      indexRef.current = nextIdx;
      setIndex(indexRef.current);
      timeoutRef.current = setTimeout(step, getSentencePauseDuration(nextIdx));
      return;
    }

    // Normal: swap word instantly
    indexRef.current = nextIdx;
    setIndex(indexRef.current);
    timeoutRef.current = setTimeout(step, displayTime(indexRef.current));
  }, [displayTime, getPauseDuration, getSentencePauseDuration]);

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
