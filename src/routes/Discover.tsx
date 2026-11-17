import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, SlidersHorizontal, X } from "lucide-react";
import { DiscoverHub } from "./DiscoverHub";
import { TitleGrid } from "@/components/Grid";
import { EmptyState, ErrorState, GridSkeleton } from "@/components/States";
import { Sheet } from "@/components/Layer";
import { useBrowseInfinite, useVocabulary } from "@/lib/query";
import { useHead } from "@/lib/seo";
import { useRankContext } from "@/lib/feed/context";
import type { BrowseOrder, BrowseQuery, MangaKind } from "@/lib/api/types";

const KINDS: [MangaKind, string][] = [
  ["manhwa", "Manhwa"],
  ["manga", "Manga"],
  ["manhua", "Manhua"],
];
const STATUS = ["ongoing", "completed", "hiatus", "cancelled"] as const;
const DEMO = ["shounen", "seinen", "shoujo", "josei"] as const;
const ORDERS: [BrowseOrder, string][] = [
  ["popular", "Most followed"],
  ["rating", "Top rated"],
  ["latest", "Recently updated"],
  ["new", "Newly added"],
  ["year", "Release year"],
];
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const TAG_GROUP_LABELS: Record<string, string> = { genre: "Genres", theme: "Themes", format: "Style & format tags", content: "Content tags" };
const list = (p: URLSearchParams, k: string) => (p.get(k) ?? "").split(",").filter(Boolean);

/** Discover: an editorial hub with no filters set, the filtered catalogue otherwise. */
export default function Discover() {
  const [params] = useSearchParams();
  const hub = [...params.keys()].length === 0;
  useHead({ title: "Discover manga, manhwa and manhua", path: "/discover", description: "Browse manga, manhwa and manhua by genre, theme, status and format." });
  return hub ? <DiscoverHub /> : <Catalogue />;
}

/** Catalogue browser. Every filter maps 1:1 to a server-side /api/browse filter. */
function Catalogue() {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const vocab = useVocabulary();
  const ctx = useRankContext();
  const kinds = list(params, "kind") as MangaKind[];
  const status = list(params, "status") as BrowseQuery["status"] & string[];
  const demo = list(params, "demo") as BrowseQuery["demographic"] & string[];
  const tags = list(params, "tag");
  const without = list(params, "without");
  const order = (params.get("order") as BrowseOrder) || "popular";
  const fresh = Boolean(params.get("new"));

  const query: BrowseQuery = useMemo(
    () => ({ kinds: kinds.length ? kinds : undefined, status: status.length ? status : undefined, demographic: demo.length ? demo : undefined, includedTags: tags.length ? tags : undefined, excludedTags: without.length ? without : undefined, order, createdWithinDays: fresh ? 365 : undefined }),
    [params], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const q = useBrowseInfinite(query, 30);
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (q.data?.pages ?? []).flatMap((p) => p.items).filter((t) => !ctx.exclude?.has(t.key) && !seen.has(t.key) && seen.add(t.key));
  }, [q.data, ctx.exclude]);
  const total = q.data?.pages[0]?.total;

  const toggle = (k: string, v: string) => {
    const cur = list(params, k);
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    const p = new URLSearchParams(params);
    if (next.length) p.set(k, next.join(","));
    else p.delete(k);
    setParams(p, { replace: true });
  };
  const setOne = (k: string, v?: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };
  const tagGroups = useMemo(() => {
    const g = new Map<string, string[]>();
    for (const t of vocab.data?.tags ?? []) if (t.group !== "content") g.set(t.group, [...(g.get(t.group) ?? []), t.name]);
    return [...g.entries()].map(([k, v]) => [k, v.sort()] as const);
  }, [vocab.data]);
  const active = kinds.length + status.length + demo.length + tags.length + without.length + (fresh ? 1 : 0);
  const orderLabel = ORDERS.find(([o]) => o === order)?.[1];
  const heading = active === 1 && tags.length === 1 ? tags[0]! : active === 1 && kinds.length === 1 ? cap(kinds[0]!) : active === 1 && status.length === 1 ? `${cap(status[0]!)} series` : active === 0 ? (order === "popular" ? "Whole catalogue" : orderLabel ?? "Catalogue") : "Filtered catalogue";

  const tri = (name: string) => (tags.includes(name) ? "include" : without.includes(name) ? "exclude" : "off");
  const cycleTag = (name: string) => {
    const p = new URLSearchParams(params);
    const inc = list(p, "tag").filter((x) => x !== name);
    const exc = list(p, "without").filter((x) => x !== name);
    const s = tri(name);
    if (s === "off") inc.push(name);
    else if (s === "include") exc.push(name);
    if (inc.length) p.set("tag", inc.join(","));
    else p.delete("tag");
    if (exc.length) p.set("without", exc.join(","));
    else p.delete("without");
    setParams(p, { replace: true });
  };

  const filters = (
    <div className="stack" style={{ gap: 20 }}>
      <fieldset>
        <legend className="eyebrow">Format</legend>
        <div className="chips">
          {KINDS.map(([k, l]) => (
            <button key={k} className="chip" aria-pressed={kinds.includes(k)} onClick={() => toggle("kind", k)}>
              {l}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="eyebrow">Status</legend>
        <div className="chips">
          {STATUS.map((s) => (
            <button key={s} className="chip" aria-pressed={status.includes(s)} onClick={() => toggle("status", s)}>
              {cap(s)}
            </button>
          ))}
          <button className="chip" aria-pressed={fresh} onClick={() => setOne("new", fresh ? undefined : "1")}>
            Added this year
          </button>
        </div>
      </fieldset>
      <fieldset>
        <legend className="eyebrow">Demographic</legend>
        <div className="chips">
          {DEMO.map((s) => (
            <button key={s} className="chip" aria-pressed={demo.includes(s)} onClick={() => toggle("demo", s)}>
              {cap(s)}
            </button>
          ))}
        </div>
      </fieldset>
      {vocab.isError && <ErrorState error={vocab.error} retry={() => void vocab.refetch()} compact />}
      {tagGroups.length > 0 && <p className="muted filter-hint">Tags: tap once to include, again to exclude, a third time to clear.</p>}
      {tagGroups.map(([group, names]) => (
        <fieldset key={group}>
          <legend className="eyebrow">{TAG_GROUP_LABELS[group] ?? `${cap(group)} tags`}</legend>
          <div className="chips">
            {names.map((n) => {
              const s = tri(n);
              return (
                <button key={n} className={`chip ${s === "exclude" ? "chip-neg" : ""}`} aria-pressed={s !== "off"} aria-label={`${n}: ${s === "off" ? "any" : s === "include" ? "included" : "excluded"}`} onClick={() => cycleTag(n)}>
                  {s === "exclude" ? `Not ${n}` : n}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );

  return (
    <div className="page discover">
      <Link to="/discover" className="back-link">
        <ArrowLeft size={16} /> Discover
      </Link>
      <header className="page-head">
        <div>
          <h1>{heading}</h1>
          <p className="muted">{total !== undefined ? `${total.toLocaleString()} titles match` : "Browse the MangaDex catalogue"}</p>
        </div>
        <div className="cluster">
          <select className="select" style={{ width: "auto" }} aria-label="Sort by" value={order} onChange={(e) => setOne("order", e.target.value === "popular" ? undefined : e.target.value)}>
            {ORDERS.map(([o, l]) => (
              <option key={o} value={o}>
                {l}
              </option>
            ))}
          </select>
          <button className="btn discover-filter-btn" onClick={() => setOpen(true)} aria-label={`Filters${active ? `, ${active} active` : ""}`}>
            <SlidersHorizontal size={16} /> Filters{active ? ` (${active})` : ""}
          </button>
        </div>
      </header>
      {active > 0 && (
        <div className="active-filters" aria-label="Active filters">
          {kinds.map((k) => (
            <button key={k} className="chip is-on" onClick={() => toggle("kind", k)} aria-label={`Remove ${k}`}>
              {cap(k)} <X size={14} />
            </button>
          ))}
          {status.map((k) => (
            <button key={k} className="chip is-on" onClick={() => toggle("status", k)} aria-label={`Remove ${k}`}>
              {cap(k)} <X size={14} />
            </button>
          ))}
          {demo.map((k) => (
            <button key={k} className="chip is-on" onClick={() => toggle("demo", k)} aria-label={`Remove ${k}`}>
              {cap(k)} <X size={14} />
            </button>
          ))}
          {tags.map((k) => (
            <button key={k} className="chip is-on" onClick={() => toggle("tag", k)} aria-label={`Remove ${k}`}>
              {k} <X size={14} />
            </button>
          ))}
          {without.map((k) => (
            <button key={k} className="chip chip-neg" aria-pressed="true" onClick={() => toggle("without", k)} aria-label={`Remove exclusion ${k}`}>
              Not {k} <X size={14} />
            </button>
          ))}
          {fresh && (
            <button className="chip is-on" onClick={() => setOne("new")} aria-label="Remove added this year">
              Added this year <X size={14} />
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setParams(order !== "popular" ? { order } : { view: "all" }, { replace: true })}>
            Clear all
          </button>
        </div>
      )}
      <div className="discover-layout">
        <aside className="discover-filters" aria-label="Filters">
          {filters}
        </aside>
        <div>
          {q.isError && !items.length ? (
            <ErrorState error={q.error} retry={() => void q.refetch()} />
          ) : q.isLoading ? (
            <GridSkeleton />
          ) : !items.length ? (
            <EmptyState title="No titles match these filters" action={<button className="btn" onClick={() => setParams({ view: "all" }, { replace: true })}>Clear filters</button>}>
              Try removing a filter. Tag combinations must all match.
            </EmptyState>
          ) : (
            <TitleGrid items={items} context="discover" hasMore={q.hasNextPage} loadingMore={q.isFetchingNextPage} onMore={() => void q.fetchNextPage()} />
          )}
          {q.isError && items.length > 0 && <ErrorState error={q.error} retry={() => void q.fetchNextPage()} compact />}
        </div>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Filters">
        {filters}
        <div style={{ position: "sticky", bottom: 0, paddingTop: 16, background: "var(--bg-raised)" }}>
          <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => setOpen(false)}>
            Show {total !== undefined ? total.toLocaleString() : ""} results
          </button>
        </div>
      </Sheet>
    </div>
  );
}
