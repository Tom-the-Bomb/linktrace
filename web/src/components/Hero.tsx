import { type RefObject, type SubmitEvent, useRef, useState } from 'react';

import { ArrowRight, Check, X } from 'lucide-react';

import { useFocusShortcut } from '../hooks/useFocusShortcut';
import { useTypingPlaceholder } from '../hooks/useTypingPlaceholder';
import { SECTION_HEX, scoreTextColour } from '../lib/colours';
import { FAILURE_EXPLANATION, failureGroup, pageStatusTone } from '../lib/status';
import { SampleCrawl } from './SampleCrawl';
import { TopNav } from './TopNav';
import { GridRow } from './ui/GridRow';
import { SectionDot } from './ui/SectionDot';
import { ToneChip } from './ui/StatusChip';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from './ui/input-group';
import { Kbd } from './ui/kbd';
import { Spinner } from './ui/spinner';

interface HeroProps {
  url: string;
  setUrl: (s: string) => void;
  onSubmit: (e: SubmitEvent) => void;
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
      <main className="frame">
        <section className="grid grid-cols-1 lg:grid-cols-12">
          <div className="cell flex flex-col justify-between gap-8 px-5 pt-12 pb-10 sm:px-8 lg:col-span-8 lg:border-r lg:py-16">
            <h1 className="tracking-display text-display sm:text-display-lg leading-[0.98] font-semibold wrap-anywhere">
              Broken links,
              <br />
              <span className="text-ink-3">found and explained.</span>
            </h1>
            <DomainForm
              inputRef={inputRef}
              url={url}
              setUrl={setUrl}
              onSubmit={onSubmit}
              submitting={submitting}
              error={error}
            />
          </div>
          <div className="cell flex flex-col justify-between gap-8 border-t px-5 pt-10 pb-12 sm:px-8 lg:col-span-4 lg:border-t-0 lg:py-16">
            <p className="text-ink-2 text-lead max-w-xl leading-relaxed">
              LinkTrace crawls your site from the homepage, following every internal link. It tells
              you which links are broken and why, scores each page&rsquo;s SEO and maps the whole
              site.
            </p>
            <FailureBadges />
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
              <h2 className="tracking-display text-closing sm:text-closing-lg leading-none font-semibold">
                Check your site.
              </h2>
              <p className="text-ink-2 text-lead mt-4 max-w-md leading-relaxed">
                You don&rsquo;t need an account to run a crawl. Logging in saves each crawl to your
                history.
              </p>
            </div>
            <Button size="xl" onClick={focusField} className="self-start lg:self-auto">
              Crawl a site
              <ArrowRight strokeWidth={2} aria-hidden="true" />
            </Button>
          </section>
        </GridRow>
      </main>
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
  inputRef: RefObject<HTMLInputElement | null>;
  url: string;
  setUrl: (s: string) => void;
  onSubmit: (e: SubmitEvent) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [focused, setFocused] = useState(false);
  // pause when focused/non-empty so the fake caret doesn't fight the real one
  const placeholder = useTypingPlaceholder(url === '' && !focused);
  useFocusShortcut(inputRef);

  return (
    <form onSubmit={onSubmit} className="w-full max-w-xl">
      {/* one row down to 320px; larger text drops the button under the field */}
      <div className="flex flex-wrap gap-2">
        <InputGroup className="h-11 grow basis-44">
          <InputGroupAddon className="pl-3 font-mono text-sm">https://</InputGroupAddon>
          {/* clips the fake placeholder to the input */}
          <div className="relative flex h-full min-w-0 flex-1">
            <InputGroupInput
              ref={inputRef}
              aria-label="Domain to crawl"
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
              className="px-0 font-mono text-sm"
            />
            {/* fake placeholder: animated demo domain + blinking caret */}
            {url === '' && !focused && (
              <span
                aria-hidden="true"
                className="text-ink-3 pointer-events-none absolute inset-0 flex items-center overflow-hidden font-mono text-sm"
              >
                {placeholder}
                <span className="cursor-blink bg-ink ml-px inline-block h-[1.1em] w-px" />
              </span>
            )}
          </div>
          {url === '' && (
            <InputGroupAddon
              align="inline-end"
              className="hidden pr-3 pl-2 sm:flex"
              aria-hidden="true"
            >
              <Kbd>/</Kbd>
            </InputGroupAddon>
          )}
        </InputGroup>
        <Button type="submit" size="xl" disabled={submitting} className="w-23">
          {submitting ? <Spinner aria-label="Starting crawl" /> : 'Crawl'}
        </Button>
      </div>
      {error && (
        <p id="domain-error" role="alert" className="text-bad-fg mt-2.5 text-sm">
          {error}
        </p>
      )}
    </form>
  );
}

// the cause labels a report uses, linking to what each one means
function FailureBadges() {
  return (
    <div>
      <p className="text-ink-3 text-label">
        Broken links are labelled by cause.{' '}
        <a
          href="#failures"
          className="text-ink-2 hover:text-ink whitespace-nowrap underline underline-offset-4"
        >
          What each means
        </a>
      </p>
      <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Failure types">
        {BADGES.map((b) => (
          <li key={b} className="flex">
            <Badge mono>{b}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

const BADGES = [
  'dns_failure',
  'timeout',
  'ssl_error',
  'redirect_loop',
  'soft_404',
  'http_4xx',
  'server_error',
].map(failureGroup);

// labels, tones and sentences come from the same maps the report uses, so the two never disagree
const FAILURE_TYPES = [
  'dns_failure',
  'timeout',
  'connection_refused',
  'ssl_error',
  'redirect_loop',
  'soft_404',
  'http_4xx',
  'server_error',
  'blocked',
];

// the classifier's vocabulary, so visitors know what a report will say
function Failures() {
  return (
    <GridRow inner={['lg:left-[33.333%]', 'lg:left-[66.666%]']}>
      <section id="failures" className="grid scroll-mt-4 grid-cols-1 lg:grid-cols-12">
        <div className="cell px-5 py-12 sm:px-8 lg:col-span-4 lg:border-r lg:py-16">
          <h2 className="section-title">Why links break</h2>
          <p className="text-ink-2 text-lead mt-4 max-w-sm leading-relaxed">
            LinkTrace records why each link failed, so you can tell a mistyped URL from an expired
            certificate or a server that&rsquo;s down.
          </p>
        </div>
        <ul className="cell divide-line divide-y border-t lg:col-span-8 lg:border-t-0">
          {FAILURE_TYPES.map((type) => (
            // the sentence wraps under its chip when both don't fit
            <li
              key={type}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 px-5 py-3.5 sm:px-8"
            >
              <span className="w-32 shrink-0">
                <ToneChip tone={pageStatusTone(false, type)}>{failureGroup(type)}</ToneChip>
              </span>
              <span className="text-ink-2 text-body min-w-0 grow basis-48">
                {FAILURE_EXPLANATION[type]}
              </span>
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
          <p className="text-ink-2 text-lead mt-4 max-w-sm leading-relaxed">
            Progress updates live while the crawl runs. When it finishes, the report groups pages by
            section (the first part of the URL path, like /blog) and checks the domain&rsquo;s
            robots.txt, sitemap and HTTPS.
          </p>
          <p className="text-ink-3 text-body mt-4 max-w-sm leading-relaxed">
            Every page gets an SEO audit (title, meta description, headings, canonical tag, Open
            Graph, structured data and image alt text). Broken pages link to a saved copy on the
            Wayback Machine when one exists, and the report compares your sitemap with the pages the
            crawl found.
          </p>
        </div>
        <div className="cell border-t lg:col-span-8 lg:border-t-0">
          <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-8">
            <h3 className="text-sm font-medium">By section</h3>
            <Badge>Sample</Badge>
          </div>
          <ul className="divide-line border-line mt-3 divide-y border-y">
            {SAMPLE_SECTIONS.map((r, i) => (
              // score and chip wrap under the name when large text leaves no room
              <li
                key={r.name}
                className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 px-5 py-3 sm:px-8"
              >
                <SectionDot colour={SECTION_HEX[i]} />
                <span className="min-w-0 grow">
                  <span className="block font-mono text-sm">{r.name}</span>
                  <span className="num text-ink-3 text-label block">{r.pages} pages</span>
                </span>
                <span className="ml-auto flex flex-wrap items-center justify-end gap-x-3.5 gap-y-1.5">
                  <span
                    className={`num text-label font-mono whitespace-nowrap ${scoreTextColour(r.seo)}`}
                  >
                    SEO {r.seo}
                  </span>
                  <Badge variant={r.broken ? 'warn' : 'ok'} className="w-21 justify-center">
                    {r.broken ? `${r.broken} broken` : 'Links OK'}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3 px-5 pt-6 sm:px-8">
            <h3 className="text-sm font-medium">Site health</h3>
            <Badge>Sample</Badge>
          </div>
          <ul className="divide-line border-line mt-3 divide-y border-t">
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
