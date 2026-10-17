import fs from 'node:fs/promises';
import {startWindowRecording,stopWindowRecording} from '../src/window-recording.js';
const id='nano-banana-cartoon-workflow-28043a87';
const windowId=Number(process.argv[2]);
const result=await startWindowRecording(id,{windowId,maxSeconds:40,viewport:{width:Number(process.argv[3]),height:Number(process.argv[4])}});
console.log(JSON.stringify(result));
await fs.writeFile('data/window-recording-verification-ready.json',JSON.stringify(result));
await new Promise(r=>setTimeout(r,20000));
console.log(JSON.stringify(await stopWindowRecording(id)));
