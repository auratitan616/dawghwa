/** Hanko-seal mark: a square ink seal with a carved "D". Uses currentColor. */
export function Seal({ className = "brand-seal", title }: { className?: string; title?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <rect x="1.5" y="1.5" width="29" height="29" rx="5" fill="currentColor" />
      <path d="M10 8.5h6.2c5 0 8.3 3.1 8.3 7.5s-3.3 7.5-8.3 7.5H10z" fill="none" stroke="var(--bg, #0e0d0c)" strokeWidth="3.2" strokeLinejoin="round" />
      <path d="M10 8.5v15" stroke="var(--bg, #0e0d0c)" strokeWidth="3.2" />
    </svg>
  );
}

export function Brand() {
  return (
    <span className="brand">
      <Seal />
      <span>Dawghwa</span>
    </span>
  );
}
