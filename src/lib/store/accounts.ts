import { useSyncExternalStore } from "react";
import type { ProfileRecord } from "./db";
import { getUser, subscribeUser, updateProfile } from "./user";

/**
 * Local "sign up / sign in" (D4). A reader is a profile on this device; an optional
 * 4-digit PIN asks for confirmation before the profile opens. It is a privacy curtain
 * for shared devices, not security: nothing is encrypted and nothing leaves the device.
 *
 * Unlocks last for the browser session (sessionStorage), so a reload doesn't ask again
 * but closing the app does. "Sign out" shows the reader picker.
 */

const KEY = "dawghwa:session";
interface Session {
  unlocked: string[];
  /** Show the "Who's reading?" picker even for profiles without a PIN. */
  chooser?: boolean;
}
const subs = new Set<() => void>();
let session: Session = read();

function read(): Session {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Session | null;
    return s && Array.isArray(s.unlocked) ? s : { unlocked: [] };
  } catch {
    return { unlocked: [] };
  }
}
function write(next: Session) {
  session = next;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: the session lives in memory */
  }
  subs.forEach((f) => f());
}

export const isValidPin = (pin: string) => /^\d{4}$/.test(pin);

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  return sha256(`dawghwa:${salt}:${pin}`);
}

export async function makePin(pin: string): Promise<NonNullable<ProfileRecord["pin"]>> {
  if (!isValidPin(pin)) throw new Error("A PIN is 4 digits.");
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { salt, hash: await hashPin(pin, salt) };
}

export async function verifyPin(p: Pick<ProfileRecord, "pin">, pin: string): Promise<boolean> {
  if (!p.pin) return true;
  if (!isValidPin(pin)) return false;
  return (await hashPin(pin, p.pin.salt)) === p.pin.hash;
}

/** Set or remove the active profile's PIN. Setting one keeps the profile unlocked now. */
export async function setPin(pin: string | null) {
  const id = getUser().profile?.id;
  if (!id) return;
  const record = pin ? await makePin(pin) : undefined;
  unlock(id); // first, so the profile never flashes the sign-in screen
  await updateProfile({ pin: record });
}

export function unlock(id: string) {
  write({ unlocked: [...new Set([...session.unlocked, id])], chooser: false });
}

/** Sign out: lock every profile and show the reader picker. */
export function signOut() {
  write({ unlocked: [], chooser: true });
}

/** True after Sign out (show the reader list rather than jumping to one PIN). */
export const isChooser = () => Boolean(session.chooser);

export function needsSignIn(p: Pick<ProfileRecord, "id" | "pin"> | null | undefined, s: Session = session): boolean {
  if (!p) return false;
  if (s.chooser) return true;
  return Boolean(p.pin) && !s.unlocked.includes(p.id);
}

/** True while the active profile must be signed into before anything shows. */
export function useSignInRequired(): boolean {
  useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => session,
  );
  const p = useSyncExternalStore(subscribeUser, () => getUser().profile);
  return needsSignIn(p);
}

/** Test helper. */
export function resetSessionForTests() {
  write({ unlocked: [] });
}
