// bottom-of-page footer, in every route via the App layout shell
export function Footer() {
  return (
    <footer className="border-line mt-auto border-t">
      <div className="frame text-ink-3 flex items-center justify-between gap-4 px-4 py-5 text-[13px] sm:px-6">
        <span>© 2026 Tom the Bomb</span>
        <a
          href="https://github.com/Tom-the-Bomb"
          target="_blank"
          rel="noreferrer"
          className="text-ink-2 hover:text-ink underline-offset-4 hover:underline"
        >
          @Tom-the-Bomb
        </a>
      </div>
    </footer>
  );
}
