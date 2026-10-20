/** Integer-grid A*: adapts ClaudeCraft's existing binary heap, reconstruction and
 * no-corner-cutting search to WPM and source-owned building footprints.
 * No world/terrain generator, dependency, random state or unreachable straight fallback.
 * Cache values derive solely from current cells, destinations and live blockers. */
import type {PathingMap} from '../ir/pathing.ts';
import {FLAG_NO_WALK,FLAG_NO_FLY,FLAG_NO_BUILD} from '../ir/pathing.ts';
import type {UnitEntity} from './unit-entity.ts';import type {DefStore} from './def-store.ts';
type Point={x:number;y:number};
export class GridNavigation {
 private blocks:Uint8Array;private signature='';private cache=new Map<string,Point|null>();
 readonly grid:PathingMap;private units:()=>Iterable<UnitEntity>;private defs:DefStore;
 constructor(grid:PathingMap,units:()=>Iterable<UnitEntity>,defs:DefStore){this.grid=grid;this.units=units;this.defs=defs;this.blocks=new Uint8Array(grid.cells);}
 cell(p:Point){const g=this.grid;return {x:Math.floor((p.x-g.originX)/g.cellSize+.5),y:Math.floor((p.y-g.originY)/g.cellSize+.5)};}
 private index(x:number,y:number){return y*this.grid.width+x;}
 private inBounds(x:number,y:number){return x>=0&&y>=0&&x<this.grid.width&&y<this.grid.height;}
 private world(x:number,y:number):Point{return {x:this.grid.originX+x*this.grid.cellSize,y:this.grid.originY+y*this.grid.cellSize};}
 private footprint(typeId:string,x:number,y:number){const f=this.defs.getDef(typeId).pathing;if(!f)return null;return {f,x:Math.round((x-this.grid.originX)/this.grid.cellSize-(f.width-1)/2),y:Math.round((y-this.grid.originY)/this.grid.cellSize-(f.height-1)/2)};}
 refresh(){
  const units=[...this.units()].filter(e=>e.alive&&this.defs.getDef(e.typeId).pathing);
  const signature=units.map(e=>`${e.id}:${e.typeId}:${e.x}:${e.y}`).join('|');if(signature===this.signature)return;
  this.signature=signature;this.blocks=new Uint8Array(this.grid.cells);this.cache.clear();
  for(const e of units){const q=this.footprint(e.typeId,e.x,e.y)!;for(let y=0;y<q.f.height;y++)for(let x=0;x<q.f.width;x++)if(this.inBounds(q.x+x,q.y+y))this.blocks[this.index(q.x+x,q.y+y)]!|=q.f.cells[y*q.f.width+x]!;}
 }
 canBuild(typeId:string,x:number,y:number,pending:ReadonlyArray<{typeId:string;x:number;y:number}>=[]):boolean{
  this.refresh();const q=this.footprint(typeId,x,y);if(!q)return true;
  for(let dy=0;dy<q.f.height;dy++)for(let dx=0;dx<q.f.width;dx++){
   if(!q.f.cells[dy*q.f.width+dx])continue;
   for(const request of pending){const p=this.footprint(request.typeId,request.x,request.y);if(p){const px=q.x+dx-p.x,py=q.y+dy-p.y;if(px>=0&&py>=0&&px<p.f.width&&py<p.f.height&&(p.f.cells[py*p.f.width+px]!&(FLAG_NO_BUILD|FLAG_NO_WALK)))return false;}}
   if(!this.inBounds(q.x+dx,q.y+dy)||(this.blocks[this.index(q.x+dx,q.y+dy)]!&(FLAG_NO_BUILD|FLAG_NO_WALK)))return false;
  }return true;
 }
 route(from:Point,to:Point,flying=false,goalRadiusU=0):Point[]|null{
  this.refresh();const g=this.grid,start=this.cell(from),rawGoal=this.cell(to),mask=flying?FLAG_NO_FLY:FLAG_NO_WALK;
  if(!this.inBounds(start.x,start.y)||!this.inBounds(rawGoal.x,rawGoal.y))return null;
  const free=(x:number,y:number)=>this.inBounds(x,y)&&(this.blocks[this.index(x,y)]!&mask)===0;
  const ranged=goalRadiusU>0;
  let goal=rawGoal;
  // A move aimed inside a solid building stops at its nearest reachable perimeter.
  if(!ranged&&!free(goal.x,goal.y)){
   let candidates:Array<{x:number;y:number}>=[];
   for(let radius=1;radius<=32&&!candidates.length;radius++)for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)if(Math.max(Math.abs(dx),Math.abs(dy))===radius&&free(goal.x+dx,goal.y+dy))candidates.push({x:goal.x+dx,y:goal.y+dy});
   candidates.sort((a,b)=>(a.x-start.x)**2+(a.y-start.y)**2-((b.x-start.x)**2+(b.y-start.y)**2));if(!candidates.length)return null;goal=candidates[0]!;
  }
  const first=this.index(start.x,start.y),last=this.index(goal.x,goal.y);if(!ranged&&first===last)return [rawGoal===goal?to:this.world(goal.x,goal.y)];
  const scores=new Map<number,number>([[first,0]]),previous=new Map<number,number>();
  const heap:Array<[number,number,number]>=[];let sequence=0;
  const less=(a:ReadonlyArray<number>,b:ReadonlyArray<number>)=>a[0]!<b[0]!||(a[0]===b[0]&&a[2]!<b[2]!);
  const push=(i:number,score:number)=>{heap.push([score,i,sequence++]);for(let n=heap.length-1;n>0;){const p=(n-1)>>1;if(!less(heap[n]!,heap[p]!))break;[heap[n],heap[p]]=[heap[p]!,heap[n]!];n=p;}};
  const pop=()=>{const top=heap[0]!,tail=heap.pop()!;if(heap.length){heap[0]=tail;for(let i=0;;){const l=i*2+1,r=l+1;let m=i;if(l<heap.length&&less(heap[l]!,heap[m]!))m=l;if(r<heap.length&&less(heap[r]!,heap[m]!))m=r;if(m===i)break;[heap[m],heap[i]]=[heap[i]!,heap[m]!];i=m;}}return top[1];};
  // The same search can terminate at any free casting point in a target circle.
  // Subtract a conservative radius bound to retain an admissible integer heuristic.
  const allowance=ranged?Math.ceil(goalRadiusU/g.cellSize+1)*1414:0;
  const heuristic=(x:number,y:number)=>Math.max(0,Math.max(Math.abs(goal.x-x),Math.abs(goal.y-y))*1000+Math.min(Math.abs(goal.x-x),Math.abs(goal.y-y))*414-allowance);
  const reached=(n:number)=>{if(!ranged)return n===last;const x=n%g.width,y=Math.floor(n/g.width),p=this.world(x,y);return free(x,y)&&(p.x-to.x)**2+(p.y-to.y)**2<=goalRadiusU**2;};
  const closed=new Set<number>();push(first,heuristic(start.x,start.y));
  while(heap.length&&closed.size<200_000){const cur=pop();if(closed.has(cur))continue;if(reached(cur)){const path:number[]=[];for(let n=cur;n!==first;n=previous.get(n)!)path.push(n);path.reverse();if(!path.length)return [this.world(start.x,start.y)];return path.map((n,i)=>!ranged&&i===path.length-1&&rawGoal===goal?to:this.world(n%g.width,Math.floor(n/g.width)));}
   closed.add(cur);const cx=cur%g.width,cy=Math.floor(cur/g.width);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dy)continue;const nx=cx+dx,ny=cy+dy;if(!free(nx,ny)||(dx&&dy&&(!free(cx+dx,cy)||!free(cx,cy+dy))))continue;
    const n=this.index(nx,ny),score=scores.get(cur)!+(dx&&dy?1414:1000);if(score>=(scores.get(n)??Infinity))continue;scores.set(n,score);previous.set(n,cur);push(n,score+heuristic(nx,ny));
   }
  }return null;
 }
 waypoint(e:UnitEntity):Point|null{
  this.refresh(); // Live blocker changes must invalidate both reachable and unreachable cached paths.
  const c=this.cell(e),flying=this.defs.getDef(e.typeId).movementType==='fly',key=`${c.x}:${c.y}:${e.orderX}:${e.orderY}:${flying}`;
  if(!this.cache.has(key))this.cache.set(key,this.route(e,{x:e.orderX,y:e.orderY},flying)?.[0]??null);
  return this.cache.get(key)!;
 }
}
