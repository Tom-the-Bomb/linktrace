// report section heading; `right` holds controls and wraps under the title on narrow screens
export function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-5 pt-10 pb-5 sm:px-8">
      <div className="min-w-0">
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="text-ink-3 mt-1 text-[15px]">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
