// Standard report section heading: § number + serif title + optional right-aligned subtitle
// (or arbitrary `right` content like a control bar, which takes precedence over `subtitle`).
export function SectionHeader({
  number,
  title,
  subtitle,
  right,
  leftExtra,
}: {
  number: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  // optional content rendered to the right of the title, inside the left-aligned group —
  // useful for filters/search that should hug the heading
  leftExtra?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-ink-500/70 pb-4">
      <div className="flex flex-wrap items-baseline gap-5">
        <span className="section-num">§ {number}</span>
        <h2 className="display text-3xl font-normal tracking-tight sm:text-4xl">{title}</h2>
        {leftExtra}
      </div>
      {right ? (
        right
      ) : (
        subtitle && <span className="hidden text-xs italic text-ink-300 sm:inline">{subtitle}</span>
      )}
    </div>
  );
}
