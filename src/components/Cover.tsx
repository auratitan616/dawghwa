import { useState } from "react";

/**
 * Cover image in a fixed 5:7 frame (no layout shift), lazy loaded, with a
 * typographic fallback when the provider has no cover or it fails to load.
 * `large` (when the API provides it) is offered via srcset for big slots.
 */
export function Cover({ src, large, title, eager, sizes = "160px", className = "" }: { src?: string; large?: string; title: string; eager?: boolean; sizes?: string; className?: string }) {
  const [failed, setFailed] = useState<string | undefined>();
  const [loaded, setLoaded] = useState<string | undefined>();
  const broken = !src || failed === src;
  return (
    <div className={`cover ${className}`}>
      {broken ? (
        <div className="cover-fallback" aria-hidden="true">
          <span className="cover-fallback-text">{title}</span>
        </div>
      ) : (
        <img
          src={src}
          srcSet={large && large !== src ? `${src} 256w, ${large} 512w` : undefined}
          sizes={large && large !== src ? sizes : undefined}
          alt=""
          width={256}
          height={358}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={eager ? "high" : undefined}
          data-loaded={loaded === src ? "" : undefined}
          onLoad={() => setLoaded(src)}
          onError={() => setFailed(src)}
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  );
}
