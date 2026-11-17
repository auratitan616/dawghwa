import type { Title } from "../titles";

/**
 * Story themes that providers do not tag (MangaDex has no "Revenge" or
 * "Regression" tag). They are detected from the title's own synopsis with
 * explicit word patterns, so a match is always checkable: the synopsis says it.
 * Titles without a synopsis never match.
 */
export interface StoryTheme {
  id: string;
  label: string;
  /** Tags that also count as this theme when the provider has them. */
  tags?: string[];
  patterns: RegExp[];
  /** Words a user may type in a natural-language search. */
  aliases: string[];
}

export const STORY_THEMES: StoryTheme[] = [
  {
    id: "revenge",
    label: "Revenge",
    patterns: [/\brevenge\b/i, /\bvengeance\b/i, /\bavenge[ds]?\b/i, /\bretribution\b/i, /\bpay(?:ing)? (?:them|him|her) back\b/i],
    aliases: ["revenge", "vengeance", "avenge", "payback"],
  },
  {
    id: "regression",
    label: "Regression",
    tags: ["Time Travel"],
    patterns: [/\bregress(?:ed|ion|or|es)?\b/i, /\breturn(?:ed|s)? to (?:the )?past\b/i, /\bsecond (?:chance|life)\b/i, /\b(?:went|sent|goes|going) back in time\b/i, /\b(?:\d+|ten|twenty|several) years (?:into the )?(?:past|earlier)\b/i, /\breturn(?:ed|s)? to (?:his|her|their) (?:younger|past|former) (?:self|days)\b/i],
    aliases: ["regression", "regressor", "regressed", "time loop", "second chance", "returner"],
  },
  {
    id: "reincarnation",
    label: "Reincarnation",
    tags: ["Reincarnation", "Isekai"],
    patterns: [/\breincarnat\w*/i, /\breborn\b/i, /\btransmigrat\w*/i, /\bpossess(?:es|ed)? the body\b/i, /\banother world\b/i],
    aliases: ["reincarnation", "reincarnated", "reborn", "isekai", "transmigration", "another world"],
  },
  {
    id: "overpowered",
    label: "Overpowered lead",
    patterns: [/\boverpowered\b/i, /\bstrongest\b/i, /\binvincible\b/i, /\bunrivaled\b/i, /\bunmatched (?:power|strength)\b/i, /\bmost powerful\b/i, /\bone[- ]man army\b/i, /\bop (?:mc|protagonist|main character)\b/i],
    aliases: ["overpowered", "op mc", "op protagonist", "strongest", "op", "op lead", "overpowered mc"],
  },
  {
    id: "cultivation",
    label: "Cultivation",
    tags: ["Wuxia"],
    patterns: [/\bcultivat\w*/i, /\bimmortal(?:s|ity)?\b/i, /\bdao\b/i, /\bqi\b/i, /\bsect\b/i, /\bmartial (?:world|realm)\b/i, /\bmurim\b/i],
    aliases: ["cultivation", "cultivator", "xianxia", "wuxia", "murim", "sect", "immortal"],
  },
  {
    id: "dungeon",
    label: "Dungeons and towers",
    patterns: [/\bdungeons?\b/i, /\btower\b/i, /\b(?:the )?gates?\b(?= (?:appeared|opened|connect))/i, /\bhunters?\b/i, /\braids?\b/i, /\bfloors?\b(?= of)/i],
    aliases: ["dungeon", "dungeons", "tower", "hunter", "hunters", "gate", "raid"],
  },
  {
    id: "system",
    label: "Game system",
    tags: ["Video Games", "Virtual Reality"],
    patterns: [/\bsystem\b(?= (?:message|window|notification|appeared|granted))/i, /\blevel(?:s|ed|ing)? up\b/i, /\bstatus window\b/i, /\bskills?\b(?= (?:tree|points))/i, /\bquests?\b/i],
    aliases: ["system", "level up", "leveling", "game system", "status window", "litrpg"],
  },
  {
    id: "villainess",
    label: "Villainess",
    tags: ["Villainess"],
    patterns: [/\bvillainess\b/i, /\b(?:the )?villain(?:'s)? (?:daughter|fiancee|role)\b/i, /\bnovel'?s villain\b/i],
    aliases: ["villainess", "villainess story", "otome"],
  },
  {
    id: "love_triangle",
    label: "Love triangle",
    patterns: [/\blove triangle\b/i, /\btorn between (?:two|both)\b/i],
    aliases: ["love triangle"],
  },
  {
    id: "worldbuilding",
    label: "Rich world-building",
    patterns: [/\bworld-?building\b/i, /\bkingdoms?\b/i, /\bempires?\b/i, /\bcontinent\b/i, /\bancient (?:civilization|ruins|order)\b/i],
    aliases: ["world-building", "worldbuilding", "world building", "epic world"],
  },
];

const BY_ID = new Map(STORY_THEMES.map((t) => [t.id, t]));
export const themeById = (id: string) => BY_ID.get(id);

const cache = new WeakMap<object, string[]>();

/** Theme ids evidenced by the title's tags or synopsis. */
export function detectThemes(t: Pick<Title, "meta">): string[] {
  const meta = t.meta;
  if (!meta) return [];
  const hit = cache.get(meta);
  if (hit) return hit;
  const tags = new Set((meta.tags ?? []).map((x) => x.toLowerCase()));
  const text = meta.description ?? "";
  const out: string[] = [];
  for (const th of STORY_THEMES) {
    if (th.tags?.some((tag) => tags.has(tag.toLowerCase())) || (text && th.patterns.some((p) => p.test(text)))) out.push(th.id);
  }
  cache.set(meta, out);
  return out;
}
