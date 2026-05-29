import { type FormEvent, useState } from 'react';

import { Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useTypingPlaceholder } from '../hooks/useTypingPlaceholder';
import { AuthBar } from './AuthBar';
import { CrawlGraphBackdrop } from './CrawlGraphBackdrop';

interface HeroProps {
  url: string;
  setUrl: (s: string) => void;
  onSubmit: (e: FormEvent) => void;
  submitting: boolean;
  error: string | null;
}

// Hero is the landing page: wordmark + auth bar, headline, the crawl input, and the feature
// cards, all over the interactive CrawlGraphBackdrop canvas.
export function Hero({ url, setUrl, onSubmit, submitting, error }: HeroProps) {
  const [focused, setFocused] = useState(false);
  // animation pauses both when there's text AND when the input is focused, so the user's
  // real caret doesn't compete with our fake one.
  const placeholder = useTypingPlaceholder(url === '' && !focused);
  return (
    <div className="relative flex-1 overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <CrawlGraphBackdrop />
      </div>

      {/* layout wrappers are click-through so the canvas behind catches taps in their empty space.
          3-col grid lets the version sit dead-centre while the wordmark and auth bar pin the sides. */}
      <header className="pointer-events-none relative z-10 grid grid-cols-3 items-center gap-4 px-6 py-4 sm:px-10 [&_*]:pointer-events-auto">
        <Link to="/#" className="flex items-center gap-2 justify-self-start" aria-label="Go to home">
          <Link2 className="h-4 w-4 text-accent" strokeWidth={2.25} />
          <span className="display text-xl font-medium tracking-tight">linktrace</span>
        </Link>
        <span className="hidden justify-self-center font-mono text-[10px] uppercase tracking-widest text-ink-300 sm:inline">
          v0.1 · distributed crawler
        </span>
        <div className="justify-self-end">
          <AuthBar />
        </div>
      </header>

      <section className="pointer-events-none relative z-10 mx-auto flex max-w-5xl flex-col items-center px-6 pb-40 pt-24 sm:pt-32 [&_article]:pointer-events-auto [&_form]:pointer-events-auto [&_h1]:pointer-events-auto [&_p]:pointer-events-auto [&_span]:pointer-events-auto">
        <span className="eyebrow mb-6">distributed site auditor · open source</span>

        <h1 className="display text-center text-5xl font-light leading-[1.02] sm:text-7xl md:text-[5.5rem]">
          Healthy links.
          <br />
          <span className="text-accent">Higher rankings.</span>
        </h1>

        <p className="mt-8 max-w-xl text-center text-base leading-relaxed text-ink-300 sm:text-lg">
          Type a domain. We BFS-crawl every page, classify the dead ones, score the SEO of the
          living, and render the whole site as a graph you can wander.
        </p>

        <form onSubmit={onSubmit} className="mt-14 w-full max-w-2xl">
          <div className="group relative">
            <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 font-mono text-xs uppercase tracking-widest text-ink-300">
              https://
            </span>
            <input
              type="text"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder=""
              className="w-full border border-ink-500 bg-ink-800/80 py-6 pl-6 pr-44 font-mono text-base text-paper shadow-card backdrop-blur-sm placeholder:text-ink-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40 sm:text-lg"
            />
            {/* fake placeholder: animated demo domain + blinking cursor on the RIGHT
                (touching the last char). Vanishes the moment the user focuses the input
                so our cursor doesn't compete with the real caret. */}
            {url === '' && !focused && (
              // [&_*]:!pointer-events-none overrides the section's [&_span]:pointer-events-auto
              // selector — without it the placeholder spans intercept clicks meant for the input.
              <div className="pointer-events-none absolute left-6 top-1/2 flex -translate-y-1/2 items-center gap-px font-mono text-base text-ink-400/60 sm:text-lg [&_*]:!pointer-events-none">
                <span>{placeholder}</span>
                <span className="cursor-blink inline-block h-[1.2em] w-[2px] bg-accent/60" />
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-accent px-6 py-3.5 font-mono text-xs uppercase tracking-widest text-ink-900 shadow-amber transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'starting…' : 'crawl →'}
            </button>
          </div>
          {error && <p className="mt-4 font-mono text-xs text-rose-300">{error}</p>}
        </form>

        <Features />
      </section>
    </div>
  );
}

const FEATURES = [
  {
    n: '01',
    title: 'Crawl',
    body: 'A self-expanding BFS feeds itself through RabbitMQ. Eight workers, deduped via Redis, rate-limited per domain.',
    offset: 'sm:translate-y-0',
  },
  {
    n: '02',
    title: 'Classify',
    body: 'DNS failure, timeout, SSL error, soft 404, 4xx/5xx, redirect loop, every dead link gets a reason, not just a status code.',
    offset: 'sm:translate-y-10',
  },
  {
    n: '03',
    title: 'Audit',
    body: 'Healthy pages get a full SEO read: title, meta, headings, structured data, on-page keywords, and a weighted score.',
    offset: 'sm:translate-y-20',
  },
];

// Features renders the three staggered "how it works" cards under the hero input.
function Features() {
  return (
    <div className="mt-24 grid w-full grid-cols-1 gap-6 sm:grid-cols-3">
      {FEATURES.map((it) => (
        <article
          key={it.n}
          className={`group z-50 border-l-2 border-ink-500 bg-ink-700/40 p-6 backdrop-blur-sm transition hover:border-accent ${it.offset}`}
        >
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
              {it.n}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-300">
              step
            </span>
          </div>
          <h3 className="display mt-4 text-2xl font-normal">{it.title}</h3>
          <p className="mt-3 text-sm leading-relaxed text-ink-300">{it.body}</p>
        </article>
      ))}
    </div>
  );
}
