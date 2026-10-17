import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {projectDir,readProject,probe,run,FFMPEG,atomicJson,addAsset,mutate,event,hash} from '../src/core.js';
import {parseVtt} from '../src/reference.js';
import {alignSections} from '../src/alignment.js';
const id='nano-banana-cartoon-workflow-28043a87',dir=projectDir(id),p=await readProject(id);
const authFile=path.join(dir,'HeyGen replacement authorization.json'),auth=JSON.parse(await fs.readFile(authFile,'utf8'));
if(auth.replacementVideoId!=='2388109a9b1f485794191d8042820f0d'||!auth.replacementSubmissionRecorded)throw new Error('Verify the one observed replacement ID before importing.');
const file='assets/sienna-shop-drop-1x-2388109a9b1f485794191d8042820f0d.mp4',captionsFile='Replacement A-roll captions.srt';
for(const [src,dest] of [['D:/Downloads/Frame_01_-_Sienna_Shop_Drop_-_1x_replacement.mp4',path.join(dir,file)],['D:/Downloads/Frame_01_-_Sienna_Shop_Drop_-_1x_replacement_caption.srt',path.join(dir,captionsFile)]]){
  await fs.copyFile(src,dest,fs.constants.COPYFILE_EXCL).catch(e=>{if(e.code!=='EEXIST')throw e});
}
const info=await probe(path.join(dir,file)),text=await fs.readFile(path.join(dir,captionsFile),'utf8'),captions=parseVtt(text);
const normalize=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
if(normalize(captions.map(c=>c.text).join(' '))!==normalize(p.script))throw new Error('Replacement captions differ from the complete saved narration.');
const video=info.streams.find((s:any)=>s.codec_type==='video');
if(!info.audio||!info.video||video.width!==1920||video.height!==1080||info.duration<700)throw new Error('Unexpected replacement media; inspect before editing.');
const mediaHash=createHash('sha256');for await(const chunk of createReadStream(path.join(dir,file)))mediaHash.update(chunk);
const levels=await run(FFMPEG,['-hide_banner','-i',path.join(dir,file),'-vn','-af','volumedetect,silencedetect=noise=-40dB:d=0.5','-f','null','-'],{timeout:300000});
const plan=JSON.parse(await fs.readFile(path.join(dir,'Reference timing.json'),'utf8'));
let fittingSections:unknown,alignmentError:string|undefined;
try{fittingSections=alignSections(p.script,plan.sections,captions,info.duration)}catch(e){alignmentError=String(e)}
// Report all exact exported section boundaries even when the source windows cannot fit.
let offset=0;const spans=captions.map(c=>{const start=offset;offset+=normalize(c.text).length;return {...c,offset:start}});offset=0;
const starts=plan.sections.map((s:any)=>{const cue=spans.find(c=>c.offset===offset);offset+=normalize(s.text).length;return cue?.start});
const sections=plan.sections.map((s:any,i:number)=>({index:i,targetStart:s.start,targetEnd:s.end,sourceStart:starts[i],sourceEnd:starts[i+1]??info.duration,speechDuration:starts[i]===undefined?null:(starts[i+1]??info.duration)-starts[i],exactCaptionBoundary:starts[i]!==undefined}));
const proof={videoId:auth.replacementVideoId,url:auth.replacementVideoUrl,file,captionsFile,sha256:mediaHash.digest('hex'),captionHash:hash(text),scriptHash:hash(p.script),completeNarrationMatch:true,captionCount:captions.length,mediaDuration:info.duration,width:video.width,height:video.height,fps:video.avg_frame_rate,voiceSpeed:1,voice:'Nelly',tone:'Warm',motionModel:'Avatar III',avatarLookId:auth.avatarLookId,peakDb:Number(levels.match(/max_volume: ([-\d.]+) dB/)?.[1]),meanDb:Number(levels.match(/mean_volume: ([-\d.]+) dB/)?.[1]),sourceDuration:Number(p.reference!.duration),runtimeExcess:info.duration-Number(p.reference!.duration),sections,fittingSections,alignmentError,basis:'Measured downloaded replacement MP4 and HeyGen-exported captions; no speed change or script shortening.',verifiedAt:new Date().toISOString()};
await atomicJson(path.join(dir,'Replacement A-roll alignment.json'),{...proof,captions});
await atomicJson(path.join(dir,'Replacement A-roll verification.json'),proof);
await fs.writeFile(path.join(dir,'Replacement audio analysis.txt'),levels);
await addAsset(id,file,'aroll');
await atomicJson(authFile,{...auth,replacementOutcome:'completed',replacementMedia:file,replacementCaptions:captionsFile,measuredDuration:info.duration,mediaSha256:proof.sha256,verifiedAt:proof.verifiedAt});
await mutate(id,p=>event(p,'heygen-replacement-complete',`Downloaded and measured ${info.duration}s replacement at 1.0x. All ${captions.length} caption cues match the complete narration. Original media and ledger preserved. Source runtime conflict: +${proof.runtimeExcess.toFixed(3)}s before adding demonstration gaps.`));
console.log(JSON.stringify(proof,null,2));
