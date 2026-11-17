import { isNative } from "@/lib/platform";

/** Service-worker registration with update detection (prompt, never silent reload mid-chapter). */
let ready = false;
let doUpdate: ((reload?: boolean) => Promise<void>) | undefined;
const subs = new Set<() => void>();

export const updateReady = {
  get: () => ready,
  subscribe(fn: () => void) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
};

export async function registerPwa() {
  if (isNative() || !("serviceWorker" in navigator) || import.meta.env.DEV) return;
  const { registerSW } = await import("virtual:pwa-register");
  doUpdate = registerSW({
    onNeedRefresh() {
      ready = true;
      subs.forEach((s) => s());
    },
    onRegisteredSW(_url, reg) {
      // check for a new version every hour while the app stays open
      if (reg) setInterval(() => void reg.update(), 3600_000);
    },
  });
}

export function applyUpdate() {
  void doUpdate?.(true);
}
