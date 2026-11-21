import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Pause, Play, Minus, Plus, X, Share, SquarePlus, Check } from "lucide-react";
import { useHead } from "@/lib/seo";
import { useUser } from "@/lib/store/user";
import { markEntered } from "@/app/landing";
import { promptInstall, useInstallMode, type InstallMode } from "@/app/install";
import mascot from "@/assets/landing/mascot.webp";
import stripRooftop from "@/assets/landing/strip-rooftop.webp";
import stripBusStop from "@/assets/landing/strip-busstop.webp";
import panelPlatform from "@/assets/landing/panel-platform.webp";
import coverLantern from "@/assets/landing/cover-lantern.webp";
import "@/styles/landing.css";

const DESCRIPTION = "Read manhwa, manga and manhua in one long scroll. Free, no account, and recommendations learned on your device. Use it in a browser or install it.";

/**
 * The public front door (dawghwa.vercel.app/ for first-time web visitors, /start always).
 * The page borrows the reader's own trick: the long-strip auto-scroll can glide the page
 * itself. Everything it says is true of the app (About, Reader shortcuts, Onboarding).
 */
export default function Landing() {
  const nav = useNavigate();
  const onboarded = useUser((s) => Boolean(s.profile?.onboarded));
  useHead({
    title: "Free manhwa and manga reader in your browser",
    path: "/",
    description: DESCRIPTION,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Dawghwa",
      applicationCategory: "EntertainmentApplication",
      operatingSystem: "Any (web browser)",
      description: DESCRIPTION,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  });
  const enter = useCallback(
    (to = "/") => {
      markEntered();
      window.scrollTo(0, 0);
      nav(to);
    },
    [nav],
  );
  const auto = usePageAutoScroll();
  const [installOpen, setInstallOpen] = useState(false);
  useReveal();

  return (
    <div className="ld">
      <a className="skip-link" href="#ld-main">
        Skip to content
      </a>
      <main id="ld-main" tabIndex={-1}>
        <Hero onEnter={() => enter()} onInstall={() => setInstallOpen(true)} auto={auto} returning={onboarded} />
        <Showcase />
        <ReaderPanel />
        <Commands />
        <Steps />
        <Faq />
        <StartDialog onStart={(name, kind) => enter(`/welcome?name=${encodeURIComponent(name)}&kind=${kind}`)} returning={onboarded} onOpen={() => enter()} />
      </main>
      <Footer onInstall={() => setInstallOpen(true)} />
      <AutoScrollPill auto={auto} />
      <InstallSheet open={installOpen} onClose={() => setInstallOpen(false)} onEnter={() => enter()} />
    </div>
  );
}

/* ------------------------------------------------------------------ hero */

function Hero({ onEnter, onInstall, auto, returning }: { onEnter: () => void; onInstall: () => void; auto: AutoScroll; returning: boolean }) {
  const mode = useInstallMode();
  return (
    <section className="ld-hero" aria-labelledby="ld-title">
      <div className="ld-hero-tl">
        <p className="ld-lede">Find manhwa, manga and manhua, then read every chapter in one long scroll.</p>
        <button className="ld-btn ld-btn-ink" onClick={onEnter}>
          {returning ? "Open the app" : "Use in browser"}
        </button>
        <p className="ld-trust">Free. No account. Your reading stays on this device.</p>
      </div>
      <nav className="ld-hero-tr" aria-label="Landing">
        <InstallLink mode={mode} onInstall={onInstall} />
        <Link to="/about">About</Link>
      </nav>
      <h1 id="ld-title" className="ld-name-wrap">
        <FitWord className="ld-name">Dawghwa</FitWord>
      </h1>
      <figure className="ld-hero-art">
        <img className="ld-hero-strip" src={stripRooftop} width={720} height={1279} alt="A courier in a red scarf leaps between rooftops at dusk, an original long-strip panel" fetchPriority="high" />
        <img className="ld-mascot" src={mascot} width={900} height={748} alt="Dawghwa's mascot, a black and white collie in a blue bandana, peeking over the name" />
      </figure>
      <p className="ld-hero-bl">A reader for long strips and pages</p>
      <div className="ld-hero-br">
        <button className="ld-textbtn" onClick={auto.toggle} aria-pressed={auto.state === "running"}>
          {auto.state === "running" ? "Pause auto-scroll" : "Auto-scroll this page"}
        </button>
        <span className="ld-hint" aria-hidden="true">
          or press <kbd>P</kbd>
        </span>
      </div>
    </section>
  );
}

function InstallLink({ mode, onInstall }: { mode: InstallMode; onInstall: () => void }) {
  if (mode === "installed") return <span className="ld-installed">Installed</span>;
  return (
    <button className="ld-textbtn" onClick={onInstall}>
      Install app
    </button>
  );
}

/** Sizes one line of display type to the full width of its box. */
function FitWord({ children, className }: { children: string; className: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    let last = -1;
    const fit = (force = false) => {
      const target = box.clientWidth;
      if (!force && target === last) return; // our own font change resized the box: ignore
      last = target;
      // Measure out of flow so a probe size can't widen the box (or the page) and
      // feed the observer a new width; that looped under reduced motion on phones.
      // Two corrective passes absorb any non-linear width (variable-font axes).
      el.style.position = "absolute";
      let size = 100;
      for (let i = 0; i < 3 && target > 0; i++) {
        el.style.fontSize = `${size}px`;
        const w = el.offsetWidth;
        if (w <= 0 || Math.abs(w - target) < 1) break;
        size = Math.floor(((size * target) / w) * 10) / 10;
      }
      el.style.fontSize = `${size}px`;
      el.style.position = "";
    };
    fit(true);
    const ro = new ResizeObserver(() => fit());
    ro.observe(box);
    const refit = () => fit(true);
    void document.fonts?.ready.then(refit);
    document.fonts?.addEventListener?.("loadingdone", refit);
    return () => {
      ro.disconnect();
      document.fonts?.removeEventListener?.("loadingdone", refit);
    };
  }, []);
  return (
    <span ref={ref} className={className}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ showcase */

function Showcase() {
  return (
    <section className="ld-panel ld-ink ld-show" aria-labelledby="ld-show-h">
      <div className="ld-show-top" data-reveal>
        <h2 id="ld-show-h" className="ld-h2">
          One chapter list
        </h2>
        <p className="ld-body">The same chapter often turns up on several sources, from several translation groups. Dawghwa merges them into one numbered list, and each chapter keeps its versions, so you choose the group you like.</p>
      </div>
      <div className="ld-specimens">
        <figure className="ld-spec" data-reveal>
          <figcaption className="ld-cap">Chapter 41 on three sources means three lists to check.</figcaption>
          <span className="ld-spec-glyph" aria-hidden="true">
            3
          </span>
        </figure>
        <figure className="ld-spec ld-spec-b" data-reveal>
          <figcaption className="ld-cap">On Dawghwa it is one list, with every version inside.</figcaption>
          <span className="ld-spec-glyph" aria-hidden="true">
            1
          </span>
        </figure>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ reader panel */

function ReaderPanel() {
  return (
    <section className="ld-panel ld-paper ld-reader" aria-labelledby="ld-reader-h">
      <div className="ld-reader-ui" data-ui aria-hidden="true">
        <div className="ld-rd-bar">
          <span className="ld-rd-title">Rooftop Courier</span>
          <span className="ld-rd-ch">Ch. 41 · 3 of 3 panels</span>
        </div>
        <div className="ld-rd-strip">
          <div className="ld-rd-track">
            <img src={stripRooftop} width={720} height={1279} alt="" loading="lazy" />
            <img src={stripBusStop} width={720} height={1440} alt="" loading="lazy" />
            <img src={panelPlatform} width={720} height={1080} alt="" loading="lazy" />
            <img src={stripRooftop} width={720} height={1279} alt="" loading="lazy" />
          </div>
        </div>
        <div className="ld-rd-pill">
          <span className="ld-rd-dot" />
          Auto-scroll <span className="tabular">60 px/s</span>
          <span className="ld-rd-keys">
            <span>−</span>
            <span>+</span>
          </span>
        </div>
      </div>
      <div className="ld-reader-cap" data-reveal>
        <h2 id="ld-reader-h" className="ld-h2">
          Strips read as one
        </h2>
        <p className="ld-body">Pages load as you go and run edge to edge. Turn on auto-scroll and the chapter glides at the speed you set, then pauses the moment you touch it.</p>
        <p className="ld-credit">Illustrations on this page are original art made for Dawghwa.</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ command list */

const COMMANDS: { name: string; keys: string[]; text: string }[] = [
  { name: "Auto-scroll", keys: ["P"], text: "Glide down a long strip at a steady speed. Tap the page to pause it." },
  { name: "Faster or slower", keys: ["−", "+"], text: "Change the auto-scroll speed in steps while it runs." },
  { name: "Next chapter", keys: ["]"], text: "Jump to the next chapter without going back to the list." },
  { name: "Previous chapter", keys: ["["], text: "Step back one chapter, keeping your place in the series." },
  { name: "Zoom a panel", keys: ["Z"], text: "Double the page size to read small lettering, then press Z again to fit." },
  { name: "Chapter notes", keys: ["C"], text: "Write a note on a chapter. Notes are kept on this device only." },
  { name: "Search anywhere", keys: ["/"], text: "Open search from any screen in the app." },
];

function Commands() {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listId = useId();
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? COMMANDS.filter((c) => (c.name + " " + c.text).toLowerCase().includes(t)) : COMMANDS;
  }, [q]);
  const active = Math.min(sel, Math.max(rows.length - 1, 0));
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    }
  };
  return (
    <section className="ld-panel ld-paper ld-cmd" aria-labelledby="ld-cmd-h">
      <h2 id="ld-cmd-h" className="sr-only">
        Reader shortcuts
      </h2>
      <div className="ld-cmd-ui" data-ui data-reveal>
        <input
          className="ld-cmd-input"
          type="search"
          value={q}
          placeholder="Find a shortcut"
          aria-label="Find a shortcut"
          aria-controls={listId}
          aria-activedescendant={rows.length ? `${listId}-${active}` : undefined}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={onKey}
        />
        <ul className="ld-cmd-list" id={listId} role="listbox" aria-label="Reader shortcuts">
          {rows.map((c, i) => (
            <li
              key={c.name}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className="ld-cmd-row"
              onPointerEnter={(e) => e.pointerType === "mouse" && setSel(i)}
              onClick={() => setSel(i)}
            >
              <span className="ld-cmd-name">{c.name}</span>
              <span className="ld-cmd-keys" aria-label={`Shortcut ${c.keys.join(" and ")}`}>
                {c.keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </span>
              {i === active && <span className="ld-cmd-text">{c.text}</span>}
            </li>
          ))}
          {!rows.length && <li className="ld-cmd-empty">No shortcut matches “{q}”.</li>}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ steps */

const STEPS: [string, string][] = [
  ["First you open it here.", "No sign-up and no download. Dawghwa runs in this browser tab."],
  ["Then pick a few genres.", "Choose what you like and what to skip. Change it any time in Profile."],
  ["Now read, save or hide.", "Each choice tunes your picks, and that learning stays on this device."],
  ["Last, install it.", "On your home screen it opens full screen, and its shell works offline."],
];

function Steps() {
  return (
    <section className="ld-panel ld-lime ld-steps" aria-labelledby="ld-step-0">
      <ol className="ld-steps-list">
        {STEPS.map(([line, text], i) => (
          <li key={line} className="ld-step" style={{ ["--i" as string]: i }} data-reveal>
            {i === 0 ? (
              <h2 id="ld-step-0" className="ld-step-line">
                {line}
              </h2>
            ) : (
              <p className="ld-step-line">{line}</p>
            )}
            <p className="ld-step-text">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ faq */

const FAQ: { tab: string; q: string; a: ReactNode }[] = [
  { tab: "Price", q: "Does it cost anything?", a: "No. Dawghwa is free to use. There is no account and no subscription." },
  { tab: "Account", q: "Do I need an account?", a: "No. Reader profiles live on this device. You can add more than one and lock each with a PIN." },
  {
    tab: "Sources",
    q: "Where do the chapters come from?",
    a: "Dawghwa doesn't host any comics. Covers and chapters come from the sources connected to its API. Chapters open in the app when a source provides the pages, and on the source's own site otherwise. Scanlation groups are credited on every chapter.",
  },
  { tab: "Offline", q: "Does it work offline?", a: "The app shell, your library, history and recently viewed catalogue pages do. Chapter pages are not saved for offline reading." },
  { tab: "Install", q: "How do I install it?", a: "In Chrome or Edge, press Install app on this page or use the install icon in the address bar. On iPhone and iPad, open it in Safari, tap Share, then Add to Home Screen." },
  { tab: "Privacy", q: "What does it know about me?", a: "Your history, library and recommendations are stored on this device, and no reading data leaves it. Clearing the site's data removes them." },
];

function Faq() {
  const [open, setOpen] = useState(0);
  const id = useId();
  return (
    <section className="ld-panel ld-ink ld-faq" aria-labelledby="ld-faq-h">
      <div className="ld-faq-head" data-reveal>
        <h2 id="ld-faq-h" className="ld-h2">
          Fair questions
        </h2>
        <img className="ld-faq-art" src={coverLantern} width={720} height={1080} alt="A swordswoman holds up a paper lantern in a misty bamboo forest, an original cover" loading="lazy" />
      </div>
      <div className="ld-cards">
        {FAQ.map((f, i) => (
          <div key={f.tab} className="ld-card" data-open={i === open || undefined} style={{ ["--i" as string]: i }}>
            <h3 className="ld-card-q">
              <button id={`${id}-b${i}`} aria-expanded={i === open} aria-controls={`${id}-p${i}`} onClick={() => setOpen(i)}>
                <span className="ld-card-tab">{f.tab}</span>
                <span className="ld-card-text">{f.q}</span>
              </button>
            </h3>
            <div id={`${id}-p${i}`} role="region" aria-labelledby={`${id}-b${i}`} className="ld-card-a" hidden={i !== open}>
              <p>{f.a}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ cta */

function StartDialog({ onStart, onOpen, returning }: { onStart: (name: string, kind: string) => void; onOpen: () => void; returning: boolean }) {
  const [name, setName] = useState("Hana");
  const [kind, setKind] = useState<"manhwa" | "manga">("manhwa");
  return (
    <section className="ld-panel ld-lime ld-cta" aria-labelledby="ld-cta-h">
      <div className="ld-cta-copy" data-reveal>
        <h2 id="ld-cta-h" className="ld-h-close">
          Start a shelf
        </h2>
        <p className="ld-body">This makes a reader profile on this device with your name, then asks a few taste questions. Nothing is sent anywhere.</p>
      </div>
      {returning ? (
        <div className="ld-dialog" data-ui data-reveal>
          <p className="ld-dialog-title">Your shelf is ready</p>
          <p className="ld-dialog-sub">This browser already has a Dawghwa profile.</p>
          <button className="ld-dialog-go" onClick={onOpen}>
            Open the app
          </button>
        </div>
      ) : (
        <form
          className="ld-dialog"
          data-ui
          data-reveal
          onSubmit={(e) => {
            e.preventDefault();
            onStart(name.trim().slice(0, 40), kind);
          }}
        >
          <p className="ld-dialog-title" id="ld-dialog-t">
            Name your reader
          </p>
          <label className="ld-field">
            <span>Reader name</span>
            <input value={name} maxLength={40} autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
          </label>
          <fieldset className="ld-seg">
            <legend>You mostly read</legend>
            {(["manhwa", "manga"] as const).map((k) => (
              <label key={k} data-on={kind === k || undefined}>
                <input type="radio" name="ld-kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
                {k === "manhwa" ? "Manhwa" : "Manga"}
              </label>
            ))}
          </fieldset>
          <button className="ld-dialog-go" type="submit">
            Start reading
          </button>
        </form>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ footer */

function Footer({ onInstall }: { onInstall: () => void }) {
  const mode = useInstallMode();
  return (
    <footer className="ld-foot" aria-labelledby="ld-foot-h">
      <div className="ld-foot-top" data-reveal>
        <div>
          <h2 id="ld-foot-h" className="ld-h-foot">
            Keep it one tap away
          </h2>
          {mode === "installed" ? (
            <p className="ld-body">Dawghwa is installed on this device.</p>
          ) : (
            <button className="ld-btn ld-btn-lime" onClick={onInstall}>
              Install app
            </button>
          )}
        </div>
        <nav className="ld-foot-links" aria-label="Footer">
          <Link to="/about">About and credits</Link>
          <a href="https://github.com/Titan717/dawghwa" rel="noopener noreferrer" target="_blank">
            Source code
          </a>
          <Link to="/discover">Browse the catalogue</Link>
        </nav>
      </div>
      <div className="ld-foot-legal">
        <span>Dawghwa doesn't host comics. Titles, covers and chapters come from their sources.</span>
        <span>Free to use · Data stays on your device</span>
      </div>
      <p className="ld-foot-name" aria-hidden="true">
        Dawghwa
      </p>
    </footer>
  );
}

/* ------------------------------------------------------------------ install sheet */

function InstallSheet({ open, onClose, onEnter }: { open: boolean; onClose: () => void; onEnter: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const mode = useInstallMode();
  const [status, setStatus] = useState<"" | "dismissed">("");
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setStatus("");
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    } else if (!open && d.open) d.close();
  }, [open]);
  const install = async () => {
    const r = await promptInstall();
    if (r === "dismissed") setStatus("dismissed");
  };
  return (
    <dialog ref={ref} className="ld-sheet" aria-labelledby="ld-sheet-h" onClose={onClose} onCancel={onClose}>
      <div className="ld-sheet-head">
        <h2 id="ld-sheet-h">{mode === "installed" ? "Dawghwa is installed" : "Install Dawghwa"}</h2>
        <button className="ld-sheet-x" aria-label="Close" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {mode === "installed" ? (
        <p className="ld-sheet-p">
          <Check size={18} aria-hidden="true" /> Open it from your home screen or app list. It starts straight in the reader, without this page.
        </p>
      ) : mode === "prompt" ? (
        <>
          <p className="ld-sheet-p">Your browser can add Dawghwa as an app. It opens in its own window and keeps your shelf on this device.</p>
          {status === "dismissed" && <p className="ld-sheet-note">No problem. You can install it later from this page or the browser menu.</p>}
          <button className="ld-btn ld-btn-ink ld-sheet-go" onClick={() => void install()}>
            Install now
          </button>
        </>
      ) : mode === "ios" ? (
        <ol className="ld-sheet-steps">
          <li>
            <Share size={18} aria-hidden="true" /> Open this page in Safari and tap Share.
          </li>
          <li>
            <SquarePlus size={18} aria-hidden="true" /> Choose Add to Home Screen, then Add.
          </li>
        </ol>
      ) : mode === "mac-safari" ? (
        <ol className="ld-sheet-steps">
          <li>In the menu bar, choose File, then Add to Dock.</li>
          <li>Dawghwa opens from the Dock in its own window.</li>
        </ol>
      ) : (
        <ol className="ld-sheet-steps">
          <li>In Chrome or Edge, use the install icon at the right of the address bar, or Install in the browser menu.</li>
          <li>On Android, open the browser menu and choose Install app or Add to Home screen.</li>
          <li>Firefox on desktop can't install web apps, but Dawghwa works fully in the browser.</li>
        </ol>
      )}
      <button className="ld-textbtn ld-sheet-alt" onClick={() => (onClose(), onEnter())}>
        Use in browser instead
      </button>
    </dialog>
  );
}

/* ------------------------------------------------------------------ page auto-scroll */

type AutoState = "off" | "running" | "paused";
interface AutoScroll {
  state: AutoState;
  speed: number;
  toggle: () => void;
  stop: () => void;
  faster: () => void;
  slower: () => void;
}
const SPEEDS = [30, 45, 60, 80, 110, 150, 200];

/** The reader's auto-scroll, pointed at this page: time-based, pauses on touch or wheel, steps under reduced motion. */
function usePageAutoScroll(): AutoScroll {
  const [state, setState] = useState<AutoState>("off");
  const [step, setStep] = useState(2);
  const speed = SPEEDS[step]!;
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    if (state !== "running") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const atEnd = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    let raf = 0;
    let timer = 0;
    let last = performance.now();
    let carry = 0;
    if (reduced) {
      // a page-sized step at the same average speed, no continuous motion
      const tick = () => {
        if (atEnd()) return setState("off");
        const by = Math.round(window.innerHeight * 0.8);
        window.scrollBy({ top: by, behavior: "instant" as ScrollBehavior });
        timer = window.setTimeout(tick, (by / speedRef.current) * 1000);
      };
      timer = window.setTimeout(tick, (window.innerHeight * 0.8 * 1000) / speedRef.current);
    } else {
      const frame = (now: number) => {
        const dt = Math.min(now - last, 100);
        last = now;
        carry += (speedRef.current * dt) / 1000;
        const whole = Math.floor(carry);
        if (whole >= 1) {
          carry -= whole;
          window.scrollBy({ top: whole, behavior: "instant" as ScrollBehavior });
        }
        if (atEnd()) return setState("off");
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }
    const interrupt = (e: Event) => {
      if ((e.target as HTMLElement | null)?.closest?.(".ld-pill, .ld-hero-br")) return;
      setState("paused");
    };
    window.addEventListener("wheel", interrupt, { passive: true });
    window.addEventListener("touchstart", interrupt, { passive: true });
    window.addEventListener("pointerdown", interrupt);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      window.removeEventListener("wheel", interrupt);
      window.removeEventListener("touchstart", interrupt);
      window.removeEventListener("pointerdown", interrupt);
    };
  }, [state]);

  const toggle = useCallback(() => setState((s) => (s === "running" ? "paused" : "running")), []);
  const stop = useCallback(() => setState("off"), []);
  const faster = useCallback(() => setStep((s) => Math.min(s + 1, SPEEDS.length - 1)), []);
  const slower = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "p" || e.key === "P") toggle();
      else if (e.key === "Escape") stop();
      else if ((e.key === "+" || e.key === "=") && state !== "off") faster();
      else if ((e.key === "-" || e.key === "_") && state !== "off") slower();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [toggle, stop, faster, slower, state]);

  return { state, speed, toggle, stop, faster, slower };
}

function AutoScrollPill({ auto }: { auto: AutoScroll }) {
  if (auto.state === "off") return null;
  return (
    <div className="ld-pill" role="group" aria-label="Page auto-scroll">
      <button className="ld-pill-btn" aria-label={auto.state === "running" ? "Pause auto-scroll" : "Resume auto-scroll"} onClick={auto.toggle}>
        {auto.state === "running" ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <button className="ld-pill-btn" aria-label="Slower" onClick={auto.slower}>
        <Minus size={18} />
      </button>
      <span className="ld-pill-speed tabular" aria-live="polite">
        {auto.speed} px/s
      </span>
      <button className="ld-pill-btn" aria-label="Faster" onClick={auto.faster}>
        <Plus size={18} />
      </button>
      <button className="ld-pill-btn" aria-label="Stop auto-scroll" onClick={auto.stop}>
        <X size={18} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ reveal */

/** Marks [data-reveal] blocks as they enter the viewport; CSS does the motion (none under reduced motion). */
function useReveal() {
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>(".ld [data-reveal]")];
    if (!("IntersectionObserver" in window)) return void els.forEach((el) => (el.dataset.in = ""));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            (e.target as HTMLElement).dataset.in = "";
            io.unobserve(e.target);
          }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}
