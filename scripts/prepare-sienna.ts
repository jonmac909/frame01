import fs from 'node:fs/promises';
import path from 'node:path';
import {mutate,projectDir,event} from '../src/core.js';
import {reconcileHeyGen} from '../src/browser.js';
const id='nano-banana-cartoon-workflow-28043a87';
const p=await mutate(id,p=>{
  if(p.heygen.video)throw new Error('A-roll already submitted; preserve its settings and narration.');
  p.avatar='Sienna';p.model='Avatar III';p.voice='Nelly';p.tone='Warm';delete p.heygen.verified;
  const plan=p.script.search(/\nSHOT PLAN\b/);
  if(plan>=0){p.notes+='\n\n'+p.script.slice(plan).trim();p.script=p.script.slice(0,plan).trim();}
  event(p,'settings-updated','User selected Sienna, Avatar III, Nelly, Warm. Separated shot plan from spoken narration.');
});
await reconcileHeyGen(id,'draft','https://app.heygen.com/create-v4/045fdb164a324611b8d2cd88ea336d50');
await fs.writeFile(path.join(projectDir(id),'Rewritten narration.txt'),p.script);
await fs.writeFile(path.join(projectDir(id),'Production notes.md'),p.notes);
console.log(JSON.stringify({avatar:p.avatar,model:p.model,voice:p.voice,tone:p.tone,words:p.script.split(/\s+/).length,draft:'045fdb164a324611b8d2cd88ea336d50'}));
