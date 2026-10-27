// a full-width row of the grid frame: top hairline with crosshairs where it meets the frame edges
export function GridRow({
  children,
  // extra crosshair x-positions (e.g. 'lg:left-7/12') where an inner column line meets this row
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
