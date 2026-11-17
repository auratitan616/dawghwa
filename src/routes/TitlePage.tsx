import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowDownUp, BookOpen, Check, ExternalLink, Heart, Library, MoreHorizontal, Share2, Sparkles, Star, ThumbsDown, ThumbsUp, Users } from "lucide-react";
import { Cover } from "@/components/Cover";
import { Row } from "@/components/Row";
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
import { compactNumber, kindLabel, readerPath, statusLabel, type Title } from "@/lib/titles";
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
        <div>
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
          const inner = (
            <>
              <span className="ch-title">
                Chapter {c.number}
                {c.title ? `: ${c.title}` : ""}
              </span>
              <span className="ch-meta">{meta}</span>
            </>
          );
          return (
            <div key={c.id} className="chapter" role="listitem" style={{ top: idx * ROW_H }} data-read={isRead || undefined} data-current={progress?.chapterId === c.id || undefined}>
              {readable ? (
                <Link to={readerPath(title, c.id)}>{inner}</Link>
              ) : (
                <a href={c.url} target="_blank" rel="noopener noreferrer">
                  {inner}
                </a>
              )}
              <button className="icon-btn" aria-label={isRead ? `Mark chapter ${c.number} unread` : `Mark chapter ${c.number} read`} aria-pressed={isRead} onClick={() => void markChaptersRead(title, [c], !isRead)}>
                {isRead ? <Check size={18} /> : progress?.chapterId === c.id ? <span className="dot" /> : <Check size={18} style={{ opacity: 0.25 }} />}
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
  if (items.length < 4) return null;
  return (
    <Row id="similar" title="More like this" subtitle="Shares its genres, themes and format" more={similarPath(title)}>
      {items.map((t) => (
        <TitleCard key={t.key} title={t} context="similar" />
      ))}
    </Row>
  );
}

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
  const [clamp, setClamp] = useState(true);
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
          description: m?.description?.slice(0, 160) ?? `Read ${title.title} on Dawghwa.`,
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

  if (t.isError && !title) return <div className="page page-narrow"><ErrorState error={t.error} retry={() => void t.refetch()} center /></div>;
  if (!title)
    return (
      <div className="page title-page" aria-busy="true">
        <div className="title-hero">
          <div className="cover skeleton" />
          <div>
            <div className="skeleton" style={{ height: 28, width: "70%" }} />
            <div className="skeleton skeleton-line" style={{ width: "40%" }} />
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
  ].filter(Boolean);

  return (
    <div className="page">
      <div className="title-page">
        <aside className="title-aside">
          <div className="title-hero">
            <Cover src={title.cover} large={title.coverLarge} title={title.title} eager sizes="(min-width: 1024px) 300px, 120px" />
            <div className="title-hero-text">
              <h1>{title.title}</h1>
              {m?.altTitles?.length ? <p className="alt-titles">{m.altTitles.slice(0, 3).join(" · ")}</p> : null}
              <div className="facts">
                {facts.map((f) => (
                  <span key={f}>{f}</span>
                ))}
                {title.rating ? (
                  <span>
                    <Star size={14} aria-hidden="true" /> {title.rating.toFixed(2)}
                  </span>
                ) : null}
                {title.follows ? (
                  <span>
                    <Users size={14} aria-hidden="true" /> {compactNumber(title.follows)}
                  </span>
                ) : null}
                {lastNum ? <span>{Math.floor(lastNum)} ch.</span> : null}
              </div>
            </div>
          </div>
          <div className="title-actions">
            {readable && target ? (
              <Link className="btn btn-primary btn-lg" to={readerPath(title, target.id, current === target && progress?.page ? progress.page : undefined)}>
                <BookOpen size={18} /> {startLabel}
              </Link>
            ) : readable ? (
              <button className="btn btn-primary btn-lg" disabled>
                <BookOpen size={18} /> {chapters.isLoading ? "Loading chapters" : "No readable chapters"}
              </button>
            ) : (
              <a className="btn btn-primary btn-lg" href={target?.url ?? title.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={18} /> Open on {sourceName}
              </a>
            )}
            <button className="btn btn-lg" onClick={() => setStatusOpen(true)} aria-label={status ? `Library: ${STATUS_LABELS[status]}` : "Add to library"} aria-haspopup="dialog">
              <Library size={18} /> <span className="hide-sm">{status ? STATUS_LABELS[status] : "Add"}</span>
            </button>
            <button
              className="btn btn-lg"
              aria-pressed={Boolean(lib?.favorite)}
              aria-label={lib?.favorite ? "Remove from favourites" : "Add to favourites"}
              onClick={() => {
                void toggleFavorite(title);
                void haptic("light");
              }}
            >
              <Heart size={18} fill={lib?.favorite ? "currentColor" : "none"} />
            </button>
            <button className="btn btn-lg" aria-label="More actions" onClick={() => setMenu(true)}>
              <MoreHorizontal size={18} />
            </button>
          </div>
          <div className="cluster">
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
            <Link className="btn btn-sm" to={similarPath(title)} onClick={() => void signal("more_like_this", title)}>
              <Sparkles size={15} /> Similar
            </Link>
            <button className="btn btn-sm" onClick={() => void share({ title: title.title, url: location.origin + loc.pathname + loc.search }).then((r) => r === "copied" && toast("Link copied"))}>
              <Share2 size={15} /> Share
            </button>
          </div>
        </aside>

        <div className="stack" style={{ gap: "var(--space-6)", minWidth: 0 }}>
          {reason && (
            <p className="why">
              <Sparkles size={16} /> <span>{reason}</span>
            </p>
          )}
          {m?.description && (
            <div>
              <p className="synopsis" data-clamped={clamp || undefined}>
                {m.description}
              </p>
              {m.description.length > 360 && (
                <button className="btn btn-sm btn-ghost" onClick={() => setClamp((c) => !c)} aria-expanded={!clamp}>
                  {clamp ? "Read more" : "Show less"}
                </button>
              )}
            </div>
          )}
          {(m?.genres?.length || m?.themes?.length) && (
            <div className="chips" aria-label="Tags">
              {[...(m?.genres ?? []), ...(m?.themes ?? [])].map((g) => (
                <Link key={g} className="tag" to={`/discover?tag=${encodeURIComponent(g)}`}>
                  {g}
                </Link>
              ))}
            </div>
          )}
          {(m?.authors?.length || m?.artists?.length) && (
            <dl className="facts" style={{ marginTop: 0 }}>
              {m?.authors?.length ? (
                <span>
                  <dt className="muted">Story</dt> <dd>{m.authors.join(", ")}</dd>
                </span>
              ) : null}
              {m?.artists?.length ? (
                <span>
                  <dt className="muted">Art</dt> <dd>{m.artists.join(", ")}</dd>
                </span>
              ) : null}
              <span>
                <dt className="muted">Source</dt>{" "}
                <dd>
                  <a href={title.url} target="_blank" rel="noopener noreferrer">
                    {sourceName}
                  </a>
                </dd>
              </span>
            </dl>
          )}
          {chapters.isError ? (
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
          )}
          <MoreLikeThis title={title} />
        </div>
      </div>
      <Sheet open={statusOpen} onClose={() => setStatusOpen(false)} title="Library">
        <div className="menu-list" role="radiogroup" aria-label="Library status">
          {(Object.keys(STATUS_LABELS) as LibraryStatus[]).map((s) => (
            <button
              key={s}
              className="menu-item"
              role="radio"
              aria-checked={status === s}
              onClick={() => {
                void setStatus(title, s);
                void haptic("light");
                setStatusOpen(false);
              }}
            >
              {status === s ? <Check size={18} /> : <span style={{ width: 18 }} />} {STATUS_LABELS[s]}
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
              <span style={{ width: 18 }} /> Remove from library
            </button>
          )}
        </div>
      </Sheet>
      <TitleActionsSheet title={title} open={menu} onClose={() => setMenu(false)} />
    </div>
  );
}
