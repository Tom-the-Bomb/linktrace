export function SectionDot({ colour }: { colour: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-2.5 shrink-0 rounded-full forced-color-adjust-none"
      style={{ background: colour }}
    />
  );
}
