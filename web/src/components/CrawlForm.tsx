import { useRef, useState } from 'react';

import { Globe } from 'lucide-react';

import { useFocusShortcut } from '../hooks/useFocusShortcut';
import { Button } from './ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from './ui/input-group';
import { Kbd } from './ui/kbd';
import { Spinner } from './ui/spinner';

interface Props {
  onSubmit: (url: string) => void;
  submitting: boolean;
  children?: React.ReactNode;
}

export function CrawlForm({ onSubmit, submitting, children }: Props) {
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useFocusShortcut(inputRef);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(url);
      }}
      className="flex w-full items-center gap-2 md:max-w-lg md:flex-1"
    >
      <InputGroup className="flex-1">
        <InputGroupAddon>
          <Globe />
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
          className="text-label font-mono placeholder:font-sans placeholder:text-sm"
        />
        {url === '' && (
          <InputGroupAddon align="inline-end" className="hidden sm:flex" aria-hidden="true">
            <Kbd>/</Kbd>
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
