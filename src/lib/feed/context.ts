import { useMemo } from "react";
import { useIntel } from "../intel/runtime";
import type { RankContext } from "../intel/rank";
import { useUser } from "../store/user";
import type { Title } from "../titles";

/** Session impressions (anti-repetition across refreshes of personal rows). */
const shown = new Map<string, number>();
export function noteShown(keys: string[]) {
  for (const k of keys) shown.set(k, (shown.get(k) ?? 0) + 1);
}

/** Everything ranking needs for the active profile. */
export function useRankContext(opts: { excludeLibrary?: boolean } = {}): RankContext & { ready: boolean; personalize: boolean } {
  const state = useIntel();
  const profile = useUser((s) => s.profile);
  const hidden = useUser((s) => s.hidden);
  const library = useUser((s) => s.library);
  const progress = useUser((s) => s.progress);
  const titles = useUser((s) => s.titles);
  return useMemo(() => {
    const exclude = new Set<string>(hidden.keys());
    library.forEach((r, k) => {
      if (r.rating === -1 || r.status === "dropped" || r.status === "completed") exclude.add(k);
      if (opts.excludeLibrary && r.status) exclude.add(k);
    });
    if (opts.excludeLibrary) progress.forEach((_, k) => exclude.add(k));
    const personalize = profile?.prefs.personalize !== false;
    return {
      ready: Boolean(profile),
      personalize,
      state: personalize ? state : null,
      prefs: personalize && profile ? { genres: profile.prefs.genres, kinds: profile.prefs.kinds, avoid: profile.prefs.avoid } : profile ? { genres: [], kinds: [], avoid: profile.prefs.avoid } : undefined,
      exclude,
      recentlyShown: shown,
      titleOf: (k: string): Title | undefined => titles.get(k),
    };
  }, [state, profile, hidden, library, progress, titles, opts.excludeLibrary]);
}
