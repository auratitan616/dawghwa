import { Link } from "react-router-dom";
import { Check, ChevronRight } from "lucide-react";
import { XP, useProgression, type Quest } from "@/lib/rewards";
import { nextQuestUnlock } from "@/lib/rewards/cosmetics";
import { useSettings } from "@/lib/settings";
import { useUser } from "@/lib/store/user";
import { ProgressRing } from "./ProgressRing";

const label = (q: Quest) => (q.doneAt ? "Done" : `${q.value} of ${q.goal}`);

/** One weekly quest. Done quests stay visible (with their reward) until the week ends. */
export function QuestCard({ q, unlock }: { q: Quest; unlock?: string }) {
  const done = q.doneAt !== undefined;
  return (
    <li className="quest" data-done={done || undefined}>
      <ProgressRing value={q.value / q.goal} size={48} stroke={4} tone="quest" label={`${q.title}: ${label(q)}`}>
        {done ? <Check size={20} aria-hidden /> : q.goal > 1 ? `${q.value}/${q.goal}` : null}
      </ProgressRing>
      <div className="quest-body">
        <h3>{q.title}</h3>
        <p className="muted">{q.detail}</p>
        <p className="quest-reward">{done ? `Done · +${XP.quest} XP` : `+${XP.quest} XP${unlock ? ` · counts toward ${unlock}` : ""}`}</p>
      </div>
      {!done && (
        <Link className="btn btn-sm quest-go" to={q.action.to}>
          {q.action.label}
        </Link>
      )}
    </li>
  );
}

export function QuestList({ quests }: { quests: Quest[] }) {
  const { quests: book } = useProgression();
  const next = nextQuestUnlock(book.done.length);
  return (
    <ul className="quest-list">
      {quests.map((q) => (
        <QuestCard key={q.id} q={q} unlock={next?.name} />
      ))}
    </ul>
  );
}

/** Compact "This week" row on Home. Hidden when Rewards is off. */
export function QuestStrip() {
  const { rewards } = useSettings();
  const ready = useUser((s) => s.ready);
  const { quests } = useProgression();
  if (!rewards || !ready || !quests.current.length) return null;
  const done = quests.current.filter((q) => q.doneAt !== undefined).length;
  return (
    <section className="quest-strip" aria-labelledby="quest-strip-h">
      <Link to="/achievements#quests" className="quest-strip-head">
        <h2 id="quest-strip-h">This week's quests</h2>
        <span className="muted">
          {done} of {quests.current.length} done <ChevronRight size={16} aria-hidden="true" />
        </span>
      </Link>
      <ul>
        {quests.current.map((q) => (
          <li key={q.id} data-done={q.doneAt !== undefined || undefined}>
            <Link to={q.doneAt !== undefined ? "/achievements#quests" : q.action.to}>
              <ProgressRing value={q.value / q.goal} size={32} stroke={3} tone="quest">
                {q.doneAt !== undefined ? <Check size={14} aria-hidden /> : null}
              </ProgressRing>
              <span>
                <b>{q.title}</b>
                <span className="muted">{label(q)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
