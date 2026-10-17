import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {bundle} from '@remotion/bundler';
import {selectComposition,renderMedia} from '@remotion/renderer';
import {ROOT,readProject,projectDir,probe,run,FFMPEG,atomicJson} from '../src/core.js';
import {importLibrary} from '../src/library.js';
import {checkExport} from '../src/preflight.js';
const id='nano-banana-cartoon-workflow-28043a87',p=await readProject(id),dir=projectDir(id);
assert.equal(p.heygen.acceptedTestVoiceSpeed,1.5);
const whoosh=await importLibrary(id,'266499c7cc095eec');
// Complete exported cue boundaries, reordered without speech-rate changes.
const audioCuts=[{start:0,end:8.086,trim:0}];let cursor=24.4;
for(const [a,b] of [[11.753,14.339],[22.003,27.174],[27.174,30.512],[14.339,22.003],[30.512,32.863],[32.863,37.376],[37.376,41.452],[41.452,45.923]]){audioCuts.push({start:cursor,end:cursor+b-a,trim:a});cursor+=b-a;}
assert(cursor<58.8);
const inputProps={baseUrl:`http://127.0.0.1:4317/media/${id}`,aroll:p.heygen.asset!,whoosh:whoosh.file,audioCuts};
for(const file of ['assets/local-opening-dialogue-first.mp4','assets/local-opening-dialogue-second.mp4','assets/openart-home-capture.jpg','recordings/shots/character-prompt.mp4'])await fs.access(path.join(dir,file));
const serveUrl=await bundle({entryPoint:path.join(ROOT,'video/first-minute.tsx'),outDir:path.join(ROOT,'.render-bundle-first-minute')});
const browserExecutable='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const composition=await selectComposition({serveUrl,id:'FirstMinute',inputProps,browserExecutable});
const file='exports/Frame 01 - first minute.mp4',temporary=path.join(dir,'exports/first-minute-rendering.mp4');let progress=-1;
await renderMedia({serveUrl,composition,inputProps,browserExecutable,codec:'h264',outputLocation:temporary,concurrency:4,crf:19,pixelFormat:'yuv420p',chromiumOptions:{gl:'swangle'},onProgress:p=>{const step=Math.floor(p.progress*10);if(step!==progress){progress=step;console.log(`First minute: ${step*10}%`)}}});
const info=await probe(temporary),levels=await run(FFMPEG,['-hide_banner','-i',temporary,'-vn','-af','volumedetect','-f','null','-']);
const peak=Number(levels.match(/max_volume: ([-\d.]+) dB/)?.[1]);checkExport(info,60,peak);
await fs.rename(temporary,path.join(dir,file));
await atomicJson(path.join(dir,file+'.proof.json'),{file,duration:info.duration,peakDb:peak,inputProps,sourceWindow:[0,60],frames:1800,referenceScanFps:4,referenceFramesReviewed:240,captions:0,additionalHeyGenSubmissions:0,limitations:['Existing accepted 1.5x HeyGen narration; complete cues reordered to fit the source editing beats','Cartoon characters and actions are newly generated locally, not identical to source','OpenArt home view is a real browser still; prompt insert uses an existing screen recording','Source promotional link badge is omitted because this narration does not promise a description link'],at:new Date().toISOString()});
console.log(JSON.stringify({file,duration:info.duration,peakDb:peak}));
