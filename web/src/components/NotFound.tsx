import { Link } from 'react-router-dom';

import { useSeo } from '../hooks/useSeo';
import { Wordmark } from './Wordmark';

// standalone 404 state, reusable for any unmatched route
export function NotFound({
  eyebrow = 'error 404',
  title = 'Page not found',
  message = "This page doesn't exist or has moved.",
}: {
  eyebrow?: string;
  title?: string;
  message?: string;
}) {
  useSeo({ title: '404 · Not found', path: '/404', noindex: true });

  return (
    <div className="relative flex flex-1 flex-col">
      <header className="px-6 py-4 sm:px-10">
        <Wordmark />
      </header>

      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 pb-32 text-center">
        <span className="eyebrow mb-6">{eyebrow}</span>

        <h1 className="display text-7xl font-light leading-none sm:text-8xl">
          4<span className="text-accent">0</span>4
        </h1>

        <h2 className="display mt-8 text-2xl font-normal">{title}</h2>
        <p className="mt-4 max-w-md text-base leading-relaxed text-ink-300">{message}</p>

        <Link
          to="/"
          className="mt-10 border border-ink-500/70 px-5 py-2.5 font-mono text-xs uppercase tracking-widest text-ink-300 transition hover:bg-ink-600/40 hover:text-paper"
        >
          ← back to home
        </Link>
      </section>
    </div>
  );
}
