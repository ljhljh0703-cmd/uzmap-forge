/**
 * INV-D1: sim 코어 유일 난수원. Math.random 금지.
 * mulberry32 — 32bit 시드 결정론 PRNG. 같은 시드 = 같은 시퀀스.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max] 정수 */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** 내부 state 관측 (stateHash용 — INV-D4 해시 입력 원천). 순수 조회, 진행 없음. */
  getState(): number {
    return this.state;
  }
}

/** 고정스텝 (INV-D2). 렌더 프레임과 분리. */
export const DT = 1 / 20;
