// Standard report section heading: § number + serif title + optional right-aligned subtitle.
export function SectionHeader({
  number,
  title,
  subtitle,
}: {
  number: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-8 flex items-end justify-between gap-6 border-b border-ink-500/70 pb-4">
      <div className="flex items-baseline gap-5">
        <span className="section-num">§ {number}</span>
        <h2 className="display text-3xl font-normal tracking-tight sm:text-4xl">{title}</h2>
      </div>
      {subtitle && <span className="hidden text-xs italic text-ink-300 sm:inline">{subtitle}</span>}
    </div>
  );
}
