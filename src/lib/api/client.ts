import { ApiError, toApiError } from "./errors";
import type { ApiErrorBody } from "./types";

/**
 * Central HTTP client for the Dawghwa API.
 *
 *  - one base URL (VITE_API_BASE_URL, or same-origin /api)
 *  - per-request timeout and caller cancellation (AbortSignal)
 *  - in-flight de-duplication: identical concurrent requests share one fetch;
 *    the shared fetch is aborted only when every caller has cancelled
 *  - retries with exponential backoff + jitter for transient failures only,
 *    honouring Retry-After
 *  - every failure normalised to ApiError
 *  - passive API health tracking (see apiHealth)
 */

export interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
  /** Share identical in-flight requests (default true). */
  dedupe?: boolean;
}

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export function apiBase(): string {
  const base = (env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
  return base;
}

export function apiUrl(path: string): string {
  return `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`;
}

// ---------------------------------------------------------------- API health

export type ApiHealthState = "ok" | "degraded" | "unreachable";
type Listener = (s: ApiHealthState) => void;
let healthState: ApiHealthState = "ok";
let consecutiveFailures = 0;
const listeners = new Set<Listener>();

function setHealth(s: ApiHealthState) {
  if (s === healthState) return;
  healthState = s;
  listeners.forEach((l) => l(s));
}

export const apiHealth = {
  get: () => healthState,
  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Exposed for tests. */
  reset() {
    consecutiveFailures = 0;
    setHealth("ok");
  },
};

function recordOutcome(ok: boolean, err?: ApiError) {
  if (ok) {
    consecutiveFailures = 0;
    setHealth("ok");
    return;
  }
  // Only failures to reach the API itself count, not upstream source errors.
  if (err && (err.kind === "network" || err.kind === "timeout" || (err.status >= 500 && err.code === "INTERNAL_ERROR"))) {
    consecutiveFailures++;
    setHealth(consecutiveFailures >= 3 ? "unreachable" : "degraded");
  }
}

// ------------------------------------------------------------------ helpers

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ApiError({ kind: "aborted", message: "Aborted" }));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new ApiError({ kind: "aborted", message: "Aborted" }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function backoffMs(attempt: number, retryAfterMs?: number, base = 400, max = 6000): number {
  if (retryAfterMs !== undefined) return Math.min(retryAfterMs, 15_000);
  const exp = Math.min(max, base * 2 ** attempt);
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}

function parseRetryAfter(h: string | null): number | undefined {
  if (!h) return undefined;
  const n = Number(h);
  if (Number.isFinite(n)) return Math.max(0, n * 1000);
  const d = Date.parse(h);
  return Number.isFinite(d) ? Math.max(0, d - Date.now()) : undefined;
}

export async function errorFromResponse(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> = {};
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    /* non-JSON error body */
  }
  return new ApiError({
    kind: "http",
    status: res.status,
    code: body.code || `HTTP_${res.status}`,
    message: body.error || res.statusText || `HTTP ${res.status}`,
    requestId: body.requestId || res.headers.get("x-request-id") || undefined,
    details: body.details,
    retryAfterMs: parseRetryAfter(res.headers.get("retry-after")),
  });
}

/** One fetch attempt with a timeout, returning the raw Response (2xx only). */
export async function fetchOnce(url: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  if (isOffline()) throw new ApiError({ kind: "offline", message: "Offline" });
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw await errorFromResponse(res);
    return res;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (timedOut) throw new ApiError({ kind: "timeout", message: `Timed out after ${timeoutMs} ms` });
    if (signal?.aborted) throw new ApiError({ kind: "aborted", message: "Aborted" });
    throw toApiError(e);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

// ------------------------------------------------------------- dedupe + retry

interface Shared {
  promise: Promise<unknown>;
  ctrl: AbortController;
  refs: number;
}
const inflight = new Map<string, Shared>();

export function inflightCount(): number {
  return inflight.size;
}

async function run<T>(url: string, opts: RequestOptions, signal: AbortSignal): Promise<T> {
  const method = opts.method ?? (opts.body === undefined ? "GET" : "POST");
  const init: RequestInit = {
    method,
    headers: opts.body !== undefined ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  };
  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetchOnce(url, init, timeoutMs, signal);
      let data: T;
      try {
        // the health endpoint can stream leading whitespace; JSON.parse ignores it
        data = JSON.parse(await res.text()) as T;
      } catch {
        throw new ApiError({ kind: "parse", message: "Invalid JSON from API", status: res.status });
      }
      recordOutcome(true);
      return data;
    } catch (raw) {
      const err = toApiError(raw);
      recordOutcome(false, err);
      // A plain 5xx gets one retry at most: a down service shouldn't cause a storm of requests.
      const cap = err.kind === "http" && err.status >= 500 && err.retryAfterMs === undefined ? Math.min(retries, 1) : retries;
      if (err.kind === "aborted" || attempt >= cap || !err.retryable || err.kind === "offline") throw err;
      await sleep(backoffMs(attempt, err.retryAfterMs), signal);
    }
  }
}

/**
 * Typed request. Identical concurrent requests (same method, path and body)
 * share a single network request unless `dedupe: false`.
 */
export function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = apiUrl(path);
  const key = `${opts.method ?? (opts.body === undefined ? "GET" : "POST")} ${url} ${opts.body === undefined ? "" : JSON.stringify(opts.body)}`;
  const callerSignal = opts.signal;
  if (callerSignal?.aborted) return Promise.reject(new ApiError({ kind: "aborted", message: "Aborted" }));

  let shared = opts.dedupe === false ? undefined : inflight.get(key);
  if (!shared) {
    const ctrl = new AbortController();
    const entry: Shared = { ctrl, refs: 0, promise: Promise.resolve() };
    entry.promise = run<T>(url, opts, ctrl.signal).finally(() => {
      if (inflight.get(key) === entry) inflight.delete(key);
    });
    // avoid unhandled rejections when every caller detached
    entry.promise.catch(() => undefined);
    if (opts.dedupe !== false) inflight.set(key, entry);
    shared = entry;
  }
  const s = shared;
  s.refs++;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const detach = () => {
      if (settled) return;
      settled = true;
      s.refs--;
      if (s.refs <= 0) {
        s.ctrl.abort();
        if (inflight.get(key) === s) inflight.delete(key);
      }
      reject(new ApiError({ kind: "aborted", message: "Aborted" }));
    };
    callerSignal?.addEventListener("abort", detach, { once: true });
    s.promise.then(
      (v) => {
        if (settled) return;
        settled = true;
        s.refs--;
        callerSignal?.removeEventListener("abort", detach);
        resolve(v as T);
      },
      (e) => {
        if (settled) return;
        settled = true;
        s.refs--;
        callerSignal?.removeEventListener("abort", detach);
        reject(e);
      },
    );
  });
}

// ------------------------------------------------------------------- NDJSON

/**
 * Incrementally parse a newline-delimited JSON stream. Yields each complete
 * line as soon as it arrives; a trailing partial line is parsed at the end.
 * Malformed lines are skipped (reported through onBadLine), never fatal.
 */
export async function* parseNdjson<T = unknown>(
  stream: ReadableStream<Uint8Array>,
  onBadLine?: (line: string) => void,
): AsyncGenerator<T> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          yield JSON.parse(line) as T;
        } catch {
          onBadLine?.(line);
        }
      }
    }
    buf += decoder.decode();
    const last = buf.trim();
    if (last) {
      try {
        yield JSON.parse(last) as T;
      } catch {
        onBadLine?.(last);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
