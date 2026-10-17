import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {bundle} from '@remotion/bundler';
import {selectComposition,renderMedia,renderStill} from '@remotion/renderer';
import {ROOT,readProject,projectDir,timelineSchema,probe,run,FFMPEG,atomicJson,mutate,event} from '../src/core.js';
import {importLibrary} from '../src/library.js';
import {checkExport,checkReferenceStyle} from '../src/preflight.js';
import {renderProps} from '../src/render.js';

const id='nano-banana-cartoon-workflow-28043a87',p=await readProject(id),dir=projectDir(id);
assert.equal(p.heygen.acceptedTestVoiceSpeed,1.5);
const asset=p.heygen.asset!,sheet='assets/local-badger-character-sheet.png';
const sourceStart=73.759,duration=Math.round((92.986-sourceStart)*30)/30;
const camera=JSON.parse(await fs.readFile(path.join(dir,'reference/character-sheet-camera.json'),'utf8'));
const whoosh=await importLibrary(id,'266499c7cc095eec');
const timeline=timelineSchema.parse({title:'Reference-matched character-sheet sample',accent:'#20c9ef',
  clips:[
    {id:'tracked-sheet',asset:sheet,start:0,duration:15.8,kind:'image',layout:'card',camera,muted:true},
    {id:'presenter-return',asset,start:15.8,duration:duration-15.8,trim:sourceStart+15.8,kind:'aroll',muted:true},
  ],
  audio:[{id:'nelly-existing',asset,start:0,duration,trim:sourceStart,volume:1,fade:0},
    {id:'sheet-reveal-sfx',asset:whoosh.file,start:0,duration:1.2,trim:0,volume:.1,fade:.04},
    {id:'pan-left-sfx',asset:whoosh.file,start:6.75,duration:.7,trim:0,volume:.06,fade:.04},
    {id:'pan-right-sfx',asset:whoosh.file,start:13.25,duration:.7,trim:0,volume:.06,fade:.04}],
  overlays:[],graphics:[],captions:[],
});
const visualStyle={burnedInCaptions:false,addedLabels:false,presenterInsetOnScreensOnly:true};
checkReferenceStyle(timeline,{visualStyle});
await mutate(id,p=>{p.reference={...p.reference,visualStyle};if(p.timeline){p.timeline.captions=[];p.timeline.graphics=[];p.timeline.overlays=[];}event(p,'editorial-correction','Removed the rejected template. No burned-in captions or added labels. Full assembly stopped pending source shot mapping.');});
await atomicJson(path.join(dir,'Test render status.json'),{phase:'stopped-for-source-match-correction',qualityReview:'previous preview rejected by user',fullRenderStarted:false,at:new Date().toISOString()});
await fs.mkdir(path.join(dir,'exports/source-match-review'),{recursive:true});
const file='exports/Frame 01 - source-matched sample.mp4',temporary=path.join(dir,'exports/source-match-review/rendering.mp4');
const serveUrl=await bundle({entryPoint:path.join(ROOT,'video/index.tsx'),outDir:path.join(ROOT,'.render-bundle-source-match')});
const inputProps=await renderProps(id,timeline),browserExecutable='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const composition=await selectComposition({serveUrl,id:'CourseEditor',inputProps,browserExecutable});
const reviewTimes=[1.5,5.5,9,14.5,17];
for(const [i,second] of reviewTimes.entries())await renderStill({serveUrl,composition,inputProps,browserExecutable,frame:Math.round(second*30),output:path.join(dir,`exports/source-match-review/corrected-${i}.png`),chromiumOptions:{gl:'swangle'}});
let progress=-1;
await renderMedia({serveUrl,composition,inputProps,browserExecutable,codec:'h264',outputLocation:temporary,concurrency:2,crf:18,pixelFormat:'yuv420p',chromiumOptions:{gl:'swangle'},onProgress:p=>{const step=Math.floor(p.progress*10);if(step!==progress){progress=step;console.log(`Corrected sample render: ${step*10}%`)}}});
const info=await probe(temporary),levels=await run(FFMPEG,['-hide_banner','-i',temporary,'-vn','-af','volumedetect','-f','null','-']);
const peak=Number(levels.match(/max_volume: ([-\d.]+) dB/)?.[1]);checkExport(info,duration,peak);
await fs.rename(temporary,path.join(dir,file));
const proof={file,duration:info.duration,peakDb:peak,sourceReferenceStart:85,sourceReferenceEnd:85+duration,referenceEvidence:['reference/analysis-1792192732714/review/all-4fps-006.jpg','reference/analysis-1792192732714/review/all-4fps-007.jpg'],captions:0,addedLabels:0,presenterInsets:0,courseLessons:['10.7 03:11-04:08: transcript as planning data','4.3 00:55-02:18: eased keyframes','5.2 11:20-13:13: sound tied to motion'],limitations:['Visual sample only, not the complete remake','Existing user-accepted accelerated A-roll remains','Local character-sheet artwork differs from the source'],additionalHeyGenSubmissions:0,timeline,verifiedAt:new Date().toISOString()};
await atomicJson(path.join(dir,file+'.proof.json'),proof);
// Preserve the rejected artifact privately, and correct the original link too.
const old=path.join(dir,'exports/Frame 01 - edit test.mp4'),archive=path.resolve(ROOT,'../../work/rejected-captioned-edit-test.mp4');
await fs.copyFile(old,archive,fs.constants.COPYFILE_EXCL).catch(e=>{if(e.code!=='EEXIST'&&e.code!=='ENOENT')throw e});
await fs.copyFile(path.join(dir,file),old);await atomicJson(old+'.proof.json',{...proof,file:'exports/Frame 01 - edit test.mp4',supersedes:'Rejected captioned 30-second compositor test'});
await mutate(id,p=>event(p,'edit-test-corrected',`Saved ${file}: clean card, reference-matched pan/zoom and presenter return; no captions, provider badges or presenter inset. Full remake remains unverified.`));
console.log(JSON.stringify({file,duration:info.duration,peakDb:peak,cameraFrames:camera.length}));
