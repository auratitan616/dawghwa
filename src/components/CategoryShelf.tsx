import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { TitleCard } from "@/components/TitleCard";
import { ErrorState, RowSkeleton } from "@/components/States";
import { useBrowse } from "@/lib/query";
import { rerankRow, type RankContext } from "@/lib/intel/rank";

const DEFAULT = ["Fantasy", "Action", "Romance", "Drama", "Comedy", "Thriller", "Slice of Life", "Horror", "Sci-Fi", "Sports"];

/**
 * Blueprint "Popular series by category": a chip tab bar over one shelf.
 * Each tab is a real /api/browse query (genre, most followed); the profile's
 * chosen genres are moved to the front.
 */
export function CategoryShelf({ ctx, preferred = [] }: { ctx: RankContext; preferred?: string[] }) {
  const genres = useMemo(() => [...new Set([...preferred.filter((g) => DEFAULT.includes(g)), ...DEFAULT])], [preferred]);
  const [genre, setGenre] = useState(genres[0]!);
  const id = useId();
  const tabs = useRef<HTMLDivElement>(null);
  const q = useBrowse({ order: "popular", limit: 24, includedTags: [genre] });
  const items = useMemo(() => rerankRow(q.data?.items ?? [], ctx).slice(0, 18), [q.data, ctx]);

  const onKey = (e: KeyboardEvent) => {
    const i = genres.indexOf(genre);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? genres.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const g = genres[(next + genres.length) % genres.length]!;
    setGenre(g);
    tabs.current?.querySelector<HTMLButtonElement>(`[data-g="${CSS.escape(g)}"]`)?.focus();
  };

  return (
    <section className="section cat-shelf" aria-labelledby={`${id}-h`}>
      <div className="section-head">
        <div className="section-titles">
          <h2 id={`${id}-h`}>Popular by category</h2>
        </div>
        <Link to={`/discover?tag=${encodeURIComponent(genre)}`} className="see-all" aria-label={`See all popular ${genre}`}>
          See all <ChevronRight size={15} />
        </Link>
      </div>
      <div className="cat-tabs" role="tablist" aria-label="Category" ref={tabs} onKeyDown={onKey}>
        {genres.map((g) => (
          <button key={g} data-g={g} role="tab" id={`${id}-t-${g}`} aria-selected={g === genre} aria-controls={`${id}-p`} tabIndex={g === genre ? 0 : -1} className="chip" onClick={() => setGenre(g)}>
            {g}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-p`} aria-labelledby={`${id}-t-${genre}`} aria-busy={!q.data || undefined}>
        {q.isError && !q.data ? (
          <ErrorState error={q.error} retry={() => void q.refetch()} compact />
        ) : !q.data ? (
          <RowSkeleton />
        ) : (
          <div className="row-track">
            {items.map((t, i) => (
              <TitleCard key={t.key} title={t} context={`cat-${genre}`} eager={i < 3} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
