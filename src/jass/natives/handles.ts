/**
 * R-206a natives — 핸들·좌표 클러스터: Rect/Location.
 * 실측(§2.2): Rect() 리터럴 126회(config+main 프로브 기준), GetRectCenter 501(전체 파일 top20 —
 * 트리거 액션 안에서 주로 쓰임). 좌표는 얕은 struct 핸들로 충분(렌더/충돌 없음, M2 스코프 밖).
 */
import type { JassVm } from "../vm.ts";
import { vhandle, vreal, vint } from "../vm.ts";

function num(v: { t: string; v?: unknown } | undefined): number {
  if (!v) return 0;
  if (v.t === "real" || v.t === "int") return v.v as number;
  return 0;
}

export function registerHandleNatives(vm: JassVm): void {
  vm.registerNative("Rect", (ctx, args) => {
    const [minx, miny, maxx, maxy] = args.map(num);
    return vhandle(ctx.handles.create("rect", { minx, miny, maxx, maxy }).id);
  });
  vm.registerNative("RectFromCenterSizeBJ", (ctx, args) => {
    const cx = num(args[0]);
    const cy = num(args[0]); // 자리표시 — 실제 시그니처는 (loc, w, h), 얕은 스텁이라 중심만 보존
    return vhandle(ctx.handles.create("rect", { minx: cx, miny: cy, maxx: cx, maxy: cy }).id);
  });
  vm.registerNative("GetRectCenterX", (ctx, args) => {
    const r = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    if (!r) return vreal(0);
    return vreal(((r.data.minx as number) + (r.data.maxx as number)) / 2);
  });
  vm.registerNative("GetRectCenterY", (ctx, args) => {
    const r = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    if (!r) return vreal(0);
    return vreal(((r.data.miny as number) + (r.data.maxy as number)) / 2);
  });
  vm.registerNative("GetRectCenter", (ctx, args) => {
    const r = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    const x = r ? ((r.data.minx as number) + (r.data.maxx as number)) / 2 : 0;
    const y = r ? ((r.data.miny as number) + (r.data.maxy as number)) / 2 : 0;
    return vhandle(ctx.handles.create("location", { x, y }).id);
  });
  vm.registerNative("GetRectMinX", (ctx, args) => {
    const r = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    return vreal(r ? (r.data.minx as number) : 0);
  });
  vm.registerNative("GetRectMaxX", (ctx, args) => {
    const r = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    return vreal(r ? (r.data.maxx as number) : 0);
  });
  vm.registerNative("GetRectMinY", (ctx, args) => {
    const r = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    return vreal(r ? (r.data.miny as number) : 0);
  });
  vm.registerNative("GetRectMaxY", (ctx, args) => {
    const r = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    return vreal(r ? (r.data.maxy as number) : 0);
  });

  // Caller-owned 1.28 Blizzard.j: one shared GetRandomReal draw per rectangle axis.
  vm.registerNative('GetRandomLocInRect',(ctx,args)=>{
    const rect=args[0]?.t==='handle'&&args[0].v!==null?ctx.handles.get(args[0].v):undefined;
    const draw=(low:string,high:string)=>num(vm.callFunctionSync('GetRandomReal',[vreal(rect?.kind==='rect'?rect.data[low] as number:0),vreal(rect?.kind==='rect'?rect.data[high] as number:0)]));
    return vhandle(ctx.handles.create('location',{x:draw('minx','maxx'),y:draw('miny','maxy')}).id);
  });

  vm.registerNative("Location", (ctx, args) => {
    const x = num(args[0]);
    const y = num(args[1]);
    return vhandle(ctx.handles.create("location", { x, y }).id);
  });
  vm.registerNative("GetLocationX", (ctx, args) => {
    const l = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    return vreal(l ? (l.data.x as number) : 0);
  });
  vm.registerNative("GetLocationY", (ctx, args) => {
    const l = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    return vreal(l ? (l.data.y as number) : 0);
  });
  vm.registerNative("MoveLocation", (ctx, args) => {
    const l = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    if (l) {
      l.data.x = num(args[1]);
      l.data.y = num(args[2]);
    }
    return vint(0);
  });
  vm.registerNative("RemoveLocation", () => vint(0));
  vm.registerNative("RemoveRect", () => vint(0));

  // 카메라 마진 — main() 초반 InitBlizzard 인라인 잔재(GetCameraMargin 24회). 값 무관(헤드리스 무의미).
  vm.registerNative("GetCameraMargin", () => vreal(0));
  vm.registerNative("GetCameraField", () => vreal(0));
  vm.registerNative("GetCameraTargetPositionX", () => vreal(0));
  vm.registerNative("GetCameraTargetPositionY", () => vreal(0));
  vm.registerNative("CameraSetupApplyForPlayer", () => vint(0));
  vm.registerNative("PanCameraToTimedLocForPlayer", () => vint(0));
}
