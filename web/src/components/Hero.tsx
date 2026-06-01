import { type FormEvent } from 'react';

import { Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { AuthBar } from './AuthBar';
import { CrawlForm } from './CrawlForm';
import { CrawlGraphBackdrop } from './CrawlGraphBackdrop';

interface HeroProps {
  url: string;
  setUrl: (s: string) => void;
  onSubmit: (e: FormEvent) => void;
  submitting: boolean;
  error: string | null;
}

// landing page over the CrawlGraphBackdrop canvas: headline, crawl input, feature cards
export function Hero({ url, setUrl, onSubmit, submitting, error }: HeroProps) {
  return (
    <div className="relative flex-1 overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <CrawlGraphBackdrop />
      </div>

      {/* click-through so the canvas behind catches taps in empty space */}
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
          Enter a domain. Find broken links, score your on-page SEO, and explore your whole site as
          an interactive graph.
        </p>

        <CrawlForm url={url} setUrl={setUrl} onSubmit={onSubmit} submitting={submitting} error={error} />

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

// staggered how-it-works cards under the input
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
