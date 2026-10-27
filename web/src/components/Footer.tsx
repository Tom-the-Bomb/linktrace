export function Footer() {
  return (
    <footer className="mt-auto border-t">
      <div className="frame text-ink-3 text-label flex items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <span>© 2026 Tom the Bomb</span>
        <a
          href="https://github.com/Tom-the-Bomb"
          target="_blank"
          rel="noreferrer"
          className="text-ink-2 hover:text-ink tap-area underline-offset-4 hover:underline"
        >
          @Tom-the-Bomb
        </a>
      </div>
    </footer>
  );
}
