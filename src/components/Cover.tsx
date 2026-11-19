import { useState } from "react";
import { useSettings } from "@/lib/settings";
import { coverSrc } from "@/lib/api/images";

/**
 * Cover image in a fixed 5:7 frame (no layout shift), lazy loaded, with a
 * typographic fallback when the provider has no cover or it fails to load.
 * `large` (when the API provides it) is offered via srcset for big slots.
 */
export function Cover({ src: rawSrc, large: rawLarge, title, eager, sizes = "160px", className = "", mature }: { src?: string; large?: string; title: string; eager?: boolean; sizes?: string; className?: string; mature?: boolean }) {
  const src = coverSrc(rawSrc);
  const large = coverSrc(rawLarge);
  const blur = useSettings().matureCovers === "blur" && mature;
  const [failed, setFailed] = useState<string | undefined>();
  const [loaded, setLoaded] = useState<string | undefined>();
  const broken = !src || failed === src;
  return (
    <div className={`cover ${className}`} data-mature={blur || undefined}>
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
      {blur && !broken && <span className="cover-mature">Mature</span>}
    </div>
  );
}
