// Local compositor test only. This does not replace the final timeline or HeyGen ledger.
import fs from 'node:fs/promises';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {selectComposition,renderMedia,renderStill} from '@remotion/renderer';
import {ROOT,readProject,projectDir,timelineSchema,probe,run,FFMPEG,atomicJson,mutate,event} from '../src/core.js';
import {importLibrary} from '../src/library.js';
import {checkExport} from '../src/preflight.js';
import {renderProps} from '../src/render.js';
const id='nano-banana-cartoon-workflow-28043a87',p=await readProject(id),dir=projectDir(id);
throw new Error('This generic captioned preview was rejected. Use scripts/render-source-match.ts for the source-matched correction.');
if(p.heygen.acceptedTestVoiceSpeed!==1.5||p.heygen.verified?.voiceSpeed!==1.5)throw new Error('This preview requires the recorded user exception for the existing A-roll.');
const asset=p.heygen.asset!;await fs.access(path.join(dir,asset));
const alignment=JSON.parse(await fs.readFile(path.join(dir,'A-roll alignment.json'),'utf8'));
const start=alignment.sections[1].sourceStart,duration=30;
const whoosh=await importLibrary(id,'266499c7cc095eec'),font=await importLibrary(id,'c7c1be029d996982');
const timeline=timelineSchema.parse({title:'Frame 01 — local edit test',accent:'#20c9ef',font:font.file,
  clips:[
    {id:'sienna-open',asset,start:0,duration:7,trim:start,kind:'aroll',muted:true},
    {id:'example-card',asset:'assets/local-3d-badger-scene.png',start:7,duration:11,trim:0,kind:'image',layout:'card',entrance:'rise',muted:true},
    {id:'sienna-close',asset,start:18,duration:12,trim:start+18,kind:'aroll',muted:true},
  ],
  audio:[{id:'existing-nelly',asset,start:0,duration,trim:start,volume:1,fade:0},
    {id:'reveal-whoosh',asset:whoosh.file,start:7,duration:1.2,trim:0,volume:.16,fade:.04}],
  overlays:[{id:'sienna-inset',asset,start:7,duration:11,trim:start+7,blend:'normal',layout:'circle'}],
  graphics:[{start:0,duration:4,text:'01 / 3D CARTOON',kind:'lower-third'},{start:7,duration:11,text:'Local Qwen Image 2.1 illustration',kind:'lower-third'}],
  captions:alignment.captions.filter((c:any)=>c.end>start&&c.start<start+duration).map((c:any)=>({start:Math.max(0,c.start-start),end:Math.min(duration,c.end-start),text:c.text})),
});
await fs.mkdir(path.join(dir,'exports'),{recursive:true});
const file='exports/Frame 01 - edit test.mp4',output=path.join(dir,file);
const serveUrl=await bundle({entryPoint:path.join(ROOT,'video/index.tsx'),outDir:path.join(ROOT,'.render-bundle')});
const inputProps=await renderProps(id,timeline),browserExecutable='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const composition=await selectComposition({serveUrl,id:'CourseEditor',inputProps,browserExecutable});
await renderStill({serveUrl,composition,inputProps,browserExecutable,frame:300,output:path.join(dir,'exports/Edit test frame.png'),chromiumOptions:{gl:'swangle'}});
console.log('Preview frame saved. Rendering 30-second local compositor test.');
await renderMedia({serveUrl,composition,inputProps,browserExecutable,codec:'h264',outputLocation:output,concurrency:2,crf:20,pixelFormat:'yuv420p',chromiumOptions:{gl:'swangle'}});
const info=await probe(output),levels=await run(FFMPEG,['-hide_banner','-i',output,'-vn','-af','volumedetect','-f','null','-']);
const peak=Number(levels.match(/max_volume: ([-\d.]+) dB/)?.[1]);checkExport(info,duration,peak);
await atomicJson(output+'.proof.json',{purpose:'30-second compositor test, not a complete remake',file,duration:info.duration,peakDb:peak,voiceSpeed:1.5,additionalHeyGenSubmissions:0,timeline,verifiedAt:new Date().toISOString()});
await mutate(id,p=>event(p,'edit-test',`Saved ${file}: 30-second local compositor test using existing A-roll, Qwen illustration and filmmaking-pack SFX. Not the final remake.`));
console.log({file,duration:info.duration,peakDb:peak});
