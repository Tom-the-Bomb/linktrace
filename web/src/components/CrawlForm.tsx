import { type FormEvent, useState } from 'react';

import { useTypingPlaceholder } from '../hooks/useTypingPlaceholder';

interface Props {
  url: string;
  setUrl: (s: string) => void;
  onSubmit: (e: FormEvent) => void;
  submitting: boolean;
  error?: string | null;
  // hero = large landing input w/ animated placeholder; compact = sticky-header bar
  variant?: 'hero' | 'compact';
  // extra controls beside submit (compact stop/back button)
  children?: React.ReactNode;
}

// shared URL input + submit button (landing hero and compact header)
export function CrawlForm({
  url,
  setUrl,
  onSubmit,
  submitting,
  error,
  variant = 'hero',
  children,
}: Props) {
  if (variant === 'compact') {
    return (
      <form onSubmit={onSubmit} className="ml-auto flex max-w-md flex-1 gap-2">
        <input
          type="text"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="new domain…"
          className="input flex-1 px-3 py-2 text-xs"
        />
        <button
          type="submit"
          disabled={submitting}
          // fixed size so the "crawl" -> "…" swap during submit can't shift layout
          className="h-[34px] w-[80px] shrink-0 bg-accent font-mono text-[11px] uppercase tracking-widest text-ink-900 transition hover:bg-accent-soft disabled:opacity-50"
        >
          {submitting ? '…' : 'crawl'}
        </button>
        {children}
      </form>
    );
  }

  return <HeroForm url={url} setUrl={setUrl} onSubmit={onSubmit} submitting={submitting} error={error} />;
}

function HeroForm({ url, setUrl, onSubmit, submitting, error }: Omit<Props, 'variant' | 'children'>) {
  const [focused, setFocused] = useState(false);
  // pause when focused/non-empty so the fake caret doesn't fight the real one
  const placeholder = useTypingPlaceholder(url === '' && !focused);
  return (
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
        {/* fake placeholder: animated demo domain + blinking cursor */}
        {url === '' && !focused && (
          // override [&_span]:pointer-events-auto so these spans don't eat input clicks
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
  );
}
