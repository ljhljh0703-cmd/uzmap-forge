/** R-208 — deterministic integer player-state storage and transition queue. */
export const PLAYER_STATE_RESOURCE_GOLD = 1;
export const PLAYER_STATE_RESOURCE_LUMBER = 2;
export const PLAYER_STATE_RESOURCE_FOOD_CAP = 4;
export const PLAYER_STATE_RESOURCE_FOOD_USED = 5;
export const PLAYER_STATE_GIVES_BOUNTY = 7; // caller-supplied 1.28.5 common.j
export const PLAYER_STATE_ALLIED_VICTORY = 8;

/** Public alliance enum IDs, checked against common.j (facts only, no bundled script):
 * https://jass.sourceforge.net/doc/api/common_j-source.shtml */
export const ALLIANCE_TYPES = {
  ALLIANCE_PASSIVE: 0, ALLIANCE_HELP_REQUEST: 1, ALLIANCE_HELP_RESPONSE: 2,
  ALLIANCE_SHARED_XP: 3, ALLIANCE_SHARED_SPELLS: 4, ALLIANCE_SHARED_VISION: 5,
  ALLIANCE_SHARED_CONTROL: 6, ALLIANCE_SHARED_ADVANCED_CONTROL: 7,
  ALLIANCE_RESCUABLE: 8, ALLIANCE_SHARED_VISION_FORCED: 9,
} as const;

/** Values read from the supplied 1.28.5.7680 Scripts/common.j (API facts only). */
export const MAP_CONTROLS = {MAP_CONTROL_USER: 0, MAP_CONTROL_COMPUTER: 1,
  MAP_CONTROL_RESCUABLE: 2, MAP_CONTROL_NEUTRAL: 3, MAP_CONTROL_CREEP: 4, MAP_CONTROL_NONE: 5} as const;
export const PLAYER_SLOT_STATES = {PLAYER_SLOT_STATE_EMPTY: 0, PLAYER_SLOT_STATE_PLAYING: 1, PLAYER_SLOT_STATE_LEFT: 2} as const;

const validPlayerId = (id: number): boolean => Number.isSafeInteger(id) && id >= 0;
const validAllianceType = (id: number): boolean => Number.isSafeInteger(id) && id >= 0 && id <= 9;

export interface PlayerStateTransition {
  readonly playerId: number;
  readonly stateKey: number;
  readonly previous: number;
  readonly value: number;
}

export class PlayerStateStore {
  private readonly controllers = new Map<number, number>();
  private readonly slotStates = new Map<number, number>();
  private readonly values = new Map<number, Map<number, number>>();
  private readonly transitions: PlayerStateTransition[] = [];
  /** Only explicitly enabled directional flags. Default false; no inferred reciprocal sharing. */
  private readonly alliances = new Map<string, true>();

  private readonly startLocations=new Map<number,{x:number;y:number}>();
  private readonly playerStarts=new Map<number,number>();
  defineStartLocation(index:number,x:number,y:number):void{if(validPlayerId(index)&&Number.isFinite(x)&&Number.isFinite(y))this.startLocations.set(index,{x,y});}
  setStartLocation(playerId:number,index:number):void{if(validPlayerId(playerId)&&validPlayerId(index))this.playerStarts.set(playerId,index);}
  getStartLocation(playerId:number):{x:number;y:number}|undefined{const point=this.startLocations.get(this.playerStarts.get(playerId)??playerId);return point&&{...point};}

  setController(playerId: number, controller: number): void {
    if (validPlayerId(playerId) && Number.isInteger(controller) && controller >= 0 && controller <= 5)
      this.controllers.set(playerId, controller);
  }
  getController(playerId: number): number {
    return this.controllers.get(playerId) ?? MAP_CONTROLS.MAP_CONTROL_USER;
  }
  setSlotState(playerId: number, state: number): void {
    if (validPlayerId(playerId) && Number.isInteger(state) && state >= 0 && state <= 2)
      this.slotStates.set(playerId, state);
  }
  getSlotState(playerId: number): number {
    // Legacy callers without an explicit lobby keep the previous intended occupied default.
    return this.slotStates.get(playerId) ?? PLAYER_SLOT_STATES.PLAYER_SLOT_STATE_PLAYING;
  }
  configurationSnapshot() {
    return {controllers: [...this.controllers], slots: [...this.slotStates], starts:[...this.startLocations],playerStarts:[...this.playerStarts]};
  }

  setAlliance(sourcePlayer: number, otherPlayer: number, setting: number, enabled: boolean): void {
    if (!validPlayerId(sourcePlayer) || !validPlayerId(otherPlayer) || !validAllianceType(setting) || typeof enabled !== "boolean") return;
    const key = `${sourcePlayer}:${otherPlayer}:${setting}`;
    if (enabled) this.alliances.set(key, true);
    else this.alliances.delete(key);
  }

  getAlliance(sourcePlayer: number, otherPlayer: number, setting: number): boolean {
    if (!validPlayerId(sourcePlayer) || !validPlayerId(otherPlayer) || !validAllianceType(setting)) return false;
    return this.alliances.has(`${sourcePlayer}:${otherPlayer}:${setting}`);
  }

  canControl(owner: number, controller: number): boolean {
    return validPlayerId(owner) && validPlayerId(controller) &&
      (owner === controller || this.getAlliance(owner, controller, ALLIANCE_TYPES.ALLIANCE_SHARED_CONTROL));
  }

  allianceSnapshots(): string[] {
    return [...this.alliances.keys()];
  }

  get(playerId: number, stateKey: number): number {
    return this.values.get(Math.trunc(playerId))?.get(Math.trunc(stateKey)) ?? 0;
  }

  set(playerId: number, stateKey: number, value: number): number {
    const p = Math.trunc(playerId);
    const key = Math.trunc(stateKey);
    const next = Math.trunc(value);
    const previous = this.get(p, key);
    if (previous === next) return next;
    let states = this.values.get(p);
    if (!states) {
      states = new Map();
      this.values.set(p, states);
    }
    states.set(key, next);
    this.transitions.push({ playerId: p, stateKey: key, previous, value: next });
    return next;
  }

  adjust(playerId: number, stateKey: number, delta: number): number {
    return this.set(playerId, stateKey, this.get(playerId, stateKey) + Math.trunc(delta));
  }

  drainTransitions(): PlayerStateTransition[] {
    const drained = this.transitions.slice();
    this.transitions.length = 0;
    return drained;
  }

  /** Stable insertion-ordered snapshot for Sim.stateHash(). */
  snapshots(): Array<{ playerId: number; states: Array<[number, number]> }> {
    const out: Array<{ playerId: number; states: Array<[number, number]> }> = [];
    for (const [playerId, states] of this.values) out.push({ playerId, states: [...states] });
    return out;
  }
}
