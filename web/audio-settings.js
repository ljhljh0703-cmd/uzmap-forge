/** UI preferences only. Never stored with game inputs or simulation state. */
const KEY='uzmap.ui.gemtower.audio.v1';
const defaults=()=>({enabled:false,sfxVolume:80,bgmVolume:50});
const volume=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?Math.round(Math.max(0,Math.min(100,value))):fallback;
export function createAudioPreferences(storage=()=>globalThis.localStorage){
 let state=defaults();
 try{const source=JSON.parse(storage()?.getItem(KEY)??'null');if(source&&typeof source==='object')state={enabled:typeof source.enabled==='boolean'?source.enabled:false,sfxVolume:volume(source.sfxVolume,80),bgmVolume:volume(source.bgmVolume,50)};}catch{}
 return{snapshot:()=>({...state}),set(patch={}){state={enabled:typeof patch.enabled==='boolean'?patch.enabled:state.enabled,sfxVolume:volume(patch.sfxVolume,state.sfxVolume),bgmVolume:volume(patch.bgmVolume,state.bgmVolume)};try{storage()?.setItem(KEY,JSON.stringify(state));}catch{}return{...state};}};
}
export function mountAudioSettings(doc,{audio,storage,muted=false}={}){
 const host=doc.querySelector('.feedback-sound'),button=doc.getElementById('feedbackSound'),preferences=createAudioPreferences(storage);if(!host||!audio)return{render(){},preferences};
 const outputs=new Map();
 for(const [kind,label]of [['sfx','효과음'],['bgm','배경음']]){
  const row=doc.createElement('label'),title=doc.createElement('span'),input=doc.createElement('input'),output=doc.createElement('output');
  row.className='sound-volume';title.textContent=label;input.id=kind+'Volume';input.type='range';input.min='0';input.max='100';input.step='1';input.setAttribute('aria-label',label+' 음량');output.id=kind+'VolumeValue';output.setAttribute('for',input.id);row.append(title,input,output);host.append(row);outputs.set(kind,{input,output});
  input.addEventListener('input',()=>{const state=preferences.set({[kind+'Volume']:Number(input.value)});(kind==='sfx'?audio.setSfxVolume:audio.setBgmVolume)(state[kind+'Volume']);render();if(state.enabled&&(state.sfxVolume>0||state.bgmVolume>0))void audio.unlock();});
 }
 function render(){const state=audio.snapshot();for(const [kind,{input,output}]of outputs){input.value=String(state[kind+'Volume']);output.textContent=String(state[kind+'Volume']);input.setAttribute('aria-valuetext',String(state[kind+'Volume'])+'%');}if(button){button.textContent=state.enabled?'소리 켜짐':'소리 꺼짐';button.setAttribute('aria-pressed',String(state.enabled));}}
 const saved=preferences.snapshot();audio.setSfxVolume(saved.sfxVolume);audio.setBgmVolume(saved.bgmVolume);audio.setEnabled(saved.enabled&&muted!==true);
 button?.addEventListener('click',()=>{const state=preferences.set({enabled:!audio.snapshot().enabled});audio.setEnabled(state.enabled);render();if(state.enabled)void audio.unlock();});render();
 return{render,preferences};
}

export function createPlayPreferences(storage=()=>globalThis.localStorage){
 const key='uzmap.ui.gemtower.play.v1';let state={damageNumbers:true,precision:false};
 try{const raw=JSON.parse(storage()?.getItem(key)??'null');if(raw&&typeof raw==='object')for(const name of Object.keys(state))if(typeof raw[name]==='boolean')state[name]=raw[name];}catch{}
 return{snapshot:()=>({...state}),set(patch={}){for(const name of Object.keys(state))if(typeof patch[name]==='boolean')state[name]=patch[name];try{storage()?.setItem(key,JSON.stringify(state));}catch{}return{...state};}};
}
