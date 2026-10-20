/** R-208 — script-owned victory/defeat decisions surfaced as GameOver events. */
import type { JassVm } from "../vm.ts";
import { vint } from "../vm.ts";
import type { Sim } from "../../sim/sim.ts";
import { playerIndexOf } from "./players.ts";

export function registerVictoryNatives(vm: JassVm, sim: Sim): void {
  const defeated = new Map<number, true>();

  vm.registerNative("CustomVictoryBJ", (ctx, args) => {
    const playerId = args[0] ? playerIndexOf(ctx, args[0]) : -1;
    if (playerId >= 0) sim.endGame(playerId);
    return vint(0);
  });

  vm.registerNative("CustomDefeatBJ", (ctx, args) => {
    const playerId = args[0] ? playerIndexOf(ctx, args[0]) : -1;
    if (playerId >= 0) defeated.set(playerId, true);
    // D-3 single-client semantics: only the fixed local player losing ends this headless run.
    if (playerId === 0) sim.endGame(null);
    return vint(0);
  });
}
