import { useEffect } from "react";

/**
 * Minimal head manager for a client-rendered app: title, description,
 * canonical, Open Graph / Twitter tags, JSON-LD, and robots. Private screens
 * (library, history, profile, reader) set `noindex`.
 */
export interface Head {
  title: string;
  description?: string;
  path?: string;
  image?: string;
  type?: "website" | "book" | "article";
  jsonLd?: Record<string, unknown>;
  noindex?: boolean;
}

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
export const SITE_URL = (env.VITE_SITE_URL || "").replace(/\/+$/, "") || (typeof location !== "undefined" ? location.origin : "");
export const SITE_NAME = "Dawghwa";
const DEFAULT_DESC = "Find your next manhwa, manga, manhua or webtoon. Personal recommendations that learn on your device, and a reader built for long strips and pages.";

function meta(attr: "name" | "property", key: string, value: string | undefined) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!value) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value;
}

function link(rel: string, href: string | undefined) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!href) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

export function applyHead(h: Head) {
  const title = h.title === SITE_NAME ? `${SITE_NAME} · Manhwa, manga and webtoon reader` : `${h.title} · ${SITE_NAME}`;
  document.title = title;
  const desc = (h.description || DEFAULT_DESC).replace(/\s+/g, " ").slice(0, 200);
  const url = h.path !== undefined ? `${SITE_URL}${h.path}` : undefined;
  meta("name", "description", desc);
  meta("name", "robots", h.noindex ? "noindex, nofollow" : "index, follow");
  meta("property", "og:title", title);
  meta("property", "og:description", desc);
  meta("property", "og:type", h.type ?? "website");
  meta("property", "og:site_name", SITE_NAME);
  meta("property", "og:url", url);
  meta("property", "og:image", h.image ?? `${SITE_URL}/icons/og.png`);
  meta("name", "twitter:card", h.image ? "summary" : "summary_large_image");
  meta("name", "twitter:title", title);
  meta("name", "twitter:description", desc);
  link("canonical", h.noindex ? undefined : url);
  let ld = document.getElementById("ld-json") as HTMLScriptElement | null;
  if (h.jsonLd && !h.noindex) {
    if (!ld) {
      ld = document.createElement("script");
      ld.type = "application/ld+json";
      ld.id = "ld-json";
      document.head.appendChild(ld);
    }
    ld.textContent = JSON.stringify(h.jsonLd);
  } else ld?.remove();
}

export function useHead(h: Head) {
  const key = JSON.stringify(h);
  useEffect(() => {
    applyHead(JSON.parse(key) as Head);
  }, [key]);
}
