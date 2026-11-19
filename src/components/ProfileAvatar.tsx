import type { ProfileRecord } from "@/lib/store/db";
import { useSettings } from "@/lib/settings";
import { Avatar } from "./Avatar";

/** The profile's avatar wearing its equipped frame (only while Rewards is on). */
export function ProfileAvatar({ profile, size = 36, frame }: { profile: Pick<ProfileRecord, "name" | "color" | "cosmetics">; size?: number; frame?: string }) {
  const { rewards } = useSettings();
  const f = frame ?? (rewards ? profile.cosmetics?.frame : undefined);
  if (!f || f === "none") return <Avatar name={profile.name} color={profile.color} size={size} />;
  return (
    <span className="avatar-frame" data-frame={f} style={{ width: size, height: size }}>
      <Avatar name={profile.name} color={profile.color} size={Math.round(size * 0.8)} />
    </span>
  );
}
