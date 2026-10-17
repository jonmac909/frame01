import fs from 'node:fs/promises';
import path from 'node:path';
import {sourceShots,sourceCameraShots} from '../video/source-shots.js';
import {projectDir,atomicJson} from '../src/core.js';
const dir=projectDir('nano-banana-cartoon-workflow-28043a87');
await atomicJson(path.join(dir,'Source shot map.json'),{fps:30,reviewedFrames:3004,reviewedSheets:47,basis:'Actual 4fps semantic review, authored shot boundaries; frame refinement and asset QA pending.',shots:sourceShots.map((s,i)=>({...s,id:`source-${i+1}`,startFrame:Math.round(s.start*30),endFrame:Math.round(s.end*30),durationFrames:Math.round(s.end*30)-Math.round(s.start*30)}))});
await fs.mkdir(path.join(dir,'reference/cameras'),{recursive:true});
await atomicJson(path.join(dir,'reference/cameras/requests.json'),sourceCameraShots);
console.log(JSON.stringify({shots:sourceShots.length,cameraTracks:sourceCameraShots.length}));
