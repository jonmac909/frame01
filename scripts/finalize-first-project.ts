import fs from 'node:fs/promises';
import path from 'node:path';
import {mutate,projectDir,readProject,event} from '../src/core.js';
import {indexCourse} from '../src/knowledge.js';
const id='nano-banana-cartoon-workflow-28043a87';
await mutate(id,p=>{const lines=p.script.split(/\r?\n/),directions=lines.filter(l=>/^TITLE:|^\[.*\]$/.test(l.trim()));if(directions.length){p.script=lines.filter(l=>!/^TITLE:|^\[.*\]$/.test(l.trim())).join('\n').replace(/\n{3,}/g,'\n\n').trim();p.notes+='\n\nUnspoken production markers (excluded from HeyGen narration):\n'+directions.join('\n');delete p.heygen.verified;event(p,'narration-cleaned','Separated unspoken stage directions from the saved HeyGen narration.');}});
const p=await readProject(id);await fs.writeFile(path.join(projectDir(id),'Rewritten narration.txt'),p.script);await fs.writeFile(path.join(projectDir(id),'Production notes.md'),p.notes);
console.log({narrationWords:p.script.split(/\s+/).length,heygen:p.heygen,course:await indexCourse()});
