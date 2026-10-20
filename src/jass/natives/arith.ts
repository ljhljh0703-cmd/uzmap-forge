/**
 * R-206a natives — 산술/문자열/난수 유틸 클러스터.
 * GetRandomInt/GetRandomReal은 반드시 sim.rng 경유(INV-D1 — Math.random 금지).
 */
import type { JassVm } from "../vm.ts";
import { vint, vreal, vstring, vbool } from "../vm.ts";

export function registerArithNatives(vm: JassVm): void {
  vm.registerNative("I2S", (_ctx, args) => vstring(String(args[0]?.t === "int" ? args[0].v : 0)));
  vm.registerNative("I2R", (_ctx, args) => vreal(args[0]?.t === "int" ? args[0].v : 0));
  vm.registerNative("R2I", (_ctx, args) => vint(args[0]?.t === "real" ? Math.trunc(args[0].v) : 0));
  vm.registerNative("R2S", (_ctx, args) => vstring(String(args[0]?.t === "real" ? args[0].v : 0)));
  vm.registerNative("R2SW", (_ctx, args) => vstring(String(args[0]?.t === "real" ? args[0].v : 0)));
  vm.registerNative("S2I", (_ctx, args) => vint(args[0]?.t === "string" ? parseInt(args[0].v, 10) || 0 : 0));
  vm.registerNative("S2R", (_ctx, args) => vreal(args[0]?.t === "string" ? parseFloat(args[0].v) || 0 : 0));

  vm.registerNative("ModuloInteger", (_ctx, args) => {
    const a = args[0]?.t === "int" ? args[0].v : 0;
    const b = args[1]?.t === "int" ? args[1].v : 0;
    if (b === 0) return vint(0);
    const r = a % b;
    return vint(r < 0 ? r + Math.abs(b) : r); // JASS ModuloInteger: 결과 부호는 제수 부호(양수 관례)
  });
  vm.registerNative("ModuloReal", (_ctx, args) => {
    const a = args[0]?.t === "real" ? args[0].v : 0;
    const b = args[1]?.t === "real" ? args[1].v : 0;
    if (b === 0) return vreal(0);
    const r = a % b;
    return vreal(r < 0 ? r + Math.abs(b) : r);
  });

  vm.registerNative("StringLength", (_ctx, args) => vint(args[0]?.t === "string" ? args[0].v.length : 0));
  vm.registerNative("SubString", (_ctx, args) => {
    const s = args[0]?.t === "string" ? args[0].v : "";
    const start = args[1]?.t === "int" ? args[1].v : 0;
    const end = args[2]?.t === "int" ? args[2].v : 0;
    return vstring(s.substring(start, end));
  });
  // BJ 변형: 1-based start를 native SubString의 0-based로 변환(커뮤니티 문서 기반 재구현, blizzard.j
  // 원문 비열람 — 동작만 사실로 취급, MAP §6 클린룸 각주).
  vm.registerNative("SubStringBJ", (_ctx, args) => {
    const s = args[0]?.t === "string" ? args[0].v : "";
    const start = args[1]?.t === "int" ? args[1].v : 1;
    const end = args[2]?.t === "int" ? args[2].v : 1;
    return vstring(s.substring(start - 1, end));
  });
  vm.registerNative("StringCase", (_ctx, args) => {
    const s = args[0]?.t === "string" ? args[0].v : "";
    const upper = args[1]?.t === "bool" ? args[1].v : false;
    return vstring(upper ? s.toUpperCase() : s.toLowerCase());
  });

  vm.registerNative("GetRandomInt", (ctx, args) => {
    const lo = args[0]?.t === "int" ? args[0].v : 0;
    const hi = args[1]?.t === "int" ? args[1].v : 0;
    if (!ctx.sim) return vint(lo);
    return vint(ctx.sim.rng.int(lo, hi)); // INV-D1
  });
  vm.registerNative("GetRandomReal", (ctx, args) => {
    const lo = args[0]?.t === "real" || args[0]?.t === "int" ? args[0].v : 0;
    const hi = args[1]?.t === "real" || args[1]?.t === "int" ? args[1].v : 0;
    if (!ctx.sim) return vreal(lo);
    return vreal(lo + ctx.sim.rng.next() * (hi - lo)); // INV-D1
  });

  vm.registerNative("Pow", (_ctx, args) => {
    const a = args[0]?.t === "real" || args[0]?.t === "int" ? args[0].v : 0;
    const b = args[1]?.t === "real" || args[1]?.t === "int" ? args[1].v : 0;
    return vreal(Math.pow(a, b));
  });
  vm.registerNative("SquareRoot", (_ctx, args) => vreal(Math.sqrt(args[0]?.t === "real" || args[0]?.t === "int" ? args[0].v : 0)));

  vm.registerNative("GetBooleanAndBJ", (_ctx, args) => vbool((args[0]?.t === "bool" && args[0].v) === true && (args[1]?.t === "bool" && args[1].v) === true));
}
