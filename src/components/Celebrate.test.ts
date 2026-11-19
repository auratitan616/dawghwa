import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/platform", () => ({ haptic: vi.fn(async () => undefined), setSystemBars: vi.fn(async () => undefined) }));

import { celebrate, dismissReward, pendingRewards } from "./Celebrate";
import { migrateSettings, updateSettings } from "@/lib/settings";

afterEach(() => {
  pendingRewards().forEach((r) => dismissReward(r.id));
  updateSettings({ rewards: true });
});

describe("celebrate", () => {
  it("queues at most two reward cards", () => {
    celebrate({ kind: "chapter", title: "a" });
    celebrate({ kind: "chapter", title: "b" });
    celebrate({ kind: "level", title: "c" });
    expect(pendingRewards().map((r) => r.title)).toEqual(["b", "c"]);
  });
  it("does nothing when Profile > Rewards is off", () => {
    updateSettings({ rewards: false });
    celebrate({ kind: "badge", title: "hidden" });
    expect(pendingRewards()).toHaveLength(0);
  });
});

describe("migrateSettings", () => {
  it("maps the old milestones switch to rewards", () => {
    expect(migrateSettings({ achievements: false })).toEqual({ rewards: false });
    expect(migrateSettings({ achievements: false, rewards: true })).toEqual({ rewards: true });
  });
});
