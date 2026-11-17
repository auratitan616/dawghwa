/// <reference types="node" />
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach } from "vitest";
import { resetDbForTests } from "@/lib/store/db";

if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, "crypto", { value: await import("node:crypto").then((m) => m.webcrypto) });
}

afterEach(() => {
  resetDbForTests();
  // fresh database per test: no state leaks between tests
  globalThis.indexedDB = new IDBFactory();
});
