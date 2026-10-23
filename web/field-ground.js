import {spriteFrame} from './visual-assets.js';

const opposite={N:'S',S:'N',E:'W',W:'E'};
/** Join only the supplied observed ground path. Coordinates are never snapped or extended. */
export function groundPathPlan(points=[]){
 if(!Array.isArray(points)||points.some(p=>![p?.x,p?.y].every(Number.isFinite)))return [];
 const cells=new Map(),at=p=>{const key=p.x+','+p.y;if(!cells.has(key))cells.set(key,{x:p.x,y:p.y,links:new Set()});return cells.get(key);};
 for(let i=0;i<points.length;i++){
  const a=at(points[i]),next=points[i+1];if(!next)continue;
  const dx=next.x-a.x,dy=next.y-a.y;if(!dx&&!dy)continue;
  if(dx&&dy)continue; // Eight-way diagonals are painted from their actual segment below.
  const dir=Math.abs(dx)>=Math.abs(dy)?dx>0?'E':'W':dy>0?'N':'S';a.links.add(dir);at(next).links.add(opposite[dir]);
 }
 return [...cells.values()].filter(p=>p.links.size).map(p=>{
  const l=p.links,n=l.size;let key='dead',rotation=0;
  if(n===4)key='cross';
  else if(n===3){key='t-junction';rotation=!l.has('N')?0:!l.has('E')?90:!l.has('S')?180:270;}
  else if(n===2){key=l.has('N')&&l.has('S')?'vertical':l.has('E')&&l.has('W')?'horizontal':l.has('N')?l.has('E')?'corner-ne':'corner-nw':l.has('E')?'corner-se':'corner-sw';}
  else rotation=l.has('S')?0:l.has('W')?90:l.has('N')?180:270;
  return {x:p.x,y:p.y,key:'ground:path:'+key,rotation};
 });
}

/** Opaque tile geometry comes from the existing navigation cell, not a new grid. */
export function drawGroundRoute(ctx,{preview,project,cellSize,sprites}={}){
 if(!preview||preview.status==='invalid'||preview.flightPredicted===true||!Number.isFinite(cellSize)||cellSize<=0||typeof project!=='function'||!sprites?.get)return 0;
 const origin=project({x:0,y:0}),end=project({x:cellSize,y:0}),size=Math.abs(end.x-origin.x);if(!(size>0))return 0;
 let painted=0;
 for(const item of groundPathPlan(preview.points)){
  const sprite=sprites.get(item.key);if(!sprite)continue;
  const frame=spriteFrame(sprite.spec,0),p=project(item),left=Math.round(p.x-size/2),right=Math.round(p.x+size/2),top=Math.round(p.y-size/2),bottom=Math.round(p.y+size/2),w=right-left,h=bottom-top;
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate((left+right)/2,(top+bottom)/2);ctx.rotate((item.rotation+(sprite.spec.rotation??0))*Math.PI/180);
  ctx.drawImage(sprite.image,frame.x,frame.y,frame.w,frame.h,-w/2,-h/2,w,h);ctx.restore();painted++;
 }
 // A source path can move diagonally. Reuse the straight crop at its observed
 // angle, overlapping endpoints by half a cell; never snap it into a false turn.
 const straight=sprites.get('ground:path:horizontal');
 if(straight)for(let i=1;i<(preview.points?.length??0);i++){
  const a=preview.points[i-1],b=preview.points[i];if(![a?.x,a?.y,b?.x,b?.y].every(Number.isFinite)||a.x===b.x||a.y===b.y)continue;
  const p=project(a),q=project(b),length=Math.hypot(q.x-p.x,q.y-p.y),frame=spriteFrame(straight.spec,0);
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate((p.x+q.x)/2,(p.y+q.y)/2);ctx.rotate(Math.atan2(q.y-p.y,q.x-p.x));ctx.drawImage(straight.image,frame.x,frame.y,frame.w,frame.h,-(length+size)/2,-size/2,length+size,size);ctx.restore();painted++;
 }
 return painted;
}

/** Source ingress/waypoints/exit only; decorative art stays under the unit layer. */
export function drawFieldLandmarks(ctx,{field,span,project,sprites}={}){
 if(!field?.bounds||!field.spawn||!field.waypoints?.length||!Number.isFinite(span)||span<=0||typeof project!=='function'||!sprites?.draw)return 0;
 const b=field.bounds,first=project({x:b.minX,y:b.minY}),last=project({x:b.maxX,y:b.maxY}),left=Math.min(first.x,last.x),right=Math.max(first.x,last.x),top=Math.min(first.y,last.y),bottom=Math.max(first.y,last.y),size=Math.abs(project({x:span,y:0}).x-project({x:0,y:0}).x);
 const centre=r=>({x:(r.minX+r.maxX)/2,y:(r.minY+r.maxY)/2}),end=centre(field.waypoints.at(-1)),items=[{key:'field:entrance',point:field.spawn,size:size*1.3},...field.waypoints.slice(1,-1).map(r=>({key:'field:checkpoint',point:centre(r),size:size*.8})),{key:'field:exit',point:{x:b.maxX-span/2,y:end.y},size:size*1.3}];
 let painted=0;
 for(const item of items){const p=project(item.point),s=item.size,x=Math.max(left+s/2,Math.min(right-s/2,p.x)),y=Math.max(top+s/2,Math.min(bottom-s/2,p.y));if(sprites.draw(ctx,item.key,x,y,s,{tick:0,anchor:.5,shadow:false}))painted++;}
 return painted;
}
