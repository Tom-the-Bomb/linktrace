// a full-width row of the grid frame: top hairline with crosshairs where it meets the frame edges
export function GridRow({
  children,
  className = '',
  // extra crosshair x-positions (e.g. 'lg:left-[58.333%]') where an inner column line meets this row
  inner = [],
}: {
  children: React.ReactNode;
  className?: string;
  inner?: string[];
}) {
  return (
    <div className={`relative border-t border-line ${className}`}>
      <span aria-hidden="true" className="cross left-0 top-0" />
      <span aria-hidden="true" className="cross left-full top-0" />
      {inner.map((pos) => (
        <span key={pos} aria-hidden="true" className={`cross top-0 hidden lg:block ${pos}`} />
      ))}
      {children}
    </div>
  );
}
