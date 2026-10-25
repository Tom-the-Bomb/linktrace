import { type SubmitEvent, useRef } from 'react';

import { Globe } from 'lucide-react';

import { useFocusShortcut } from '../hooks/useFocusShortcut';
import { Button } from './ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from './ui/input-group';
import { Kbd } from './ui/kbd';
import { Spinner } from './ui/spinner';

interface Props {
  url: string;
  setUrl: (s: string) => void;
  onSubmit: (e: SubmitEvent) => void;
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
      <InputGroup className="flex-1">
        <InputGroupAddon>
          <Globe strokeWidth={2} aria-hidden="true" />
        </InputGroupAddon>
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
          placeholder="Crawl another domain"
          className="font-mono text-[13px] placeholder:font-sans placeholder:text-sm"
        />
        {url === '' && (
          <InputGroupAddon align="inline-end" className="hidden sm:flex" aria-hidden="true">
            <Kbd className="text-[10px]">/</Kbd>
          </InputGroupAddon>
        )}
      </InputGroup>
      <Button type="submit" disabled={submitting} className="w-18">
        {submitting ? <Spinner aria-label="Starting crawl" /> : 'Crawl'}
      </Button>
      {children}
    </form>
  );
}
