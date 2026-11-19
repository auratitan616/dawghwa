import { isNative } from "../platform";

/**
 * Shareable reader card (Phase 5, D33). Drawn on a canvas with colours read from the
 * live CSS tokens, so it matches the current theme. Contains only what the reader
 * chooses to share: name, level (when Rewards are on), top genres, a 12-week heatmap
 * and totals. No titles, no history list.
 */
export interface CardInput {
  name: string;
  color: string;
  level?: { level: number; tier: string; progress: number };
  genres: string[];
  /** Per-day chapter counts, oldest first (84 days). */
  days: number[];
  stats: [string, number][];
  mascot?: string;
}

const W = 1080;
const H = 1350;

function token(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function drawReaderCard(input: CardInput): Promise<Blob> {
  const c = {
    bg: token("--bg", "#0e0e10"),
    surface: token("--surface-2", "#26262b"),
    ink: token("--ink", "#f5f5f1"),
    ink2: token("--ink-2", "#c9c9c3"),
    ink3: token("--ink-3", "#9b9b95"),
    accent: token("--lime", "#b8f35a"),
    accentInk: token("--on-bright", "#10140a"),
    lavender: token("--lavender", "#b8a5f7"),
    lavenderText: token("--lavender-text", "#c4b5fa"),
    display: token("--font-display", "system-ui, sans-serif"),
    body: token("--font-body", "system-ui, sans-serif"),
  };
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);
  // lavender glow behind the mascot
  const g = ctx.createRadialGradient(W - 200, 230, 20, W - 200, 230, 360);
  g.addColorStop(0, c.lavender + "55");
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, 700);

  const pad = 84;
  ctx.fillStyle = c.ink3;
  ctx.font = `700 30px ${c.body}`;
  ctx.fillText("DAWGHWA · READER CARD", pad, pad + 20);

  // avatar
  ctx.fillStyle = input.color;
  ctx.beginPath();
  ctx.arc(pad + 56, 230, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#10140a";
  ctx.font = `800 54px ${c.display}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((input.name.trim()[0] ?? "R").toUpperCase(), pad + 56, 233);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = c.ink;
  ctx.font = `800 72px ${c.display}`;
  ctx.fillText(input.name.slice(0, 18), pad + 140, 252);

  if (input.mascot) {
    const img = await loadImage(input.mascot);
    if (img) ctx.drawImage(img, W - 360, 70, 300, 300);
  }

  let y = 400;
  if (input.level) {
    roundRect(ctx, pad, y, W - pad * 2, 170, 28);
    ctx.fillStyle = c.surface;
    ctx.fill();
    ctx.fillStyle = c.lavenderText;
    ctx.font = `700 30px ${c.body}`;
    ctx.fillText(input.level.tier.toUpperCase(), pad + 40, y + 62);
    ctx.fillStyle = c.ink;
    ctx.font = `800 64px ${c.display}`;
    ctx.fillText(`Level ${input.level.level}`, pad + 40, y + 132);
    const bx = pad + 460;
    const bw = W - pad * 2 - 500;
    roundRect(ctx, bx, y + 96, bw, 22, 11);
    ctx.fillStyle = c.bg;
    ctx.fill();
    roundRect(ctx, bx, y + 96, Math.max(22, bw * Math.min(1, input.level.progress)), 22, 11);
    ctx.fillStyle = c.accent;
    ctx.fill();
    y += 220;
  }

  // stats
  const colW = (W - pad * 2) / input.stats.length;
  input.stats.forEach(([label, v], i) => {
    const x = pad + i * colW;
    ctx.fillStyle = c.ink;
    ctx.font = `800 64px ${c.display}`;
    ctx.fillText(v.toLocaleString(), x, y + 60);
    ctx.fillStyle = c.ink3;
    ctx.font = `600 28px ${c.body}`;
    ctx.fillText(label, x, y + 104);
  });
  y += 170;

  // top genres as pills
  if (input.genres.length) {
    ctx.fillStyle = c.ink3;
    ctx.font = `700 28px ${c.body}`;
    ctx.fillText("TOP GENRES", pad, y);
    y += 30;
    let x = pad;
    ctx.font = `700 32px ${c.body}`;
    for (const name of input.genres.slice(0, 4)) {
      const w = ctx.measureText(name).width + 56;
      if (x + w > W - pad) break;
      roundRect(ctx, x, y, w, 64, 32);
      ctx.fillStyle = c.surface;
      ctx.fill();
      ctx.fillStyle = c.ink;
      ctx.fillText(name, x + 28, y + 43);
      x += w + 14;
    }
    y += 120;
  }

  // 12-week heatmap, Monday-first columns
  ctx.fillStyle = c.ink3;
  ctx.font = `700 28px ${c.body}`;
  ctx.fillText("LAST 12 WEEKS", pad, y);
  y += 30;
  const max = Math.max(1, ...input.days);
  const cols = Math.ceil(input.days.length / 7);
  const gap = 10;
  const cell = Math.min(56, (W - pad * 2 - gap * (cols - 1)) / cols);
  input.days.forEach((n, i) => {
    const col = Math.floor(i / 7);
    const row = i % 7;
    roundRect(ctx, pad + col * (cell + gap), y + row * (cell * 0.5 + 8), cell, cell * 0.5, 6);
    ctx.fillStyle = n === 0 ? c.surface : c.accent;
    ctx.globalAlpha = n === 0 ? 1 : 0.35 + 0.65 * (n / max);
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  ctx.fillStyle = c.ink3;
  ctx.font = `600 26px ${c.body}`;
  ctx.fillText("dawghwa.vercel.app", pad, H - 70);

  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not draw the card"))), "image/png"));
}

const toBase64 = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

/** Share the PNG: Capacitor Share on Android, Web Share with files, else a download. */
export async function shareCard(blob: Blob, fileName = "dawghwa-reader-card.png"): Promise<"shared" | "downloaded" | "failed"> {
  try {
    if (isNative()) {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
      const saved = await Filesystem.writeFile({ path: fileName, data: await toBase64(blob), directory: Directory.Cache });
      await Share.share({ title: "My Dawghwa reader card", files: [saved.uri], dialogTitle: "Share reader card" });
      return "shared";
    }
    const file = new File([blob], fileName, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "My Dawghwa reader card" });
      return "shared";
    }
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return "downloaded";
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return "shared";
    return "failed";
  }
}
