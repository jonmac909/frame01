import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {bundle} from '@remotion/bundler';
import {selectComposition,renderMedia} from '@remotion/renderer';
import {ROOT,projectDir,atomicJson,probe,run,FFMPEG} from '../src/core.js';
import type {FullPlan} from '../video/full-types.js';
const dir=projectDir('nano-banana-cartoon-workflow-28043a87');
const plan:FullPlan=JSON.parse(await fs.readFile(path.join(dir,'Source-runtime remake plan.json'),'utf8'));
assert.deepEqual(plan.speech.slice(0,3),[{from:0,to:125,trim:0},{from:125,to:290,trim:364},{from:884,to:1123,trim:125}]);
const out=path.join(dir,'exports/source-runtime'),patch=path.join(out,'opening-repair');await fs.mkdir(patch,{recursive:true});
const file=path.join(out,'section-00.mp4'),proof=JSON.parse(await fs.readFile(file+'.proof.json','utf8'));
if(proof.openingAcousticBoundaryRepair){console.log('Opening word boundary already repaired.');process.exit(0)}
const serveUrl=await bundle({entryPoint:path.join(ROOT,'video/full-remake.tsx'),outDir:path.join(ROOT,`.render-bundle-opening-${process.pid}`)});
const browserExecutable='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
for(const kind of ['hold','audio']as const){
 const target=path.join(patch,kind==='hold'?'hold.mp4':'section.wav');
 if(await fs.stat(target).then(()=>true,()=>false))continue;
 const inputProps={plan,offset:kind==='hold'?860:0,length:kind==='hold'?24:1670};
 const composition=await selectComposition({serveUrl,id:'FullRemake',inputProps,browserExecutable});
 await renderMedia({serveUrl,composition,inputProps,browserExecutable,codec:kind==='hold'?'h264':'wav',outputLocation:target,muted:kind==='hold',concurrency:4,crf:kind==='hold'?19:undefined,pixelFormat:'yuv420p',sampleRate:48000,chromiumOptions:{gl:'swangle'}});
 console.log(`Rendered opening ${kind}.`);
}
const result=path.join(patch,'repaired.mp4');
await run(FFMPEG,['-v','error','-y','-i',file,'-i',path.join(patch,'hold.mp4'),'-i',path.join(patch,'section.wav'),'-filter_complex','[0:v]trim=start_frame=0:end_frame=860,settb=expr=1/30,setpts=N[a];[1:v]settb=expr=1/30,setpts=N[b];[0:v]trim=start_frame=884:end_frame=1670,settb=expr=1/30,setpts=N[c];[a][b][c]concat=n=3:v=1:a=0,fps=30[v]','-map','[v]','-map','2:a:0','-c:v','libx264','-threads','4','-preset','veryfast','-crf','19','-r','30','-fps_mode','cfr','-frames:v','1670','-c:a','aac','-b:a','192k','-t',String(1670/30),'-movflags','+faststart',result]);
const info=await probe(result);assert(info.streams.some((s:any)=>s.codec_type==='video'&&Number(s.nb_frames)===1670&&s.r_frame_rate==='30/1'));
await fs.copyFile(result,file);
await atomicJson(file+'.proof.json',{...proof,info,openingAcousticBoundaryRepair:{sourceBoundary:125/30,priorCaptionBoundary:101/30,holdFrames:[860,884],reason:'Keep the whole word workflow before the teaser; retain the native source timing after the hold. Full opening audio rendered from the revised plan.',qa:'Requires final-master transcript and opening frame inspection'},at:new Date().toISOString()});
console.log(JSON.stringify({repaired:file,frames:1670}));
