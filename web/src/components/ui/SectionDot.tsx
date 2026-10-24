// swatch marking a site section; the same colour follows it into the graph
export function SectionDot({ colour, className = '' }: { colour: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-2.5 shrink-0 rounded-full ${className}`}
      style={{ background: colour }}
    />
  );
}
