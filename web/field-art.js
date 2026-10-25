import {FLAG_NO_WALK,FLAG_NO_BUILD} from './dist/ir/pathing.js';
// Terrain remains a view of the existing WPM; no decorative cell becomes walkable.
export function terrainKind(flags){return flags&FLAG_NO_WALK?'wall':flags&FLAG_NO_BUILD?'path':'build';}
const FLOOR={build:[[74,103,62],[78,107,65],[71,100,59]],path:[[181,157,107],[188,164,113],[194,170,119]],wall:[[43,57,41],[47,61,44],[50,65,47]]};
export function terrainPixel(flags,col,row){const seed=(Math.imul(col,374761393)+Math.imul(row,668265263))|0,n=Math.imul(seed^(seed>>>13),1274126177)>>>0,tone=n%23<3?1:n%23<5?2:0;return FLOOR[terrainKind(flags)][tone];}
export function fieldRimRects(box,thickness=4){
 if(!box||![box.left,box.top,box.width,box.height,thickness].every(Number.isFinite)||box.width<=0||box.height<=0||thickness<=0)return [];
 const l=Math.floor(box.left),t=Math.floor(box.top),r=Math.ceil(box.left+box.width),b=Math.ceil(box.top+box.height),n=Math.ceil(thickness);
 return [{x:l-n,y:t-n,width:r-l+n*2,height:n},{x:l-n,y:b,width:r-l+n*2,height:n},{x:l-n,y:t,width:n,height:b-t},{x:r,y:t,width:n,height:b-t}];
}
/** Existing stone atlas is clipped to gutters; gameplay pixels stay uncovered. */
function paintFieldRim(ctx,box,sprites){
 for(const r of fieldRimRects(box)){
  ctx.save();ctx.beginPath();ctx.rect(r.x,r.y,r.width,r.height);ctx.clip();ctx.fillStyle='#3e4436';ctx.fillRect(r.x,r.y,r.width,r.height);
  for(let y=r.y;y<r.y+r.height;y+=16)for(let x=r.x;x<r.x+r.width;x+=16)sprites.draw(ctx,'terrain:stone',x+8,y+8,16,{anchor:.5,tick:0});
  ctx.restore();
 }
}
// One cached gutter image per sprite bank; static stone is not repainted every frame.
const rimCache=new WeakMap();
export function drawFieldRim(ctx,box,sprites){
 if(!ctx.canvas||typeof document==='undefined'||typeof sprites.get!=='function')return paintFieldRim(ctx,box,sprites);
 const texture=sprites.get('terrain:stone'),key=JSON.stringify([ctx.canvas.width,ctx.canvas.height,box,texture?.src??null]);let cached=rimCache.get(sprites);
 if(cached?.key!==key){const image=document.createElement('canvas');image.width=ctx.canvas.width;image.height=ctx.canvas.height;paintFieldRim(image.getContext('2d'),box,sprites);cached={key,image};rimCache.set(sprites,cached);}
 ctx.drawImage(cached.image,0,0);
}
/** Thin ground forecast only, below units. Partial blocked routes are never extended. */
export function drawBuildRoute(ctx,preview,project,{alpha=1,dashed=true}={}){
 if(!preview||preview.status==='invalid'||preview.points.length<2)return;
 ctx.save();ctx.beginPath();preview.points.forEach((p,index)=>{const q=project(p);if(index)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});
 ctx.globalAlpha=alpha;ctx.lineWidth=2;ctx.lineJoin='round';ctx.lineCap='round';ctx.setLineDash(dashed?[4,4]:[]);ctx.strokeStyle=preview.status==='blocked'?'#efaa8c':'#eadcb1';ctx.stroke();ctx.restore();
}

// This is a static view of immutable source pathing, not a second placement grid.
// One atlas tile covers four source cells (the existing tower footprint scale).
const GROUND_CELL_PX=8;
function sourceLandmarks(rects){return Array.isArray(rects)?rects.filter(r=>[r?.minX,r?.minY,r?.maxX,r?.maxY].every(Number.isFinite)&&r.maxX>=r.minX&&r.maxY>=r.minY):[];}
export function fieldGroundPlan(grid,bounds,{landmarkRects=[]}={}){
 if(!grid||!bounds||!Number.isInteger(grid.width)||!Number.isInteger(grid.height)||grid.width<=0||grid.height<=0||!Number.isFinite(grid.cellSize)||grid.cellSize<=0||![grid.originX,grid.originY,bounds.minX,bounds.minY,bounds.maxX,bounds.maxY].every(Number.isFinite)||bounds.maxX<=bounds.minX||bounds.maxY<=bounds.minY||!grid.cells||grid.cells.length<grid.width*grid.height)return null;
 const landmarks=sourceLandmarks(landmarkRects),size=grid.cellSize,left=grid.originX-size/2,bottom=grid.originY-size/2;
 const minCol=Math.max(0,Math.floor((bounds.minX-left)/size)),maxCol=Math.min(grid.width,Math.ceil((bounds.maxX-left)/size)),minRow=Math.max(0,Math.floor((bounds.minY-bottom)/size)),maxRow=Math.min(grid.height,Math.ceil((bounds.maxY-bottom)/size));
 if(minCol>=maxCol||minRow>=maxRow)return null;
 const runs=[],edges=[],p=GROUND_CELL_PX,kindAt=(col,row)=>col>=0&&row>=0&&col<grid.width&&row<grid.height?terrainKind(grid.cells[row*grid.width+col]):null;
 for(let row=minRow;row<maxRow;row++){
  let run=null;
  for(let col=minCol;col<maxCol;col++){
   const kind=kindAt(col,row),x=(col-minCol)*p,y=(maxRow-1-row)*p,worldX=grid.originX+col*size,worldY=grid.originY+row*size,landmark=kind==='path'&&landmarks.some(r=>worldX>=r.minX&&worldX<=r.maxX&&worldY>=r.minY&&worldY<=r.maxY);
   if(run?.kind===kind&&run.landmark===landmark)run.width+=p;else{run={kind,landmark,col,row,x,y,width:p,height:p};runs.push(run);}
   if(kind==='build')continue;
   const edge=(side,dx,dy,width,height)=>edges.push({kind,col,row,side,x:x+dx,y:y+dy,width,height});
   // Draw only on the blocked/non-buildable side of each genuine source boundary.
   if(kindAt(col-1,row)!==kind)edge('west',0,0,1,p);
   if(kindAt(col+1,row)!==kind)edge('east',p-1,0,1,p);
   if(kindAt(col,row-1)!==kind)edge('south',0,p-1,p,1);
   if(kindAt(col,row+1)!==kind)edge('north',0,0,p,1);
  }
 }
 return {width:(maxCol-minCol)*p,height:(maxRow-minRow)*p,minCol,maxRow,runs,edges,world:{minX:left+minCol*size,minY:bottom+minRow*size,maxX:left+maxCol*size,maxY:bottom+maxRow*size}};
}
function paintGroundTexture(ctx,plan,texture,grass=[]){
 if(grass.every(Boolean)&&grass.length===4){
  for(const landmark of [false,true]){
   const runs=plan.runs.filter(run=>landmark?run.landmark:run.kind==='build');if(!runs.length)continue;
   // Only authored landmark NO_BUILD cells cover the old base raster opaquely.
   // Their original path kind/flags and no-build boundary remain unchanged.
   ctx.save();ctx.beginPath();for(const run of runs)ctx.rect(run.x,run.y,run.width,run.height);ctx.clip();ctx.globalAlpha=landmark?1:.55;
   const tile=GROUND_CELL_PX*4,startX=-(plan.minCol%4)*GROUND_CELL_PX,startY=-((4-plan.maxRow%4)%4)*GROUND_CELL_PX;
   for(let y=startY;y<plan.height;y+=tile)for(let x=startX;x<plan.width;x+=tile){const col=Math.floor((plan.minCol+x/GROUND_CELL_PX)/4),row=Math.floor((plan.maxRow-y/GROUND_CELL_PX)/4),index=(Math.imul(col,374761393)^Math.imul(row,668265263))>>>0,t=grass[index%4],f=t.spec.frame;ctx.drawImage(t.image,f.x,f.y,f.w,f.h,x,y,tile,tile);}
   ctx.restore();
  }
 }

 const f=texture.spec.frame,tile=GROUND_CELL_PX*4;
 // Reuse the loaded, unmodified raster. Build ground receives only fine grain;
 // pale no-build cells become worn paving; walls retain their darker source colour.
 for(const [kind,alpha] of [['build',.035],['path',.48],['wall',.32]]){
  const runs=plan.runs.filter(run=>run.kind===kind&&!run.landmark);if(!runs.length)continue;
  ctx.save();ctx.beginPath();for(const run of runs)ctx.rect(run.x,run.y,run.width,run.height);ctx.clip();ctx.globalAlpha=alpha;
  const startX=-(plan.minCol%4)*GROUND_CELL_PX,startY=-((4-plan.maxRow%4)%4)*GROUND_CELL_PX;
  for(let y=startY;y<plan.height;y+=tile)for(let x=startX;x<plan.width;x+=tile)ctx.drawImage(texture.image,f.x,f.y,f.w,f.h,x,y,tile,tile);
  ctx.restore();
 }
 ctx.save();
 for(const edge of plan.edges){ctx.fillStyle=edge.side==='north'||edge.side==='west'?'rgba(232,220,174,.25)':'rgba(22,34,22,.52)';ctx.fillRect(edge.x,edge.y,edge.width,edge.height);}
 ctx.restore();
}
const groundCache=new WeakMap();
/** Render below route previews and entities; the caller's gameplay clip remains intact. */
export function drawFieldGround(ctx,{grid,bounds,project,sprites,landmarkRects=[]}={}){
 if(!grid||!bounds||typeof project!=='function'||typeof sprites?.get!=='function'||typeof document==='undefined')return;
 const texture=sprites.get('terrain:stone'),grass=Array.from({length:4},(_,i)=>sprites.get('ground:grass:'+i));if(!texture?.image||!texture.spec?.frame)return;
 let grids=groundCache.get(sprites);if(!grids){grids=new WeakMap();groundCache.set(sprites,grids);}
 let cache=grids.get(grid);if(!cache){cache=new Map();grids.set(grid,cache);}
 const key=JSON.stringify([grid.width,grid.height,grid.cellSize,grid.originX,grid.originY,bounds.minX,bounds.minY,bounds.maxX,bounds.maxY,sourceLandmarks(landmarkRects).map(r=>[r.minX,r.minY,r.maxX,r.maxY])]);
 let cached=cache.get(key);
 if(!cached||cached.imageSource!==texture.image||cached.src!==texture.src||grass.some((g,i)=>g?.image!==cached.grassImages[i])){
  const plan=fieldGroundPlan(grid,bounds,{landmarkRects});if(!plan)return;
  const image=document.createElement('canvas');image.width=plan.width;image.height=plan.height;
  const paint=image.getContext('2d');if(!paint)return;paint.imageSmoothingEnabled=false;paintGroundTexture(paint,plan,texture,grass);
  cached={image,plan,imageSource:texture.image,src:texture.src,grassImages:grass.map(g=>g?.image)};cache.set(key,cached);
  // The product exposes two fields; don't retain canvases for old camera bounds.
  if(cache.size>2)cache.delete(cache.keys().next().value);
 }
 const clipTop=project({x:bounds.minX,y:bounds.maxY}),clipBottom=project({x:bounds.maxX,y:bounds.minY});
 const top=project({x:cached.plan.world.minX,y:cached.plan.world.maxY}),bottom=project({x:cached.plan.world.maxX,y:cached.plan.world.minY});
 ctx.save();ctx.beginPath();ctx.rect(clipTop.x,clipTop.y,clipBottom.x-clipTop.x,clipBottom.y-clipTop.y);ctx.clip();ctx.imageSmoothingEnabled=false;
 ctx.drawImage(cached.image,top.x,top.y,bottom.x-top.x,bottom.y-top.y);ctx.restore();
}

/** Same observed HP thresholds; integer raster pixels sit above the existing sprite. */
export function drawCreepHealth(ctx,{x,y,size,hp,maxHp,boss=false}={}){
 if(![x,y,size,hp,maxHp].every(Number.isFinite)||size<=0||maxHp<=0||hp>=maxHp)return false;
 const width=Math.max(24,Math.round(size*.75)),left=Math.round(x-width/2),top=Math.round(y-size*.8-6),fraction=Math.max(0,Math.min(1,hp/maxHp)),pixels=width-4;
 const colour=fraction>.5?'#53a64f':fraction>.25?'#c18b30':'#d74e3c',height=boss?6:3;
 ctx.save();ctx.imageSmoothingEnabled=false;ctx.fillStyle='#170f0b';ctx.fillRect(left-1,top-1,width+2,height+2);
 for(let index=0;index<5;index++){
  const start=Math.floor(index*pixels/5)+index,end=Math.floor((index+1)*pixels/5)+index,segment=end-start,part=Math.max(0,Math.min(1,fraction*5-index));
  ctx.fillStyle='#332218';ctx.fillRect(left+start,top,segment,height);
  if(part>0){ctx.fillStyle=colour;ctx.fillRect(left+start,top,Math.max(1,Math.round(segment*part)),height);}
 }
 ctx.restore();return true;
}

/** Small static source-grade rail, contained in the existing sprite box. */
export function drawGemGrade(ctx,{x,y,size,rank}={}){
 if(![x,y,size].every(Number.isFinite)||size<12||!Number.isInteger(rank)||rank<1||rank>6)return false;
 const left=Math.round(x-6),top=Math.round(y+size/2-3);
 ctx.save();ctx.fillStyle='#170f0b';ctx.fillRect(left,top,12,3);
 for(let i=0;i<6;i++){ctx.fillStyle=i<rank?'#f0dfb2':'#655b47';ctx.fillRect(left+i*2,top+1,1,1);}
 ctx.restore();return true;
}
/** Static identity accent only; original replacement pixels and picking size stay intact. */
export function drawObjectKindMark(ctx,{x,y,size,kind}={}){
 if(![x,y,size].every(Number.isFinite)||size<6||!['stone','slate'].includes(kind))return false;
 const left=Math.round(x-size/2),top=Math.round(y-size/2),width=Math.round(size);
 ctx.save();ctx.strokeStyle=kind==='stone'?'#1a211d':'#e0c998';ctx.lineWidth=1;ctx.strokeRect(left+.5,top+.5,width-1,width-1);
 if(kind==='slate'){ctx.fillStyle='#e0c998';ctx.fillRect(left+2,top+width-4,Math.max(1,width-4),1);}
 ctx.restore();return true;
}
/** A wing mark below the picture remains readable with reduced motion. */
export function drawAirborneMark(ctx,{x,y,size,airborne}={}){
 if(airborne!==true||![x,y,size].every(Number.isFinite)||size<=0)return false;
 const cy=Math.round(y+size*.2+6),half=Math.min(7,Math.max(3,size*.18));
 ctx.save();ctx.beginPath();ctx.moveTo(x-half,cy+2);ctx.lineTo(x-half/2,cy);ctx.lineTo(x,cy+2);ctx.lineTo(x+half/2,cy);ctx.lineTo(x+half,cy+2);
 ctx.lineWidth=3;ctx.strokeStyle='#17241f';ctx.stroke();ctx.lineWidth=1;ctx.strokeStyle='#8ad8ef';ctx.stroke();ctx.restore();return true;
}

/** Enlarge the already-rendered field beside the touch; the map camera never changes. */
export function placementLoupeBox({width,height,fingerX,fingerY}={}){
 if(![width,height,fingerX,fingerY].every(Number.isFinite)||width<=0||height<=0)return null;
 const x=Math.max(0,Math.min(width,fingerX)),y=Math.max(0,Math.min(height,fingerY));
 const size=Math.floor(Math.min(120,width-16,height-40,Math.max(x,width-x)-28));if(size<48)return null;
 const left=Math.max(8,Math.min(width-size-8,x<width/2?x+20:x-size-20));
 const top=Math.max(8,Math.min(height-size-32,y-size-24));return {left,top,size};
}
export function drawPlacementLoupe(ctx,source,point,{cellPixels=0}={}){
 const size=ctx?.canvas?.width;if(!ctx||!source||![size,source.width,source.height,point?.x,point?.y].every(Number.isFinite)||size<=0||source.width<=0||source.height<=0||point.x<0||point.y<0||point.x>source.width||point.y>source.height)return null;
 const side=Math.min(size/3,source.width,source.height),sx=Math.max(0,Math.min(source.width-side,point.x-side/2)),sy=Math.max(0,Math.min(source.height-side,point.y-side/2)),scale=size/side;
 const x=(point.x-sx)*scale,y=(point.y-sy)*scale;
 ctx.save();ctx.clearRect(0,0,size,size);ctx.globalAlpha=1;ctx.imageSmoothingEnabled=false;ctx.drawImage(source,sx,sy,side,side,0,0,size,size);
 ctx.strokeStyle='#ffe08a';ctx.lineWidth=2;if(Number.isFinite(cellPixels)&&cellPixels>0){const span=cellPixels*scale;ctx.strokeRect(x-span/2,y-span/2,span,span);}
 ctx.beginPath();ctx.moveTo(x-5,y);ctx.lineTo(x+5,y);ctx.moveTo(x,y-5);ctx.lineTo(x,y+5);ctx.stroke();ctx.restore();
 return {crop:{x:sx,y:sy,size:side},point:{x,y},scale};
}
