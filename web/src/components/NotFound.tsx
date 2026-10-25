import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useSeo } from '../hooks/useSeo';
import { SplitPage } from './SplitPage';
import { Button } from './ui/button';

export function NotFound({ title, message }: { title: string; message: string }) {
  useSeo({ title: 'Page not found', path: '/404', noindex: true });
  return (
    <SplitPage title={title}>
      <p className="text-ink-2 mt-4 max-w-md text-[17px] leading-relaxed">
        {message} <span className="num text-ink-3 font-mono text-[14px]">(404)</span>
      </p>
      <Button size="lg" className="mt-8" asChild>
        <Link to="/">
          <ArrowLeft strokeWidth={2} aria-hidden="true" />
          Back to home
        </Link>
      </Button>
    </SplitPage>
  );
}
