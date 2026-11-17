import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Globe, Search as SearchIcon, X } from "lucide-react";
import { TitleGrid } from "@/components/Grid";
import { EmptyState, ErrorState, GridSkeleton } from "@/components/States";
import { Cover } from "@/components/Cover";
import { parseIntent } from "@/lib/search/intent";
import { runIntent } from "@/lib/search/run";
import { textScore } from "@/lib/search/local";
import { streamSearch } from "@/lib/api/endpoints";
import { useBrowse, useVocabulary } from "@/lib/query";
import { useHead } from "@/lib/seo";
import { getCachedTitles } from "@/lib/store/db";
import { useUser } from "@/lib/store/user";
import { useRankContext } from "@/lib/feed/context";
import { fromResult, titlePath, type Title } from "@/lib/titles";

const EXAMPLES = ["Manhwa with an overpowered MC and revenge", "Completed fantasy manga with romance", "Dark Korean manhwa without a love triangle", "Something similar to Solo Leveling", "Hidden gems with fewer than 100 chapters"];

function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

const recentKey = (pid?: string) => `dawghwa:recent-searches:${pid ?? "none"}`;
function readRecent(pid?: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(recentKey(pid)) ?? "[]") as string[];
  } catch {
    return [];
  }
}

interface SourceRun {
  sourceId: string;
  source: string;
  items: Title[];
  error?: string;
  durationMs?: number;
}

/** Multi-source title search over the NDJSON stream, started explicitly (it hits every provider). */
function AllSources({ q }: { q: string }) {
  const [runs, setRuns] = useState<SourceRun[]>([]);
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [err, setErr] = useState<unknown>();
  const ac = useRef<AbortController | null>(null);
  useEffect(() => () => ac.current?.abort(), []);
  useEffect(() => {
    ac.current?.abort();
    setRuns([]);
    setState("idle");
  }, [q]);
  const start = async () => {
    ac.current?.abort();
    const c = new AbortController();
    ac.current = c;
    setRuns([]);
    setState("running");
    try {
      await streamSearch(q, {
        signal: c.signal,
        onLine: (l) => {
          const items = l.results.map((r) => fromResult(r, l.sourceId, l.source)).sort((a, b) => textScore(b, q) - textScore(a, q));
          setRuns((r) => [...r, { sourceId: l.sourceId, source: l.source, items, error: l.error, durationMs: l.durationMs }]);
        },
      });
      if (!c.signal.aborted) setState("done");
    } catch (e) {
      if (c.signal.aborted) return;
      setErr(e);
      setState("error");
    }
  };
  if (state === "idle")
    return (
      <div className="inline-state">
        <Globe size={18} />
        <span style={{ flex: 1 }}>Not finding it? Search every connected source for "{q}". Results stream in as each source answers.</span>
        <button className="btn btn-sm" onClick={() => void start()}>
          Search all sources
        </button>
      </div>
    );
  const found = runs.filter((r) => r.items.length);
  const failed = runs.filter((r) => r.error);
  return (
    <section className="section" aria-live="polite">
      <div className="section-head">
        <div>
          <h2>All sources</h2>
          <p>
            {state === "running" ? `Searching... ${runs.length} sources answered` : `${runs.length} sources answered, ${found.length} with matches`}
            {failed.length ? `, ${failed.length} unavailable` : ""}
          </p>
        </div>
        {state === "running" && (
          <button className="btn btn-sm" onClick={() => ac.current?.abort()}>
            Stop
          </button>
        )}
      </div>
      {state === "error" && <ErrorState error={err} retry={() => void start()} compact />}
      <div className="stack">
        {found.map((r) => (
          <div key={r.sourceId} className="list">
            <div className="eyebrow" style={{ padding: "8px 0" }}>
              {r.source} · {r.items.length}
            </div>
            {r.items.slice(0, 5).map((t) => (
              <Link key={t.key} className="list-item" to={titlePath(t)}>
                <Cover src={t.cover} title={t.title} sizes="48px" className="cover-sm" />
                <span style={{ minWidth: 0 }}>
                  <span className="title">{t.title}</span>
                  <span className="card-meta">{t.latestChapter ? `Ch. ${t.latestChapter}` : ""}</span>
                </span>
              </Link>
            ))}
          </div>
        ))}
      </div>
      {failed.length > 0 && <p className="source-status muted">Unavailable: {failed.map((f) => f.source).join(", ")}</p>}
    </section>
  );
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const profileId = useUser((s) => s.profile?.id);
  const userTitles = useUser((s) => s.titles);
  const [text, setText] = useState(params.get("q") ?? "");
  const q = useDebounced(text.trim(), 280);
  const vocab = useVocabulary();
  const ctx = useRankContext();
  const input = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<string[]>(() => readRecent(profileId));
  const similarKey = params.get("similar") ?? undefined;
  useHead({ title: q ? `Search: ${q}` : "Search", path: "/search", noindex: true });

  useEffect(() => setRecent(readRecent(profileId)), [profileId]);
  useEffect(() => {
    const p = new URLSearchParams(params);
    if (q) p.set("q", q);
    else p.delete("q");
    if (similarKey && !q.toLowerCase().startsWith("similar to")) p.delete("similar");
    if (p.toString() !== params.toString()) setParams(p, { replace: true });
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const fromUrl = params.get("q") ?? "";
    if (fromUrl !== q) setText(fromUrl);
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!q || q.length < 3) return;
    const t = setTimeout(() => {
      const next = [q, ...readRecent(profileId).filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 8);
      localStorage.setItem(recentKey(profileId), JSON.stringify(next));
      setRecent(next);
    }, 2500);
    return () => clearTimeout(t);
  }, [q, profileId]);

  const intent = useMemo(() => parseIntent(q, vocab.data), [q, vocab.data]);
  const seedQ = useQuery({
    queryKey: ["seed", similarKey],
    enabled: Boolean(similarKey),
    queryFn: async () => userTitles.get(similarKey!) ?? (await getCachedTitles([similarKey!])).get(similarKey!) ?? null,
  });
  const structured = intent.structured || Boolean(intent.similarTo);
  const ready = !similarKey || seedQ.isFetched;
  const intentQ = useQuery({
    queryKey: ["intent", JSON.stringify({ ...intent, raw: undefined, chips: undefined }), similarKey ?? ""],
    enabled: Boolean(q) && structured && ready,
    queryFn: ({ signal }) => runIntent(intent, { signal, want: 36, seed: seedQ.data ?? undefined }),
    staleTime: 10 * 60_000,
  });
  const textQ = useBrowse(q && !structured ? { query: q, order: "relevance", limit: 40 } : null);
  const textItems = useMemo(() => (textQ.data?.items ?? []).map((t, i) => ({ t, s: textScore(t, q) * 2 - i / 40 })).sort((a, b) => b.s - a.s).map((x) => x.t), [textQ.data, q]);
  const items = (structured ? intentQ.data?.items : textItems)?.filter((t) => !ctx.exclude?.has(t.key)) ?? [];
  const active = structured ? intentQ : textQ;
  const local = intent.chips.filter((c) => c.where === "local");

  return (
    <div className="page search-page">
      <h1 className="sr-only">Search</h1>
      <div className="search-box">
        <form
          className="search-input"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            input.current?.blur();
          }}
        >
          <SearchIcon size={18} aria-hidden="true" />
          <input ref={input} autoFocus type="search" enterKeyHint="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Title, or describe it: dark revenge manhwa, completed..." aria-label="Search titles" autoComplete="off" spellCheck={false} />
          {text && (
            <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => (setText(""), input.current?.focus())}>
              <X size={18} />
            </button>
          )}
        </form>
        {q && intent.chips.length > 0 && (
          <div className="chips" style={{ marginTop: 10 }} aria-label="Understood filters">
            {intent.chips.map((c) => (
              <span key={c.id} className={`chip ${c.where === "local" ? "chip-local" : ""} ${c.negative ? "chip-neg" : ""}`} title={c.where === "local" ? "Applied on this device after fetching results" : "Sent to the catalogue as a filter"}>
                {c.label}
                {c.where === "local" && <small>on device</small>}
              </span>
            ))}
          </div>
        )}
      </div>

      {!q && (
        <div className="stack" style={{ gap: 28, marginTop: 12 }}>
          {recent.length > 0 && (
            <section>
              <div className="section-head">
                <h2>Recent</h2>
                <button className="btn btn-sm btn-ghost" onClick={() => (localStorage.removeItem(recentKey(profileId)), setRecent([]))}>
                  Clear
                </button>
              </div>
              <div className="chips">
                {recent.map((r) => (
                  <button key={r} className="chip" onClick={() => setText(r)}>
                    {r}
                  </button>
                ))}
              </div>
            </section>
          )}
          <section>
            <div className="section-head">
              <div>
                <h2>Describe what you want</h2>
                <p>Search understands formats, genres, themes, status, length and "similar to". It runs on your device.</p>
              </div>
            </div>
            <div className="suggestions">
              {EXAMPLES.map((e) => (
                <button key={e} className="menu-item" onClick={() => setText(e)}>
                  <SearchIcon size={16} /> {e}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {q && (
        <div style={{ marginTop: 8 }}>
          {structured && intentQ.data && (
            <p className="muted" style={{ fontSize: "var(--text-sm)", margin: "8px 0 16px" }}>
              {intentQ.data.seed ? `Ranked by similarity to ${intentQ.data.seed.title}. ` : ""}
              {intentQ.data.seedMissing ? `Couldn't find "${intent.similarTo}" in the catalogue, so this uses the other filters only. ` : ""}
              {local.length || intentQ.data.downgraded.length ? `Filtered on this device: ${intentQ.data.removedLocally} of ${intentQ.data.scanned} fetched titles removed.` : ""}
              {intentQ.data.downgraded.length ? ` Not supported by the catalogue, applied locally: ${intentQ.data.downgraded.join(", ")}.` : ""}
            </p>
          )}
          {active.isError && !items.length ? (
            <ErrorState error={active.error} retry={() => void active.refetch()} />
          ) : active.isLoading || (structured && !intentQ.data) ? (
            <GridSkeleton count={12} />
          ) : !items.length ? (
            <EmptyState title={`Nothing found for "${q}"`}>{structured ? "Try fewer filters, or rephrase. Filters marked on device can only check titles that were fetched." : "Check the spelling, or search all sources below."}</EmptyState>
          ) : (
            <TitleGrid items={items} context="search" />
          )}
          {!structured && q.length >= 2 && (
            <div style={{ marginTop: 28 }}>
              <AllSources q={q} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
