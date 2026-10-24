import { type FormEvent, useRef } from 'react';

import { Globe, LoaderCircle } from 'lucide-react';

import { useFocusShortcut } from '../hooks/useFocusShortcut';

interface Props {
  url: string;
  setUrl: (s: string) => void;
  onSubmit: (e: FormEvent) => void;
  submitting: boolean;
  // extra controls beside submit (stop/back button)
  children?: React.ReactNode;
}

// compact launcher in the sticky header of /jobs/:id and /history
export function CrawlForm({ url, setUrl, onSubmit, submitting, children }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  useFocusShortcut(inputRef);
  return (
    <form onSubmit={onSubmit} className="flex w-full items-center gap-2 md:max-w-lg md:flex-1">
      <label className="field relative flex h-9 min-w-0 flex-1 items-center gap-2 px-2.5">
        <span className="sr-only">Domain to crawl</span>
        <Globe className="size-4 shrink-0 text-ink-3" strokeWidth={2} aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Crawl another domain"
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-[13px] outline-none placeholder:font-sans placeholder:text-sm placeholder:text-ink-3"
        />
        {url === '' && (
          <span className="kbd hidden !h-5 !min-w-5 !text-[10px] sm:inline-flex" aria-hidden="true">
            /
          </span>
        )}
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="btn-primary h-9 w-[72px] shrink-0 text-sm"
      >
        {submitting ? (
          <LoaderCircle className="spin size-4" strokeWidth={2.5} aria-label="Starting crawl" />
        ) : (
          'Crawl'
        )}
      </button>
      {children}
    </form>
  );
}
