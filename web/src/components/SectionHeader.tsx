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
    <div className="gutter flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pt-10 pb-5">
      <div className="min-w-0">
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="text-ink-3 text-body mt-1">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
