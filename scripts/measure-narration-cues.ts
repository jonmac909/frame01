import fs from 'node:fs/promises';
import path from 'node:path';
import {projectDir,atomicJson} from '../src/core.js';
const dir=projectDir('nano-banana-cartoon-workflow-28043a87');
const script=await fs.readFile(path.join(dir,'Rewritten narration.txt'),'utf8');
const alignment=JSON.parse(await fs.readFile(path.join(dir,'Replacement A-roll alignment.json'),'utf8'));
const normal=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
if(normal(script)!==normal(alignment.captions.map((c:any)=>c.text).join(' ')))throw new Error('Incomplete narration.');
let offset=0;
const cues=alignment.captions.map((c:any)=>{const startOffset=offset;offset+=normal(c.text).length;return {...c,startOffset,endOffset:offset}});
offset=0;
const paragraphs=script.split(/\r?\n\s*\r?\n/).filter(s=>s.trim()).map((text,index)=>{
  const startOffset=offset;offset+=normal(text).length;
  const cue=cues.find((c:any)=>c.startOffset<=startOffset&&c.endOffset>startOffset);
  if(!cue)throw new Error('Paragraph absent from exported captions.');
  return {index,text,startOffset,endOffset:offset,cueStart:cue.start,cueEnd:cue.end,exactBoundary:cue.startOffset===startOffset,containingCue:cue.text};
});
await atomicJson(path.join(dir,'Replacement narration cue anchors.json'),{paragraphs,cues,basis:'Exact character offsets in matching complete caption text. Only exactBoundary entries are precise cut anchors; other entries explicitly identify containing cues.'});
console.log(JSON.stringify(paragraphs.map(({index,text,cueStart,cueEnd,exactBoundary})=>({index,cueStart,cueEnd,exactBoundary,text:text.slice(0,60)})),null,2));
