/// <reference lib="webworker" />
import { serialize, train, type TrainInput } from "./learner";

/** Training runs off the main thread so ranking never blocks scrolling. */
self.onmessage = (ev: MessageEvent<{ id: number; input: Omit<TrainInput, "titles" | "forgotten"> & { titles: Record<string, import("../titles").Title>; forgotten: string[] } }>) => {
  const { id, input } = ev.data;
  try {
    const state = train({ ...input, forgotten: new Set(input.forgotten) });
    (self as unknown as Worker).postMessage({ id, state: serialize(state) });
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, error: String(e) });
  }
};
