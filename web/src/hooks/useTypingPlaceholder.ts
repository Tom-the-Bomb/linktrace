import { useEffect, useState } from 'react';

const DEMO_DOMAINS = ['example.com', 'vercel.com', 'github.com', 'linear.app', 'nytimes.com'];

// animates a rotating type-and-delete demo domain for the hero placeholder; active=false freezes it
export function useTypingPlaceholder(active: boolean): string {
  // pre-typed so first paint shows a domain, not an empty field
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
        delay = 2800; // pause at full word
        phase = 'deleting';
      } else {
        charIdx--;
        delay = 55;
        if (charIdx <= 0) {
          domainIdx = (domainIdx + 1) % DEMO_DOMAINS.length;
          phase = 'typing';
          delay = 2500; // pause when empty
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
