import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import * as audio from '../../web/audio-catalog.js';
const cues=['place','combine','upgrade','waveStart','lifeLoss','kill','boss','air','keep','rare','research','waveGold','tap','defeat','clear'];
const root=path.resolve('web/assets/audio/cc0');
const metadata=()=>JSON.parse(readFileSync(path.join(root,'manifest.json'),'utf8'));

test('catalogue provides every approved cue and both music states in ogg/m4a fallback order with no lazy-load side effect',async()=>{
 assert.deepEqual(Object.keys(audio.H_AUDIO_CUES).sort(),[...cues].sort());assert.deepEqual(Object.keys(audio.H_BGM).sort(),['combat','prepare']);
 let fetched=0;const previous=globalThis.fetch;globalThis.fetch=async()=>{fetched++;throw Error('catalogue must not fetch');};
 try{
  const url=pathToFileURL(path.resolve('web/audio-catalog.js'));url.searchParams.set('build','0123456789abcdef');const pinned=await import(url.href);
  for(const pair of [...Object.values(pinned.H_AUDIO_CUES),...Object.values(pinned.H_BGM)] as string[][]){assert.equal(pair.length,2);assert.equal(new URL(pair[0]).pathname.endsWith('.ogg'),true);assert.equal(new URL(pair[1]).pathname.endsWith('.m4a'),true);assert.ok(pair.every(value=>new URL(value).searchParams.get('build')==='0123456789abcdef'));}
  assert.equal(fetched,0);
 }finally{globalThis.fetch=previous;}
});

test('each cue has bounded gain and priority, keeping small taps and kills below life and terminal events',()=>{
 assert.deepEqual(Object.keys(audio.H_CUE_SETTINGS).sort(),[...cues].sort());
 for(const row of Object.values(audio.H_CUE_SETTINGS) as any[]){assert.ok(row.gain>=0&&row.gain<=1);assert.ok(Number.isSafeInteger(row.priority)&&row.priority>=0);}
 assert.ok(audio.H_CUE_SETTINGS.kill.gain<audio.H_CUE_SETTINGS.lifeLoss.gain);assert.ok(audio.H_CUE_SETTINGS.tap.priority<audio.H_CUE_SETTINGS.defeat.priority);
});

test('all advertised variants are real codec files with exact recorded hashes, license and per-file provenance',()=>{
 const m=metadata(),license=readFileSync('web/assets/audio/LICENSES.md','utf8'),advertised=[...Object.values(audio.H_AUDIO_CUES),...Object.values(audio.H_BGM)].flat() as string[];
 assert.equal(m.files.length,34);assert.equal(advertised.length,34);
 for(const href of advertised){const file=fileURLToPath(href),relative=path.relative(root,file),row=m.files.find((entry:any)=>entry.file===relative);assert.ok(row,relative);const bytes=readFileSync(file);
  assert.equal(bytes.length,row.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
  if(relative.endsWith('.ogg'))assert.equal(bytes.toString('ascii',0,4),'OggS');else assert.equal(bytes.toString('ascii',4,8),'ftyp');
  assert.equal(row.license,'CC0-1.0');assert.equal(row.licenseUrl,'https://creativecommons.org/publicdomain/zero/1.0/');assert.match(row.source.pageUrl,/^https:\/\//);assert.match(row.source.downloadUrl,/^https:\/\//);assert.match(row.source.sha256,/^[a-f0-9]{64}$/);assert.equal(row.source.downloaded,'2026-10-24');assert.ok(row.source.member&&row.transformation);
  assert.ok(license.includes('cc0/'+relative),relative+' is credited');assert.ok(license.includes(row.source.pageUrl));assert.ok(license.includes(row.source.downloadUrl));
 }
 const actual=readdirSync(root).filter(name=>/\.(ogg|m4a)$/.test(name));assert.equal(actual.length,34);assert.deepEqual(actual.sort(),m.files.map((entry:any)=>entry.file).sort());
});

test('selected codec alternatives plus preserved legacy cues remain under the conservative1.5MB audio budget',()=>{
 const m=metadata(),selected=m.files.reduce((sum:number,row:any)=>sum+readFileSync(path.join(root,row.file)).length,0),legacy=['place','combine','upgrade'].reduce((sum,name)=>sum+readFileSync('web/assets/audio/'+name+'.wav').length,0);
 assert.equal(legacy,107736);assert.ok(selected+legacy<=1500000,`${selected}+${legacy} exceeds audio budget`);
 const pins={place:'184da0406c812073003c093bc0a34bbfdf8ed40eb28096888c9891eff779dfae',combine:'b14e990c1f06d5ebf3d4b180bbc05e5021d826cc0554b907d54e55bd889b8166',upgrade:'256d3cd4022915469d8323968981ced7681d9aa431275a6de86c63d9b1cb2847'};
 for(const [name,hash]of Object.entries(pins))assert.equal(createHash('sha256').update(readFileSync('web/assets/audio/'+name+'.wav')).digest('hex'),hash);

});

test('post-encode measurements meet the loudness/peak bounds and short clips explicitly disclose repeated measurement',()=>{
 for(const row of metadata().files){const target=row.kind==='bgm'?-20:-16,measure=row.measure;assert.ok(Number.isFinite(measure.integratedLufs),row.file);assert.ok(Math.abs(measure.integratedLufs-target)<=2,row.file+' loudness');assert.ok(measure.truePeakDbtp<=-1,row.file+' peak');assert.ok(measure.decodedDurationSeconds>0);assert.ok(Number.isInteger(measure.repeats)&&measure.repeats>=1);
  if(measure.decodedDurationSeconds<.4){assert.match(measure.method,/repeat/);assert.ok(measure.repeats>1,'short intrinsic LUFS is not fabricated');}
 }
});

test('music loops preserve finite boundary metrics and codec-aligned durations without claiming listening verification',()=>{
 const m=metadata();for(const row of m.files.filter((entry:any)=>entry.kind==='bgm')){assert.ok(row.loop.crossfadeSeconds>0&&row.loop.crossfadeSeconds<=.5);assert.ok(row.loop.pcmSamples%1024===0);assert.ok(Number.isFinite(row.loop.decodedBoundaryJumpDbfs));assert.ok(row.loop.decodedBoundaryJumpDbfs<=-30,row.file+' wrap transient');assert.equal(row.loop.audition,'not run');}
});
