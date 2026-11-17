/**
 * Mascot slot. Dawghwa's mascot artwork is supplied by the project owner:
 * drop files named after a pose (e.g. `welcome.webp`, `empty.webp`,
 * `error.webp`, `offline.webp`) into `src/assets/mascot/`. Until real artwork
 * exists, nothing is rendered: no stand-in character is generated.
 */
const files = import.meta.glob<string>("../assets/mascot/*.{webp,png,svg,avif}", { eager: true, query: "?url", import: "default" });
const byPose = new Map(Object.entries(files).map(([path, url]) => [path.split("/").pop()!.replace(/\.\w+$/, ""), url]));

export type Pose = "welcome" | "empty" | "error" | "offline" | "reading" | "done";

export const hasMascot = (pose: Pose) => byPose.has(pose) || byPose.has("default");

export function Mascot({ pose, size = 120, className = "state-art" }: { pose: Pose; size?: number; className?: string }) {
  const src = byPose.get(pose) ?? byPose.get("default");
  if (!src) return null;
  return <img className={className} src={src} width={size} height={size} alt="" decoding="async" />;
}
