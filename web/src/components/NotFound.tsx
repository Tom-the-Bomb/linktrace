import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useSeo } from '../hooks/useSeo';
import { TopNav } from './TopNav';
import { GridRow } from './ui/GridRow';

// standalone 404 state, reusable for any unmatched route
export function NotFound({
  title = 'Page not found',
  message = "This page doesn't exist or has moved.",
}: {
  title?: string;
  message?: string;
}) {
  useSeo({ title: '404 · Not found', path: '/404', noindex: true });

  return (
    <div className="flex flex-1 flex-col">
      <TopNav />
      <div className="frame flex-1">
        <section className="grid grid-cols-1 lg:grid-cols-12">
          <div className="cell px-5 pb-10 pt-12 sm:px-8 lg:col-span-8 lg:border-r lg:py-20">
            <h1 className="text-[40px] font-semibold leading-none tracking-display sm:text-[56px]">
              {title}
            </h1>
            <p className="mt-4 max-w-md text-[17px] leading-relaxed text-ink-2">
              {message} <span className="num font-mono text-[14px] text-ink-3">(404)</span>
            </p>
            <Link to="/" className="btn-primary mt-8 h-10 px-4 text-sm">
              <ArrowLeft className="size-4" strokeWidth={2} aria-hidden="true" />
              Back to home
            </Link>
          </div>
        </section>
        <GridRow inner={['lg:left-[66.666%]']}>
          <div />
        </GridRow>
      </div>
    </div>
  );
}
