import { Link } from "react-router-dom";
import { Award, BookOpen, CalendarDays, Compass, Flag, FolderHeart, Heart, Layers, MessageSquare, Sparkles } from "lucide-react";
import { Badge } from "@/components/Badge";
import { Kicker } from "@/components/Editorial";
import { LevelMascot, TIER_ICON } from "@/components/LevelMascot";
import { MascotSays } from "@/components/Mascot";
import { ProfileSkeleton } from "@/components/States";
import { TIERS, XP, useProgression, type XpEntry } from "@/lib/rewards";
import { updateSettings, useSettings } from "@/lib/settings";
import { useUser } from "@/lib/store/user";
import { useHead } from "@/lib/seo";
import { titlePath } from "@/lib/titles";

const ICONS: Record<string, typeof Award> = { chapters: BookOpen, series: Layers, complete: Sparkles, genres: Compass, days: CalendarDays, favourites: Heart, collections: FolderHeart, quests: Flag, comments: MessageSquare };

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

const REASON: Record<XpEntry["reason"], string> = { chapter: "Chapter finished", series: "New series", complete: "Series complete", genre: "New genre", quest: "Weekly quest" };
interface Moment {
  at: number;
  xp: number;
  titleKey?: string;
  parts: string[];
}
/** One row per moment (a finished chapter can also stamp genres and start a series). */
export function groupRecent(entries: XpEntry[], n: number): Moment[] {
  const out: Moment[] = [];
  for (let i = entries.length - 1; i >= 0 && out.length <= n; i--) {
    const x = entries[i]!;
    const last = out.at(-1);
    const part = x.reason === "genre" ? `${x.ref}` : REASON[x.reason];
    if (last && last.at === x.at && last.titleKey === x.titleKey) {
      last.xp += x.xp;
      last.parts.unshift(part);
    } else out.push({ at: x.at, xp: x.xp, titleKey: x.titleKey, parts: [part] });
  }
  return out.slice(0, n).map((m) => {
    const genres = m.parts.filter((p) => !Object.values(REASON).includes(p));
    const rest = m.parts.filter((p) => Object.values(REASON).includes(p));
    return { ...m, parts: genres.length ? [...rest, `${genres.length === 1 ? "new genre" : "new genres"}: ${genres.join(", ")}`] : rest };
  });
}

const when = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Achievements (bottom-nav "Awards"). Everything here is derived from reading already stored on this device. */
export default function Achievements() {
  const ready = useUser((s) => s.ready);
  const titles = useUser((s) => s.titles);
  const { rewards } = useSettings();
  const { level, sets, ledger } = useProgression();
  useHead({ title: "Achievements", noindex: true });
  if (!ready) return <ProfileSkeleton />;
  if (!rewards)
    return (
      <div className="page page-narrow">
        <h1 className="page-title">Achievements</h1>
        <RewardsOff />
      </div>
    );
  const earned = sets.reduce((n, s) => n + s.tier, 0);
  const total = sets.reduce((n, s) => n + s.goals.length, 0);
  const recent = groupRecent(ledger.entries, 6);
  return (
    <div className="page page-narrow ach-page">
      <header className="ach-head">
        <Kicker>Just for fun, no streaks</Kicker>
        <h1 className="page-title">Achievements</h1>
      </header>

      <section className="level-card" aria-labelledby="level-h">
        <LevelMascot level={level} size={104} />
        <div className="level-body">
          <p className="level-tier">{level.tier.name}</p>
          <h2 id="level-h">Level {level.level}</h2>
          <p className="level-xp">
            <b>{level.into}</b> / {level.span} XP to level {level.level + 1}
          </p>
          <p className="muted level-next">{level.nextTier ? `${level.nextTier.name} at level ${level.nextTier.from} adds the ${level.nextTier.accessory.toLowerCase()}.` : "Every mascot accessory unlocked."}</p>
        </div>
      </section>

      <ol className="tier-ladder" aria-label="Level tiers">
        {TIERS.map((t) => {
          const Icon = TIER_ICON[t.id];
          const on = level.level >= t.from;
          return (
            <li key={t.id} data-on={on || undefined} aria-current={t.id === level.tier.id ? "step" : undefined}>
              <span className="tier-dot" aria-hidden="true">
                <Icon size={16} aria-hidden />
              </span>
              <span className="tier-name">{t.name}</span>
              <span className="tier-from">Lv {t.from}</span>
              <span className="sr-only">{on ? `Unlocked: ${t.accessory}` : `Locked until level ${t.from}`}</span>
            </li>
          );
        })}
      </ol>

      <section aria-labelledby="sets-h">
        <div className="profile-block-head">
          <h2 id="sets-h">Badges</h2>
          <p className="muted">
            {earned} of {total} tiers
          </p>
        </div>
        <ul className="badge-grid">
          {sets.map((s) => (
            <li key={s.id}>
              <Badge icon={ICONS[s.id] ?? Award} name={s.name} tier={s.tier} tiers={s.goals.length} progress={s.progress} hint={s.hint} detail={`${s.rule}: ${s.value}`} />
            </li>
          ))}
        </ul>
      </section>

      {recent.length > 0 && (
        <section className="profile-block" aria-labelledby="xp-recent-h">
          <h2 id="xp-recent-h">Recent XP</h2>
          <ul className="xp-list">
            {recent.map((x, i) => {
              const t = x.titleKey ? titles.get(x.titleKey) : undefined;
              return (
                <li key={`${x.at}-${i}`}>
                  <span className="xp-amt">+{x.xp}</span>
                  <span className="xp-why">
                    {x.parts.join(", ")}
                    {t && (
                      <>
                        {" · "}
                        <Link to={titlePath(t)}>{t.title}</Link>
                      </>
                    )}
                  </span>
                  <span className="muted xp-when">{when(x.at)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="profile-block" aria-labelledby="xp-how-h">
        <h2 id="xp-how-h">How XP works</h2>
        <ul className="xp-rules">
          <li>
            <b>+{XP.chapter}</b> for each chapter you read to the last page, once per chapter
          </li>
          <li>
            <b>+{XP.series}</b> the first time you finish a chapter of a new series
          </li>
          <li>
            <b>+{XP.genre}</b> for the first chapter in a genre (a passport stamp)
          </li>
          <li>
            <b>+{XP.complete}</b> for reading a series to its final chapter
          </li>
          <li>
            <b>+{XP.quest}</b> for each weekly quest
          </li>
        </ul>
        <p className="muted">Re-reading, opening chapters and marking chapters read by hand do not add XP. Nothing expires and nothing can be lost.</p>
      </section>

      <p className="muted ach-foot">
        Turn rewards off any time in <Link to="/profile#rewards">Profile &gt; Rewards</Link>.
      </p>
    </div>
  );
}
