/** Shared assembly of the existing parser, VM, Sim, natives and systems.
 * No map-specific balance or startup workaround belongs in this factory. */
import { createUnitIdentityProvider } from "./unit-identity.ts";
import type { MapIR, ObjectMod } from "../ir/types.ts";
import { openArchive } from "../formats/mpq/index.ts";
import { parseObjectFile, toObjectMods } from "../formats/objects.ts";
import {parseWts} from "../formats/wts.ts";
import { parseWpm } from "../formats/wpm.ts";
import { parseJass } from "../jass/parser.ts";
import { JassVm } from "../jass/vm.ts";
import { installNatives } from "../jass/natives/index.ts";
import { Sim } from "../sim/sim.ts";
import type { DefStore } from "../sim/def-store.ts";
import { installCombat } from "../sim/combat-system.ts";
import {createAbilityRangeResolver,createCombatAbilityCatalog} from "./ability-effects.ts";
import {GridNavigation} from "../sim/navigation.ts";
import { installMovement } from "../sim/movement.ts";
import type { BountyMode } from "../sim/combat-pipe.ts";
import type { GameConstants } from "../sim/balance/config.ts";
import type { LifeConfig } from "../sim/life.ts";

export interface SessionOptions {
  seed: number;
  pathing?:import("../formats/wpm.ts").PathingMap;
  /** Host/lobby occupancy, independent of controller settings authored by config(). */
  playerSlots?: ReadonlyArray<{playerId: number; state: number}>;
  /** Explicit local profile; no bundled or guessed stock values. */
  stockUnits?: ReadonlyArray<ObjectMod>;
  stockAbilities?:ReadonlyArray<ObjectMod>;
  pathingTextures?:Readonly<Record<string,import("../formats/stock-unit-abilities.ts").PathingFootprint>>;
  defStore: DefStore;
  gc: GameConstants;
  bountyMode: BountyMode;
  life?: LifeConfig;
  researchConfig?: Sim["researchConfig"];
  threadBudget?: number;
  maxCallDepth?: number;
}

/** Known standard members only; this neither reconstructs listfiles nor protection.
 * ponytail: reuse existing readers. Terrain/info/placement readers remain explicit
 * gaps until a compatible existing reader or the user's versioned data is supplied. */
export function readScriptMap(bytes: Uint8Array, sourceFile: string) {
  const archive = openArchive(bytes);
  const source = new TextDecoder("utf-8").decode(archive.read("war3map.j"));
  const objectMods: ObjectMod[] = [];
  const objectFiles: Array<[string, "basic" | "extended", ObjectMod["kind"]]> = [
    ["war3map.w3u", "basic", "unit"], ["war3map.w3t", "basic", "item"],
    ["war3map.w3b", "basic", "destructable"], ["war3map.w3h", "basic", "buff"],
    ["war3map.w3a", "extended", "ability"], ["war3map.w3d", "extended", "doodad"],
    ["war3map.w3q", "extended", "upgrade"],
  ];
  const files = ["war3map.j"];
  for (const [path, mode, kind] of objectFiles) {
    if (!archive.has(path)) continue;
    objectMods.push(...toObjectMods(parseObjectFile(archive.read(path), mode, kind)));
    files.push(path);
  }
  const pathing = archive.has("war3map.wpm") ? parseWpm(archive.read("war3map.wpm")) : null;
  if (pathing) files.push("war3map.wpm");
  const strings=archive.has("war3map.wts")?parseWts(archive.read("war3map.wts")):new Map<number,string>();
  if(strings.size)files.push("war3map.wts");
  const notes = ["partial loader: w3i names/players, w3e terrain and doo placement are not yet decoded",
    "stock game data and native-demand analysis are not supplied by this loader"];
  const ir: MapIR = {
    irVersion: 1,
    info: {name: sourceFile, author: "", suggestedPlayers: "", playableWidth: 0, playableHeight: 0, formatVersion: 0},
    terrain: {tileset: "", width: 1, height: 1, tiles: [{ground: 0, height: 0, waterHeight: null, flags: 0}]},
    placedUnits: [], objectMods, regions: [], script: {source, nativesUsed: {}},
    meta: {sourceFile, fileInventory: files, parsedAt: ""},
  };
  return {archive, ir, pathing, strings, notes};
}

export function createSession(ir: MapIR, options: SessionOptions) {
  const defStore = options.stockUnits
    ? options.defStore.withIdentity(createUnitIdentityProvider(options.stockUnits, ir.objectMods, options.pathingTextures))
    : options.defStore;
  const parsed = parseJass(ir.script.source);
  const vm = JassVm.fromParseResult(parsed, {
    threadBudget: options.threadBudget ?? 5_000_000,
    maxCallDepth: options.maxCallDepth ?? 500,
  });
  const sim = new Sim(ir, options.seed);
  for (const slot of options.playerSlots ?? []) sim.playerState.setSlotState(slot.playerId, slot.state);
  sim.defStore = defStore;
  sim.abilityRange=createAbilityRangeResolver(options.stockAbilities??[],ir.objectMods);
  sim.abilityEffects=createCombatAbilityCatalog(options.stockAbilities??[],ir.objectMods,options.gc);
  if(options.pathing)sim.navigation=new GridNavigation(options.pathing,()=>sim.entities.values(),defStore);
  installCombat(sim, {defStore, gc: options.gc, ledger: sim.ledger,
    bountyMode: options.bountyMode, minDamage: 1});
  if (options.life) sim.installLife(options.life);
  if (options.researchConfig) sim.researchConfig = options.researchConfig;
  const {registry} = installNatives(vm, sim);
  vm.attachToSim(sim);
  installMovement(sim, registry);
  const hasConfig = parsed.functionIndex.has("config"), hasMain = parsed.functionIndex.has("main");
  if (hasConfig) vm.spawnThread("config", []);
  if (hasMain) vm.spawnThread("main", []);
  // Keep boot events available: each caller chooses how to retain/display them.
  return {vm, sim, registry, defStore, hasConfig, hasMain};
}
