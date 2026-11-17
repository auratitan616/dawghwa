import type { BrowseOrder, BrowseQuery, MangaKind } from "../api/types";
import { STORY_THEMES } from "../intel/themes";

/**
 * Deterministic natural-language search parser (no AI service, no network).
 *
 * Turns "Dark Korean manhwa without a love triangle" into:
 *   - server filters the browse API really supports (kinds, tags, status,
 *     demographic, year, order) and
 *   - local filters applied on this device to the results (story themes found
 *     in synopses, moods, chapter-count bounds, hidden gems, year ranges).
 * Every filter is surfaced as a chip with where it is applied, so nothing is
 * pretended: a local filter is labelled as such.
 */

export type ChipWhere = "server" | "local";
export interface Chip {
  id: string;
  label: string;
  where: ChipWhere;
  negative?: boolean;
}

export interface Intent {
  raw: string;
  /** Remaining free text (title words). Empty when the query was all filters. */
  text: string;
  kinds: MangaKind[];
  status: NonNullable<BrowseQuery["status"]>;
  demographic: NonNullable<BrowseQuery["demographic"]>;
  includeTags: string[];
  excludeTags: string[];
  includeThemes: string[];
  excludeThemes: string[];
  /** Local "any of these tags" groups (moods such as "dark"). */
  anyTags: { label: string; tags: string[] }[];
  similarTo?: string;
  maxChapters?: number;
  minChapters?: number;
  yearMin?: number;
  yearMax?: number;
  year?: number;
  hiddenGems: boolean;
  order?: BrowseOrder;
  chips: Chip[];
  /** True when at least one structured filter was understood. */
  structured: boolean;
}

const KIND_WORDS: [RegExp, MangaKind, string][] = [
  [/\b(manhwas?|korean|webtoons?|k-?comics?)\b/i, "manhwa", "Manhwa"],
  [/\b(manhuas?|chinese)\b/i, "manhua", "Manhua"],
  [/\b(mangas?|japanese)\b/i, "manga", "Manga"],
  [/\b(western comics?|american comics?)\b/i, "comic", "Comic"],
];

/** Extra spellings for vocabulary tags. Keys are lower-case tag names. */
const TAG_ALIASES: Record<string, string[]> = {
  romance: ["romance", "romantic", "love story", "love stories", "romcom", "rom-com"],
  comedy: ["comedy", "funny", "comedic", "humor", "humour", "romcom", "rom-com"],
  "sci-fi": ["sci-fi", "scifi", "sci fi", "science fiction"],
  "boys' love": ["boys' love", "boys love", "bl", "yaoi"],
  "girls' love": ["girls' love", "girls love", "gl", "yuri"],
  "slice of life": ["slice of life", "slice-of-life", "sol"],
  "martial arts": ["martial arts", "martial art", "kung fu"],
  "school life": ["school life", "school", "high school", "academy"],
  "post-apocalyptic": ["post-apocalyptic", "post apocalyptic", "apocalypse", "apocalyptic"],
  "video games": ["video games", "video game", "gaming", "game world"],
  "virtual reality": ["virtual reality", "vr"],
  "time travel": ["time travel", "time-travel"],
  psychological: ["psychological", "mind games"],
  supernatural: ["supernatural", "paranormal"],
  monsters: ["monsters", "monster"],
  demons: ["demons", "demon"],
  vampires: ["vampires", "vampire"],
  zombies: ["zombies", "zombie"],
  harem: ["harem"],
  isekai: ["isekai"],
  magic: ["magic", "magical", "mages", "wizards"],
  historical: ["historical", "history", "period piece"],
  mystery: ["mystery", "mysteries", "detective"],
  tragedy: ["tragedy", "tragic"],
  sports: ["sports", "sport"],
  "office workers": ["office workers", "office", "workplace"],
  military: ["military", "war"],
  "full color": ["full color", "full colour", "colored", "coloured"],
  "long strip": ["long strip", "vertical scroll"],
};

/** Moods: local, any-of tag groups. Only tags providers really use. */
const MOODS: { re: RegExp; label: string; tags: string[]; exclude?: string[] }[] = [
  { re: /\b(dark|grim|gritty|bleak)\b/i, label: "Dark", tags: ["Psychological", "Tragedy", "Horror", "Thriller", "Gore", "Survival", "Post-Apocalyptic"] },
  { re: /\b(wholesome|cozy|cosy|heartwarming|feel-?good)\b/i, label: "Wholesome", tags: ["Slice of Life", "Comedy", "Cooking", "Animals"], exclude: ["Gore", "Tragedy", "Horror"] },
  { re: /\b(scary|creepy|spooky)\b/i, label: "Scary", tags: ["Horror", "Ghosts", "Supernatural", "Thriller"] },
];

const STATUS_WORDS: [RegExp, "completed" | "ongoing" | "hiatus" | "cancelled", string][] = [
  [/\b(completed|complete|finished|ended|concluded)\b/i, "completed", "Completed"],
  [/\b(ongoing|still (?:going|releasing|updating)|currently (?:releasing|updating))\b/i, "ongoing", "Ongoing"],
  [/\b(on hiatus|hiatus)\b/i, "hiatus", "On hiatus"],
];

const DEMO_WORDS: [RegExp, "shounen" | "shoujo" | "seinen" | "josei", string][] = [
  [/\b(shounen|shonen)\b/i, "shounen", "Shounen"],
  [/\b(shoujo|shojo)\b/i, "shoujo", "Shoujo"],
  [/\bseinen\b/i, "seinen", "Seinen"],
  [/\bjosei\b/i, "josei", "Josei"],
];

const FILLER = new Set(
  "a an the with and or of in on for to by from that which who is are be has have having some any good great best top i me my want looking look find show give recommend recommendations something anything series story stories title titles one ones mc protagonist lead main character characters hero heroine where about like more please read reading new please kind type sort chapters chapter ch than fewer less under over more least most at".split(
    " ",
  ),
);

const NEG = /\b(?:without|no|not|non|excluding|exclude|except|avoid|minus|skip|zero)\s+(?:a\s+|an\s+|any\s+|the\s+)?/i;

export interface Vocabulary {
  tags: { name: string; group: string }[];
}

interface Matcher {
  phrase: string;
  apply: (neg: boolean, intent: Intent) => void;
}

function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildMatchers(vocab?: Vocabulary): Matcher[] {
  const m: Matcher[] = [];
  const tagNames = new Map((vocab?.tags ?? []).filter((t) => t.group !== "content").map((t) => [t.name.toLowerCase(), t.name]));
  // story themes first: "overpowered mc", "regression"...
  for (const th of STORY_THEMES) {
    for (const alias of th.aliases) {
      m.push({
        phrase: alias,
        apply: (neg, i) => {
          const list = neg ? i.excludeThemes : i.includeThemes;
          if (!list.includes(th.id)) {
            list.push(th.id);
            i.chips.push({ id: `theme:${th.id}`, label: neg ? `No ${th.label.toLowerCase()}` : th.label, where: "local", negative: neg });
          }
        },
      });
    }
  }
  for (const [lower, name] of tagNames) {
    const aliases = TAG_ALIASES[lower] ?? [lower];
    for (const alias of aliases) {
      m.push({
        phrase: alias,
        apply: (neg, i) => {
          const list = neg ? i.excludeTags : i.includeTags;
          if (!list.includes(name)) {
            list.push(name);
            i.chips.push({ id: `tag:${name}`, label: neg ? `No ${name}` : name, where: "server", negative: neg });
          }
        },
      });
    }
  }
  // longest phrases first so "slice of life" wins over "life"
  return m.sort((a, b) => b.phrase.length - a.phrase.length);
}

const matcherCache = new WeakMap<object, Matcher[]>();
const NO_VOCAB = {};

export function emptyIntent(raw = ""): Intent {
  return { raw, text: "", kinds: [], status: [], demographic: [], includeTags: [], excludeTags: [], includeThemes: [], excludeThemes: [], anyTags: [], hiddenGems: false, chips: [], structured: false };
}

export function parseIntent(raw: string, vocab?: Vocabulary): Intent {
  const i = emptyIntent(raw);
  let s = ` ${raw.normalize("NFKC").replace(/[’`]/g, "'").replace(/\s+/g, " ").trim()} `;
  const consume = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    s = s.replace(g, (...args) => {
      fn(args as unknown as RegExpMatchArray);
      return " ";
    });
  };

  // "similar to X" / "something like X" / "more like X"
  const TITLE_END = String.raw`["']?([^,"';]+?)["']?(?=\s+(?:but|with|without|and no|that|which)\b|[,;]|\s*$)`;
  const onSimilar = (m: RegExpMatchArray) => {
    const title = m[1]!.trim();
    if (!i.similarTo && title.split(" ").length <= 8 && title.length > 1) {
      i.similarTo = title;
      i.chips.push({ id: "similar", label: `Similar to ${title}`, where: "local" });
    }
  };
  consume(new RegExp(String.raw`\b(?:similar to|in the vein of|reminds? me of|more like|along the lines of)\s+` + TITLE_END, "i"), onSimilar);
  consume(new RegExp(String.raw`(?:^\s*|(?<=\b(?:something|anything|stuff|series|titles?|ones?|manhwa|manhwas|manga|mangas|manhua|webtoons?|comics?)\s))like\s+` + TITLE_END, "i"), onSimilar);

  // chapter counts
  consume(/\b(?:fewer|less|under|below|at most|max(?:imum)?|up to|no more)\s+(?:than\s+)?(\d{1,4})\s*(?:chapters?|chs?|eps?|episodes?)\b/i, (m) => {
    i.maxChapters = Number(m[1]);
    i.chips.push({ id: "maxch", label: `Under ${m[1]} chapters`, where: "local" });
  });
  consume(/\b(?:more|over|above|at least|min(?:imum)?)\s+(?:than\s+)?(\d{1,4})\s*(?:chapters?|chs?|eps?|episodes?)\b/i, (m) => {
    i.minChapters = Number(m[1]);
    i.chips.push({ id: "minch", label: `Over ${m[1]} chapters`, where: "local" });
  });
  consume(/\b(?:short|quick|binge-?able)\s+(?:reads?|series)\b/i, () => {
    i.maxChapters = 50;
    i.chips.push({ id: "maxch", label: "Under 50 chapters", where: "local" });
  });
  consume(/\b(?:long|lengthy|epic)\s+(?:reads?|series|running)\b/i, () => {
    i.minChapters = 150;
    i.chips.push({ id: "minch", label: "Over 150 chapters", where: "local" });
  });

  // years
  consume(/\b(?:after|since|newer than|from)\s+((?:19|20)\d{2})\b/i, (m) => {
    i.yearMin = Number(m[1]);
    i.chips.push({ id: "ymin", label: `From ${m[1]}`, where: "local" });
  });
  consume(/\b(?:before|older than|until|pre)\s+((?:19|20)\d{2})\b/i, (m) => {
    i.yearMax = Number(m[1]) - 1;
    i.chips.push({ id: "ymax", label: `Before ${m[1]}`, where: "local" });
  });
  consume(/\b(?:in|released in|year)\s+((?:19|20)\d{2})\b/i, (m) => {
    i.year = Number(m[1]);
    i.chips.push({ id: "year", label: m[1]!, where: "server" });
  });

  // hidden gems / ordering
  consume(/\b(hidden gems?|underrated|under-?the-?radar|lesser[- ]known|obscure|sleeper hits?)\b/i, () => {
    i.hiddenGems = true;
    i.order = "rating";
    i.chips.push({ id: "gems", label: "Hidden gems", where: "local" });
  });
  consume(/\b(highest rated|top rated|best rated|best|highly rated|top)\b/i, () => {
    i.order ??= "rating";
  });
  consume(/\b(most popular|popular|trending|famous)\b/i, () => {
    i.order ??= "popular";
  });
  consume(/\b(newest|latest|recently updated|new releases?|fresh)\b/i, () => {
    i.order ??= "latest";
  });

  for (const [re, st, label] of STATUS_WORDS)
    consume(re, () => {
      if (!i.status.includes(st)) {
        i.status.push(st);
        i.chips.push({ id: `status:${st}`, label, where: "server" });
      }
    });
  for (const [re, d, label] of DEMO_WORDS)
    consume(re, () => {
      if (!i.demographic.includes(d)) {
        i.demographic.push(d);
        i.chips.push({ id: `demo:${d}`, label, where: "server" });
      }
    });
  for (const mood of MOODS)
    consume(mood.re, () => {
      i.anyTags.push({ label: mood.label, tags: mood.tags });
      i.chips.push({ id: `mood:${mood.label}`, label: mood.label, where: "local" });
      for (const x of mood.exclude ?? []) if (!i.excludeTags.includes(x)) i.excludeTags.push(x);
    });

  // tags and themes, with negation scope "without X (and|or|,) Y"
  const vocabKey = vocab ?? NO_VOCAB;
  let matchers = matcherCache.get(vocabKey);
  if (!matchers) matcherCache.set(vocabKey, (matchers = buildMatchers(vocab)));
  for (const mt of matchers) {
    const re = new RegExp(`(${NEG.source})?\\b${esc(mt.phrase)}(?:e?s)?\\b`, "gi");
    const src = s;
    s = src.replace(re, (_whole: string, negPart: string | undefined, offset: number) => {
      // negation carries over a list: "without harem or love triangles"
      const before = src.slice(Math.max(0, offset - 60), offset);
      const listNeg = /(?:without|no|not|excluding|avoid)\s[^,]*?(?:,\s*|\s(?:or|and|nor)\s+)$/i.test(before) && !/\bwith\s[^,]*$/i.test(before.replace(/^.*\b(?:without|no|not|excluding|avoid)\b/i, ""));
      mt.apply(Boolean(negPart) || listNeg, i);
      return " ";
    });
  }

  // formats last: "korean" etc. (after tags so "korean" in a title phrase is rare)
  for (const [re, k, label] of KIND_WORDS)
    consume(re, () => {
      if (!i.kinds.includes(k)) {
        i.kinds.push(k);
        i.chips.push({ id: `kind:${k}`, label, where: "server" });
      }
    });

  const leftover = s
    .replace(NEG, " ")
    .replace(/[^\p{L}\p{N}' -]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w.toLowerCase()) && !/^(without|no|not|but|nor|excluding|avoid|op)$/i.test(w));
  i.structured = i.chips.length > 0 || Boolean(i.order);
  i.text = i.structured ? (leftover.length >= 2 ? leftover.join(" ") : "") : raw.trim();
  return i;
}

/** The part of an intent the API can apply. */
export function toBrowseQuery(i: Intent): BrowseQuery {
  const q: BrowseQuery = { order: i.order ?? (i.text ? "relevance" : "popular"), limit: 100 };
  if (i.text) q.query = i.text;
  if (i.kinds.length) q.kinds = i.kinds;
  if (i.status.length) q.status = i.status;
  if (i.demographic.length) q.demographic = i.demographic;
  if (i.includeTags.length) q.includedTags = i.includeTags;
  if (i.excludeTags.length) q.excludedTags = i.excludeTags;
  if (i.year) q.year = i.year;
  return q;
}

export function hasLocalFilters(i: Intent): boolean {
  return Boolean(i.includeThemes.length || i.excludeThemes.length || i.anyTags.length || i.maxChapters || i.minChapters || i.yearMin || i.yearMax || i.hiddenGems);
}
