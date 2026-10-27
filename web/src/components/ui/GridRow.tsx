export function GridRow({
  children,
  inner = [],
}: {
  children?: React.ReactNode;
  inner?: string[];
}) {
  return (
    <div className="relative border-t">
      <span aria-hidden="true" className="cross top-0 left-0" />
      <span aria-hidden="true" className="cross cross-end top-0 left-full" />
      {inner.map((pos) => (
        <span key={pos} aria-hidden="true" className={`cross top-0 hidden lg:block ${pos}`} />
      ))}
      {children}
    </div>
  );
}
