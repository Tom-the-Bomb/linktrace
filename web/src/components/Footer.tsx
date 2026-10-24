// bottom-of-page footer, in every route via the App layout shell
export function Footer() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="frame flex items-center justify-between gap-4 px-4 py-5 text-[13px] text-ink-3 sm:px-6">
        <span>© 2026 Tom the Bomb</span>
        <a
          href="https://github.com/Tom-the-Bomb"
          target="_blank"
          rel="noreferrer"
          className="text-ink-2 underline-offset-4 hover:text-ink hover:underline"
        >
          @Tom-the-Bomb
        </a>
      </div>
    </footer>
  );
}
