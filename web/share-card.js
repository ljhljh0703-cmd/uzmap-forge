/** Optional, prepared result image. Never delays a user's share gesture. */
export function paintShareCard(ctx,image,model={},width=1200,height=675){
 const iw=image.naturalWidth??image.width,ih=image.naturalHeight??image.height,scale=Math.max(width/iw,height/ih);
 ctx.drawImage(image,(width-iw*scale)/2,(height-ih*scale)/2,iw*scale,ih*scale);
 const shade=ctx.createLinearGradient(0,0,0,height*.58);shade.addColorStop(0,'rgba(5,12,15,.94)');shade.addColorStop(.9,'rgba(5,12,15,.88)');shade.addColorStop(1,'rgba(5,12,15,.05)');ctx.fillStyle=shade;ctx.fillRect(0,0,width,height*.58);
 ctx.textAlign='center';ctx.fillStyle='#fff0bd';
 const line=(text,y,size)=>{let n=size;while(n>16){ctx.font=`bold ${n}px Galmuri11, system-ui`;if(ctx.measureText(text).width<=width-96)break;n-=2;}ctx.lineJoin='round';ctx.lineWidth=Math.max(2,Math.round(n/10));ctx.strokeStyle='#081014';ctx.strokeText?.(text,width/2,y);ctx.fillText(text,width/2,y);};
 line('보석타워',84,56);line((model.winner===0?'클리어 · ':'')+String(model.wave??0)+'웨이브',158,48);
 line(`처치 ${model.stats?.kills??0} · 남긴 보석 ${model.gems??0}`,216,32);
 line(model.highest?'최고 등급 · '+model.highest:'같은 시작 조건으로 도전해 보세요',260,28);
 if(model.profile?.dailyDate)line('일일 도전 · '+model.profile.dailyDate,302,24);
}
export function createShareCardController({loadBackground=()=>Promise.reject(Error('no art')),createCanvas=()=>document.createElement('canvas'),makeFile=blob=>typeof File==='function'?new File([blob],'gemtower-result.'+(blob.type==='image/jpeg'?'jpg':'png'),{type:blob.type||'image/png'}):null,fonts=()=>Promise.resolve()}={}){
 let generation=0,key=null,file=null,job=null,runId=null;
 return {
  prepare(model){
   const value={runId:model?.runId,wave:model?.wave,winner:model?.winner,stats:{kills:model?.stats?.kills??0},gems:model?.gems??0,highest:model?.highest??'',profile:{dailyDate:model?.profile?.dailyDate??null}},next=JSON.stringify(value);
   if(next===key)return job;key=next;file=null;runId=value.runId;const token=++generation;
   // Fetch only at a real result. Clear/new result invalidates a late callback.
   let image;try{image=loadBackground();}catch(error){image=Promise.reject(error);}
   job=Promise.all([image,Promise.resolve().then(fonts)]).then(async([background])=>{
    if(token!==generation)return null;const canvas=createCanvas();canvas.width=1200;canvas.height=675;const ctx=canvas.getContext('2d');if(!ctx)return null;
    paintShareCard(ctx,background,value,1200,675);
    const blob=await new Promise((resolve,reject)=>{try{canvas.toBlob(resolve,'image/jpeg',.88);}catch(error){reject(error);}});
    if(token!==generation||!blob)return null;file=makeFile(blob);return file;
   }).catch(()=>null);return job;
  },
  file(id){return id===runId?file:null;},
  clear(){if(key!==null)generation++;key=null;file=null;runId=null;job=null;}
 };
}
