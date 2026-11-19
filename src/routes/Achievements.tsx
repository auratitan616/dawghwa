import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Award, BookOpen, Compass, FolderHeart, Layers, Sparkles, Trophy } from "lucide-react";
import { Badge } from "@/components/Badge";
import { Kicker } from "@/components/Editorial";
import { MascotSays } from "@/components/Mascot";
import { ProfileSkeleton } from "@/components/States";
import { achievements, readingStats } from "@/lib/profile/stats";
import { updateSettings, useSettings } from "@/lib/settings";
import { allCollections, useUser } from "@/lib/store/user";
import { useHead } from "@/lib/seo";

const ICONS: Record<string, typeof Award> = { "first-chapter": BookOpen, "ten-chapters": BookOpen, "hundred-chapters": Trophy, "five-series": Layers, "first-complete": Sparkles, genres: Compass, collection: FolderHeart };

export function RewardsOff() {
  return (
    <div className="state state-center">
      <MascotSays size={96}>Rewards are switched off for this profile. Your reading still counts; nothing was deleted.</MascotSays>
      <button className="btn btn-primary" onClick={() => updateSettings({ rewards: true })}>
        Turn rewards on
      </button>
    </div>
  );
}

/** Achievements (bottom-nav "Awards"). Everything here is derived from reading already stored on this device. */
export default function Achievements() {
  const ready = useUser((s) => s.ready);
  const state = useUser((s) => s);
  const { rewards } = useSettings();
  const stats = useMemo(() => readingStats(state.progress.values(), state.library.values(), state.titles), [state.progress, state.library, state.titles]);
  const awards = useMemo(() => achievements(stats, allCollections(state).length), [stats, state]);
  useHead({ title: "Achievements", noindex: true });
  if (!ready) return <ProfileSkeleton />;
  if (!rewards)
    return (
      <div className="page page-narrow">
        <h1 className="page-title">Achievements</h1>
        <RewardsOff />
      </div>
    );
  const earned = awards.filter((a) => a.earned).length;
  return (
    <div className="page page-narrow ach-page">
      <header className="ach-head">
        <Kicker>Just for fun, no streaks</Kicker>
        <h1 className="page-title">Achievements</h1>
        <p className="muted">
          {earned} of {awards.length} earned. Only chapters you read to the last page count.
        </p>
      </header>
      <ul className="badge-grid">
        {awards.map((a) => (
          <li key={a.id}>
            <Badge icon={ICONS[a.id] ?? Award} name={a.title} tier={a.earned ? 1 : 0} tiers={1} progress={a.value / a.goal} hint={a.earned ? a.detail : `${a.detail} · ${a.value}/${a.goal}`} />
          </li>
        ))}
      </ul>
      <p className="muted ach-foot">
        Turn rewards off any time in <Link to="/profile#rewards">Profile &gt; Rewards</Link>.
      </p>
    </div>
  );
}
