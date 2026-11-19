import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, ExternalLink, ListOrdered, MessageCircle, RotateCw, Settings2 } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { ChapterNo } from "@/components/Editorial";
import { Sheet } from "@/components/Layer";
import { Cover } from "@/components/Cover";
import { ProgressRing } from "@/components/ProgressRing";
import { CommentList, CommentsSheet } from "@/components/Comments";
import { Celebrations } from "@/components/Celebrate";
import { ErrorState, errorText } from "@/components/States";
import { useChapters, usePages, useSources, useTitle } from "@/lib/query";
import { reducedMotion, updateSettings, useSettings } from "@/lib/settings";
import { saveProgress, useUser } from "@/lib/store/user";
import { lifecycle, onBack, setImmersive, haptic } from "@/lib/platform";
import { isMature, readerPath, titlePath } from "@/lib/titles";
import { threads, useChapterComments } from "@/lib/comments";
import type { Moment } from "@/lib/rewards/runtime";
import { useHead } from "@/lib/seo";
import type { Chapter, ChapterPage } from "@/lib/api/types";

/**
 * Scroll-only reader (D8). The top bar is always on screen (D9) and carries the
 * chapter's comments and a 2px progress line on its bottom edge (D10); there is
 * no bottom bar. The chapter end holds the reward beat, the next episode and
 * comments, so nothing ever interrupts a chapter in progress.
 */

/** One page image: reserves space before load, retries on failure, never fakes content. */
function PageImage({ page, eager, onFail, onLoad, ratio }: { page: ChapterPage; eager: boolean; onFail: (i: number) => void; onLoad: (i: number, r: number) => void; ratio?: number }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const src = attempt === 0 ? page.url : `${page.url}${page.url.includes("?") ? "&" : "?"}r=${attempt}`;
  const ar = ratio ?? (page.width && page.height ? page.height / page.width : undefined);
  return (
    <div className="rd-page" data-state={state} style={ar ? ({ "--ar": ar } as React.CSSProperties) : undefined} data-index={page.index}>
      {state !== "error" && (
        <img
          key={src}
          src={src}
          alt={`Page ${page.index + 1}`}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={eager ? "high" : "auto"}
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget;
            setState("ok");
            if (img.naturalWidth) onLoad(page.index, img.naturalHeight / img.naturalWidth);
          }}
          onError={() => {
            setState("error");
            onFail(page.index);
          }}
        />
      )}
      {state === "loading" && (
        <span className="rd-page-num" aria-hidden="true">
          {page.index + 1}
        </span>
      )}
      {state === "error" && (
        <div className="rd-page-error" role="alert">
          <p>Page {page.index + 1} didn't load.</p>
          <button
            className="btn btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              setState("loading");
              setAttempt((a) => a + 1);
            }}
          >
            <RotateCw size={15} /> Retry
          </button>
        </div>
      )}
    </div>
  );
}

export default function Reader() {
  const { source = "", id = "", chapterId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const settings = useSettings();
  const sources = useSources();
  const t = useTitle(source, id);
  const title = t.data;
  const chapters = useChapters(title);
  const prog = useUser((s) => (title ? s.progress.get(title.key) : undefined));
  const src = sources.data?.find((s) => s.id === source);
  const readable = sources.data ? Boolean(src?.capabilities.chapterPages) : true;
  const pagesQ = usePages(source, chapterId, settings.dataSaver, readable);
  const pages = useMemo(() => pagesQ.data?.pages ?? [], [pagesQ.data]);
  const count = pages.length;

  const list = useMemo(() => chapters.data?.chapters ?? [], [chapters.data]);
  const idx = list.findIndex((c) => c.id === chapterId);
  const chapter: Chapter | undefined = list[idx];
  const prev = idx > 0 ? list[idx - 1] : undefined;
  const next = idx >= 0 ? list[idx + 1] : undefined;

  // a synchronous position mirror covers reloads that land before the IndexedDB write commits
  const mirror = chapterId ? readPos(chapterId) : undefined;
  const fresh = mirror && (prog?.chapterId !== chapterId || mirror.t > (prog?.updatedAt ?? 0)) ? mirror : undefined;
  const startPage = Number(params.get("p") ?? (fresh ? fresh.page : prog?.chapterId === chapterId ? prog.page : 0)) || 0;
  const [page, setPage] = useState(startPage);
  const [panel, setPanel] = useState(false);
  const [chList, setChList] = useState(false);
  const commentsOpen = params.get("comments");
  const setComments = useCallback(
    (v: false | "read" | "write") =>
      setParams((p) => (v ? p.set("comments", v) : p.delete("comments"), p), {
        replace: true,
      }),
    [setParams],
  );
  useEffect(() => {
    if (chList) requestAnimationFrame(() => document.querySelector('.rd-ch[aria-current="true"]')?.scrollIntoView({ block: "center" }));
  }, [chList]);
  const [ratios, setRatios] = useState<Record<number, number>>({});
  const [failures, setFailures] = useState(0);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [beat, setBeat] = useState<Moment | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  const target = useMemo(() => (title && chapterId ? { title, chapterId, chapterNumber: chapter?.number } : undefined), [title, chapterId, chapter?.number]);
  const { items: comments } = useChapterComments(chapterId);

  useHead({
    title: title ? `${title.title}${chapter ? ` · Chapter ${chapter.number}` : ""}` : "Reader",
    noindex: true,
  });

  // reset per chapter
  useEffect(() => {
    setPage(startPage);
    setCountdown(null);
    setReachedEnd(false);
    setFailures(0);
    setRatios({});
    setBeat(null);
    restored.current = false;
  }, [chapterId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Android: the status bar hides while reading; the reader's own top bar stays (D9).
  useEffect(() => {
    void setImmersive(true);
    return () => void setImmersive(false);
  }, []);

  // Reward moments land in the end panel instead of a floating card (never mid-chapter:
  // chapter_read is emitted only once the end is reached).
  useEffect(() => {
    if (!settings.rewards) return;
    let off = false;
    let reset: (() => void) | undefined;
    void import("@/lib/rewards/runtime").then((m) => {
      if (off) return;
      m.startRewards();
      m.setRewardSink((g) => {
        setBeat((b) => mergeMoment(b, g));
        if (!reducedMotion()) void haptic("success");
      });
      reset = () => m.setRewardSink(null);
    });
    return () => {
      off = true;
      reset?.();
    };
  }, [settings.rewards]);

  // ------------------------------------------------------------ progress
  // the page at the top of the viewport and how far into it the reader is
  const anchor = useRef<{ page: number; offset: number } | null>(null);
  const latest = useRef({ page, reachedEnd });
  latest.current = { page, reachedEnd };
  // true while a restored position is being held in place; programmatic scrolls then are not reader intent
  const pinning = useRef(false);
  const save = useCallback(
    (finished = latest.current.reachedEnd) => {
      if (!title || !chapter || !count) return;
      // measure at save time: images above may have changed height since the last scroll event
      if (scroller.current && !pinning.current) anchor.current = measureAnchor(scroller.current) ?? anchor.current;
      const a = anchor.current;
      const p = Math.min(a ? a.page : latest.current.page, count - 1);
      writePos(chapter.id, p, a?.offset);
      void saveProgress({
        title,
        chapterId: chapter.id,
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
        page: p,
        offset: a?.offset,
        pageCount: count,
        fraction: finished ? 1 : (p + 1) / count,
        finished,
        lastChapterNumber: list.at(-1)?.number,
      });
    },
    [title, chapter, count, list],
  );
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!count) return;
    const tm = setTimeout(() => save(), 900);
    return () => clearTimeout(tm);
  }, [page, count, save]);
  useEffect(() => {
    if (reachedEnd) save(true); // the chapter counts as read only once its last page was reached
  }, [reachedEnd, save]);
  useEffect(() => {
    const off = lifecycle.onPause(() => save());
    return () => void off();
  }, [save]);
  useEffect(() => () => save(), [save]);
  // web reload / tab close / app switch: lifecycle.onPause does not fire there
  useEffect(() => {
    const flush = () => save();
    const vis = () => document.visibilityState === "hidden" && save();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [save]);

  // ------------------------------------------------------------ tracking
  useEffect(() => {
    if (!count || !scroller.current) return;
    const root = scroller.current;
    const vis = new Map<number, number>();
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) vis.set(Number((e.target as HTMLElement).dataset.index), e.intersectionRatio);
        let best = -1;
        let bestR = 0;
        vis.forEach((r, i) => r > bestR && ((bestR = r), (best = i)));
        if (best >= 0) setPage(best);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    root.querySelectorAll<HTMLElement>(".rd-page").forEach((el) => io.observe(el));
    // the end marker sits right after the last page: reaching it is "last page reached"
    const end = root.querySelector(".rd-end-mark");
    const endIo = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setReachedEnd(true), { threshold: 0 });
    if (end) endIo.observe(end);
    return () => {
      io.disconnect();
      endIo.disconnect();
    };
  }, [count, chapterId]);

  // live reading fraction for the top bar line (scroll position through the pages)
  const [fraction, setFraction] = useState(0);
  useEffect(() => {
    if (!count) return;
    let raf = 0;
    let last = 0;
    let trailing = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const root = scroller.current;
        if (!root) return;
        anchor.current = measureAnchor(root) ?? anchor.current;
        const strip = root.querySelector<HTMLElement>(".rd-pages");
        if (strip) {
          const r = strip.getBoundingClientRect();
          const span = r.height - window.innerHeight;
          setFraction(span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 1);
        }
        // throttled save (~500ms) plus a trailing save once scrolling settles
        const now = Date.now();
        if (restored.current && !pinning.current && now - last > 500) {
          last = now;
          saveRef.current();
        }
        clearTimeout(trailing);
        trailing = window.setTimeout(() => restored.current && !pinning.current && saveRef.current(), 250);
      });
    };
    window.addEventListener("scroll", on, { passive: true });
    on();
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(trailing);
      window.removeEventListener("scroll", on);
    };
  }, [count, chapterId]);

  // restore the saved position once pages exist; keep it pinned while images above it load
  // and change height, until the reader scrolls or touches the page themselves
  useEffect(() => {
    if (!count || !title || restored.current) return;
    restored.current = true;
    anchor.current = null;
    const offset = fresh && fresh.page === startPage ? (fresh.offset ?? 0) : prog?.chapterId === chapterId && prog.page === startPage ? (prog.offset ?? 0) : 0;
    if (startPage <= 0 && offset <= 0) return void window.scrollTo(0, 0);
    const root = scroller.current;
    if (!root) return;
    const pin = () => {
      const el = root.querySelector<HTMLElement>(`[data-index="${startPage}"]`);
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY + el.offsetHeight * offset - barHeight();
      window.scrollTo(0, Math.max(0, top - 1));
    };
    requestAnimationFrame(pin);
    const ro = new ResizeObserver(() => pin());
    ro.observe(root);
    pinning.current = true;
    const stop = () => {
      pinning.current = false;
      ro.disconnect();
      clearTimeout(tm);
      for (const e of ["wheel", "touchstart", "keydown", "pointerdown"]) window.removeEventListener(e, stop);
    };
    const tm = setTimeout(stop, 8000);
    for (const e of ["wheel", "touchstart", "keydown", "pointerdown"]) window.addEventListener(e, stop, { passive: true, once: true });
    return stop;
  }, [count, startPage, title]); // eslint-disable-line react-hooks/exhaustive-deps

  const goChapter = useCallback(
    (c?: Chapter) => {
      if (!c || !title) return;
      save();
      nav(readerPath(title, c.id), { replace: true });
    },
    [nav, title, save],
  );

  // keyboard: the page scrolls natively; [ and ] change chapter, C opens comments
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (panel || chList || commentsOpen || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "]") goChapter(next);
      else if (e.key === "[") goChapter(prev);
      else if (e.key === "c" && target) setComments("read");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goChapter, next, prev, panel, chList, commentsOpen, target, setComments]);

  // Android back / Escape: close a layer, then leave to the title page
  useEffect(
    () =>
      onBack(() => {
        if (panel) return (setPanel(false), true);
        if (chList) return (setChList(false), true);
        if (commentsOpen) return (setComments(false), true);
        if (title) nav(titlePath(title), { replace: true });
        else nav(-1);
        return true;
      }),
    [panel, chList, commentsOpen, setComments, title, nav],
  );

  const onLoad = useCallback((i: number, r: number) => setRatios((m) => (m[i] === r ? m : { ...m, [i]: r })), []);
  const onFail = useCallback(() => setFailures((n) => n + 1), []);

  // auto-advance: countdown on the end panel. Paused while comments are open.
  useEffect(() => {
    if (!reachedEnd || !settings.autoNext || !next || commentsOpen) return setCountdown(null);
    setCountdown(8);
    const iv = setInterval(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearInterval(iv);
  }, [reachedEnd, settings.autoNext, next, commentsOpen]);
  // Fire once per countdown: clear it before navigating, so the next chapter's "next" can't re-trigger it.
  useEffect(() => {
    if (countdown !== 0) return;
    setCountdown(null);
    goChapter(next);
  }, [countdown, goChapter, next]);

  const sourceName = src?.name ?? title?.sourceName ?? source;
  const backTo = title ? titlePath(title) : "/";

  // ------------------------------------------------------------ states
  if (sources.data && !readable)
    return (
      <div className="reader reader-msg">
        <div className="state state-center">
          <h1 style={{ fontSize: "var(--text-xl)" }}>Reading isn't available for {sourceName} in Dawghwa</h1>
          <p>This source doesn't provide chapter pages through the Dawghwa API, so the chapter opens on the source's own site.</p>
          <div className="cluster">
            {chapter && (
              <a className="btn btn-primary" href={chapter.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={16} /> Open on {sourceName}
              </a>
            )}
            <Link className="btn" to={backTo}>
              Back to title
            </Link>
          </div>
        </div>
      </div>
    );

  const top = threads(comments, "top");
  const endPanel = (
    <section className="rd-end" aria-label="End of chapter">
      <div className="rd-end-head">
        <p className="rd-end-kicker">
          End of <ChapterNo n={chapter?.number} />
        </p>
        {beat && settings.rewards ? <RewardBeat m={beat} /> : <Mascot variant="head" size={64} className="rd-end-mascot" />}
      </div>

      {next ? (
        <div className="rd-next">
          <button className="rd-next-card" onClick={() => goChapter(next)}>
            {title && <Cover src={title.cover} title={title.title} sizes="64px" mature={isMature(title)} />}
            <span className="rd-next-body">
              <span className="rd-next-kicker">Next episode</span>
              <span className="rd-next-title">
                Chapter {next.number}
                {next.title ? `: ${next.title}` : ""}
              </span>
            </span>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
          {countdown !== null && countdown > 0 && (
            <p className="rd-countdown" aria-live="polite">
              Next chapter in {countdown}s ·{" "}
              <button className="link-btn" onClick={() => setCountdown(null)}>
                Stay here
              </button>
            </p>
          )}
        </div>
      ) : list.length ? (
        <div className="rd-caught">
          <h2 className="rd-end-title">You're caught up</h2>
          <p className="rd-end-note">This is the latest chapter on {sourceName}. New chapters show up on Home when they're released.</p>
        </div>
      ) : null}

      {target && (
        <div className="rd-comments">
          <div className="rd-comments-head">
            <h2>Comments {comments.length ? <span className="tabular">({comments.length})</span> : null}</h2>
            {comments.length > 0 && (
              <button className="link-btn" onClick={() => setComments("read")}>
                See all
              </button>
            )}
          </div>
          {top.length ? <CommentList list={top} target={target} limit={2} /> : <p className="rd-end-note">Jot down a reaction to this chapter. Only you can see it.</p>}
          <button className="rd-leave" onClick={() => setComments("write")}>
            <MessageCircle size={18} aria-hidden="true" /> Leave a comment
          </button>
        </div>
      )}

      <p className="rd-credits">Credits: {[chapter?.group?.name, `via ${prettySource(sourceName)}`].filter(Boolean).join(" · ")}</p>
      <div className="rd-end-links">
        {prev && (
          <button className="btn btn-ghost" onClick={() => goChapter(prev)}>
            <ChevronLeft size={16} /> Chapter {prev.number}
          </button>
        )}
        <Link className="btn btn-ghost" to={backTo}>
          Back to title
        </Link>
      </div>
    </section>
  );

  const body = pagesQ.isError ? (
    <div className="state state-center">
      <ErrorState error={pagesQ.error} retry={() => void pagesQ.refetch()} />
      {errorText(pagesQ.error).offline && <p className="muted">Chapter pages aren't stored offline. Reconnect to keep reading.</p>}
    </div>
  ) : !pagesQ.data ? (
    <div className="rd-loading" aria-busy="true">
      <div className="rd-page skeleton" />
    </div>
  ) : !count ? (
    <div className="state state-center">
      <h2>This chapter has no pages</h2>
      <p>{sourceName} returned an empty chapter. It may be hosted externally.</p>
      {chapter && (
        <a className="btn" href={chapter.url} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={16} /> Open on {sourceName}
        </a>
      )}
    </div>
  ) : (
    <div className="rd-strip" ref={scroller}>
      <div className="rd-pages">
        {pages.map((p) => (
          <PageImage key={p.url} page={p} eager={Math.abs(p.index - startPage) < 3} onFail={onFail} onLoad={onLoad} ratio={ratios[p.index]} />
        ))}
      </div>
      <div className="rd-end-mark" aria-hidden="true" />
      {endPanel}
    </div>
  );

  const shown = count ? (reachedEnd ? 1 : fraction) : 0;

  return (
    <div className="reader">
      <Celebrations />
      <header className="rd-top">
        <Link className="icon-btn" to={backTo} replace aria-label="Back to title">
          <ArrowLeft size={20} />
        </Link>
        <div className="rd-titles">
          <span className="rd-series">{title?.title ?? (t.isError ? "Reader" : "Loading…")}</span>
          <span className="rd-chapter">
            {[chapter ? `Chapter ${chapter.number}${chapter.title ? `: ${chapter.title}` : ""}` : "", count ? `${Math.min(page, count - 1) + 1} / ${count}` : ""].filter(Boolean).join(" · ")}
          </span>
        </div>
        {target && (
          <button className="icon-btn rd-cm-btn" aria-label={`Comments (${comments.length})`} aria-haspopup="dialog" onClick={() => setComments("read")}>
            <MessageCircle size={20} />
            {comments.length > 0 && (
              <span className="rd-cm-count tabular" aria-hidden="true">
                {comments.length > 99 ? "99+" : comments.length}
              </span>
            )}
          </button>
        )}
        {list.length > 1 && (
          <button className="icon-btn" aria-label="Chapters" aria-haspopup="dialog" onClick={() => setChList(true)}>
            <ListOrdered size={20} />
          </button>
        )}
        <button className="icon-btn" aria-label="Reader settings" aria-haspopup="dialog" onClick={() => setPanel(true)}>
          <Settings2 size={20} />
        </button>
        <div className="rd-progress" role="progressbar" aria-label="Chapter progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(shown * 100)}>
          <span style={{ transform: `scaleX(${shown})` }} />
        </div>
      </header>

      <main className="rd-body">
        {failures >= 3 && (
          <div className="banner banner-warn rd-banner" role="status">
            Several pages failed. Image links from {sourceName} can expire.
            <button className="btn btn-sm" onClick={() => (setFailures(0), void pagesQ.refetch())}>
              Reload pages
            </button>
          </div>
        )}
        {body}
      </main>

      <CommentsSheet open={Boolean(commentsOpen)} onClose={() => setComments(false)} target={target} items={comments} compose={commentsOpen === "write"} />

      <Sheet open={chList} onClose={() => setChList(false)} title="Chapters">
        <ol className="rd-chlist">
          {[...list].reverse().map((c) => {
            const read = Boolean(prog?.read[c.id]);
            return (
              <li key={c.id}>
                <button className="rd-ch" aria-current={c.id === chapterId ? "true" : undefined} data-read={read || undefined} onClick={() => (setChList(false), goChapter(c))}>
                  <ChapterNo n={c.number} />
                  <span className="rd-ch-title">{c.title || `Chapter ${c.number}`}</span>
                  {read && <Check size={16} aria-label="Read" />}
                </button>
              </li>
            );
          })}
        </ol>
      </Sheet>
      <Sheet open={panel} onClose={() => setPanel(false)} title="Reader settings">
        <div className="stack">
          <label className="switch settings-row">
            <span>Continue to next chapter automatically</span>
            <input type="checkbox" checked={settings.autoNext} onChange={(e) => updateSettings({ autoNext: e.target.checked })} />
          </label>
          <label className="switch settings-row">
            <span>
              Data saver
              <small className="muted" style={{ display: "block" }}>
                Smaller, compressed page images
              </small>
            </span>
            <input type="checkbox" checked={settings.dataSaver} onChange={(e) => (updateSettings({ dataSaver: e.target.checked }), void haptic("light"))} />
          </label>
          <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
            Pages scroll top to bottom. Keys: [ and ] change chapter, C opens comments.
          </p>
        </div>
      </Sheet>
    </div>
  );
}

/** Several events can land at one chapter end (chapter, series, quest): show them as one beat. */
function mergeMoment(a: Moment | null, b: Moment): Moment {
  if (!a) return b;
  return {
    xp: a.xp + b.xp,
    levelUp: b.levelUp ?? a.levelUp,
    tiers: [...a.tiers, ...b.tiers],
    genres: [...a.genres, ...b.genres],
    completed: a.completed || b.completed,
    quests: [...a.quests, ...b.quests],
    unlocks: [...a.unlocks, ...b.unlocks],
    after: b.after,
  };
}

/** The chapter-end reward beat: XP, level ring and anything newly earned. Static under reduced motion. */
function RewardBeat({ m }: { m: Moment }) {
  const lv = m.after.level;
  const extras = [
    ...m.quests.map((q) => `Quest done: ${q.title}`),
    ...m.unlocks.map((u) => `Unlocked ${u.name}`),
    ...m.tiers.map((t) => `${t.set.name} ${["", "I", "II", "III", "IV", "V"][t.tier]}`),
    ...(m.genres.length ? [`Passport stamp: ${m.genres.join(", ")}`] : []),
  ];
  return (
    <div className={`rd-beat ${m.completed ? "rd-beat-done" : ""}`} role="status">
      {m.completed && (
        <div className="rd-beat-series">
          <Mascot variant="full" size={120} pose="done" className="rd-beat-mascot" />
          <p className="rd-beat-big">Series complete</p>
          <p className="rd-end-note">You read it to the final chapter. It's on your shelf under Completed.</p>
        </div>
      )}
      <div className="rd-beat-row">
        <ProgressRing value={lv.progress} size={56} stroke={5} label={`Level ${lv.level}, ${lv.into} of ${lv.span} XP`}>
          <span className="rd-beat-lv">{lv.level}</span>
        </ProgressRing>
        <div className="rd-beat-text">
          <p className="rd-beat-xp">+{m.xp} XP</p>
          <p className="rd-beat-sub">{m.levelUp ? `Level up · ${lv.tier.name}` : `${lv.span - lv.into} XP to level ${lv.level + 1}`}</p>
        </div>
        <Link className="link-btn rd-beat-link" to="/achievements">
          Awards
        </Link>
      </div>
      {extras.length > 0 && (
        <ul className="rd-beat-list">
          {extras.slice(0, 4).map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Height of the fixed reader bar, so restored positions land below it. */
function barHeight(): number {
  return document.querySelector<HTMLElement>(".rd-top")?.offsetHeight ?? 0;
}

const POS_KEY = "dawghwa.pos.";
function readPos(chapterId: string): { page: number; offset?: number; t: number } | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(POS_KEY + chapterId) ?? "null");
    return v && typeof v.page === "number" && typeof v.t === "number" ? v : undefined;
  } catch {
    return undefined;
  }
}
function writePos(chapterId: string, page: number, offset?: number) {
  try {
    localStorage.setItem(POS_KEY + chapterId, JSON.stringify({ page, offset, t: Date.now() }));
    // keep the mirror small: drop all but the 20 most recent chapters
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(POS_KEY));
    if (keys.length > 20)
      keys
        .map((k) => [k, readPos(k.slice(POS_KEY.length))?.t ?? 0] as const)
        .sort((a, b) => a[1] - b[1])
        .slice(0, keys.length - 20)
        .forEach(([k]) => localStorage.removeItem(k));
  } catch {
    /* storage full or blocked: IndexedDB progress still applies */
  }
}

/** The page at the top of the viewport and how far into it (0–1) the reader has scrolled. */
function measureAnchor(root: HTMLElement): { page: number; offset: number } | null {
  for (const el of root.querySelectorAll<HTMLElement>(".rd-page")) {
    const r = el.getBoundingClientRect();
    if (r.bottom > 0)
      return {
        page: Number(el.dataset.index),
        offset: r.height ? Math.max(0, -r.top) / r.height : 0,
      };
  }
  return null;
}

/** Source ids ("mangadex") read as names ("MangaDex") when the source list hasn't loaded. */
function prettySource(name: string): string {
  const known: Record<string, string> = {
    mangadex: "MangaDex",
    anilist: "AniList",
    comick: "ComicK",
    mangapill: "MangaPill",
  };
  return known[name.toLowerCase()] ?? name.charAt(0).toUpperCase() + name.slice(1);
}
