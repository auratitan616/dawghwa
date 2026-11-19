import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Bookmark as BookmarkIcon, BookmarkCheck, Check, ChevronLeft, ChevronRight, ListOrdered, Maximize2, Minimize2, RotateCw, Settings2, X } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { ChapterNo } from "@/components/Editorial";
import { Sheet } from "@/components/Layer";
import { ErrorState, errorText } from "@/components/States";
import { useChapters, usePages, useSources, useTitle } from "@/lib/query";
import { updateSettings, useSettings, type Fit, type ReaderMode } from "@/lib/settings";
import { saveProgress, useUser } from "@/lib/store/user";
import { lifecycle, onBack, setImmersive, haptic } from "@/lib/platform";
import { prefersVertical, readerPath, titlePath, type Title } from "@/lib/titles";
import { useHead } from "@/lib/seo";
import type { Chapter, ChapterPage, ChapterVariant } from "@/lib/api/types";
import { api } from "@/lib/api/endpoints";
import { chapterAliases, chapterBadge, chapterLabel, editionLabel, fallbackPlan, findChapter, isChapterRead, languageLabel, mapPosition, pickVariant, variantIdOf } from "@/lib/chapters";
import { isBookmarked, removeBookmark, toggleBookmark, useBookmarks } from "@/lib/store/bookmarks";

type Mode = Exclude<ReaderMode, "auto">;

/** One page image: reserves space before load, retries on failure, never fakes content. */
function PageImage({ page, eager, onFail, onLoad, ratio, fit }: { page: ChapterPage; eager: boolean; onFail: (i: number) => void; onLoad: (i: number, r: number) => void; ratio?: number; fit: Fit }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const src = attempt === 0 ? page.url : `${page.url}${page.url.includes("?") ? "&" : "?"}r=${attempt}`;
  const ar = ratio ?? (page.width && page.height ? page.height / page.width : undefined);
  return (
    <div className={`rd-page rd-fit-${fit}`} data-state={state} style={ar ? ({ "--ar": ar } as React.CSSProperties) : undefined} data-index={page.index}>
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
      {state === "loading" && <span className="rd-page-num" aria-hidden="true">{page.index + 1}</span>}
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

function useReaderMode(title: Title | undefined): Mode {
  const s = useSettings();
  if (s.readerMode !== "auto") return s.readerMode;
  return prefersVertical(title) ? "vertical" : "single";
}

export default function Reader() {
  const { source = "", id = "", chapterId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const [pageRefreshKey, setPageRefreshKey] = useState(0);
  const settings = useSettings();
  const sources = useSources();
  const t = useTitle(source, id);
  const title = t.data;
  const chapters = useChapters(title);
  const prog = useUser((s) => (title ? s.progress.get(title.key) : undefined));
  const all = useMemo(() => chapters.data?.chapters ?? [], [chapters.data]);
  const found = findChapter(all, chapterId);
  const chapter: Chapter | undefined = found?.chapter;
  // Prev/next stay in the current chapter's translation language: never switch language silently.
  const list = useMemo(() => (chapter ? all.filter((c) => (c.language ?? "und") === (chapter.language ?? "und")) : all), [all, chapter]);
  const idx = chapter ? list.indexOf(chapter) : -1;
  const sameChapter = (id: string | undefined) => Boolean(id && chapter && chapterAliases(chapter).includes(id));
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<{ kind: "fallback" | "approx" | "manual"; text: string } | null>(null);
  const [needsChoice, setNeedsChoice] = useState<{ failed: ChapterVariant; options: ChapterVariant[] } | null>(null);
  // a pending position to carry over when the version changes (fallback or manual switch)
  const [carry, setCarry] = useState<{ page: number; count: number; variantId: string } | null>(null);
  const preferredSource = params.get("s");
  const preferredVariant = params.get("v");
  const selectedVariant = pickVariant(chapter, {
    variantId: preferredVariant,
    sourceId: preferredSource,
    previous: prog && sameChapter(prog.chapterId) && prog.sourceId ? { sourceId: prog.sourceId } : null,
    failed,
  });
  const activeVariantId = selectedVariant ? variantIdOf(selectedVariant) : "";
  const activeSource = selectedVariant?.sourceId ?? preferredSource ?? source;
  const activeChapterId = selectedVariant?.providerChapterId ?? chapterId;
  const chapterKey = chapter?.id ?? chapterId;
  const src = sources.data?.find((s) => s.id === activeSource);
  const readable = Boolean(selectedVariant);
  const pagesQ = usePages(activeSource, activeChapterId, settings.dataSaver, readable, selectedVariant?.url, pageRefreshKey);
  const mode = useReaderMode(title);
  const rtl = settings.direction === "rtl" && mode !== "vertical";
  const pages = useMemo(() => pagesQ.data?.pages ?? [], [pagesQ.data]);
  const count = pages.length;
  const prev = idx > 0 ? list[idx - 1] : undefined;
  const next = idx >= 0 ? list[idx + 1] : undefined;

  // a synchronous position mirror covers reloads that land before the IndexedDB write commits
  const mirror = chapterKey ? readPos(chapterKey) : undefined;
  const fresh = mirror && (!sameChapter(prog?.chapterId) || mirror.t > (prog?.updatedAt ?? 0)) ? mirror : undefined;
  const paramPage = Number(params.get("p") ?? (fresh ? fresh.page : sameChapter(prog?.chapterId) ? prog!.page : 0)) || 0;
  const carried = carry && carry.variantId === activeVariantId && count ? mapPosition(carry.page, carry.count, count) : undefined;
  const startPage = carried ? carried.page : paramPage;
  const [page, setPage] = useState(startPage);
  const [controls, setControls] = useState(true);
  const [panel, setPanel] = useState(false);
  const [chList, setChList] = useState(false);
  useEffect(() => {
    if (chList) requestAnimationFrame(() => document.querySelector('.rd-ch[aria-current="true"]')?.scrollIntoView({ block: "center" }));
  }, [chList]);
  const [ratios, setRatios] = useState<Record<number, number>>({});
  const [failures, setFailures] = useState(0);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [endView, setEndView] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  const pageRefreshAt = useRef(0);

  useHead({ title: title ? `${title.title}${chapter ? ` · ${chapterLabel(chapter)}` : ""}` : "Reader", noindex: true });

  // Older links and history use provider chapter ids; move them to the canonical chapter key
  // and pin the version they referred to (same source, same upload).
  useEffect(() => {
    if (!title || !found?.legacy) return;
    const v = found.chapter.variants?.find((x) => x.providerChapterId === chapterId || x.variantId === chapterId);
    const p = params.get("p");
    nav(readerPath(title, found.chapter.id, p ? Number(p) : undefined, v?.sourceId ?? preferredSource ?? undefined, v ? variantIdOf(v) : undefined), { replace: true });
  }, [found, title, chapterId]); // eslint-disable-line react-hooks/exhaustive-deps

  // reset per chapter
  useEffect(() => {
    setPage(startPage);
    setCountdown(null);
    setReachedEnd(false);
    setEndView(false);
    setFailures(0);
    setPageRefreshKey(0);
    setRatios({});
    restored.current = false;
    pageRefreshAt.current = 0;
  }, [chapterKey, activeVariantId]); // eslint-disable-line react-hooks/exhaustive-deps

  // a new chapter starts with a clean failure list and no stale notices
  useEffect(() => {
    setFailed(new Set());
    setNeedsChoice(null);
    setNotice((n) => (n?.kind === "fallback" || n?.kind === "approx" ? n : null));
  }, [chapterKey]);

  // carried position: once the new version's pages are known, map the page and explain approximations
  useEffect(() => {
    if (!carry || carry.variantId !== activeVariantId || !count) return;
    const m = mapPosition(carry.page, carry.count, count);
    setPage(m.page);
    if (!m.exact)
      setNotice((n) => ({
        kind: n?.kind === "fallback" ? "fallback" : "approx",
        text: `${n?.kind === "fallback" ? n.text + " " : ""}This version splits pages differently (${count} pages instead of ${carry.count}), so you're at the closest point: page ${m.page + 1}.`,
      }));
    setCarry(null);
    setParams((cur) => {
      const np = new URLSearchParams(cur);
      np.set("p", String(m.page));
      return np;
    }, { replace: true });
  }, [carry, activeVariantId, count]); // eslint-disable-line react-hooks/exhaustive-deps

  // immersive system bars follow the controls
  useEffect(() => {
    void setImmersive(!controls);
  }, [controls]);
  useEffect(() => () => void setImmersive(false), []);

  // ------------------------------------------------------------ progress
  // vertical mode: the page at the top of the viewport and how far into it the reader is
  const anchor = useRef<{ page: number; offset: number } | null>(null);
  const latest = useRef({ page, reachedEnd });
  latest.current = { page, reachedEnd };
  // true while a restored position is being held in place; programmatic scrolls then are not reader intent
  const pinning = useRef(false);
  const save = useCallback(
    (finished = latest.current.reachedEnd) => {
      if (!title || !chapter || !count) return;
      // measure at save time: images above may have changed height since the last scroll event
      if (mode === "vertical" && scroller.current && !pinning.current) anchor.current = measureAnchor(scroller.current) ?? anchor.current;
      const a = mode === "vertical" ? anchor.current : null;
      const p = Math.min(a ? a.page : latest.current.page, count - 1);
      writePos(chapter.id, p, a?.offset);
      void saveProgress({
        title,
        chapterId: chapter.id,
        variantId: selectedVariant ? variantIdOf(selectedVariant) : undefined,
        sourceId: selectedVariant?.sourceId,
        language: chapter.language,
        chapterNumber: chapter.number,
        chapterTitle: chapter.kind && chapter.kind !== "regular" ? chapterLabel(chapter) : chapter.title,
        page: p,
        offset: a?.offset,
        pageCount: count,
        fraction: finished ? 1 : (p + 1) / count,
        finished,
        lastChapterNumber: list.at(-1)?.number,
      });
    },
    [title, chapter, count, list, mode, selectedVariant],
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

  // ------------------------------------------------------------ vertical tracking
  useEffect(() => {
    if (mode !== "vertical" || !count || !scroller.current) return;
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
    const end = root.querySelector(".rd-end");
    const endIo = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setReachedEnd(true), { threshold: 0.3 });
    if (end) endIo.observe(end);
    return () => {
      io.disconnect();
      endIo.disconnect();
    };
  }, [mode, count, chapterKey, activeVariantId]);

  // track the exact reading position (page at the viewport top + offset inside it), saved with progress
  useEffect(() => {
    if (mode !== "vertical" || !count) return;
    let raf = 0;
    let last = 0;
    let trailing = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!scroller.current) return;
        anchor.current = measureAnchor(scroller.current) ?? anchor.current;
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
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(trailing);
      window.removeEventListener("scroll", on);
    };
  }, [mode, count, chapterKey, activeVariantId]);

  // restore the saved position once pages exist; keep it pinned while images above it load
  // and change height, until the reader scrolls or touches the page themselves
  useEffect(() => {
    if (mode !== "vertical" || !count || !title || restored.current) return;
    restored.current = true;
    anchor.current = null;
    const offset = carried ? 0 : fresh && fresh.page === startPage ? (fresh.offset ?? 0) : sameChapter(prog?.chapterId) && prog!.page === startPage ? (prog!.offset ?? 0) : 0;
    if (startPage <= 0 && offset <= 0) return void window.scrollTo(0, 0);
    const root = scroller.current;
    if (!root) return;
    const pin = () => {
      const el = root.querySelector<HTMLElement>(`[data-index="${startPage}"]`);
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY + el.offsetHeight * offset;
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
  }, [mode, count, startPage, title, activeVariantId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (count > 0 && page >= count) setPage(count - 1);
  }, [count, page]);

  // ------------------------------------------------------------ paged
  const spreads = useMemo(() => {
    if (mode !== "double") return pages.map((_, i) => [i]);
    const out: number[][] = [[0]];
    for (let i = 1; i < count; i += 2) out.push(i + 1 < count ? [i, i + 1] : [i]);
    return out;
  }, [mode, pages, count]);
  const spreadIdx = Math.max(0, spreads.findIndex((s) => s.includes(page)));
  const goChapter = useCallback(
    (c?: Chapter) => {
      if (!c || !title) return;
      save();
      // keep the same provider and translation group when the next chapter has it
      const v = pickVariant(c, { previous: selectedVariant ?? null });
      setNotice(null);
      nav(readerPath(title, c.id, undefined, v?.sourceId ?? activeSource, v ? variantIdOf(v) : undefined), { replace: true });
    },
    [nav, title, save, activeSource, selectedVariant],
  );
  const step = useCallback(
    (dir: 1 | -1) => {
      if (mode === "vertical") {
        window.scrollBy({ top: dir * window.innerHeight * 0.85, behavior: "smooth" });
        return;
      }
      if (endView) {
        if (dir === 1) goChapter(next);
        else setEndView(false);
        return;
      }
      const ni = spreadIdx + dir;
      if (ni >= spreads.length) {
        setReachedEnd(true);
        setEndView(true);
        return;
      }
      if (ni < 0) return;
      const target = spreads[ni]!;
      setPage(target[0]!);
      if (ni === spreads.length - 1) setReachedEnd(true);
    },
    [mode, spreadIdx, spreads, endView, next, goChapter],
  );
  useEffect(() => {
    if (mode !== "vertical" && spreads.length && spreadIdx === spreads.length - 1) setReachedEnd(true);
  }, [mode, spreads, spreadIdx]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (panel || chList || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const fwd = rtl ? "ArrowLeft" : "ArrowRight";
      const back = rtl ? "ArrowRight" : "ArrowLeft";
      if (e.key === fwd || (mode !== "vertical" && (e.key === " " || e.key === "PageDown"))) {
        e.preventDefault();
        step(1);
      } else if (e.key === back || (mode !== "vertical" && e.key === "PageUp")) {
        e.preventDefault();
        step(-1);
      }
      else if (e.key === "]") goChapter(next);
      else if (e.key === "[") goChapter(prev);
      else if (e.key === "m") setControls((c) => !c);
      else if (e.key === "Escape") setControls(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rtl, mode, step, goChapter, next, prev, panel, chList]);

  // Android back / Escape: close panel, then leave to the title page
  useEffect(
    () =>
      onBack(() => {
        if (panel) return (setPanel(false), true);
        if (chList) return (setChList(false), true);
        if (title) nav(titlePath(title), { replace: true });
        else nav(-1);
        return true;
      }),
    [panel, chList, title, nav],
  );

  // swipe for paged modes
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return;
    touch.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s || mode === "vertical") return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - s.t < 600) {
      const forward = rtl ? dx > 0 : dx < 0;
      step(forward ? 1 : -1);
      swiped.current = true;
    }
  };
  const swiped = useRef(false);
  const onTap = (e: React.MouseEvent) => {
    if (swiped.current) return void (swiped.current = false);
    if ((e.target as HTMLElement).closest("button, a")) return;
    const x = e.clientX / window.innerWidth;
    if (mode === "vertical" || !settings.tapZones || (x > 0.3 && x < 0.7)) return setControls((c) => !c);
    const forward = rtl ? x < 0.3 : x > 0.7;
    step(forward ? 1 : -1);
  };

  /** Switch to another version of the same chapter, carrying the reading position. */
  const switchVariant = useCallback(
    (v: ChapterVariant, why: "manual" | "fallback") => {
      if (!chapter) return;
      if (why === "manual") save();
      const id = variantIdOf(v);
      setCarry({ page: Math.min(page, Math.max(0, count - 1)), count, variantId: id });
      setNeedsChoice(null);
      setParams((cur) => {
        const np = new URLSearchParams(cur);
        np.set("s", v.sourceId);
        np.set("v", id);
        np.set("p", String(page));
        return np;
      }, { replace: true });
    },
    [chapter, page, count, save, setParams],
  );

  /**
   * The current version failed. Try another version of the *same* chapter in
   * the *same* language and edition automatically; a different edition needs
   * the reader's choice; nothing else is ever substituted.
   */
  const fallbackFrom = useCallback(
    (kind: "pages" | "image" | "empty", errorCode?: string) => {
      if (!chapter || !selectedVariant) return;
      const failedId = variantIdOf(selectedVariant);
      if (failed.has(failedId)) return;
      const tried = new Set(failed).add(failedId);
      setFailed(tried);
      const plan = fallbackPlan(chapter, selectedVariant, tried);
      const to = plan.automatic[0];
      void api.report({ sourceId: selectedVariant.sourceId, kind, chapterKey: chapter.id, providerChapterId: selectedVariant.providerChapterId, errorCode, fallback: { attempted: Boolean(to), succeeded: false, toSourceId: to?.sourceId } });
      if (to) {
        const diffs = [to.sourceId !== selectedVariant.sourceId ? null : "another upload", (to.group?.id ?? "") !== (selectedVariant.group?.id ?? "") && to.group ? `translated by ${to.group.name}` : null].filter(Boolean);
        setNotice({
          kind: "fallback",
          text: `${selectedVariant.source} couldn't load ${chapterLabel(chapter)}. Switched to the same chapter (${languageLabel(to.language ?? chapter.language)}) on ${to.source}${diffs.length ? `, ${diffs.join(", ")}` : ""}.`,
        });
        switchVariant(to, "fallback");
      } else if (plan.manual.length) {
        setNeedsChoice({ failed: selectedVariant, options: plan.manual });
      }
    },
    [chapter, selectedVariant, failed, switchVariant],
  );

  // pages request failed or came back empty -> fallback
  useEffect(() => {
    if (!chapter || !selectedVariant || pagesQ.isFetching) return;
    if (pagesQ.isError) fallbackFrom("pages", (pagesQ.error as { code?: string } | null)?.code);
    else if (pagesQ.data && pagesQ.data.pages.length === 0) fallbackFrom("empty");
  }, [pagesQ.isError, pagesQ.data, pagesQ.isFetching, chapter, selectedVariant]); // eslint-disable-line react-hooks/exhaustive-deps

  // images keep failing after a fresh manifest -> fallback
  useEffect(() => {
    if (failures >= 3 && pageRefreshKey > 0 && !pagesQ.isFetching) fallbackFrom("image");
  }, [failures, pageRefreshKey, pagesQ.isFetching]); // eslint-disable-line react-hooks/exhaustive-deps

  // the fallback version loaded: tell the API the fallback worked
  const reportedOk = useRef<string>("");
  useEffect(() => {
    if (!notice || notice.kind !== "fallback" || !count || !selectedVariant || reportedOk.current === activeVariantId) return;
    reportedOk.current = activeVariantId;
    const from = chapter?.variants?.find((v) => failed.has(variantIdOf(v)));
    if (from) void api.report({ sourceId: from.sourceId, kind: "pages", chapterKey: chapter?.id, providerChapterId: from.providerChapterId, fallback: { attempted: true, succeeded: true, toSourceId: selectedVariant.sourceId } });
  }, [count, activeVariantId, notice]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------ bookmarks & fullscreen
  const bookmarks = useBookmarks(title?.key);
  const curPage = Math.min(page, Math.max(0, count - 1));
  const marked = Boolean(title && chapter && count && bookmarks.length && isBookmarked(title.key, chapter.id, curPage));
  const onBookmark = () => {
    if (!title || !chapter || !count) return;
    const added = toggleBookmark({ titleKey: title.key, chapterId: chapter.id, chapterLabel: chapterLabel(chapter), page: curPage, pageCount: count, variantId: activeVariantId, sourceId: selectedVariant?.sourceId });
    void haptic("light");
    setNotice({ kind: "manual", text: added ? `Bookmarked page ${curPage + 1}.` : `Bookmark removed.` });
  };
  const [isFull, setIsFull] = useState(() => typeof document !== "undefined" && Boolean(document.fullscreenElement));
  useEffect(() => {
    const on = () => setIsFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.().catch(() => setNotice({ kind: "manual", text: "Fullscreen isn't available here." }));
  };

  const onLoad = useCallback((i: number, r: number) => setRatios((m) => (m[i] === r ? m : { ...m, [i]: r })), []);
  const onFail = useCallback(() => {
    setFailures((n) => n + 1);
    // Provider page URLs can expire or point at unhealthy CDN nodes. Fetch a
    // fresh manifest at most once per 15 seconds rather than retrying a dead URL.
    if (Date.now() - pageRefreshAt.current > 15_000) {
      pageRefreshAt.current = Date.now();
      setPageRefreshKey((key) => key + 1);
    }
  }, []);

  // auto-advance: countdown on the end panel
  useEffect(() => {
    if (!reachedEnd || !settings.autoNext || !next || mode !== "vertical") return setCountdown(null);
    setCountdown(5);
    const iv = setInterval(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearInterval(iv);
  }, [reachedEnd, settings.autoNext, next, mode]);
  // Fire once per countdown: clear it before navigating, so the next chapter's "next" can't re-trigger it.
  useEffect(() => {
    if (countdown !== 0) return;
    setCountdown(null);
    goChapter(next);
  }, [countdown, goChapter, next]);

  // preload upcoming pages in paged mode
  useEffect(() => {
    if (mode === "vertical") return;
    for (let i = page + 1; i < Math.min(count, page + 4); i++) {
      const img = new Image();
      img.decoding = "async";
      img.src = pages[i]!.url;
    }
  }, [mode, page, pages, count]);

  const sourceName = src?.name ?? selectedVariant?.source ?? title?.sourceName ?? activeSource;
  const backTo = title ? titlePath(title) : "/";

  // ------------------------------------------------------------ states
  if (chapters.isSuccess && !readable)
    return (
      <div className="reader reader-msg">
        <div className="state state-center">
          <h1 style={{ fontSize: "var(--text-xl)" }}>This chapter isn't readable in Dawghwa yet</h1>
          <p>No compatible source supplied an in-app page reader for this chapter. Choose another available chapter version from the title page.</p>
          <div className="cluster">
            <Link className="btn btn-primary" to={backTo}>Back to title</Link>
          </div>
        </div>
      </div>
    );

  const endPanel = (
    <div className="rd-end" aria-live="polite">
      <Mascot variant="head" size={72} className="rd-end-mascot" />
      <p className="rd-end-kicker">
        End of <ChapterNo n={chapter?.number} label={chapter && chapter.numberText !== undefined ? chapterBadge(chapter) : undefined} />
      </p>
      {next ? (
        <>
          <h2 className="rd-end-title">One more chapter?</h2>
          <button className="btn btn-primary btn-lg" onClick={() => goChapter(next)}>
            {chapterLabel(next)} <ChevronRight size={18} />
          </button>
          {countdown !== null && countdown > 0 && (
            <p className="rd-countdown">
              Continuing in {countdown}s ·{" "}
              <button className="link-btn" onClick={() => setCountdown(null)}>
                Stay here
              </button>
            </p>
          )}
        </>
      ) : list.length ? (
        <>
          <h2 className="rd-end-title">You're caught up</h2>
          <p className="rd-end-note">This is the latest chapter on {sourceName}. New chapters show up on Home when they're released.</p>
        </>
      ) : null}
      <Link className="btn btn-ghost" to={backTo}>
        Back to title
      </Link>
    </div>
  );

  const body = chapters.isError ? (
    <div className="state state-center">
      <ErrorState error={chapters.error} retry={() => void chapters.refetch()} />
    </div>
  ) : needsChoice ? (
    <div className="state state-center rd-choice" role="alert">
      <h2>{needsChoice.failed.source} couldn't load this chapter</h2>
      <p>
        The same chapter is available in another edition. Editions can differ in translation and page layout, so Dawghwa
        won't switch without asking.
      </p>
      <div className="stack">
        {needsChoice.options.map((v) => (
          <button key={variantIdOf(v)} className="btn" onClick={() => switchVariant(v, "manual")}>
            Read on {v.source} · {editionLabel(v.edition)} · {languageLabel(v.language ?? chapter?.language)}
          </button>
        ))}
        <button className="btn btn-ghost" onClick={() => (setNeedsChoice(null), setFailed(new Set()), void pagesQ.refetch())}>
          <RotateCw size={15} /> Try {needsChoice.failed.source} again
        </button>
      </div>
    </div>
  ) : pagesQ.isError ? (
    <div className="state state-center">
      <ErrorState error={pagesQ.error} retry={() => (setFailed(new Set()), void pagesQ.refetch())} />
      {chapter && (chapter.variants?.length ?? 0) <= 1 && <p className="muted">No other source has this chapter in the same language.</p>}
      {errorText(pagesQ.error).offline && <p className="muted">Chapter pages aren't stored offline. Reconnect to keep reading.</p>}
    </div>
  ) : !pagesQ.data ? (
    <div className="rd-loading" aria-busy="true">
      <div className="rd-page skeleton" />
    </div>
  ) : !count ? (
    <div className="state state-center">
      <h2>This chapter has no readable pages</h2>
      <p>{sourceName} did not return any pages{chapter && (chapter.variants?.length ?? 0) > 1 ? ", and no other version in the same language and edition could be used automatically. You can pick a version in the reader settings." : ", and no other source has this chapter in the same language."}</p>
      <Link className="btn" to={backTo}>Back to title</Link>
    </div>
  ) : mode === "vertical" ? (
    <div className={`rd-strip ${settings.pageGap ? "rd-gap" : ""}`} ref={scroller}>
      {pages.map((p) => (
        <PageImage key={p.url} page={p} eager={Math.abs(p.index - startPage) < 3} onFail={onFail} onLoad={onLoad} ratio={ratios[p.index]} fit="width" />
      ))}
      {endPanel}
    </div>
  ) : endView ? (
    endPanel
  ) : (
    <div className={`rd-spread ${rtl ? "rd-rtl" : ""} rd-fit-${settings.fit}`} data-count={spreads[spreadIdx]?.length}>
      {(spreads[spreadIdx] ?? []).map((i) => (
        <PageImage key={pages[i]!.url} page={pages[i]!} eager onFail={onFail} onLoad={onLoad} ratio={ratios[i]} fit={settings.fit} />
      ))}
    </div>
  );

  const pageLabel = count ? (mode === "double" ? `${(spreads[spreadIdx] ?? []).map((i) => i + 1).join("-")} / ${count}` : `${Math.min(page, count - 1) + 1} / ${count}`) : "";

  const fraction = count ? (reachedEnd ? 1 : (Math.min(page, count - 1) + 1) / count) : 0;

  return (
    <div className={`reader reader-${mode}`} data-controls={controls || undefined} onClick={onTap} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <div className="rd-progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${fraction})` }} />
      </div>
      <header className="rd-top" aria-hidden={!controls} inert={!controls || undefined}>
        <Link className="icon-btn" to={backTo} replace aria-label="Back to title">
          <ArrowLeft size={20} />
        </Link>
        <div className="rd-titles">
          <span className="rd-series">{title?.title ?? (t.isError ? "Reader" : "Loading…")}</span>
          <span className="rd-chapter">
            {[chapter ? chapterLabel(chapter) : "", selectedVariant?.group?.name, `via ${prettySource(sourceName)}`, chapter?.language ? languageLabel(selectedVariant?.language ?? chapter.language) : null].filter(Boolean).join(" · ")}
          </span>
        </div>
        {list.length > 1 && (
          <button className="icon-btn" aria-label="Chapters" aria-haspopup="dialog" onClick={() => setChList(true)}>
            <ListOrdered size={20} />
          </button>
        )}
        {count > 0 && (
          <button className="icon-btn" aria-label={marked ? "Remove bookmark" : "Bookmark this page"} aria-pressed={marked} onClick={onBookmark}>
            {marked ? <BookmarkCheck size={20} /> : <BookmarkIcon size={20} />}
          </button>
        )}
        <button className="icon-btn" aria-label="Reader settings" aria-haspopup="dialog" onClick={() => setPanel(true)}>
          <Settings2 size={20} />
        </button>
      </header>

      <main className="rd-body">
        {notice && (
          <div className={`banner rd-banner ${notice.kind === "manual" ? "" : "banner-warn"}`} role="status" aria-live="polite" data-testid="reader-notice" onClick={(e) => e.stopPropagation()}>
            <span>{notice.text}</span>
            <button className="icon-btn" aria-label="Dismiss" onClick={() => setNotice(null)}>
              <X size={16} />
            </button>
          </div>
        )}
        {failures >= 3 && !notice && (
          <div className="banner banner-warn rd-banner" role="status">
            Several pages failed. Image links from {sourceName} can expire.
            <button className="btn btn-sm" onClick={() => (setFailures(0), void pagesQ.refetch())}>
              Reload pages
            </button>
          </div>
        )}
        {body}
      </main>

      {count > 0 && (
        <footer className="rd-bottom" aria-hidden={!controls} inert={!controls || undefined}>
        <button className="icon-btn" disabled={!(rtl ? next : prev)} onClick={() => goChapter(rtl ? next : prev)} aria-label={rtl ? "Next chapter" : "Previous chapter"}>
          <ChevronLeft size={20} />
        </button>
        {count > 1 ? (
          <input
            className="rd-slider"
            type="range"
            min={0}
            max={count - 1}
            value={Math.min(page, count - 1)}
            dir={rtl ? "rtl" : "ltr"}
            aria-label="Page"
            aria-valuetext={`Page ${page + 1} of ${count}`}
            onChange={(e) => {
              const p = Number(e.target.value);
              setPage(p);
              setEndView(false);
              if (mode === "vertical") scroller.current?.querySelector(`[data-index="${p}"]`)?.scrollIntoView({ block: "start" });
              if (p === count - 1) setReachedEnd(true);
            }}
          />
        ) : (
          <span style={{ flex: 1 }} />
        )}
        {rtl && count > 1 && (
          <span className="rd-dir" title="Pages run right to left">
            <ArrowLeft size={13} aria-hidden="true" /> RTL
          </span>
        )}
        <span className="rd-count">{pageLabel}</span>
        <button className="icon-btn" disabled={!(rtl ? prev : next)} onClick={() => goChapter(rtl ? prev : next)} aria-label={rtl ? "Previous chapter" : "Next chapter"}>
          <ChevronRight size={20} />
        </button>
        </footer>
      )}

      <Sheet open={chList} onClose={() => setChList(false)} title="Chapters">
        <ol className="rd-chlist" onClick={(e) => e.stopPropagation()}>
          {bookmarks.length > 0 && (
            <li className="rd-bookmarks">
              <p className="rd-bm-head">Bookmarks</p>
              {bookmarks.slice(0, 20).map((b) => (
                <span key={`${b.chapterId}|${b.page}`} className="rd-bm">
                  <button
                    className="rd-ch"
                    onClick={() => {
                      setChList(false);
                      if (!title) return;
                      const c = findChapter(all, b.chapterId)?.chapter;
                      const v = c ? pickVariant(c, { variantId: b.variantId, sourceId: b.sourceId }) : undefined;
                      if (c && v && variantIdOf(v) !== b.variantId && b.pageCount) setCarry({ page: b.page, count: b.pageCount, variantId: variantIdOf(v) });
                      nav(readerPath(title, b.chapterId, b.page, v?.sourceId ?? b.sourceId, v ? variantIdOf(v) : b.variantId), { replace: true });
                    }}
                  >
                    <BookmarkCheck size={16} aria-hidden="true" />
                    <span className="rd-ch-title">
                      {b.chapterLabel} · page {b.page + 1}
                    </span>
                  </button>
                  <button className="icon-btn" aria-label={`Remove bookmark ${b.chapterLabel} page ${b.page + 1}`} onClick={() => title && removeBookmark(title.key, b.chapterId, b.page)}>
                    <X size={15} />
                  </button>
                </span>
              ))}
            </li>
          )}
          {[...list].reverse().map((c) => {
            const read = isChapterRead(prog?.read, c);
            return (
              <li key={c.id}>
                <button className="rd-ch" aria-current={c.id === chapterKey ? "true" : undefined} data-read={read || undefined} onClick={() => (setChList(false), goChapter(c))}>
                  <ChapterNo n={c.number} label={c.numberText !== undefined ? chapterBadge(c) : undefined} />
                  <span className="rd-ch-title">{chapterLabel(c)}</span>
                  {read && <Check size={16} aria-label="Read" />}
                </button>
              </li>
            );
          })}
        </ol>
      </Sheet>
      <Sheet open={panel} onClose={() => setPanel(false)} title="Reader settings">
        <div className="stack" onClick={(e) => e.stopPropagation()}>
          <div className="settings-row">
            <span>Layout</span>
            <div className="segmented" role="radiogroup" aria-label="Layout">
              {(["auto", "vertical", "single", "double"] as const).map((m) => (
                <button key={m} role="radio" aria-checked={settings.readerMode === m} onClick={() => updateSettings({ readerMode: m })}>
                  {m === "auto" ? "Auto" : m === "vertical" ? "Scroll" : m === "single" ? "Single" : "Double"}
                </button>
              ))}
            </div>
          </div>
          {mode !== "vertical" && (
            <>
              <div className="settings-row">
                <span>Direction</span>
                <div className="segmented" role="radiogroup" aria-label="Reading direction">
                  <button role="radio" aria-checked={settings.direction === "rtl"} onClick={() => updateSettings({ direction: "rtl" })}>
                    Right to left
                  </button>
                  <button role="radio" aria-checked={settings.direction === "ltr"} onClick={() => updateSettings({ direction: "ltr" })}>
                    Left to right
                  </button>
                </div>
              </div>
              <div className="settings-row">
                <span>Fit</span>
                <div className="segmented" role="radiogroup" aria-label="Page fit">
                  {(["width", "height", "original"] as const).map((f) => (
                    <button key={f} role="radio" aria-checked={settings.fit === f} onClick={() => updateSettings({ fit: f })}>
                      {f === "width" ? "Width" : f === "height" ? "Height" : "Original"}
                    </button>
                  ))}
                </div>
              </div>
              <label className="switch settings-row">
                <span>Tap edges to turn pages</span>
                <input type="checkbox" checked={settings.tapZones} onChange={(e) => updateSettings({ tapZones: e.target.checked })} />
              </label>
            </>
          )}
          {mode === "vertical" && (
            <>
              <label className="switch settings-row">
                <span>Gap between pages</span>
                <input type="checkbox" checked={settings.pageGap} onChange={(e) => updateSettings({ pageGap: e.target.checked })} />
              </label>
              <label className="switch settings-row">
                <span>Continue to next chapter automatically</span>
                <input type="checkbox" checked={settings.autoNext} onChange={(e) => updateSettings({ autoNext: e.target.checked })} />
              </label>
            </>
          )}
          <label className="switch settings-row">
            <span>
              Data saver
              <small className="muted" style={{ display: "block" }}>
                Smaller, compressed page images
              </small>
            </span>
            <input type="checkbox" checked={settings.dataSaver} onChange={(e) => (updateSettings({ dataSaver: e.target.checked }), void haptic("light"))} />
          </label>
          {typeof document !== "undefined" && document.fullscreenEnabled && (
            <div className="settings-row">
              <span>Fullscreen</span>
              <button className="btn btn-sm" onClick={toggleFullscreen} aria-pressed={isFull}>
                {isFull ? <Minimize2 size={15} /> : <Maximize2 size={15} />} {isFull ? "Exit" : "Enter"}
              </button>
            </div>
          )}
          {chapter?.variants && chapter.variants.length > 1 && (
            <label className="settings-row">
              <span>
                Chapter version
                <small className="muted" style={{ display: "block" }}>Same chapter from another source or translation group. Wording and page splits can differ.</small>
              </span>
              <select
                className="input"
                aria-label="Chapter version"
                value={activeVariantId}
                onChange={(e) => {
                  const v = chapter.variants?.find((x) => variantIdOf(x) === e.target.value);
                  if (!v || variantIdOf(v) === activeVariantId) return;
                  setNotice(null);
                  switchVariant(v, "manual");
                }}
              >
                {chapter.variants.map((v) => (
                  <option key={variantIdOf(v)} value={variantIdOf(v)}>
                    {[v.source, v.group?.name, languageLabel(v.language ?? chapter.language), v.edition === "official" ? "Official" : null, failed.has(variantIdOf(v)) ? "failed" : null].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
            Keys: arrows turn pages, [ and ] change chapter, M toggles controls.
          </p>
        </div>
      </Sheet>
    </div>
  );
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
    if (keys.length > 20) keys.map((k) => [k, readPos(k.slice(POS_KEY.length))?.t ?? 0] as const).sort((a, b) => a[1] - b[1]).slice(0, keys.length - 20).forEach(([k]) => localStorage.removeItem(k));
  } catch {
    /* storage full or blocked: IndexedDB progress still applies */
  }
}

/** The page at the top of the viewport and how far into it (0–1) the reader has scrolled. */
function measureAnchor(root: HTMLElement): { page: number; offset: number } | null {
  for (const el of root.querySelectorAll<HTMLElement>(".rd-page")) {
    const r = el.getBoundingClientRect();
    if (r.bottom > 0) return { page: Number(el.dataset.index), offset: r.height ? Math.max(0, -r.top) / r.height : 0 };
  }
  return null;
}

/** Source ids ("mangadex") read as names ("MangaDex") when the source list hasn't loaded. */
function prettySource(name: string): string {
  const known: Record<string, string> = { mangadex: "MangaDex", anilist: "AniList", comick: "ComicK", mangapill: "MangaPill" };
  return known[name.toLowerCase()] ?? (name.charAt(0).toUpperCase() + name.slice(1));
}
