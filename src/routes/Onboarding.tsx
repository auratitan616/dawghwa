import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Brand } from "@/components/Brand";
import { Mascot } from "@/components/Mascot";
import { useVocabulary } from "@/lib/query";
import { updateProfile, useUser } from "@/lib/store/user";
import { useHead } from "@/lib/seo";

const FORMATS: [string, string, string][] = [
  ["manhwa", "Manhwa", "Korean, usually full-colour vertical scroll"],
  ["manga", "Manga", "Japanese, read right to left"],
  ["manhua", "Manhua", "Chinese, often cultivation and fantasy"],
];
// a curated first screen; the full vocabulary from the API fills in the rest
const STARTER = ["Action", "Fantasy", "Romance", "Comedy", "Drama", "Isekai", "Thriller", "Horror", "Slice of Life", "Psychological", "Mystery", "Sci-Fi", "Sports", "Historical", "Martial Arts", "Reincarnation", "Time Travel", "Villainess", "Monsters", "Survival", "Office Workers", "School Life", "Tragedy", "Mecha"];
const AVOID = ["Gore", "Sexual Violence", "Boys' Love", "Girls' Love", "Harem", "Tragedy"];

/** Short, skippable cold-start: everything chosen here is editable later in Profile. */
export default function Onboarding() {
  const profile = useUser((s) => s.profile);
  const nav = useNavigate();
  const [params] = useSearchParams();
  const editing = params.get("edit") === "1";
  const vocab = useVocabulary();
  const [step, setStep] = useState(0);
  const [kinds, setKinds] = useState<string[]>(profile?.prefs.kinds ?? []);
  const [genres, setGenres] = useState<string[]>(profile?.prefs.genres ?? []);
  const [avoid, setAvoid] = useState<string[]>(profile?.prefs.avoid ?? []);
  useHead({ title: "Welcome to Dawghwa", noindex: true });
  const known = useMemo(() => new Set((vocab.data?.tags ?? []).map((t) => t.name)), [vocab.data]);
  const starter = vocab.data ? STARTER.filter((g) => known.has(g)) : STARTER;
  const avoidList = vocab.data ? AVOID.filter((g) => known.has(g)) : AVOID;
  const toggle = (xs: string[], set: (v: string[]) => void, v: string) => set(xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]);
  const finish = async (save: boolean) => {
    if (profile) await updateProfile({ onboarded: true, prefs: save ? { ...profile.prefs, kinds, genres, avoid } : profile.prefs });
    nav(editing ? "/profile" : "/", { replace: true });
  };
  const steps = [
    {
      title: "What do you like to read?",
      body: "Pick any formats. Leave it empty if you read everything.",
      content: (
        <div className="stack">
          {FORMATS.map(([k, l, d]) => (
            <button key={k} className="menu-item onboard-option" aria-pressed={kinds.includes(k)} onClick={() => toggle(kinds, setKinds, k)}>
              <span>
                <strong>{l}</strong>
                <span className="hint">{d}</span>
              </span>
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "Pick a few genres",
      body: "Three or more gives better first picks. Your reading soon matters more than these.",
      content: (
        <div className="chips">
          {starter.map((g) => (
            <button key={g} className="chip chip-lg" aria-pressed={genres.includes(g)} onClick={() => toggle(genres, setGenres, g)}>
              {g}
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "Anything to keep out?",
      body: "These are filtered from recommendations. You can still find them in search.",
      content: (
        <div className="chips">
          {avoidList.map((g) => (
            <button key={g} className="chip chip-lg chip-neg" aria-pressed={avoid.includes(g)} onClick={() => toggle(avoid, setAvoid, g)}>
              {g}
            </button>
          ))}
        </div>
      ),
    },
  ];
  const s = steps[step]!;
  return (
    <div className="onboard">
      <header className="cluster" style={{ justifyContent: "space-between" }}>
        <Brand />
        <button className="btn btn-ghost" onClick={() => void finish(false)}>
          {editing ? "Cancel" : "Skip"}
        </button>
      </header>
      <main>
        <Mascot pose="welcome" size={132} />
        <p className="eyebrow">
          Step {step + 1} of {steps.length}
        </p>
        <h1>{s.title}</h1>
        <p className="muted" style={{ margin: "8px 0 24px" }}>
          {s.body}
        </p>
        {s.content}
      </main>
      <footer className="onboard-foot">
        <div className="onboard-steps" aria-hidden="true">
          {steps.map((_, i) => (
            <i key={i} data-on={i <= step || undefined} />
          ))}
        </div>
        <div className="cluster">
          {step > 0 && (
            <button className="btn" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button className="btn btn-primary btn-lg" onClick={() => (step < steps.length - 1 ? setStep(step + 1) : void finish(true))}>
            {step < steps.length - 1 ? "Next" : editing ? "Save" : "Start reading"}
          </button>
        </div>
      </footer>
    </div>
  );
}
