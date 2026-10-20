/** LIFE_LOOP_DESIGN §3 — deterministic, script-neutral life accounting. */
export type LifeInstallMode = "off" | "observe" | "enforce";
export type LifePoolMode = "individual" | "shared";
export type LifeCause = "leak" | "timeout";

export interface LeakGateRect {
  readonly id: string;
  readonly playerId: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface LifeConfig {
  readonly mode: LifeInstallMode;
  readonly lifeMode: LifePoolMode;
  readonly startingLives: number;
  readonly leakGateRects: ReadonlyArray<LeakGateRect>;
  readonly survivalTimeoutTicks: number | null;
  readonly creepOwners: ReadonlyArray<number>;
}

export interface LifeTransition {
  readonly playerId: number;
  readonly previous: number;
  readonly value: number;
  readonly cause: LifeCause;
}

const SHARED_POOL = -1;

export class LifeLedger {
  readonly config: LifeConfig;
  private readonly values = new Map<number, number>();
  private readonly transitions: LifeTransition[] = [];
  private gameOver = false;
  private gateClaimTick = -1;
  private readonly gateClaims = new Set<string>();

  constructor(config: LifeConfig) {
    this.config = config;
    if (config.lifeMode === "shared") this.values.set(SHARED_POOL, Math.max(0, Math.trunc(config.startingLives)));
  }

  private key(playerId: number): number {
    return this.config.lifeMode === "shared" ? SHARED_POOL : Math.trunc(playerId);
  }

  lives(playerId: number): number {
    return this.values.get(this.key(playerId)) ?? Math.max(0, Math.trunc(this.config.startingLives));
  }

  decrement(playerId: number, cause: LifeCause): LifeTransition | null {
    if (this.config.mode !== "enforce" || this.gameOver) return null;
    const p = Math.trunc(playerId);
    const key = this.key(p);
    const previous = this.lives(p);
    if (previous <= 0) return null;
    const value = Math.max(0, previous - 1);
    this.values.set(key, value);
    const transition = { playerId: p, previous, value, cause } as const;
    this.transitions.push(transition);
    return transition;
  }

  /** Same physical gate may have several WC3 trigger registrations; claim once per unit/tick/gate. */
  claimGate(tick: number, gateId: string, unitId: number): boolean {
    const t = Math.trunc(tick);
    if (this.gateClaimTick !== t) {
      this.gateClaimTick = t;
      this.gateClaims.clear();
    }
    const key = `${gateId}:${Math.trunc(unitId)}`;
    if (this.gateClaims.has(key)) return false;
    this.gateClaims.add(key);
    return true;
  }

  markGameOver(): void {
    this.gameOver = true;
  }

  drainTransitions(): LifeTransition[] {
    const drained = this.transitions.slice();
    this.transitions.length = 0;
    return drained;
  }

  snapshots(): Array<[number, number]> {
    return [...this.values];
  }
}
