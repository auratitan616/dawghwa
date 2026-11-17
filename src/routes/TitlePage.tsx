import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowDownUp, ArrowLeft, BookOpen, Check, ExternalLink, Heart, Info, MoreHorizontal, Plus, Search, Share2, Sparkles, Star, ThumbsDown, ThumbsUp, Users, X } from "lucide-react";
import { Cover } from "@/components/Cover";
import { ChapterNo, Sticker } from "@/components/Editorial";
import { TitleCard } from "@/components/TitleCard";
import { Sheet } from "@/components/Layer";
import { EmptyState, ErrorState } from "@/components/States";
import { TitleActionsSheet, similarPath } from "@/components/TitleActions";
import { toast } from "@/components/Toast";
import { useBrowse, useChapters, useSources, useTitle } from "@/lib/query";
import { useHead } from "@/lib/seo";
import { markChaptersRead, rate, setStatus, signal, toggleFavorite, useUser } from "@/lib/store/user";
import type { LibraryStatus } from "@/lib/store/db";
import { useRankContext } from "@/lib/feed/context";
import { explain, positivesOf, scoreTitle } from "@/lib/intel/rank";
import { cosineSparse, vectorize } from "@/lib/intel/features";
import { compactNumber, kindLabel, markUnreadable, plainText, readerPath, statusLabel, type Title } from "@/lib/titles";
import { useWindowVirtual } from "@/lib/useWindowVirtual";
import { share, haptic } from "@/lib/platform";
import type { Chapter } from "@/lib/api/types";

export const STATUS_LABELS: Record<LibraryStatus, string> = { reading: "Reading", plan: "Plan to read", completed: "Completed", on_hold: "On hold", dropped: "Dropped" };
const ROW_H = 56;

function ChapterList({ title, chapters, readable, sourceName }: { title: Title; chapters: Chapter[]; readable: boolean; sourceName: string }) {
  const progress = useUser((s) => s.progress.get(title.key));
  const [desc, setDesc] = useState(true);
  const [find, setFind] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const list = useMemo(() => {
    const f = find.trim().toLowerCase();
    const xs = f ? chapters.filter((c) => String(c.number).startsWith(f) || c.title?.toLowerCase().includes(f) || c.group?.name.toLowerCase().includes(f)) : chapters;
    return desc ? [...xs].reverse() : xs;
  }, [chapters, desc, find]);
  const { start, end } = useWindowVirtual(ref, list.length, ROW_H);
  const read = progress?.read ?? {};
  const readCount = chapters.filter((c) => read[c.id]).length;
  return (
    <section aria-labelledby="chapters-h">
      <div className="section-head">
        <div className="section-titles">
          <h2 id="chapters-h">{chapters.length.toLocaleString()} {chapters.length === 1 ? "chapter" : "chapters"}</h2>
          <p>
            {readCount ? `${readCount} read · ` : ""}
            {readable ? `Read in Dawghwa via ${sourceName}` : `Chapters open on ${sourceName}`}
          </p>
        </div>
      </div>
      <div className="chapter-tools">
        <input className="input" type="search" inputMode="decimal" placeholder="Jump to chapter or search" aria-label="Find chapter" value={find} onChange={(e) => setFind(e.target.value)} />
        <button className="btn btn-sm" onClick={() => setDesc((d) => !d)} aria-label={`Sort ${desc ? "oldest first" : "newest first"}`}>
          <ArrowDownUp size={15} /> {desc ? "Newest" : "Oldest"}
        </button>
        {readCount > 0 && (
          <button className="btn btn-sm btn-ghost" onClick={() => void markChaptersRead(title, chapters, false).then(() => toast("Read marks cleared"))}>
            Clear read
          </button>
        )}
      </div>
      {!list.length && <p className="muted">No chapter matches "{find}".</p>}
      <div ref={ref} className="chapter-list" style={{ height: list.length * ROW_H }} role="list">
        {list.slice(start, end).map((c, i) => {
          const idx = start + i;
          const isRead = Boolean(read[c.id]);
          const meta = [c.group?.name, c.lastUpdated].filter(Boolean).join(" · ");
          const isCurrent = progress?.chapterId === c.id;
          const inner = (
            <>
              <ChapterNo n={c.number} />
              <span className="ch-body">
                <span className="ch-title">
                  {c.title || `Chapter ${c.number}`}
                  {isCurrent && !isRead && <Sticker tone="accent">Reading</Sticker>}
                </span>
                <span className="ch-meta">{meta}</span>
              </span>
            </>
          );
          return (
            <div key={c.id} className="chapter" role="listitem" style={{ top: idx * ROW_H }} data-read={isRead || undefined} data-current={isCurrent || undefined}>
              {readable ? (
                <Link to={readerPath(title, c.id)}>{inner}</Link>
              ) : (
                <a href={c.url} target="_blank" rel="noopener noreferrer">
                  {inner}
                </a>
              )}
              <button className="icon-btn" aria-label={isRead ? `Mark chapter ${c.number} unread` : `Mark chapter ${c.number} read`} aria-pressed={isRead} onClick={() => void markChaptersRead(title, [c], !isRead)}>
                {isRead ? <Check size={18} /> : isCurrent ? <span className="dot" /> : <Check size={18} style={{ opacity: 0.25 }} />}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MoreLikeThis({ title }: { title: Title }) {
  const ctx = useRankContext();
  const g = title.meta?.genres?.slice(0, 2) ?? [];
  const q = useBrowse(g.length ? { order: "popular", limit: 60, includedTags: g, kinds: title.meta?.kind ? [title.meta.kind] : undefined } : null);
  const items = useMemo(() => {
    const v = vectorize(title);
    return (q.data?.items ?? [])
      .filter((t) => t.key !== title.key && !ctx.exclude?.has(t.key))
      .map((t) => ({ t, s: cosineSparse(v, vectorize(t)) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 16)
      .map((x) => x.t);
  }, [q.data, title, ctx.exclude]);
  if (q.isError && !q.data) return <ErrorState error={q.error} retry={() => void q.refetch()} compact />;
  if (g.length && !q.data)
    return (
      <div className="grid" aria-busy="true" aria-label="Loading similar series">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="cover skeleton" />
        ))}
      </div>
    );
  if (!items.length) return <EmptyState title="Nothing close enough yet">We couldn't find series that share enough of this one's genres and format.</EmptyState>;
  return (
    <>
      <div className="grid">
        {items.map((t) => (
          <TitleCard key={t.key} title={t} context="similar" />
        ))}
      </div>
      <p className="tp-more">
        <Link className="btn" to={similarPath(title)}>
          <Sparkles size={16} /> Explore more like this
        </Link>
      </p>
    </>
  );
}

type Tab = "chapters" | "about" | "similar";
const TABS: { id: Tab; label: string }[] = [
  { id: "chapters", label: "Chapters" },
  { id: "about", label: "About" },
  { id: "similar", label: "Readers also like" },
];

export default function TitlePage() {
  const { source = "", id = "" } = useParams();
  const [params] = useSearchParams();
  const loc = useLocation();
  const nav = useNavigate();
  const t = useTitle(source, id, params.get("u") ?? undefined);
  const title = t.data;
  const chapters = useChapters(title);
  const sources = useSources();
  const lib = useUser((s) => (title ? s.library.get(title.key) : undefined));
  const progress = useUser((s) => (title ? s.progress.get(title.key) : undefined));
  const ctx = useRankContext();
  const [statusOpen, setStatusOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [barSolid, setBarSolid] = useState(false);
  useEffect(() => {
    const on = () => setBarSolid(window.scrollY > 240);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const [tab, setTab] = useState<Tab>("chapters");
  const onTabKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex((x) => x.id === tab);
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = TABS[(i + d + TABS.length) % TABS.length]!.id;
    setTab(next);
    document.getElementById(`tp-tab-${next}`)?.focus();
  };
  const opened = useRef<string | null>(null);

  const src = sources.data?.find((s) => s.id === source);
  const readable = Boolean(src?.capabilities.chapterPages);
  const sourceName = title?.sourceName ?? src?.name ?? source;
  const m = title?.meta;

  useEffect(() => {
    if (title && opened.current !== title.key) {
      opened.current = title.key;
      void signal("open", title, title.key, { context: "title" }); // weak signal, never counted as a like
    }
  }, [title]);

  useHead(
    title
      ? {
          title: `${title.title}${m?.kind ? ` (${kindLabel(m.kind)})` : ""}`,
          description: m?.description ? plainText(m.description).slice(0, 160) : `Read ${title.title} on Dawghwa.`,
          path: loc.pathname,
          image: title.coverLarge ?? title.cover,
          type: "book",
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "Book",
            name: title.title,
            alternateName: m?.altTitles?.slice(0, 5),
            author: m?.authors?.map((a) => ({ "@type": "Person", name: a })),
            illustrator: m?.artists?.map((a) => ({ "@type": "Person", name: a })),
            genre: m?.genres,
            image: title.coverLarge ?? title.cover,
            description: m?.description,
            inLanguage: m?.originalLanguage,
            aggregateRating: title.rating ? { "@type": "AggregateRating", ratingValue: title.rating, bestRating: 10 } : undefined,
          },
        }
      : { title: "Loading title", noindex: true },
  );

  const reason = useMemo(() => {
    const fromNav = (loc.state as { reason?: string } | null)?.reason;
    if (fromNav) return fromNav;
    if (!title || !ctx.state || !title.meta) return undefined;
    const pos = positivesOf(ctx).filter((p) => p.key !== title.key);
    const sc = scoreTitle(title, ctx, pos);
    return sc.score > 0.55 ? explain(sc, ctx, pos)?.text : undefined;
  }, [title, ctx, loc.state]);
  useEffect(() => {
    if (title && chapters.data && !chapters.data.chapters.length) markUnreadable(title.key);
  }, [title, chapters.data]);

  const bareBar = (
    <div className="tp-bar" data-scrolled="">
      <button className="icon-btn tp-icon" onClick={() => (window.history.state?.idx > 0 ? nav(-1) : nav("/"))} aria-label="Back">
        <ArrowLeft size={22} />
      </button>
      <span className="tp-bar-title">{t.isError ? "Series" : "Loading…"}</span>
      <Link className="btn btn-sm" to="/">
        Home
      </Link>
    </div>
  );
  if (t.isError && !title)
    return (
      <div className="tp">
        {bareBar}
        <div className="page page-narrow tp-error">
          <ErrorState error={t.error} retry={() => void t.refetch()} center />
        </div>
      </div>
    );
  if (!title)
    return (
      <div className="tp" aria-busy="true" aria-label="Loading series">
        {bareBar}
        <div className="tp-layout">
          <div className="tp-hero">
            <div className="tp-cover">
              <div className="cover skeleton" />
            </div>
            <div className="skeleton" style={{ height: 30, width: "70%", margin: "0 auto" }} />
            <div className="skeleton skeleton-line" style={{ width: "40%", margin: "12px auto" }} />
          </div>
        </div>
      </div>
    );

  const chs = chapters.data?.chapters ?? [];
  const current = progress ? chs.find((c) => c.id === progress.chapterId) : undefined;
  const nextAfterCurrent = current && progress?.read[current.id] ? chs[chs.indexOf(current) + 1] : current;
  const first = chs[0];
  const target = nextAfterCurrent ?? first;
  const startLabel = progress && target ? (progress.read[target.id] ? `Reread ch. ${target.number}` : `Continue ch. ${target.number}`) : "Start reading";
  const status = lib?.status;
  const lastNum = chs.length ? chs[chs.length - 1]!.number : title.latestChapter;
  const facts = [
    kindLabel(m?.kind),
    statusLabel(m?.status),
    m?.year ? String(m.year) : undefined,
    m?.demographic && m.demographic !== "none" ? m.demographic[0]!.toUpperCase() + m.demographic.slice(1) : undefined,
  ].filter(Boolean) as string[];
  const readCount = progress ? chs.filter((c) => progress.read[c.id]).length : 0;
  const pubStatus = statusLabel(m?.status);
  const stats = [
    pubStatus ? { label: "Status", value: pubStatus, icon: null } : null,
    title.rating ? { label: "Rating", value: title.rating.toFixed(2), icon: <Star size={14} aria-hidden="true" /> } : null,
    title.follows ? { label: "Followers", value: compactNumber(title.follows), icon: <Users size={14} aria-hidden="true" /> } : null,
    lastNum ? { label: "Latest", value: String(Math.floor(lastNum)), icon: null } : null,
    readCount ? { label: "Read", value: String(readCount), icon: <Check size={14} aria-hidden="true" /> } : null,
  ].filter(Boolean) as { label: string; value: string; icon: ReactNode }[];

  const synopsis = m?.description ? plainText(m.description) : "";
  const tags = [...(m?.genres ?? []), ...(m?.themes ?? [])];
  const names = (xs?: string[]) => (xs?.length ? xs.slice(0, 2).join(", ") + (xs.length > 2 ? ` +${xs.length - 2}` : "") : "");
  const sameCreators = m?.artists?.join() === m?.authors?.join();
  const credit = [m?.authors?.length ? `Story ${names(m.authors)}` : null, m?.artists?.length && !sameCreators ? `Art ${names(m.artists)}` : null].filter(Boolean).join(" · ");
  const back = () => (window.history.state?.idx > 0 ? nav(-1) : nav("/"));
  const saveToggle = () => {
    if (status) return setStatusOpen(true);
    void setStatus(title, "plan");
    void haptic("light");
    toast(`Saved to ${STATUS_LABELS.plan}`, { label: "Undo", run: () => void setStatus(title, undefined) });
  };
  const art = title.coverLarge ?? title.cover;

  const cta =
    readable && target ? (
      <Link className="btn btn-primary btn-lg tp-cta" to={readerPath(title, target.id, current === target && progress?.page ? progress.page : undefined)}>
        <BookOpen size={18} /> {progress ? startLabel : `Read chapter ${target.number}`}
      </Link>
    ) : readable && chapters.isLoading ? (
      <button className="btn btn-primary btn-lg tp-cta" disabled>
        <BookOpen size={18} /> Loading chapters
      </button>
    ) : readable ? (
      <Link className="btn btn-primary btn-lg tp-cta" to={`/search?q=${encodeURIComponent(title.title)}`}>
        <Search size={18} /> Find it on other sources
      </Link>
    ) : (
      <a className="btn btn-primary btn-lg tp-cta" href={target?.url ?? title.url} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={18} /> Open on {sourceName}
      </a>
    );

  const chapterPanel = chapters.isError ? (
    <ErrorState error={chapters.error} retry={() => void chapters.refetch()} compact />
  ) : chapters.isLoading ? (
    <div aria-busy="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="skeleton skeleton-line" style={{ height: 40, margin: "8px 0" }} />
      ))}
    </div>
  ) : !chs.length ? (
    <EmptyState
      title={`No chapters on ${sourceName}`}
      action={
        <button className="btn" onClick={() => nav(`/search?q=${encodeURIComponent(title.title)}`)}>
          Look for it on other sources
        </button>
      }
    >
      {sourceName} lists this title but hosts no readable English chapters, which usually means it is officially licensed. Dawghwa only shows chapters a source actually provides.
    </EmptyState>
  ) : (
    <ChapterList title={title} chapters={chs} readable={readable} sourceName={sourceName} />
  );

  const about = (
    <div className="tp-about">
      {stats.length > 0 && (
        <dl className="stat-strip" style={{ ["--n" as string]: stats.length }}>
          {stats.map((x) => (
            <div key={x.label}>
              <dt>{x.label}</dt>
              <dd>
                {x.icon}
                {x.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {synopsis && <p className="synopsis">{synopsis}</p>}
      {tags.length > 0 && (
        <div className="chips" aria-label="Tags">
          {tags.map((g) => (
            <Link key={g} className="tag" to={`/discover?tag=${encodeURIComponent(g)}`}>
              {g}
            </Link>
          ))}
        </div>
      )}
      <dl className="credits">
        {facts.length > 0 && (
          <div>
            <dt>Format</dt>
            <dd>{facts.join(" · ")}</dd>
          </div>
        )}
        {m?.authors?.length ? (
          <div>
            <dt>Story</dt>
            <dd>{m.authors.join(", ")}</dd>
          </div>
        ) : null}
        {m?.artists?.length ? (
          <div>
            <dt>Art</dt>
            <dd>{m.artists.join(", ")}</dd>
          </div>
        ) : null}
        {m?.altTitles?.length ? (
          <div>
            <dt>Also known as</dt>
            <dd>{m.altTitles.slice(0, 4).join(" · ")}</dd>
          </div>
        ) : null}
        <div>
          <dt>Source</dt>
          <dd>
            <a href={title.url} target="_blank" rel="noopener noreferrer">
              {sourceName} <ExternalLink size={12} aria-hidden="true" />
            </a>
          </dd>
        </div>
      </dl>
    </div>
  );

  return (
    <div className="tp">
      <div className="tp-backdrop" aria-hidden="true">
        {art && <img src={art} alt="" decoding="async" referrerPolicy="no-referrer" />}
      </div>
      <div className="tp-bar" data-scrolled={barSolid || undefined}>
        <button className="icon-btn tp-icon" onClick={back} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <span className="tp-bar-title" aria-hidden="true">
          {title.title}
        </span>
        <button className="btn btn-sm tp-save" data-saved={status ? "" : undefined} onClick={saveToggle} aria-haspopup={status ? "dialog" : undefined} aria-label={status ? `In library: ${STATUS_LABELS[status]}. Change` : "Save to library"}>
          {status ? <Check size={16} /> : <Plus size={16} />} {status ? STATUS_LABELS[status] : "Save"}
        </button>
        <button className="icon-btn tp-icon" onClick={() => setAboutOpen(true)} aria-label="About this series" aria-haspopup="dialog">
          <Info size={21} />
        </button>
        <button className="icon-btn tp-icon" onClick={() => setMenu(true)} aria-label="More actions" aria-haspopup="dialog">
          <MoreHorizontal size={22} />
        </button>
      </div>

      <div className="tp-layout">
        <section className="tp-hero" aria-labelledby="tp-h">
          <div className="tp-cover">
            <Cover src={title.cover} large={title.coverLarge} title={title.title} eager sizes="(min-width: 900px) 280px, 200px" />
          </div>
          {facts.length > 0 && (
            <p className="title-kicker">
              {facts.map((f, i) => (
                <span key={f} className={i === 0 ? "title-kind" : undefined}>
                  {f}
                </span>
              ))}
            </p>
          )}
          <h1 id="tp-h">{title.title}</h1>
          {credit && <p className="tp-credit">{credit}</p>}
          {(title.rating || title.follows || lastNum) && (
            <p className="tp-stats">
              {title.rating ? (
                <span>
                  <Star size={13} aria-hidden="true" fill="currentColor" /> {title.rating.toFixed(2)}
                </span>
              ) : null}
              {title.follows ? (
                <span>
                  <Users size={13} aria-hidden="true" /> {compactNumber(title.follows)} followers
                </span>
              ) : null}
              {lastNum ? <span>{chs.length && chs.length !== Math.floor(lastNum) ? `Latest ch. ${Math.floor(lastNum)}` : `${Math.floor(lastNum)} chapters`}</span> : null}
            </p>
          )}
          {synopsis && (
            <button className="tp-synopsis" onClick={() => setAboutOpen(true)} aria-haspopup="dialog" aria-label={`Synopsis: ${synopsis.slice(0, 120)}… Open full details`}>
              <span aria-hidden="true">{synopsis}</span>
            </button>
          )}
          {tags.length > 0 && (
            <div className="chips tp-tags" aria-label="Tags">
              {tags.slice(0, 5).map((g) => (
                <Link key={g} className="tag" to={`/discover?tag=${encodeURIComponent(g)}`}>
                  {g}
                </Link>
              ))}
            </div>
          )}
          {reason && (
            <p className="why">
              <Sparkles size={16} /> <span>{reason}</span>
            </p>
          )}
          {readCount > 0 && chs.length > 0 && (
            <div className="title-progress" aria-label={`${readCount} of ${chs.length} chapters read`}>
              <span className="title-progress-bar">
                <span style={{ width: `${Math.min(100, (readCount / chs.length) * 100)}%` }} />
              </span>
              <span className="title-progress-label">
                {readCount} / {chs.length} read
              </span>
            </div>
          )}
          <div className="tp-cta-wrap">{cta}</div>
          <div className="react-bar">
            <button className="btn btn-sm" aria-pressed={lib?.rating === 1} onClick={() => void rate(title, lib?.rating === 1 ? undefined : 1)}>
              <ThumbsUp size={15} /> {lib?.rating === 1 ? "Liked" : "Like"}
            </button>
            <button
              className="btn btn-sm"
              aria-pressed={lib?.rating === -1}
              onClick={() => {
                void rate(title, lib?.rating === -1 ? undefined : -1);
                if (lib?.rating !== -1) toast("Got it. You'll see fewer titles like this", { label: "Undo", run: () => void rate(title, undefined) });
              }}
            >
              <ThumbsDown size={15} /> Not for me
            </button>
            <button
              className="btn btn-sm"
              aria-pressed={Boolean(lib?.favorite)}
              onClick={() => {
                const on = !lib?.favorite;
                void toggleFavorite(title);
                void haptic("light");
                toast(on ? "Added to favourites" : "Removed from favourites", { label: "Undo", run: () => void toggleFavorite(title) });
              }}
            >
              <Heart size={15} fill={lib?.favorite ? "currentColor" : "none"} /> {lib?.favorite ? "Favourited" : "Favourite"}
            </button>
            <button className="btn btn-sm" onClick={() => void share({ title: title.title, url: location.origin + loc.pathname + loc.search }).then((r) => r === "copied" && toast("Link copied"))}>
              <Share2 size={15} /> Share
            </button>
          </div>
        </section>

        <div className="tp-main">
          <div className="tp-tabs" role="tablist" aria-label="Series sections" onKeyDown={onTabKey}>
            {TABS.map((x) => (
              <button key={x.id} id={`tp-tab-${x.id}`} role="tab" aria-selected={tab === x.id} aria-controls={`tp-panel-${x.id}`} tabIndex={tab === x.id ? 0 : -1} onClick={() => setTab(x.id)}>
                {x.label}
                {x.id === "chapters" && chs.length > 0 && <small>{chs.length}</small>}
              </button>
            ))}
          </div>
          <div className="tp-panel" role="tabpanel" id={`tp-panel-${tab}`} aria-labelledby={`tp-tab-${tab}`}>
            {tab === "chapters" ? chapterPanel : tab === "about" ? about : <MoreLikeThis title={title} />}
          </div>
        </div>
      </div>
      <Sheet open={aboutOpen} onClose={() => setAboutOpen(false)} title={title.title}>
        {about}
      </Sheet>
      <Sheet open={statusOpen} onClose={() => setStatusOpen(false)} title="Library">
        <div className="menu-list" role="radiogroup" aria-label="Library status">
          {(Object.keys(STATUS_LABELS) as LibraryStatus[]).map((s) => (
            <button
              key={s}
              className="menu-item"
              role="radio"
              aria-checked={status === s}
              onClick={() => {
                const was = status;
                void setStatus(title, s);
                void haptic("light");
                setStatusOpen(false);
                if (was !== s) toast(`Moved to ${STATUS_LABELS[s]}`, { label: "Undo", run: () => void setStatus(title, was) });
              }}
            >
              <span className="radio-dot" aria-hidden="true" /> {STATUS_LABELS[s]}
            </button>
          ))}
          {status && (
            <button
              className="menu-item"
              onClick={() => {
                void setStatus(title, undefined);
                setStatusOpen(false);
                toast("Removed from library");
              }}
            >
              <X size={18} /> Remove from library
            </button>
          )}
        </div>
      </Sheet>
      <TitleActionsSheet title={title} open={menu} onClose={() => setMenu(false)} />
    </div>
  );
}
