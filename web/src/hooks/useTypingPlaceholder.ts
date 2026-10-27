import { useEffect, useState } from 'react';

const DEMO_DOMAINS = ['example.com', 'vercel.com', 'github.com', 'linear.app', 'nytimes.com'];

// animates a rotating type-and-delete demo domain for the hero placeholder; active=false or a
// reduced-motion preference freezes it
export function useTypingPlaceholder(active: boolean): string {
  // pre-typed so first paint shows a domain, not an empty field
  const [text, setText] = useState(DEMO_DOMAINS[0]);
  useEffect(() => {
    if (!active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    let domainIdx = 0;
    let charIdx = DEMO_DOMAINS[0].length;
    let phase: 'typing' | 'holding' | 'deleting' = 'holding';
    setText(DEMO_DOMAINS[0]);

    let id: number;
    const tick = () => {
      const word = DEMO_DOMAINS[domainIdx];
      let delay = 130; // typing speed
      if (phase === 'typing') {
        charIdx++;
        if (charIdx >= word.length) {
          phase = 'holding';
        }
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
      id = window.setTimeout(tick, delay);
    };

    id = window.setTimeout(tick, 0);
    return () => clearTimeout(id);
  }, [active]);

  return text;
}
