import { cacheTitles, db, getCachedTitles, type EventRecord, type Hidden, type LibraryRecord, type ProfileRecord, type ProgressRecord } from "./db";
import { getUser, newProfile, switchProfile } from "./user";
import type { Title } from "../titles";

/**
 * Profile export / import as a portable JSON document. This is also the
 * shape a future cloud sync would exchange; nothing leaves the device unless
 * the user saves the file themselves.
 */
export interface ProfileExport {
  format: "dawghwa-profile";
  version: 1;
  exportedAt: string;
  profile: Omit<ProfileRecord, "id">;
  library: Omit<LibraryRecord, "profileId">[];
  progress: Omit<ProgressRecord, "profileId">[];
  hidden: Omit<Hidden, "profileId">[];
  events: Omit<EventRecord, "profileId">[];
  titles: Title[];
}

const strip = <T extends { profileId: string }>(xs: T[]) => xs.map(({ profileId: _p, ...rest }) => rest);

export async function exportProfile(profileId = getUser().profile?.id): Promise<ProfileExport> {
  if (!profileId) throw new Error("No active profile");
  const d = await db();
  const profile = await d.get("profiles", profileId);
  if (!profile) throw new Error("Profile not found");
  const [library, progress, hidden, events] = await Promise.all([
    d.getAllFromIndex("library", "byProfile", profileId),
    d.getAllFromIndex("progress", "byProfile", profileId),
    d.getAllFromIndex("hidden", "byProfile", profileId),
    d.getAllFromIndex("events", "byProfile", profileId),
  ]);
  // Event titles too, so derived rewards (genre stamps) survive a round trip.
  const keys = [...new Set([...library, ...progress, ...hidden, ...events.filter((e) => e.kind === "chapter_read" || e.kind === "title_finished")].map((r) => r.titleKey))];
  const titles = [...(await getCachedTitles(keys)).values()].map((t) => {
    const { cachedAt: _c, ...rest } = t as Title & { cachedAt?: number };
    return rest;
  });
  const { id: _id, ...p } = profile;
  return { format: "dawghwa-profile", version: 1, exportedAt: new Date().toISOString(), profile: p, library: strip(library), progress: strip(progress), hidden: strip(hidden), events: strip(events), titles };
}

function isExport(x: unknown): x is ProfileExport {
  const o = x as ProfileExport;
  return Boolean(o && o.format === "dawghwa-profile" && o.version === 1 && o.profile && Array.isArray(o.library) && Array.isArray(o.progress) && Array.isArray(o.events));
}

/** Import as a new profile (never merges into or overwrites an existing one). */
export async function importProfile(json: string): Promise<ProfileRecord> {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!isExport(data)) throw new Error("That file isn't a Dawghwa profile export.");
  const base = newProfile(data.profile.name || "Imported", getUser().profiles.length);
  const profile: ProfileRecord = { ...base, name: `${data.profile.name || "Imported"}`.slice(0, 40), color: data.profile.color || base.color, onboarded: true, prefs: { ...base.prefs, ...data.profile.prefs } };
  const pid = profile.id;
  const d = await db();
  const tx = d.transaction(["profiles", "library", "progress", "hidden", "events"], "readwrite");
  await tx.objectStore("profiles").put(profile);
  for (const r of data.library) await tx.objectStore("library").put({ ...r, collections: r.collections ?? [], profileId: pid });
  for (const r of data.progress) await tx.objectStore("progress").put({ ...r, read: r.read ?? {}, profileId: pid });
  for (const r of data.hidden ?? []) await tx.objectStore("hidden").put({ ...r, profileId: pid });
  for (const r of data.events) await tx.objectStore("events").put({ ...r, profileId: pid });
  await tx.done;
  await cacheTitles((data.titles ?? []).filter((t) => t && typeof t.key === "string" && typeof t.title === "string"));
  await switchProfile(pid);
  return profile;
}

export function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
