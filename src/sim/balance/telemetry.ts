/**
 * R-202b B3 — 밸런스 telemetry 수집기(설계 §8.1). 웨이브 단위 정수 카운터.
 * 배선은 R-204(대미지 수렴점)·R-208(골드)·R-210(리포트 노출)이 담당 — 여기는 순수 집계 자료구조만.
 * 관측 전용 파생값 — stateHash 대상 아님(§8.1). 순회는 Map 삽입순(INV-D4 규율과 동일 정신).
 */

export interface BalanceWaveReport {
  wave: number;
  band: string;
  spawned: number;
  killed: number;
  leaked: number;
  clearTicks: number;
  goldStart: number;
  goldEnd: number;
  bountyPaid: number;
  buildSpend: number;
  towerDamageByLine: Record<string, number>;
  creepLifetimeTicks: { p50: number; p90: number };
}

interface WaveAcc {
  wave: number;
  band: string;
  spawned: number;
  killed: number;
  leaked: number;
  clearTicks: number;
  goldStart: number;
  goldEnd: number;
  bountyPaid: number;
  buildSpend: number;
  damageByLine: Map<string, number>;
  lifetimes: number[];
}

function percentile(sortedAsc: ReadonlyArray<number>, p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.floor((sortedAsc.length * p) / 100));
  return sortedAsc[idx]!;
}

export class BalanceTelemetry {
  private readonly waves = new Map<number, WaveAcc>(); // 삽입순 유지

  private acc(wave: number): WaveAcc {
    let w = this.waves.get(wave);
    if (!w) {
      w = { wave, band: "", spawned: 0, killed: 0, leaked: 0, clearTicks: 0, goldStart: 0, goldEnd: 0, bountyPaid: 0, buildSpend: 0, damageByLine: new Map(), lifetimes: [] };
      this.waves.set(wave, w);
    }
    return w;
  }

  beginWave(wave: number, band: string): void {
    this.acc(wave).band = band;
  }
  recordSpawn(wave: number, n = 1): void {
    this.acc(wave).spawned += n;
  }
  recordKill(wave: number): void {
    this.acc(wave).killed += 1;
  }
  recordLeak(wave: number): void {
    this.acc(wave).leaked += 1;
  }
  recordDamage(wave: number, lineKey: string, amount: number): void {
    const w = this.acc(wave);
    w.damageByLine.set(lineKey, (w.damageByLine.get(lineKey) ?? 0) + amount);
  }
  recordBounty(wave: number, amount: number): void {
    this.acc(wave).bountyPaid += amount;
  }
  recordSpend(wave: number, amount: number): void {
    this.acc(wave).buildSpend += amount;
  }
  recordGoldStart(wave: number, gold: number): void {
    this.acc(wave).goldStart = gold;
  }
  recordGoldEnd(wave: number, gold: number): void {
    this.acc(wave).goldEnd = gold;
  }
  recordClear(wave: number, ticks: number): void {
    this.acc(wave).clearTicks = ticks;
  }
  recordCreepLifetime(wave: number, ticks: number): void {
    this.acc(wave).lifetimes.push(ticks);
  }

  /** 스냅샷(불변 복사) — IWorld.balanceReport() 노출용(R-210 배선). */
  report(): BalanceWaveReport[] {
    const out: BalanceWaveReport[] = [];
    for (const w of this.waves.values()) {
      const sorted = [...w.lifetimes].sort((a, b) => a - b);
      const damage: Record<string, number> = {};
      for (const [k, v] of w.damageByLine) damage[k] = v;
      out.push({
        wave: w.wave,
        band: w.band,
        spawned: w.spawned,
        killed: w.killed,
        leaked: w.leaked,
        clearTicks: w.clearTicks,
        goldStart: w.goldStart,
        goldEnd: w.goldEnd,
        bountyPaid: w.bountyPaid,
        buildSpend: w.buildSpend,
        towerDamageByLine: damage,
        creepLifetimeTicks: { p50: percentile(sorted, 50), p90: percentile(sorted, 90) },
      });
    }
    return out;
  }
}
