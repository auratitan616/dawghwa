import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { History, LayoutGrid, List, Search as SearchIcon, X } from "lucide-react";
import { TitleGrid } from "@/components/Grid";
import { Cover } from "@/components/Cover";
import { EmptyState } from "@/components/States";
import { Kicker, Sticker } from "@/components/Editorial";
import { useHead } from "@/lib/seo";
import { allCollections, useUser } from "@/lib/store/user";
import type { LibraryRecord, LibraryStatus, ProgressRecord } from "@/lib/store/db";
import { kindLabel, readerPath, titlePath, type Title } from "@/lib/titles";
import { STATUS_LABELS } from "./TitlePage";

type Tab = LibraryStatus | "all" | "favorites" | `c:${string}`;
type View = "grid" | "list";
const SORTS = { updated: "Recently changed", added: "Date added", title: "Title A-Z", progress: "Most read" } as const;
const VIEW_KEY = "dawghwa:library-view";
const STATUS_TONE: Partial<Record<LibraryStatus, "accent" | "lime" | "lavender" | "ink">> = { reading: "accent", completed: "lavender", plan: "ink" };

const readCount = (p?: ProgressRecord) => (p ? Object.keys(p.read).length : 0);

/** Progress through a series, only when both sides are known (no guessed totals). */
function seriesProgress(t: Title, p?: ProgressRecord): { label: string; fraction?: number } | undefined {
  if (!p) return undefined;
  const n = readCount(p);
  const last = t.latestChapter;
  const label = `Ch. ${p.chapterNumber}${n ? ` · ${n} read` : ""}`;
  return { label, fraction: last && p.maxReadNumber ? Math.min(1, p.maxReadNumber / last) : undefined };
}

function LibraryRow({ t, r, p }: { t: Title; r: LibraryRecord; p?: ProgressRecord }) {
  const prog = seriesProgress(t, p);
  const resume = p?.pageCount ? readerPath(t, p.chapterId, p.page || undefined) : undefined;
  return (
    <li className="lib-row">
      <Link to={titlePath(t)} className="lib-row-main">
        <Cover src={t.cover} title={t.title} sizes="56px" className="cover-sm" />
        <span className="lib-row-body">
          <span className="lib-row-title">{t.title}</span>
          <span className="lib-row-meta">
            {r.status && <Sticker tone={STATUS_TONE[r.status] ?? "lime"}>{STATUS_LABELS[r.status]}</Sticker>}
            {r.favorite && <span className="lib-fav">Favourite</span>}
            <span>{[kindLabel(t.meta?.kind), prog?.label].filter(Boolean).join(" · ")}</span>
          </span>
          {prog?.fraction !== undefined && (
            <span className="progress-bar" aria-label={`Reached chapter ${p!.maxReadNumber} of ${t.latestChapter}`}>
              <i style={{ width: `${Math.round(prog.fraction * 100)}%` }} />
            </span>
          )}
        </span>
      </Link>
      {resume && (
        <Link className="btn btn-sm" to={resume} aria-label={`Continue ${t.title}, chapter ${p!.chapterNumber}`}>
          Continue
        </Link>
      )}
    </li>
  );
}

/** Local-first library: everything here lives in this profile on this device (IndexedDB via the user store). */
export default function Library() {
  const [params, setParams] = useSearchParams();
  const library = useUser((s) => s.library);
  const titles = useUser((s) => s.titles);
  const progress = useUser((s) => s.progress);
  const state = useUser((s) => s);
  const tab = (params.get("tab") as Tab) || "all";
  const [sort, setSort] = useState<keyof typeof SORTS>("updated");
  const [find, setFind] = useState("");
  const [view, setViewState] = useState<View>(() => (localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid"));
  const setView = (v: View) => (setViewState(v), localStorage.setItem(VIEW_KEY, v));
  useHead({ title: "Library", noindex: true });
  const collections = useMemo(() => allCollections(state), [state]);
  const recs = useMemo(() => [...library.values()].filter((r) => r.status || r.favorite || r.collections.length), [library]);
  const match = (r: LibraryRecord) => (tab === "all" ? Boolean(r.status || r.favorite || r.collections.length) : tab === "favorites" ? r.favorite : tab.startsWith("c:") ? r.collections.includes(tab.slice(2)) : r.status === tab);
  const rows = useMemo(() => {
    const f = find.trim().toLowerCase();
    const xs = recs
      .filter(match)
      .map((r) => ({ r, t: titles.get(r.titleKey), p: progress.get(r.titleKey) }))
      .filter((x): x is { r: LibraryRecord; t: Title; p: ProgressRecord | undefined } => Boolean(x.t))
      .filter((x) => !f || x.t.title.toLowerCase().includes(f) || x.t.meta?.altTitles?.some((a) => a.toLowerCase().includes(f)));
    xs.sort((a, b) => (sort === "title" ? a.t.title.localeCompare(b.t.title) : sort === "added" ? b.r.addedAt - a.r.addedAt : sort === "progress" ? readCount(b.p) - readCount(a.p) : b.r.updatedAt - a.r.updatedAt));
    return xs;
  }, [recs, tab, sort, titles, progress, find]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = (f: (r: LibraryRecord) => boolean) => recs.filter(f).length;
  const tabs: [Tab, string, number][] = [
    ["all", "All", recs.length],
    ...(Object.keys(STATUS_LABELS) as LibraryStatus[]).map((s): [Tab, string, number] => [s, STATUS_LABELS[s], count((r) => r.status === s)]),
    ["favorites", "Favourites", count((r) => r.favorite)],
    ...collections.map((c): [Tab, string, number] => [`c:${c}`, c, count((r) => r.collections.includes(c))]),
  ];
  const chaptersRead = useMemo(() => [...progress.values()].reduce((n, p) => n + readCount(p), 0), [progress]);
  const stats = [
    { label: "Saved", value: recs.length },
    { label: "Reading", value: count((r) => r.status === "reading") },
    { label: "Completed", value: count((r) => r.status === "completed") },
    { label: "Chapters read", value: chaptersRead },
  ];
  const tabLabel = tabs.find((t) => t[0] === tab)?.[1] ?? "this list";

  return (
    <div className="page library-page">
      <header className="lib-head">
        <div>
          <Kicker>Your shelf</Kicker>
          <h1>Library</h1>
          <p className="muted">Saved on this device for {state.profile?.name ?? "this profile"}.</p>
        </div>
        <Link className="btn btn-sm" to="/history">
          <History size={16} /> History
        </Link>
      </header>
      {recs.length > 0 && (
        <dl className="stat-strip lib-stats" style={{ ["--n" as string]: stats.length }}>
          {stats.map((x) => (
            <div key={x.label}>
              <dt>{x.label}</dt>
              <dd>{x.value.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="tabs" role="tablist" aria-label="Library lists">
        {tabs.map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setParams(id === "all" ? {} : { tab: id }, { replace: true })}>
            {label}
            <span className="count">{n}</span>
          </button>
        ))}
      </div>
      {recs.length > 0 && (
        <div className="lib-tools">
          <label className="lib-find">
            <SearchIcon size={16} aria-hidden="true" />
            <input type="search" placeholder="Find in library" aria-label="Find in library" value={find} onChange={(e) => setFind(e.target.value)} />
            {find && (
              <button className="icon-btn" aria-label="Clear" onClick={() => setFind("")}>
                <X size={16} />
              </button>
            )}
          </label>
          <select className="select select-sm" aria-label="Sort library" value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)}>
            {Object.entries(SORTS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <div className="segmented lib-view" role="radiogroup" aria-label="View">
            <button role="radio" aria-checked={view === "grid"} aria-label="Grid" onClick={() => setView("grid")}>
              <LayoutGrid size={16} />
            </button>
            <button role="radio" aria-checked={view === "list"} aria-label="List" onClick={() => setView("list")}>
              <List size={16} />
            </button>
          </div>
        </div>
      )}
      {rows.length ? (
        view === "grid" ? (
          <TitleGrid items={rows.map((x) => x.t)} context="library" />
        ) : (
          <ul className="lib-list">
            {rows.map((x) => (
              <LibraryRow key={x.t.key} t={x.t} r={x.r} p={x.p} />
            ))}
          </ul>
        )
      ) : find ? (
        <EmptyState title={`No saved title matches "${find}"`} action={<button className="btn" onClick={() => setFind("")}>Clear search</button>} />
      ) : (
        <EmptyState
          title={tab === "all" ? "Your library is empty" : `Nothing in ${tabLabel} yet`}
          pose="empty"
          action={
            <Link className="btn btn-primary" to="/discover">
              Find something to read
            </Link>
          }
        >
          {tab === "all" ? "Lost in another world? Add titles from any series page, or long-press a cover. Collections are created from a title's menu." : "Titles you give this status will show up here."}
        </EmptyState>
      )}
    </div>
  );
}
