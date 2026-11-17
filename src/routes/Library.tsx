import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { TitleGrid } from "@/components/Grid";
import { EmptyState } from "@/components/States";
import { useHead } from "@/lib/seo";
import { allCollections, useUser } from "@/lib/store/user";
import type { LibraryRecord, LibraryStatus } from "@/lib/store/db";
import type { Title } from "@/lib/titles";
import { STATUS_LABELS } from "./TitlePage";

type Tab = LibraryStatus | "all" | "favorites" | `c:${string}`;
const SORTS = { updated: "Recently changed", added: "Date added", title: "Title A-Z" } as const;

/** Local-first library: everything here lives in this profile on this device. */
export default function Library() {
  const [params, setParams] = useSearchParams();
  const library = useUser((s) => s.library);
  const titles = useUser((s) => s.titles);
  const state = useUser((s) => s);
  const tab = (params.get("tab") as Tab) || "all";
  const [sort, setSort] = useState<keyof typeof SORTS>("updated");
  useHead({ title: "Library", noindex: true });
  const collections = useMemo(() => allCollections(state), [state]);
  const recs = [...library.values()].filter((r) => r.status || r.favorite || r.collections.length);
  const match = (r: LibraryRecord) => (tab === "all" ? Boolean(r.status || r.favorite) : tab === "favorites" ? r.favorite : tab.startsWith("c:") ? r.collections.includes(tab.slice(2)) : r.status === tab);
  const items = useMemo(() => {
    const xs = recs.filter(match).map((r) => ({ r, t: titles.get(r.titleKey) })).filter((x): x is { r: LibraryRecord; t: Title } => Boolean(x.t));
    xs.sort((a, b) => (sort === "title" ? a.t.title.localeCompare(b.t.title) : sort === "added" ? b.r.addedAt - a.r.addedAt : b.r.updatedAt - a.r.updatedAt));
    return xs.map((x) => x.t);
  }, [recs, tab, sort, titles]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = (f: (r: LibraryRecord) => boolean) => recs.filter(f).length;
  const tabs: [Tab, string, number][] = [
    ["all", "All", count((r) => Boolean(r.status || r.favorite))],
    ...(Object.keys(STATUS_LABELS) as LibraryStatus[]).map((s): [Tab, string, number] => [s, STATUS_LABELS[s], count((r) => r.status === s)]),
    ["favorites", "Favourites", count((r) => r.favorite)],
    ...collections.map((c): [Tab, string, number] => [`c:${c}`, c, count((r) => r.collections.includes(c))]),
  ];
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Library</h1>
          <p className="muted">Saved on this device for {state.profile?.name ?? "this profile"}.</p>
        </div>
        <select className="select" style={{ width: "auto" }} aria-label="Sort library" value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)}>
          {Object.entries(SORTS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </header>
      <div className="tabs" role="tablist" aria-label="Library lists">
        {tabs.map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setParams(id === "all" ? {} : { tab: id }, { replace: true })}>
            {label}
            <span className="count">{n}</span>
          </button>
        ))}
      </div>
      {items.length ? (
        <TitleGrid items={items} context="library" />
      ) : (
        <EmptyState
          title={tab === "all" ? "Your library is empty" : `Nothing in ${tabs.find((t) => t[0] === tab)?.[1] ?? "this list"}`}
          action={
            <Link className="btn btn-primary" to="/discover">
              Find something to read
            </Link>
          }
        >
          Add titles from any series page or by long-pressing a cover. Collections are created from a title's menu.
        </EmptyState>
      )}
    </div>
  );
}
