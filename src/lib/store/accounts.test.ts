import { beforeEach, describe, expect, it } from "vitest";
import { hashPin, isValidPin, makePin, needsSignIn, resetSessionForTests, setPin, signOut, unlock, verifyPin } from "./accounts";
import { createProfile, getUser, initUser, switchProfile } from "./user";
import { exportProfile, importProfile } from "./transfer";

beforeEach(() => resetSessionForTests());

describe("local sign-in PIN", () => {
  it("validates, salts and verifies", async () => {
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("12a4")).toBe(false);
    expect(isValidPin("123")).toBe(false);
    const a = await makePin("1234");
    const b = await makePin("1234");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(a.hash).toBe(await hashPin("1234", a.salt));
    expect(JSON.stringify(a)).not.toContain("1234");
    expect(await verifyPin({ pin: a }, "1234")).toBe(true);
    expect(await verifyPin({ pin: a }, "4321")).toBe(false);
    expect(await verifyPin({}, "")).toBe(true);
  });

  it("locks PIN profiles until unlocked, and sign out shows the picker", async () => {
    await initUser();
    const p = getUser().profile!;
    expect(needsSignIn(p)).toBe(false);
    await setPin("2468");
    const locked = getUser().profile!;
    expect(locked.pin).toBeTruthy();
    expect(needsSignIn(locked)).toBe(false); // setting a PIN keeps you signed in
    signOut();
    expect(needsSignIn(locked)).toBe(true);
    unlock(locked.id);
    expect(needsSignIn(locked)).toBe(false);
    // other profiles without a PIN open straight away
    const q = await createProfile("Guest");
    await switchProfile(q.id);
    expect(needsSignIn(getUser().profile)).toBe(false);
  });

  it("travels with export/import, still verifiable", async () => {
    await initUser();
    await setPin("1357");
    const json = JSON.stringify(await exportProfile());
    const imported = await importProfile(json);
    expect(imported.pin).toBeTruthy();
    expect(await verifyPin(imported, "1357")).toBe(true);
    // a malformed PIN in a file is dropped rather than locking the profile forever
    const bad = JSON.parse(json);
    bad.profile.pin = { salt: "x", hash: "nope" };
    expect((await importProfile(JSON.stringify(bad))).pin).toBeUndefined();
  });
});
