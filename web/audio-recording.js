/** Optional local QA recording of actual battlefield frames and WebAudio output.
 * Does not request screen/microphone permission, synthesize events or read game state.
 */
export function createGameRecording({canvas,audio,Recorder=globalThis.MediaRecorder,streamFactory=tracks=>new MediaStream(tracks),setTimer=setTimeout,clearTimer=clearTimeout,onState=()=>{}}={}){
 let epoch=0,state='idle',recorder=null,owned=[],chunks=[],bytes=0,blob=null,timer=null,pendingStop=null,resolveStop=null;
 const snapshot=()=>({state,bytes,mimeType:blob?.type??recorder?.mimeType??'',hasAudio:state==='recording'||Boolean(blob),limitMs:300000});
 const publish=next=>{state=next;try{onState(snapshot());}catch{}};
 const release=()=>{if(timer!==null){clearTimer(timer);timer=null;}for(const track of owned)try{track.stop();}catch{}owned=[];};
 const api={snapshot,
  async start(){
   if(['recording','starting','stopping'].includes(state))return false;
   const ticket=++epoch;blob=null;bytes=0;chunks=[];publish('starting');
   if(!Recorder||!canvas?.captureStream||!audio?.getRecordingStream){publish('unsupported');return false;}
   try{
    const unlocked=await audio.unlock();if(ticket!==epoch)return false;if(!unlocked){publish('unsupported');return false;}
    const output=audio.getRecordingStream(),audioTracks=output?.getAudioTracks?.()??[];
    if(!audioTracks.length){publish('unsupported');return false;}
    owned=[...canvas.captureStream(24).getVideoTracks()];
    if(!owned.length){publish('unsupported');return false;}
    const copies=audioTracks.map(track=>track.clone());owned.push(...copies);
    const mimeType=['video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(type=>Recorder.isTypeSupported?.(type));
    if(!mimeType){release();publish('unsupported');return false;}
    recorder=new Recorder(streamFactory(owned),{mimeType,videoBitsPerSecond:400000,audioBitsPerSecond:48000});
    pendingStop=new Promise(resolve=>{resolveStop=resolve;});
    recorder.ondataavailable=event=>{if(event.data?.size){chunks.push(event.data);bytes+=event.data.size;if(bytes>40000000&&state==='recording')void api.stop();}};
    recorder.onstop=()=>{blob=new Blob(chunks,{type:recorder.mimeType||mimeType});chunks=[];release();publish(blob.size?'ready':'failed');resolveStop?.(blob);resolveStop=null;};
    recorder.onerror=()=>{release();publish('failed');resolveStop?.(null);resolveStop=null;};
    recorder.start(1000);publish('recording');timer=setTimer(()=>{void api.stop();},300000);return true;
   }catch{release();publish('failed');return false;}
  },
  stop(){if(state==='starting'){epoch++;publish('idle');return Promise.resolve(null);}if(state==='stopping')return pendingStop;if(state==='recording'){publish('stopping');try{recorder.stop();}catch{release();publish('failed');resolveStop?.(null);resolveStop=null;}return pendingStop;}return Promise.resolve(blob);}
 };return api;
}
