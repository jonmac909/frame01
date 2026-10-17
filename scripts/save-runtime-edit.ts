import fs from 'node:fs/promises';
import path from 'node:path';
import {projectDir,atomicJson} from '../src/core.js';
const dir=projectDir('nano-banana-cartoon-workflow-28043a87');
const srt=await fs.readFile(path.join(dir,'Replacement A-roll captions.srt'),'utf8');
const time=(s:string)=>s.split(/[:,]/).map(Number).reduce((n,x,i)=>n+x*[3600,60,1,.001][i],0);
const cues=srt.trim().split(/\r?\n\r?\n/).map(block=>{const [id,timing,...lines]=block.split(/\r?\n/),[a,b]=timing.split(' --> ');return {cue:Number(id),start:time(a),end:time(b),text:lines.join(' ')}});
const groups=[
 {cues:[5,8,9,10,11],reason:'Opening repeats preparation and previews topics covered in the tutorial.'},
 {cues:[14,19,23,24,30,35,40,47],reason:'Remove repeated style guidance and comparison explanations; retain all settings, character views, expressions, location, attachment order and action instructions.'},
 {cues:[55,56,59,64,65,69,71,85],reason:'Remove repeated reasons for style consistency; retain world-first setup, both characters, visual comparison, multi-angle prop sheet and multi-shot direction.'},
 {cues:[89,95],reason:'Remove restated workflow and staging rationale; retain vintage style, references, setup/reaction and review.'},
 {cues:[104,106],reason:'Remove repeated handmade consistency and staging advice; retain paper materials, all assets, generation and review.'},
 {cues:[115,118,119,123,126,129,134,135,142,145],reason:'Remove repeated design guidance and rationale; retain distinct personalities, prop, two room states, localized edit, comparison, speaker assignments and speech review.'},
 {cues:[156],reason:'Remove summary repeating the immediately preceding anatomy and environment review.'},
 {cues:[162,170],reason:'Remove repeated detail and saving advice; retain clay materials, all references, action stages and texture review.'},
 {cues:[174,176],reason:'Remove recap points already taught; preserve seven-style recap, next step and closing.'}
];
const removed=groups.flatMap(g=>g.cues.map(id=>({...cues.find(c=>c.cue===id)!,reason:g.reason}))).sort((a,b)=>a.start-b.start);
// Cue boundaries are complete clauses or sentences. Keep 200 ms native pauses;
// never cut a word, time-stretch the delivery, or regenerate the paid A-roll.
const gaps=[{raw:221.117,start:190.2333,end:204.31,seconds:350/30},{raw:375.468,start:304.5,end:326.64,seconds:19},{raw:436.159,start:377.5,end:399.2,seconds:14},{raw:489.956,start:437.5,end:459.4,seconds:14},{raw:638.828,start:556.25,end:577.96,seconds:21.71},{raw:699.635,start:623.5,end:645.88,seconds:14},{raw:757.13,start:689.5,end:721.48,seconds:29.75}];
const f=(s:number)=>Math.round(s*30),removedSeconds=removed.reduce((n,r)=>n+(f(r.end)-f(r.start))/30,0),duration=(f(801.367)-removed.reduce((n,r)=>n+f(r.end)-f(r.start),0)+594+gaps.reduce((n,g)=>n+f(g.seconds),0))/30;
await atomicJson(path.join(dir,'Editorial runtime choices.json'),{instruction:'runtime should be similar to original source video how is it 16:17 thats way too long',supersedes:'Earlier natural longer-runtime answer',target:751,expectedDuration:duration,rate:1,openingGap:19.8,gaps,removed,retainedTutorialContent:['All seven styles in source order','Image settings, multiple character views and expression sheet','Empty setting, ordered attachments and short action direction','World-first watercolor, second character and prop sheet','Vintage and paper materials, setup/reaction/payoff','Distinct dialogue speakers, prop continuity and localized room-state change','Anime action continuity and clay setup/payoff'],paidRegenerations:0,qa:'Cuts require audiovisual seam inspection before completion'});
console.log(JSON.stringify({removedCues:removed.length,removedSeconds,duration,sourceDifference:duration-751}));
