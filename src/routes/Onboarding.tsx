import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Ban, Bot, Brain, Briefcase, Droplet, Flower2, HeartHandshake, Users, ChevronLeft, CloudRain, Crown, DoorOpen, Drama, Fingerprint, Flame, Ghost, GraduationCap, Heart, Hourglass, Landmark, RefreshCcw, Rocket, Shield, Siren, Skull, Smile, Sparkles, Sun, Swords, Trophy,
} from "lucide-react";
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
const ICONS: Record<string, ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = {
  Action: Swords, Fantasy: Sparkles, Romance: Heart, Comedy: Smile, Drama, Isekai: DoorOpen, Thriller: Siren, Horror: Ghost, "Slice of Life": Sun, Psychological: Brain, Mystery: Fingerprint, "Sci-Fi": Rocket, Sports: Trophy, Historical: Landmark, "Martial Arts": Shield, Reincarnation: RefreshCcw, "Time Travel": Hourglass, Villainess: Crown, Monsters: Skull, Survival: Flame, "Office Workers": Briefcase, "School Life": GraduationCap, Tragedy: CloudRain, Mecha: Bot,
  Gore: Droplet, "Sexual Violence": Ban, "Boys' Love": HeartHandshake, "Girls' Love": Flower2, Harem: Users,
};
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
  const [finding, setFinding] = useState(false);
  const timer = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const finish = async (save: boolean) => {
    if (profile) await updateProfile({ onboarded: true, prefs: save ? { ...profile.prefs, kinds, genres, avoid } : profile.prefs });
    const go = () => nav(editing ? "/profile" : "/", { replace: true });
    // A short "finding stories" beat after real choices, as in the blueprint. Skip and edits go straight on.
    if (!save || editing || matchMedia("(prefers-reduced-motion: reduce)").matches) return go();
    setFinding(true);
    timer.current = window.setTimeout(go, 1100);
  };
  const steps = [
    {
      title: "What stories do you like?",
      body: "Select categories to help us find stories for you.",
      content: (
        <div className="onboard-chips">
          {starter.map((g) => (
            <OnboardChip key={g} label={g} on={genres.includes(g)} onClick={() => toggle(genres, setGenres, g)} />
          ))}
        </div>
      ),
    },
    {
      title: "Which formats do you read?",
      body: "Pick any. Leave it empty if you read everything.",
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
      title: "Anything to keep out?",
      body: "These are filtered from recommendations. You can still find them in search.",
      content: (
        <div className="onboard-chips">
          {avoidList.map((g) => (
            <OnboardChip key={g} label={g} neg on={avoid.includes(g)} onClick={() => toggle(avoid, setAvoid, g)} />
          ))}
        </div>
      ),
    },
  ];
  const s = steps[step]!;
  const last = step === steps.length - 1;
  const needsPick = step === 0 && !editing;
  if (finding)
    return (
      <div className="onboard-finding" role="status">
        <Mascot pose="reading" size={120} />
        <p>Finding stories for you</p>
      </div>
    );
  return (
    <div className="onboard">
      <header className="onboard-head">
        {step > 0 ? (
          <button className="icon-btn" onClick={() => setStep(step - 1)} aria-label="Back">
            <ChevronLeft size={22} />
          </button>
        ) : (
          <span />
        )}
        <span className="onboard-steps" aria-label={`Step ${step + 1} of ${steps.length}`} role="img">
          {steps.map((_, i) => (
            <i key={i} data-on={i <= step || undefined} />
          ))}
        </span>
        <button className="onboard-skip" onClick={() => void finish(false)}>
          {editing ? "Cancel" : "Skip"}
        </button>
      </header>
      <main>
        <h1>{s.title}</h1>
        <p className="onboard-sub">{s.body}</p>
        {s.content}
      </main>
      <footer className="onboard-foot">
        <button
          className="btn btn-primary btn-lg onboard-next"
          disabled={needsPick && genres.length === 0}
          onClick={() => (last ? void finish(true) : setStep(step + 1))}
        >
          {last ? (editing ? "Save" : "Done") : "Next"}
          {step === 0 && genres.length > 0 && <span className="onboard-count">{genres.length}</span>}
        </button>
      </footer>
    </div>
  );
}

function OnboardChip({ label, on, neg, onClick }: { label: string; on: boolean; neg?: boolean; onClick: () => void }) {
  const Icon = ICONS[label];
  return (
    <button className={`onboard-chip${neg ? " is-neg" : ""}`} aria-pressed={on} onClick={onClick}>
      {Icon && <Icon size={16} aria-hidden />}
      {label}
    </button>
  );
}
