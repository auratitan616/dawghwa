import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Dices, Play, Plus, RefreshCw, Sparkles } from "lucide-react";
import { Row } from "@/components/Row";
import { TitleCard } from "@/components/TitleCard";
import { Cover } from "@/components/Cover";
import { ErrorState, RowSkeleton } from "@/components/States";
import { toast } from "@/components/Toast";
import { CATALOGUE_SECTIONS, orderSections, type SectionDef } from "@/lib/feed/sections";
import { noteShown, useRankContext } from "@/lib/feed/context";
import { rank, rerankRow, surprise, type RankContext, type Scored } from "@/lib/intel/rank";
import { evidence } from "@/lib/intel/learner";
import { cosineSparse, vectorize } from "@/lib/intel/features";
import { useBrowse } from "@/lib/query";
import { useHead } from "@/lib/seo";
import { continueList, setStatus, useUser } from "@/lib/store/user";
import { kindLabel, readerPath, statusLabel, titlePath, type Title } from "@/lib/titles";

const MIN_ROW = 6;

/** Page-level registry so later rows skip titles shown in earlier rows. */
function createClaims() {
  const claims = new Map<string, { order: number; keys: string[] }>();
  const subs = new Set<() => void>();
  let version = 0;
  return {
    set(id: string, order: number, keys: string[]) {
      const prev = claims.get(id);
      if (prev && prev.order === order && prev.keys.join() === keys.join()) return;
      claims.set(id, { order, keys });
      version++;
      subs.forEach((s) => s());
    },
    before(order: number) {
      const out = new Set<string>();
      claims.forEach((c) => c.order < order && c.keys.forEach((k) => out.add(k)));
      return out;
    },
    subscribe(fn: () => void) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    version: () => version,
  };
}
type Claims = ReturnType<typeof createClaims>;

function useClaimed(claims: Claims, order: number) {
  useSyncExternalStore(claims.subscribe, claims.version, claims.version);
  return claims.before(order);
}

function CatalogueSection({ def, ctx, claims, order }: { def: SectionDef; ctx: RankContext; claims: Claims; order: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(order < 4);
  useEffect(() => {
    if (visible || !ref.current) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: "600px 0px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [visible]);
  const q = useBrowse(visible ? def.query : null);
  const claimed = useClaimed(claims, order);
  const items = useMemo(() => {
    const base = (q.data?.items ?? []).filter((t) => !def.filter || def.filter(t));
    const ranked = rerankRow(base, ctx);
    const fresh = ranked.filter((t) => !claimed.has(t.key));
    return (fresh.length >= MIN_ROW ? fresh : ranked).slice(0, 24);
  }, [q.data, def, ctx, claimed]);
  useEffect(() => {
    if (items.length) claims.set(def.id, order, items.slice(0, 12).map((t) => t.key));
  }, [items, claims, def.id, order]);
  if (q.isError && !q.data)
    return (
      <section className="section" ref={ref}>
        <div className="section-head">
          <h2>{def.title}</h2>
        </div>
        <ErrorState error={q.error} retry={() => void q.refetch()} compact />
      </section>
    );
  if (!q.data)
    return (
      <section className="section" ref={ref} aria-busy="true">
        <div className="section-head">
          <div>
            <h2>{def.title}</h2>
            <p>{def.subtitle}</p>
          </div>
        </div>
        <RowSkeleton />
      </section>
    );
  if (items.length < (def.min ?? MIN_ROW)) return <div ref={ref} />; // not enough real matches: row is omitted
  return (
    <div ref={ref}>
      <Row id={def.id} title={def.title} subtitle={def.subtitle} more={def.more} ranked={def.layout === "ranked"}>
        {items.map((t, i) => (
          <TitleCard key={t.key} title={t} context={def.id} variant={def.layout === "ranked" ? "ranked" : "card"} rank={i + 1} />
        ))}
      </Row>
    </div>
  );
}

function Featured({ ctx }: { ctx: RankContext }) {
  const q = useBrowse({ order: "popular", limit: 30, createdWithinDays: 1095 });
  const [i, setI] = useState(0);
  const lib = useUser((s) => s.library);
  const items = useMemo(() => rerankRow((q.data?.items ?? []).filter((t) => t.meta?.description && t.cover), ctx).slice(0, 5), [q.data, ctx]);
  if (q.isError && !q.data) return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  if (!items.length)
    return (
      <div className="hero" aria-busy="true">
        <div className="cover skeleton" />
        <div>
          <div className="skeleton skeleton-line" style={{ width: "30%" }} />
          <div className="skeleton" style={{ height: 32, width: "70%", marginTop: 12 }} />
          <div className="skeleton skeleton-line" style={{ width: "90%" }} />
        </div>
      </div>
    );
  const t = items[Math.min(i, items.length - 1)]!;
  const inLib = Boolean(lib.get(t.key)?.status);
  return (
    <section aria-roledescription="carousel" aria-label="Featured">
      <div className="hero">
        <div className="hero-bg" aria-hidden="true">
          {t.cover && <img src={t.cover} alt="" />}
        </div>
        <Link to={titlePath(t)} aria-label={t.title}>
          <Cover src={t.cover} large={t.coverLarge} title={t.title} eager sizes="(min-width: 768px) 180px, 112px" />
        </Link>
        <div>
          <div className="eyebrow">{[kindLabel(t.meta?.kind), statusLabel(t.meta?.status), t.meta?.year].filter(Boolean).join(" · ")}</div>
          <h2 data-long={t.title.length > 48 ? "" : undefined}>
            <Link to={titlePath(t)}>{t.title}</Link>
          </h2>
          <p className="hero-desc">{t.meta?.description}</p>
        </div>
        <div className="hero-actions">
          <Link className="btn btn-primary btn-lg" to={titlePath(t)}>
            <BookOpen size={18} /> View series
          </Link>
          <button
            className="btn btn-lg"
            onClick={() => {
              void setStatus(t, inLib ? undefined : "plan");
              toast(inLib ? "Removed from library" : "Added to Plan to read");
            }}
          >
            <Plus size={18} /> {inLib ? "In library" : "Plan to read"}
          </button>
        </div>
      </div>
      <div className="hero-dots" role="group" aria-label="Choose featured title">
        {items.map((x, n) => (
          <button key={x.key} aria-label={`Show ${x.title}`} aria-current={n === i} onClick={() => setI(n)} />
        ))}
      </div>
    </section>
  );
}

function ContinueReading() {
  const progress = useUser((s) => s.progress);
  const titles = useUser((s) => s.titles);
  const state = useUser((s) => s);
  const list = useMemo(() => continueList(state).slice(0, 12), [state]);
  if (!list.length) return null;
  void progress;
  return (
    <Row id="continue" title="Continue reading" more="/history" className="continue-row">
      {list.map((p) => {
        const t = titles.get(p.titleKey);
        if (!t) return null;
        const left = t.latestChapter ? Math.max(0, t.latestChapter - p.chapterNumber) : undefined;
        return (
          <Link key={p.titleKey} className="continue-card" to={readerPath(t, p.chapterId, p.page || undefined)}>
            <Cover src={t.cover} title={t.title} />
            <span style={{ minWidth: 0 }}>
              <span className="title" style={{ display: "block" }}>
                {t.title}
              </span>
              <span className="card-meta">
                Ch. {p.chapterNumber}
                {left ? ` · ${left} new` : ""}
              </span>
              <span className="progress-bar" style={{ display: "block", marginTop: 8 }} aria-label={`${Math.round(p.fraction * 100)}% through chapter`}>
                <i style={{ width: `${Math.round(p.fraction * 100)}%` }} />
              </span>
            </span>
          </Link>
        );
      })}
    </Row>
  );
}

/** Pools that personal rows rank from: real browse results only. */
function usePools(ctx: RankContext) {
  const s = ctx.state;
  const topGenres = useMemo(() => {
    if (!s) return ctx.prefs?.genres.slice(0, 2) ?? [];
    return Object.entries(s.affinity)
      .filter(([k, a]) => k.startsWith("g:") && a.pos >= 2 && a.score > 0)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 2)
      .map(([k]) => k.slice(2).replace(/\b\w/g, (c) => c.toUpperCase()).replace("Sci-fi", "Sci-Fi").replace("Slice Of Life", "Slice of Life").replace("Boys' Love", "Boys' Love"));
  }, [s, ctx.prefs]);
  const kinds = ctx.prefs?.kinds.length ? (ctx.prefs.kinds as ("manga" | "manhwa" | "manhua")[]) : undefined;
  const a = useBrowse({ order: "popular", limit: 100 });
  const b = useBrowse(topGenres.length ? { order: "popular", limit: 100, includedTags: topGenres.slice(0, 1), kinds } : null);
  const c = useBrowse(topGenres.length > 1 ? { order: "rating", limit: 100, includedTags: topGenres.slice(1, 2) } : null);
  const d = useBrowse({ order: "rating", limit: 100 });
  return useMemo(() => {
    const m = new Map<string, Title>();
    for (const q of [a, b, c, d]) for (const t of q.data?.items ?? []) m.set(t.key, t);
    return { items: [...m.values()], loading: a.isLoading || d.isLoading, error: a.error ?? d.error };
  }, [a, b, c, d]);
}

function PickedForYou({ ctx, pool, seed }: { ctx: RankContext; pool: Title[]; seed: number }) {
  const e = ctx.state ? evidence(ctx.state) : 0;
  const hasPrefs = Boolean(ctx.prefs?.genres.length || ctx.prefs?.kinds.length);
  const picks = useMemo(() => (pool.length ? rank(pool, { ...ctx, explore: 0.15 }, { k: 24, lambda: 0.72, exploreEvery: 6 }) : []), [pool, ctx, seed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => noteShown(picks.slice(0, 8).map((p) => p.title.key)), [picks]);
  if (!e && !hasPrefs) return null;
  if (picks.length < MIN_ROW) return null;
  return (
    <Row id="picked" title="Picked for you" subtitle={e > 0.3 ? "Learned on this device from what you read and save" : "From the genres you chose. Gets sharper as you read"}>
      {picks.map((p: Scored) => (
        <TitleCard key={p.title.key} title={p.title} reason={p.reason?.text} context="picked" />
      ))}
    </Row>
  );
}

function BecauseYouRead({ ctx }: { ctx: RankContext }) {
  const s = ctx.state;
  const seed = useMemo(() => {
    if (!s) return undefined;
    const best = Object.entries(s.liked)
      .filter(([, v]) => v > 0.8)
      .map(([k]) => ctx.titleOf?.(k))
      .filter((t): t is Title => Boolean(t?.meta?.genres?.length));
    const recent = Object.values(s.affinity).flatMap((a) => a.titles);
    return best.sort((a, b) => recent.indexOf(a.key) - recent.indexOf(b.key))[0];
  }, [s, ctx]);
  const q = useBrowse(seed ? { order: "popular", limit: 100, includedTags: seed.meta!.genres!.slice(0, 2), kinds: seed.meta?.kind ? [seed.meta.kind] : undefined } : null);
  const items = useMemo(() => {
    if (!seed || !q.data) return [];
    const sv = vectorize(seed);
    return q.data.items
      .filter((t) => t.key !== seed.key && !ctx.exclude?.has(t.key))
      .map((t) => ({ t, s: cosineSparse(sv, vectorize(t)) }))
      .filter((x) => x.s > 0.35)
      .sort((a, b) => b.s - a.s)
      .slice(0, 20)
      .map((x) => x.t);
  }, [seed, q.data, ctx.exclude]);
  if (!seed || items.length < MIN_ROW) return null;
  return (
    <Row id="because" title={`Because you read ${seed.title}`} subtitle="Shares its genres, themes and format">
      {items.map((t) => (
        <TitleCard key={t.key} title={t} context="because" />
      ))}
    </Row>
  );
}

function SomethingDifferent({ ctx, pool }: { ctx: RankContext; pool: Title[] }) {
  const s = ctx.state;
  const items = useMemo(() => {
    if (!s || Object.keys(s.liked).length < 3) return [];
    const positives = Object.keys(s.liked)
      .map((k) => ctx.titleOf?.(k))
      .filter((t): t is Title => Boolean(t?.meta));
    if (positives.length < 3) return [];
    const pv = positives.map(vectorize);
    return pool
      .filter((t) => !ctx.exclude?.has(t.key) && !s.liked[t.key] && (t.rating ?? 0) >= 7.8)
      .map((t) => ({ t, sim: Math.max(...pv.map((v) => cosineSparse(v, vectorize(t)))) }))
      .filter((x) => x.sim < 0.25)
      .sort((a, b) => (b.t.rating ?? 0) - (a.t.rating ?? 0))
      .slice(0, 16)
      .map((x) => x.t);
  }, [s, ctx, pool]);
  if (items.length < MIN_ROW) return null;
  return (
    <Row id="different" title="Something different" subtitle="Highly rated, and unlike what you usually read">
      {items.map((t) => (
        <TitleCard key={t.key} title={t} reason="Outside your usual reading" context="different" />
      ))}
    </Row>
  );
}

export default function Home() {
  const profile = useUser((s) => s.profile);
  const ctx = useRankContext();
  const pickCtx = useRankContext({ excludeLibrary: true });
  const pool = usePools(pickCtx);
  const nav = useNavigate();
  const qc = useQueryClient();
  const [seed, setSeed] = useState(0);
  const [shownCount, setShownCount] = useState(8);
  const claims = useMemo(() => createClaims(), [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const sections = useMemo(() => orderSections(CATALOGUE_SECTIONS, ctx.state, ctx.prefs), [ctx.state, ctx.prefs]);
  const more = useRef<HTMLDivElement>(null);
  const recentSurprises = useRef<string[]>([]);
  useHead({ title: "Dawghwa", path: "/", jsonLd: { "@context": "https://schema.org", "@type": "WebSite", name: "Dawghwa", url: location.origin, potentialAction: { "@type": "SearchAction", target: `${location.origin}/search?q={query}`, "query-input": "required name=query" } } });
  useEffect(() => {
    if (!more.current || shownCount >= sections.length) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setShownCount((n) => Math.min(sections.length, n + 3)), { rootMargin: "400px 0px" });
    io.observe(more.current);
    return () => io.disconnect();
  }, [shownCount, sections.length]);
  if (profile && !profile.onboarded) return <Navigate to="/welcome" replace />;
  const doSurprise = () => {
    const pick = surprise(pool.items, pickCtx, recentSurprises.current);
    if (!pick) {
      toast(pool.loading ? "Still loading titles, try again in a moment" : "Nothing new to surprise you with right now");
      return;
    }
    recentSurprises.current = [pick.title.key, ...recentSurprises.current].slice(0, 10);
    nav(titlePath(pick.title), { state: { reason: pick.reason?.text ?? "Surprise pick" } });
  };
  return (
    <div className="page">
      <h1 className="sr-only">Dawghwa home</h1>
      <div className="home-top">
        <div>
          <Featured ctx={ctx} />
        </div>
        <aside className="side-panel" aria-label="Quick actions">
          <h2>Not sure what to read?</h2>
          <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 12 }}>
            Surprise Me picks one title from the catalogue using your taste, with a little randomness.
          </p>
          <div className="cluster">
            <button className="btn btn-primary" onClick={doSurprise}>
              <Dices size={17} /> Surprise me
            </button>
            <button
              className="btn"
              onClick={async () => {
                await qc.invalidateQueries({ queryKey: ["browse"] });
                setSeed((n) => n + 1);
                toast("Feed refreshed");
              }}
            >
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
          <hr className="divider" style={{ margin: "16px 0" }} />
          <Link className="side-link" to="/search?q=hidden%20gems%20with%20fewer%20than%20100%20chapters" style={{ display: "flex", gap: 10, alignItems: "center", minHeight: 40 }}>
            <Sparkles size={16} /> Short hidden gems
          </Link>
          <Link className="side-link" to="/search?q=completed%20fantasy%20manhwa" style={{ display: "flex", gap: 10, alignItems: "center", minHeight: 40 }}>
            <Play size={16} /> Completed fantasy manhwa
          </Link>
        </aside>
      </div>
      <ContinueReading />
      <PickedForYou ctx={pickCtx} pool={pool.items} seed={seed} />
      <BecauseYouRead ctx={pickCtx} />
      {sections.slice(0, shownCount).map((d, i) => (
        <CatalogueSection key={`${d.id}-${seed}`} def={d} ctx={ctx} claims={claims} order={i} />
      ))}
      <SomethingDifferent ctx={pickCtx} pool={pool.items} />
      <div ref={more} />
      {shownCount < sections.length && (
        <div style={{ marginTop: 32 }}>
          <button className="btn" onClick={() => setShownCount((n) => n + 4)}>
            Show more sections
          </button>
        </div>
      )}
      {shownCount >= sections.length && (
        <div className="section">
          <div className="inline-state">
            <Sparkles size={18} />
            <span style={{ flex: 1 }}>That's the whole home feed. Explore every filter in Discover.</span>
            <Link className="btn btn-sm" to="/discover">
              Discover
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
