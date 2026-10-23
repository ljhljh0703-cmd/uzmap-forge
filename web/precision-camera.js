/** Presentation-only camera state. The caller supplies canvas-space points and
 * current source bounds; no DOM, world, VM, RNG, commands or persistence here. */
export function createPrecisionCamera(){
 let enabled=false,fit={cx:0,cy:0,zoom:1},bounds=null,width=1,height=1,signature=null;
 let camera={...fit},scale=1,consumed=false,single=null,pinch=null;
 const pointers=new Map();
 const validPoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
 const validId=id=>Number.isSafeInteger(id)&&id>=0;
 const result=(used=false,changed=false)=>({consumed:used,changed});
 const snapshot=()=>({camera:{...camera},scale,zoomed:scale>1,pointerCount:pointers.size});
 const sameCamera=(a,b)=>a.cx===b.cx&&a.cy===b.cy&&a.zoom===b.zoom;
 const clearPointers=()=>{pointers.clear();single=null;pinch=null;consumed=false;};
 const worldAt=(p,c=camera)=>({x:(p.x-width/2)/c.zoom+c.cx,y:-(p.y-height/2)/c.zoom+c.cy});
 function clampCenter(candidate){
  if(!bounds)return candidate;
  const halfX=width/(2*candidate.zoom),halfY=height/(2*candidate.zoom);
  const axis=(value,min,max,half)=>min+half>max-half?(min+max)/2:Math.max(min+half,Math.min(max-half,value));
  return {...candidate,cx:axis(candidate.cx,bounds.minX,bounds.maxX,halfX),cy:axis(candidate.cy,bounds.minY,bounds.maxY,halfY)};
 }
 function assign(candidate,nextScale=scale){
  const changed=scale!==nextScale||!sameCamera(camera,candidate);scale=nextScale;camera=candidate;return changed;
 }
 function zoomFrom(anchor,screenPoint,nextScale){
  nextScale=Math.max(1,Math.min(2.5,nextScale));
  if(nextScale===1)return assign({...fit},1);
  const zoom=fit.zoom*nextScale;
  return assign(clampCenter({cx:anchor.x-(screenPoint.x-width/2)/zoom,cy:anchor.y+(screenPoint.y-height/2)/zoom,zoom}),nextScale);
 }
 function rebase(){
  const values=[...pointers.values()];
  if(values.length>=2){
   const [a,b]=values,mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
   pinch={distance:Math.hypot(b.x-a.x,b.y-a.y),scale,anchor:worldAt(mid)};single=null;
  }else if(values.length===1){single={point:{...values[0]},camera:{...camera}};pinch=null;}
  else{single=null;pinch=null;}
 }
 const api={
  sync(input={}){
   const f=input.fit,b=input.bounds;
   const valid=f&&[f.cx,f.cy,f.zoom,input.width,input.height].every(Number.isFinite)&&f.zoom>0&&input.width>0&&input.height>0&&b&&[b.minX,b.minY,b.maxX,b.maxY].every(Number.isFinite)&&b.minX<b.maxX&&b.minY<b.maxY;
   if(!valid){enabled=false;assign({...fit},1);clearPointers();return snapshot();}
   const nextSignature=[f.cx,f.cy,f.zoom,b.minX,b.minY,b.maxX,b.maxY,input.width,input.height].join(':');
   const sameField=bounds&&['minX','minY','maxX','maxY'].every(key=>bounds[key]===b[key]);
   const reset=input.enabled!==true||!enabled||!sameField,viewChanged=nextSignature!==signature;
   fit={cx:f.cx,cy:f.cy,zoom:f.zoom};bounds={minX:b.minX,minY:b.minY,maxX:b.maxX,maxY:b.maxY};width=input.width;height=input.height;enabled=input.enabled===true;signature=nextSignature;
   if(reset){assign({...fit},1);clearPointers();}
   else if(viewChanged){
    // A placement confirmation panel can resize the same field before confirm.
    // Preserve its magnification/world center; only rebase the live gesture.
    assign(clampCenter({...camera,zoom:fit.zoom*scale}));
    if(pointers.size){consumed=true;rebase();}
   }
   return snapshot();
  },
  zoomAt(point,absoluteScale){
   if(!enabled||!validPoint(point)||!Number.isFinite(absoluteScale))return result();
   const changed=zoomFrom(worldAt(point),point,absoluteScale);
   if(pointers.size){consumed=true;rebase();}return result(true,changed);
  },
  panBy(dx,dy){
   if(!enabled||scale===1||!Number.isFinite(dx)||!Number.isFinite(dy))return result();
   const changed=assign(clampCenter({...camera,cx:camera.cx-dx/camera.zoom,cy:camera.cy+dy/camera.zoom}));
   if(pointers.size){consumed=true;rebase();}return result(true,changed);
  },
  down({id,point}={}){
   if(!enabled||!validId(id)||!validPoint(point))return result();
   if(pointers.has(id))return result(consumed);
   if(!pointers.size)consumed=false;
   pointers.set(id,{x:point.x,y:point.y});
   if(pointers.size>=2)consumed=true;rebase();return result(consumed);
  },
  move({id,point}={}){
   if(!enabled||!pointers.has(id)||!validPoint(point))return result();
   pointers.set(id,{x:point.x,y:point.y});
   if(pointers.size>=2){
    consumed=true;
    const [a,b]=[...pointers.values()],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},distance=Math.hypot(b.x-a.x,b.y-a.y);
    if(!pinch||pinch.distance<=0){rebase();return result(true);}
    return result(true,zoomFrom(pinch.anchor,mid,pinch.scale*distance/pinch.distance));
   }
   if(!single){rebase();return result(consumed);}
   const dx=point.x-single.point.x,dy=point.y-single.point.y;
   if(!consumed&&Math.hypot(dx,dy)<8)return result();
   consumed=true;if(scale===1)return result(true);
   return result(true,assign(clampCenter({...single.camera,cx:single.camera.cx-dx/single.camera.zoom,cy:single.camera.cy+dy/single.camera.zoom})));
  },
  up({id,cancelled=false}={}){
   if(!pointers.has(id))return result();
   const used=consumed||cancelled;pointers.delete(id);
   if(pointers.size){consumed=used;rebase();}else clearPointers();
   return result(used);
  },
  reset(){const used=pointers.size>0,changed=assign({...fit},1);clearPointers();return result(used,changed);},
  snapshot
 };
 return api;
}
