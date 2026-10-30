import { useEffect, useState } from 'react';

const DEMO_DOMAINS = ['example.com', 'vercel.com', 'github.com', 'linear.app', 'nytimes.com'];

export function useTypingPlaceholder(active: boolean): string {
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
      let delay = 130;
      if (phase === 'typing') {
        charIdx++;
        if (charIdx >= word.length) {
          phase = 'holding';
        }
      } else if (phase === 'holding') {
        delay = 2800;
        phase = 'deleting';
      } else {
        charIdx--;
        delay = 55;
        if (charIdx <= 0) {
          domainIdx = (domainIdx + 1) % DEMO_DOMAINS.length;
          phase = 'typing';
          delay = 2500;
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
