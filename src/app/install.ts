import { useSyncExternalStore } from "react";
import { isNative } from "@/lib/platform";

/**
 * Install-as-app state for the web build.
 *
 * Chromium browsers fire `beforeinstallprompt` once, early, and only if the page is
 * listening at that moment, so `captureInstallPrompt()` runs from main.tsx before the
 * app boots. Safari (iOS and macOS) and Firefox have no prompt API: for them the UI
 * shows the browser's own steps instead of pretending a button can install.
 */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallMode =
  /** running as an installed app (or inside the native shell) */
  | "installed"
  /** the browser handed us a prompt: one tap installs */
  | "prompt"
  /** iPhone / iPad: Share, then Add to Home Screen */
  | "ios"
  /** macOS Safari: File, then Add to Dock */
  | "mac-safari"
  /** a browser without an install path we can trigger (or one that has not offered yet) */
  | "manual";

let deferred: InstallPromptEvent | null = null;
let justInstalled = false;
let captured = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"].some((m) => window.matchMedia?.(`(display-mode: ${m})`).matches)
  );
}

export function captureInstallPrompt() {
  if (captured || typeof window === "undefined" || isNative()) return;
  captured = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep the mini-infobar away; the page offers its own button
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    justInstalled = true;
    emit();
  });
}

function platformMode(): Exclude<InstallMode, "installed" | "prompt"> {
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (iOS) return "ios";
  const safari = /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\/|OPR\/|Firefox\//.test(ua);
  if (safari && /Macintosh/.test(ua)) return "mac-safari";
  return "manual";
}

export function installMode(): InstallMode {
  if (isNative() || isStandalone() || justInstalled) return "installed";
  if (deferred) return "prompt";
  return platformMode();
}

/** Show the browser's install prompt. Resolves to the reader's choice, or "unavailable". */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const e = deferred;
  if (!e) return "unavailable";
  deferred = null; // a prompt can be shown once
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === "accepted") justInstalled = true;
  emit();
  return outcome;
}

const subscribe = (fn: () => void) => {
  subs.add(fn);
  return () => subs.delete(fn);
};

export function useInstallMode(): InstallMode {
  return useSyncExternalStore(subscribe, installMode, () => "manual");
}
