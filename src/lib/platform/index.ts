import { Capacitor } from "@capacitor/core";

/**
 * Platform abstraction. Screens call these functions and never import
 * Capacitor plugins directly; on the web each one degrades to the closest
 * browser behaviour (or a no-op), so one codebase serves PWA and Android.
 * Native plugins are loaded lazily, so the web bundle never pays for them.
 */

export const isNative = () => Capacitor.isNativePlatform();
export const platformName = () => Capacitor.getPlatform() as "web" | "android" | "ios";

// ------------------------------------------------------------------ back button

type BackHandler = () => boolean; // return true when handled
const backStack: BackHandler[] = [];

/** Register a back handler (topmost wins: sheets, menus, reader chrome). */
export function onBack(handler: BackHandler): () => void {
  backStack.push(handler);
  return () => {
    const i = backStack.lastIndexOf(handler);
    if (i >= 0) backStack.splice(i, 1);
  };
}

/** Run the topmost handler. Returns true when something consumed it. */
export function dispatchBack(): boolean {
  for (let i = backStack.length - 1; i >= 0; i--) if (backStack[i]!()) return true;
  return false;
}

// ------------------------------------------------------------------ haptics

export async function haptic(kind: "light" | "medium" | "success" | "warning" = "light") {
  if (!isNative()) {
    if (kind !== "light" && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(kind === "warning" ? [20, 40, 20] : 15);
    return;
  }
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
    if (kind === "success") await Haptics.notification({ type: NotificationType.Success });
    else if (kind === "warning") await Haptics.notification({ type: NotificationType.Warning });
    else await Haptics.impact({ style: kind === "medium" ? ImpactStyle.Medium : ImpactStyle.Light });
  } catch {
    /* haptics are optional */
  }
}

// ------------------------------------------------------------------ share

export async function share(data: { title: string; text?: string; url: string }): Promise<"shared" | "copied" | "failed"> {
  try {
    if (isNative()) {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title: data.title, text: data.text, url: data.url, dialogTitle: data.title });
      return "shared";
    }
    if (navigator.share) {
      await navigator.share(data);
      return "shared";
    }
    await navigator.clipboard.writeText(data.url);
    return "copied";
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return "shared";
    return "failed";
  }
}

// ------------------------------------------------------------------ system bars / immersive

export async function setSystemBars(theme: "dark" | "light", background: string) {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = background;
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: theme === "dark" ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color: background });
  } catch {
    /* ignore */
  }
}

/** Immersive reading: hide system bars on Android, request fullscreen nowhere on web (user gesture only). */
export async function setImmersive(on: boolean) {
  document.documentElement.toggleAttribute("data-immersive", on);
  if (!isNative()) return;
  try {
    const { StatusBar } = await import("@capacitor/status-bar");
    if (on) await StatusBar.hide();
    else await StatusBar.show();
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------------ network

export type NetState = { online: boolean; type?: string };
const netSubs = new Set<(s: NetState) => void>();
let net: NetState = { online: typeof navigator === "undefined" ? true : navigator.onLine };

export const network = {
  get: () => net,
  subscribe(fn: (s: NetState) => void) {
    netSubs.add(fn);
    return () => netSubs.delete(fn);
  },
};

function setNet(s: NetState) {
  if (s.online === net.online && s.type === net.type) return;
  net = s;
  netSubs.forEach((f) => f(s));
}

// ------------------------------------------------------------------ lifecycle

const resumeSubs = new Set<() => void>();
const pauseSubs = new Set<() => void>();
export const lifecycle = {
  onResume(fn: () => void) {
    resumeSubs.add(fn);
    return () => resumeSubs.delete(fn);
  },
  /** Fired when the app goes to background: flush unsaved progress here. */
  onPause(fn: () => void) {
    pauseSubs.add(fn);
    return () => pauseSubs.delete(fn);
  },
};

// ------------------------------------------------------------------ init

let started = false;

/**
 * Wire platform events once at startup.
 * `navigateBack` is called when no registered handler consumed the back
 * button; it returns false at the root so the app can exit (Android).
 */
export async function initPlatform(opts: { navigateBack: () => boolean; openUrl: (path: string) => void }) {
  if (started) return;
  started = true;
  window.addEventListener("online", () => setNet({ online: true }));
  window.addEventListener("offline", () => setNet({ online: false }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") pauseSubs.forEach((f) => f());
    else resumeSubs.forEach((f) => f());
  });
  window.addEventListener("pagehide", () => pauseSubs.forEach((f) => f()));
  // Escape behaves like back on desktop (closes the topmost layer).
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !e.defaultPrevented) {
      if (dispatchBack()) e.preventDefault();
    }
  });

  if (!isNative()) return;
  document.documentElement.dataset.platform = platformName();
  const [{ App }, { Network }, { SplashScreen }, { Keyboard }] = await Promise.all([
    import("@capacitor/app"),
    import("@capacitor/network"),
    import("@capacitor/splash-screen"),
    import("@capacitor/keyboard"),
  ]);
  void App.addListener("backButton", () => {
    if (dispatchBack()) return;
    if (!opts.navigateBack()) void App.minimizeApp();
  });
  void App.addListener("appUrlOpen", ({ url }) => {
    try {
      const u = new URL(url);
      // https://dawghwa.app/title/... and dawghwa://title/...
      const path = u.protocol === "dawghwa:" ? `/${u.host}${u.pathname}${u.search}` : `${u.pathname}${u.search}`;
      opts.openUrl(path);
    } catch {
      /* ignore malformed links */
    }
  });
  void App.addListener("pause", () => pauseSubs.forEach((f) => f()));
  void App.addListener("resume", () => resumeSubs.forEach((f) => f()));
  const status = await Network.getStatus();
  setNet({ online: status.connected, type: status.connectionType });
  void Network.addListener("networkStatusChange", (s) => setNet({ online: s.connected, type: s.connectionType }));
  void Keyboard.addListener("keyboardWillShow", (info) => document.documentElement.style.setProperty("--keyboard-h", `${info.keyboardHeight}px`));
  void Keyboard.addListener("keyboardWillHide", () => document.documentElement.style.setProperty("--keyboard-h", "0px"));
  await SplashScreen.hide({ fadeOutDuration: 200 });
}

/** Data-saver hint: metered / cellular connection or Save-Data header. */
export function prefersDataSaver(): boolean {
  const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (c?.saveData) return true;
  if (c?.effectiveType && /(^|-)2g$/.test(c.effectiveType)) return true;
  return false; // a cellular connection alone is not a reason: the user setting decides
}
