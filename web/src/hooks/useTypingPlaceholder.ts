import { useEffect, useState } from 'react';

const DEMO_DOMAINS = ['example.com', 'vercel.com', 'github.com', 'linear.app', 'nytimes.com'];

// useTypingPlaceholder animates a rotating, type-and-delete demo domain for the hero's input
// placeholder. Pass active=false (input focused or non-empty) to freeze it.
export function useTypingPlaceholder(active: boolean): string {
  // start the animation with the first domain ALREADY fully typed, so on first paint
  // the user sees "example.com" instead of an empty/typing field.
  const [text, setText] = useState(DEMO_DOMAINS[0]);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let domainIdx = 0;
    let charIdx = DEMO_DOMAINS[0].length;
    let phase: 'typing' | 'holding' | 'deleting' = 'holding';
    setText(DEMO_DOMAINS[0]);

    const tick = () => {
      if (cancelled) return;
      const word = DEMO_DOMAINS[domainIdx];
      let delay = 130; // typing speed
      if (phase === 'typing') {
        charIdx++;
        if (charIdx >= word.length) phase = 'holding';
      } else if (phase === 'holding') {
        delay = 2800; // pause at full word — long enough for the reader to register it
        phase = 'deleting';
      } else {
        charIdx--;
        delay = 55;
        if (charIdx <= 0) {
          domainIdx = (domainIdx + 1) % DEMO_DOMAINS.length;
          phase = 'typing';
          delay = 2500; // symmetric pause when empty — cursor blinks in the void
        }
      }
      setText(word.slice(0, charIdx));
      setTimeout(tick, delay);
    };

    const id = setTimeout(tick, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [active]);

  return text;
}
