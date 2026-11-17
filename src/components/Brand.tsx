import { Mascot } from "./Mascot";

/** Compact logo: the supplied mascot's face in an ink panel plus the DAWGHWA wordmark. */
export function Brand({ compact }: { compact?: boolean }) {
  return (
    <span className="brand">
      <Mascot variant="face" size={30} className="brand-mark" />
      {!compact && <span className="brand-word">Dawghwa</span>}
    </span>
  );
}

/** Small crown glyph taken from the mascot's book emblem. Decorative. */
export function Crown({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={`crown ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 18.5 4.6 7.5l4.6 4.3L12 5l2.8 6.8 4.6-4.3L21 18.5z" fill="currentColor" />
    </svg>
  );
}
