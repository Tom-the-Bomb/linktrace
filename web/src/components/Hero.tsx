import { type FormEvent, type RefObject, useRef, useState } from 'react';

import { ArrowRight, Check, LoaderCircle, X } from 'lucide-react';

import { useFocusShortcut } from '../hooks/useFocusShortcut';
import { useTypingPlaceholder } from '../hooks/useTypingPlaceholder';
import { SECTION_HEX, scoreTextColour } from '../lib/colours';
import { SampleCrawl } from './SampleCrawl';
import { TopNav } from './TopNav';
import { GridRow } from './ui/GridRow';
import { ToneChip } from './ui/StatusChip';

interface HeroProps {
  url: string;
  setUrl: (s: string) => void;
  onSubmit: (e: FormEvent) => void;
  submitting: boolean;
  error: string | null;
}

// landing page: the grid frame, a domain field, and a sample crawl playing out in the cells
export function Hero({ url, setUrl, onSubmit, submitting, error }: HeroProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function focusField() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    inputRef.current?.focus({ preventScroll: true });
  }

  return (
    <div className="flex-1">
      <TopNav />
      <div className="frame">
        <section className="grid grid-cols-1 lg:grid-cols-12">
          <div className="cell px-5 pb-10 pt-12 sm:px-8 lg:col-span-8 lg:border-r lg:py-20">
            <h1 className="text-[44px] font-semibold leading-[0.98] tracking-display sm:text-[64px] lg:text-[80px]">
              Broken links,
              <br />
              <span className="text-ink-3">found and explained.</span>
            </h1>
          </div>
          <div className="cell flex flex-col justify-end border-t px-5 pb-12 pt-10 sm:px-8 lg:col-span-4 lg:border-t-0 lg:py-20">
            <p className="text-[17px] leading-relaxed text-ink-2">
              Give it a domain and LinkTrace crawls outward from your homepage, following every
              internal link. It tells you which links are broken and why, scores each page&rsquo;s
              on-page SEO and maps out the whole site.
            </p>
            <DomainForm
              inputRef={inputRef}
              url={url}
              setUrl={setUrl}
              onSubmit={onSubmit}
              submitting={submitting}
              error={error}
            />
          </div>
        </section>

        <GridRow inner={['lg:left-[33.333%]', 'lg:left-[66.666%]']}>
          <SampleCrawl />
        </GridRow>

        <Failures />
        <ReportContents />

        <GridRow inner={['lg:left-[33.333%]']}>
          <section className="flex flex-col gap-6 px-5 py-14 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:py-20">
            <div>
              <h2 className="text-[40px] font-semibold leading-none tracking-display sm:text-[56px]">
                Check your site.
              </h2>
              <p className="mt-4 max-w-md text-[17px] leading-relaxed text-ink-2">
                You don&rsquo;t need an account to run a crawl. If you log in, each crawl is saved
                to your history so you can come back to the report later.
              </p>
            </div>
            <button
              onClick={focusField}
              className="btn-primary h-11 self-start px-5 text-[15px] lg:self-auto"
            >
              Crawl a site
              <ArrowRight className="size-4" strokeWidth={2} aria-hidden="true" />
            </button>
          </section>
        </GridRow>
      </div>
    </div>
  );
}

function DomainForm({
  inputRef,
  url,
  setUrl,
  onSubmit,
  submitting,
  error,
}: {
  inputRef: RefObject<HTMLInputElement>;
  url: string;
  setUrl: (s: string) => void;
  onSubmit: (e: FormEvent) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [focused, setFocused] = useState(false);
  // pause when focused/non-empty so the fake caret doesn't fight the real one
  const placeholder = useTypingPlaceholder(url === '' && !focused);
  useFocusShortcut(inputRef);

  return (
    <form onSubmit={onSubmit} className="mt-8">
      <div className="flex gap-2">
        <label className="field relative flex h-11 min-w-0 flex-1 items-center px-3">
          <span className="sr-only">Domain to crawl</span>
          <span className="shrink-0 font-mono text-[14px] text-ink-3">https://</span>
          <input
            ref={inputRef}
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-invalid={!!error}
            aria-describedby={error ? 'domain-error' : undefined}
            className="h-full min-w-0 flex-1 bg-transparent font-mono text-[14px] outline-none"
          />
          {/* fake placeholder: animated demo domain + blinking caret */}
          {url === '' && !focused && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-[calc(0.75rem+8ch)] flex items-center font-mono text-[14px] text-ink-3"
            >
              {placeholder}
              <span className="cursor-blink ml-px inline-block h-[1.1em] w-px bg-ink" />
            </span>
          )}
          {url === '' && (
            <span className="kbd ml-2 hidden sm:inline-flex" aria-hidden="true">
              /
            </span>
          )}
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary h-11 w-[92px] shrink-0 text-[15px]"
        >
          {submitting ? (
            <LoaderCircle className="spin size-4" strokeWidth={2.5} aria-label="Starting crawl" />
          ) : (
            'Crawl'
          )}
        </button>
      </div>
      {error && (
        <p id="domain-error" role="alert" className="mt-2.5 text-sm text-bad-fg">
          {error}
        </p>
      )}
      <p className="mt-6 text-[13px] text-ink-3">
        Broken links are labelled by cause.{' '}
        <a href="#failures" className="text-ink-2 underline underline-offset-4 hover:text-ink">
          What each label means
        </a>
      </p>
      <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Failure types">
        {BADGES.map((b) => (
          <li key={b} className="chip chip-neutral chip-code">
            {b}
          </li>
        ))}
      </ul>
    </form>
  );
}

const BADGES = ['DNS failure', 'Timeout', 'SSL error', 'Redirect loop', 'Soft 404', '4xx', '5xx'];

const FAILURES: { label: string; tone: 'bad' | 'warn'; body: string }[] = [
  {
    label: 'DNS failure',
    tone: 'bad',
    body: "The domain name doesn't point to a server (the DNS lookup failed).",
  },
  { label: 'Timeout', tone: 'bad', body: 'The server took too long to respond.' },
  {
    label: 'Refused',
    tone: 'bad',
    body: 'The server refused the connection, or dropped it partway through.',
  },
  {
    label: 'SSL error',
    tone: 'bad',
    body: "The site's certificate is invalid, expired or issued for a different domain.",
  },
  {
    label: 'Redirect loop',
    tone: 'bad',
    body: 'The page redirects back to itself, or goes through more than 10 redirects.',
  },
  {
    label: 'Soft 404',
    tone: 'bad',
    body: "The page loads with a 200 status, but its content says it couldn't be found.",
  },
  {
    label: '4xx',
    tone: 'bad',
    body: "The server says the page doesn't exist or can't be accessed (404, 403 and so on).",
  },
  {
    label: '5xx',
    tone: 'bad',
    body: 'The server hit an error while responding (500, 502 and so on).',
  },
  {
    label: 'Blocked',
    tone: 'warn',
    body: 'A bot check or rate limit answered instead of the page. These are marked in amber rather than red, since the page itself may be fine.',
  },
];

// the classifier's vocabulary, so visitors know what a report will say
function Failures() {
  return (
    <GridRow inner={['lg:left-[33.333%]', 'lg:left-[66.666%]']}>
      <section id="failures" className="grid scroll-mt-4 grid-cols-1 lg:grid-cols-12">
        <div className="cell px-5 py-12 sm:px-8 lg:col-span-4 lg:border-r lg:py-16">
          <h2 className="section-title">Why links break</h2>
          <p className="mt-4 max-w-sm text-[17px] leading-relaxed text-ink-2">
            Knowing that a link is broken doesn&rsquo;t help much on its own. LinkTrace records what
            went wrong when it tried to load each one, so you can tell a mistyped URL apart from an
            expired certificate or a server that&rsquo;s down.
          </p>
        </div>
        <ul className="cell divide-y divide-line border-t lg:col-span-8 lg:border-t-0">
          {FAILURES.map((f) => (
            <li key={f.label} className="flex items-baseline gap-4 px-5 py-3.5 sm:px-8">
              <span className="w-32 shrink-0">
                <ToneChip tone={f.tone}>{f.label}</ToneChip>
              </span>
              <span className="text-[15px] text-ink-2">{f.body}</span>
            </li>
          ))}
        </ul>
      </section>
    </GridRow>
  );
}

const SAMPLE_SECTIONS = [
  { name: '/blog', pages: 112, seo: 61, broken: 1 },
  { name: '/docs', pages: 74, seo: 78, broken: 1 },
  { name: '/pricing', pages: 38, seo: 52, broken: 1 },
  { name: '/about', pages: 16, seo: 86, broken: 0 },
];

const SAMPLE_CHECKS = [
  { label: 'robots.txt found', ok: true },
  { label: 'sitemap.xml found (231 URLs)', ok: true },
  { label: 'HTTP redirects to HTTPS', ok: true },
  { label: 'www canonicalisation: inconsistent', ok: false },
];

// the rest of a report, as labelled sample fragments
function ReportContents() {
  return (
    <GridRow inner={['lg:left-[33.333%]']}>
      <section className="grid grid-cols-1 lg:grid-cols-12">
        <div className="cell px-5 py-12 sm:px-8 lg:col-span-4 lg:border-r lg:py-16">
          <h2 className="section-title">What&rsquo;s in a report</h2>
          <p className="mt-4 max-w-sm text-[17px] leading-relaxed text-ink-2">
            You can watch the progress while the crawl runs. Once it&rsquo;s done, the report groups
            pages by section (the first part of the URL path, like /blog) and runs checks on the
            domain itself, including robots.txt, the sitemap and HTTPS.
          </p>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-ink-3">
            Each page also gets its own SEO audit (title, meta description, headings, canonical tag,
            Open Graph, structured data and image alt text). For broken pages, the report links to a
            saved copy on the Wayback Machine when one exists, and it compares your sitemap against
            the pages the crawl found.
          </p>
        </div>
        <div className="cell border-t lg:col-span-8 lg:border-t-0">
          <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-8">
            <h3 className="text-sm font-medium">By section</h3>
            <span className="chip chip-neutral">Sample</span>
          </div>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {SAMPLE_SECTIONS.map((r, i) => (
              <li key={r.name} className="flex items-center gap-3.5 px-5 py-3 sm:px-8">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: SECTION_HEX[i] }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-sm">{r.name}</span>
                  <span className="num block text-[13px] text-ink-3">{r.pages} pages</span>
                </span>
                <span className={`num font-mono text-[13px] ${scoreTextColour(r.seo)}`}>
                  SEO {r.seo}
                </span>
                <span
                  className={`chip w-[84px] justify-center ${r.broken ? 'chip-warn' : 'chip-ok'}`}
                >
                  {r.broken ? `${r.broken} broken` : 'Links OK'}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3 px-5 pt-6 sm:px-8">
            <h3 className="text-sm font-medium">Site health</h3>
            <span className="chip chip-neutral">Sample</span>
          </div>
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {SAMPLE_CHECKS.map((c) => (
              <li key={c.label} className="flex items-center gap-3 px-5 py-2.5 text-sm sm:px-8">
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full ${c.ok ? 'bg-ok-bg text-ok-fg' : 'bg-bad-bg text-bad-fg'}`}
                >
                  {c.ok ? (
                    <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                  ) : (
                    <X className="size-3" strokeWidth={3} aria-hidden="true" />
                  )}
                </span>
                {c.label}
                <span className="sr-only">{c.ok ? 'passed' : 'failed'}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </GridRow>
  );
}
