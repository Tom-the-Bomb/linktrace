// bottom-of-page footer, in every route via the App layout shell
export function Footer() {
  const links = [
    { href: 'https://github.com/Tom-the-Bomb/linktrace', label: 'github' },
    { href: 'https://github.com/Tom-the-Bomb', label: '@Tom-the-Bomb' },
  ];
  return (
    <footer className="relative z-10 mt-auto border-t border-ink-500/70 bg-ink-900/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-5 sm:px-10">
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-300">
          © 2026 Tom the Bomb · all rights reserved
        </span>
        <nav className="flex items-center gap-5">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost"
            >
              {l.label} ↗
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
