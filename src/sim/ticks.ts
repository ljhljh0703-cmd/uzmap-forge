/**
 * 시간→틱 변환 유틸 (D-2 확정: 틱 반올림 — STATUS.md 결정 로그).
 * R-205(JASS VM)가 TriggerSleepAction의 wake 틱을 계산할 때 이 함수를 재사용한다.
 * 예: 0.1초 @ DT=1/20 → round(0.1/0.05) = 2틱.
 */
import { DT } from "./rng.ts";

/** 초 단위 시간을 고정스텝 틱 수로 양자화한다 (반올림, D-2). */
export function secondsToTicks(seconds: number): number {
  return Math.round(seconds / DT);
}

/** Convert elapsed browser time to existing DT ticks. Catch-up is bounded per
 * frame while the unconsumed active time stays queued; pause adds no time.
 * ponytail: scheduling only, not another game clock; DT/Sim remain authoritative. */
export function createFrameClock(maxTicksPerFrame = 120) {
  if (!Number.isSafeInteger(maxTicksPerFrame) || maxTicksPerFrame < 1) throw new RangeError("invalid tick budget");
  let previous: number | null = null;
  let creditMs = 0;
  const tickMs = DT * 1000;
  return {
    reset(): void { previous = null; creditMs = 0; },
    advance(timestampMs: number, playing: boolean, speed = 1): number {
      if (!Number.isFinite(timestampMs) || !Number.isFinite(speed) || speed < 0 ||
          (previous !== null && timestampMs < previous)) throw new RangeError("invalid frame time or speed");
      const elapsed = previous === null ? 0 : timestampMs - previous;
      previous = timestampMs;
      if (!playing || speed === 0) return 0;
      creditMs += elapsed * speed;
      const ticks = Math.min(maxTicksPerFrame, Math.floor((creditMs + 1e-7) / tickMs));
      creditMs = Math.max(0, creditMs - ticks * tickMs);
      return ticks;
    },
  };
}
