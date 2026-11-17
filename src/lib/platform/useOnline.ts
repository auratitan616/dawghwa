import { useSyncExternalStore } from "react";
import { network } from "./index";

/** Live connectivity, from the platform network monitor. */
export function useOnline() {
  return useSyncExternalStore(network.subscribe, () => network.get().online, () => true);
}
