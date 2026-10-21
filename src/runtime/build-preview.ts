/** View-only ground route preview. Reuses the exact WPM/footprints and A* used by
 * GridNavigation, on a field-sized copy; it never receives active navigation/Sim.
 *
 * Keep one instance per loaded map. evaluate() returns the SAME frozen result for
 * unchanged candidate/blockers/pending/geometry, so a render loop may call it.
 * Only the last result is retained. WPM and definitions are static for a session;
 * call clear() after editing either (or create a new instance on map reload).
 * DefStore.getDef is the existing memoized query; warming that definition cache
 * is the only shared query effect. No entity, WPM, order, RNG or live nav writes.
 *
 * This is informational, not a placement command or new placement prohibition.
 * 'blocked' still means canBuild=true; it describes only this ground itinerary.
 * Flying routes, source rect events, damage and mine teleport are not predicted.
 */
import type {PathingMap} from '../ir/pathing.ts';
import type {DefStore} from '../sim/def-store.ts';
import {GridNavigation,type NavigationBounds} from '../sim/navigation.ts';
import {createEntity,type UnitEntity} from '../sim/unit-entity.ts';

export interface BuildPreviewPoint {readonly x:number;readonly y:number;}
export interface BuildPreviewPlacement extends BuildPreviewPoint {readonly typeId:string;}
export type BuildPreviewBlocker=Readonly<Pick<UnitEntity,'id'|'typeId'|'x'|'y'|'alive'>>;
export interface BuildPreviewInput {
 readonly entities:Iterable<BuildPreviewBlocker>;
 readonly bounds:Readonly<NavigationBounds>;
 readonly start:BuildPreviewPoint;
 /** Authored ground itinerary, including a final exit target inside the field. */
 readonly waypoints:ReadonlyArray<BuildPreviewPoint>;
 /** Optional source enter-rect bounds; omitted targets require their exact point. */
 readonly waypointBounds?:ReadonlyArray<Readonly<NavigationBounds>|null>;
 readonly pending?:ReadonlyArray<BuildPreviewPlacement>;
 readonly candidate?:BuildPreviewPlacement|null;
}
export interface BuildPreviewLeg {
 readonly index:number;
 readonly target:BuildPreviewPoint;
 readonly end:BuildPreviewPoint;
 readonly adjustedGoal:boolean;
 readonly reached:boolean;
}
export interface BuildPreviewResult {
 readonly status:'open'|'blocked'|'invalid';
 readonly reason:'route-open'|'unreachable-leg'|'occupied-or-unbuildable'|'outside-field'|'invalid-geometry'|'waypoint-not-reached';
 readonly explanation:string;
 readonly canBuild:boolean;
 readonly points:ReadonlyArray<BuildPreviewPoint>;
 readonly legs:ReadonlyArray<BuildPreviewLeg>;
 readonly legsReached:number;
 /** Zero-based start→waypoints[0], waypoints[0]→waypoints[1], etc. */
 readonly failedLeg:number|null;
 readonly movement:'ground';
 readonly flightPredicted:false;
}
export interface BuildPreview {
 evaluate(input:BuildPreviewInput):BuildPreviewResult;
 clear():void;
 readonly stats:Readonly<{computations:number;cropCells:number}>;
}
const finitePoint=(p:BuildPreviewPoint)=>Number.isFinite(p.x)&&Number.isFinite(p.y);
const contains=(b:Readonly<NavigationBounds>,p:BuildPreviewPoint)=>p.x>=b.minX&&p.x<=b.maxX&&p.y>=b.minY&&p.y<=b.maxY;

export function createBuildPreview({grid,defs}:{grid:PathingMap;defs:DefStore}):BuildPreview {
 let lastKey:string|null=null,lastResult:BuildPreviewResult|null=null,computations=0,cropCells=0;
 const freeze=(status:BuildPreviewResult['status'],reason:BuildPreviewResult['reason'],canBuild:boolean,points:ReadonlyArray<BuildPreviewPoint>=[],legsReached=0,failedLeg:number|null=null,legs:ReadonlyArray<BuildPreviewLeg>=[]):BuildPreviewResult=>{
  const explanation=reason==='route-open'?'지상 적의 예상 경로입니다. 공중 적은 다른 길로 이동합니다.':reason==='waypoint-not-reached'?'이 배치에서는 지상 적이 다음 경유지 안으로 들어갈 수 없습니다.':reason==='unreachable-leg'?'이 배치에서는 지상 적의 다음 경유지로 이어지는 길이 없습니다.':reason==='outside-field'?'전장 안의 건설 칸을 선택하세요.':reason==='occupied-or-unbuildable'?'이미 사용 중이거나 건설할 수 없는 칸입니다.':'이 전장의 경로를 미리 볼 수 없습니다.';
  return Object.freeze({status,reason,explanation,canBuild,points:Object.freeze(points.map(p=>Object.freeze({x:p.x,y:p.y}))),legs:Object.freeze(legs.map(leg=>Object.freeze({...leg,target:Object.freeze({...leg.target}),end:Object.freeze({...leg.end})}))),legsReached,failedLeg,movement:'ground',flightPredicted:false});
 };
 return {
  evaluate(input){
   // Copy only the live source-owned blockers. Moving units without a pathing
   // footprint neither change navigation nor invalidate a stationary preview.
   const blockers=[...input.entities].filter(e=>e.alive&&defs.getDef(e.typeId).pathing);
   const pending=input.pending??[],candidate=input.candidate??null,b=input.bounds,waypointBounds=input.waypointBounds??[];
   const key=JSON.stringify([candidate,blockers.map(e=>[e.id,e.typeId,e.x,e.y]),pending.map(p=>[p.typeId,p.x,p.y]),b.minX,b.minY,b.maxX,b.maxY,input.start.x,input.start.y,input.waypoints.map(p=>[p.x,p.y]),waypointBounds.map(r=>r?[r.minX,r.minY,r.maxX,r.maxY]:null)]);
   if(lastKey===key&&lastResult)return lastResult;
   computations++;cropCells=0;
   const remember=(r:BuildPreviewResult)=>{lastKey=key;lastResult=r;return r;};
   const geometryValid=Number.isInteger(grid.width)&&grid.width>0&&Number.isInteger(grid.height)&&grid.height>0&&grid.cells.length===grid.width*grid.height&&Number.isFinite(grid.cellSize)&&grid.cellSize>0&&Number.isFinite(grid.originX)&&Number.isFinite(grid.originY)&&[b.minX,b.minY,b.maxX,b.maxY].every(Number.isFinite)&&b.minX<=b.maxX&&b.minY<=b.maxY&&finitePoint(input.start)&&contains(b,input.start)&&input.waypoints.every(p=>finitePoint(p)&&contains(b,p))&&pending.every(finitePoint)&&blockers.every(finitePoint)&&waypointBounds.every(r=>!r||([r.minX,r.minY,r.maxX,r.maxY].every(Number.isFinite)&&r.minX<=r.maxX&&r.minY<=r.maxY));
   if(!geometryValid||(candidate&&!finitePoint(candidate)))return remember(freeze('invalid','invalid-geometry',false));
   if(candidate&&!contains(b,candidate))return remember(freeze('invalid','outside-field',false));
   // Keep only source cell centers that are inside the same navigation bounds.
   // The origin offset is an integer count of source cells, preserving footprint
   // rounding and alignment (including negative coordinates and half-cell edges).
   const x0=Math.max(0,Math.ceil((b.minX-grid.originX)/grid.cellSize)),y0=Math.max(0,Math.ceil((b.minY-grid.originY)/grid.cellSize));
   const x1=Math.min(grid.width-1,Math.floor((b.maxX-grid.originX)/grid.cellSize)),y1=Math.min(grid.height-1,Math.floor((b.maxY-grid.originY)/grid.cellSize));
   const width=x1-x0+1,height=y1-y0+1;
   if(width<1||height<1)return remember(freeze('invalid','invalid-geometry',false));
   const cells=new Uint8Array(width*height);
   for(let y=0;y<height;y++)cells.set(grid.cells.subarray((y0+y)*grid.width+x0,(y0+y)*grid.width+x0+width),y*width);
   cropCells=cells.length;
   const cropped:PathingMap={width,height,cells,cellSize:grid.cellSize,originX:grid.originX+x0*grid.cellSize,originY:grid.originY+y0*grid.cellSize};
   const cellInside=(p:BuildPreviewPoint)=>{const x=Math.floor((p.x-cropped.originX)/cropped.cellSize+.5),y=Math.floor((p.y-cropped.originY)/cropped.cellSize+.5);return x>=0&&y>=0&&x<width&&y<height;};
   if(!cellInside(input.start)||!input.waypoints.every(cellInside))return remember(freeze('invalid','invalid-geometry',false));
   const snapshots=blockers.map(e=>createEntity(defs.getDef(e.typeId),{id:e.id,owner:0,x:e.x,y:e.y,facing:0}));
   const navigation=new GridNavigation(cropped,()=>snapshots,defs);
   if(candidate&&!navigation.canBuild(candidate.typeId,candidate.x,candidate.y,pending))return remember(freeze('invalid','occupied-or-unbuildable',false));
   // Pending and proposed buildings are private pseudo entities, not Sim spawns.
   // Paint the same source footprints as refresh()/canBuild(), including masks.
   for(const [i,p] of [...pending,...(candidate?[candidate]:[])].entries())snapshots.push(createEntity(defs.getDef(p.typeId),{id:-(i+1),owner:0,x:p.x,y:p.y,facing:0}));
   const points:BuildPreviewPoint[]=[{x:input.start.x,y:input.start.y}];let from:BuildPreviewPoint=input.start,legsReached=0;const legs:BuildPreviewLeg[]=[];
   for(const [index,target] of input.waypoints.entries()){
    const leg=navigation.route(from,target,false,0,b);
    if(!leg)return remember(freeze('blocked','unreachable-leg',true,points,legsReached,index,legs));
    for(const p of leg){const prev=points.at(-1)!;if(p.x!==prev.x||p.y!==prev.y)points.push(p);}
    // GridNavigation may stop at a blocked destination's reachable perimeter.
    // Continue from that actual returned point; never draw a teleport to center.
    from=leg.at(-1)??from;
    const adjustedGoal=from.x!==target.x||from.y!==target.y,acceptance=waypointBounds[index],reached=acceptance?contains(acceptance,from):!adjustedGoal;
    legs.push({index,target,end:from,adjustedGoal,reached});
    if(!reached)return remember(freeze('blocked','waypoint-not-reached',true,points,legsReached,index,legs));
    legsReached++;
   }
   return remember(freeze('open','route-open',true,points,legsReached,null,legs));
  },
  clear(){lastKey=null;lastResult=null;},
  get stats(){return Object.freeze({computations,cropCells});},
 };
}
