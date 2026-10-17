// First-remake edit recipe. No provider calls or paid actions occur here.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {readProject,projectDir,probe,hash,validateTimeline,timelineSchema,atomicJson,mutate,event,type Timeline} from '../src/core.js';
import {importLibrary} from '../src/library.js';
const id='nano-banana-cartoon-workflow-28043a87',dir=projectDir(id),p=await readProject(id);
throw new Error('This paragraph-weighted recipe was rejected for failing to match the reference. Replace it with the reviewed source shot map before full assembly. The corrected visual sample is scripts/render-source-match.ts.');
const alignment=JSON.parse(await fs.readFile(path.join(dir,'A-roll alignment.json'),'utf8'));
const timing=JSON.parse(await fs.readFile(path.join(dir,'Reference timing.json'),'utf8'));
assert.equal(alignment.scriptHash,hash(p.script),'Narration changed after alignment');
assert.equal(p.heygen.acceptedTestVoiceSpeed,1.5,'The current test uses only the user-accepted existing render');
assert.ok(p.heygen.asset);const aroll=p.heygen.asset;
type Cue={start:number;end:number;text:string};
const cues: Cue[]=alignment.captions;
const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const byOffset=new Map<number,Cue>();let offset=0;
for(const cue of cues){byOffset.set(offset,cue);offset+=norm(cue.text).length}
assert.equal(norm(cues.map(c=>c.text).join('')),norm(p.script));
const paragraphs:{section:number;index:number;text:string;start:number;end:number}[]=[];offset=0;
for(const [section,s] of timing.sections.entries())for(const [index,text] of (s.text as string).split(/\n\s*\n/).entries()){
  const cue=byOffset.get(offset);assert.ok(cue,`Paragraph ${section}/${index} has no exact exported cue boundary`);
  paragraphs.push({section,index,text,start:cue.start,end:0});offset+=norm(text).length;
}
paragraphs.forEach((para,i)=>para.end=paragraphs[i+1]?.start??alignment.mediaDuration);
const styles=['3d-badger-scene','watercolor-village','rubber-hose-magic','paper-underwater','nineties-dialogue','anime-bridge','clay-kite'];
const sheets=['badger-character-sheet','watercolor-reference-sheet','rubber-reference-sheet','paper-reference-sheet','nineties-character-sheet','anime-reference-sheet','clay-reference-sheet'];
const labels=['3D CARTOON','WATERCOLOR','RUBBER HOSE','PAPER CUTOUT','NINETIES CARTOON','ANIME','CLAYMATION'];
const image=(s:string)=>`assets/local-${s}.png`,motion=(s:string)=>`assets/local-${s}-motion.mp4`,screen=(s:string)=>`recordings/shots/${s}.mp4`;
const [font,whoosh,click]=await Promise.all([importLibrary(id,'c7c1be029d996982'),importLibrary(id,'266499c7cc095eec'),importLibrary(id,'67baef9d7cade129')]);
const required=[...styles.map(image),...styles.map(motion),...sheets.map(image),...['badger-expression-sheet','badger-empty-kitchen','nineties-room-closed','nineties-room-open'].map(image)];
const missing=[];for(const file of required)try{await fs.access(path.join(dir,file))}catch{missing.push(file)}
if(missing.length)throw new Error('Required visual assets are not ready: '+missing.join(', '));
const durations=new Map<string,number>();
for(const s of styles)durations.set(motion(s),(await probe(path.join(dir,motion(s)))).duration);
for(const s of ['model-selector','image-output','character-prompt','expression-prompt','kitchen-prompt','video-references','video-output','animation-prompt','watercolor-prompt','dialogue-prompt'])durations.set(screen(s),(await probe(path.join(dir,screen(s)))).duration);
const timeline:Timeline=timelineSchema.parse({title:'Seven AI Cartoon Styles — Sienna',accent:'#20c9ef',font:font.file,clips:[{id:'placeholder',asset:aroll,start:0,duration:1,kind:'aroll'}],audio:[],overlays:[],graphics:[],captions:[]});timeline.clips=[];
let serial=0;const uid=(prefix:string)=>`${prefix}-${++serial}`;
const q=(n:number)=>Math.round(n*30)/30;
function graphic(start:number,duration:number,text:string,kind:Timeline['graphics'][number]['kind']){if(duration>.05)timeline.graphics.push({start:q(start),duration:q(start+duration)-q(start),text,kind})}
function sound(start:number,file:string,duration:number,volume:number){timeline.audio.push({id:uid('sfx'),asset:file,start:q(start),duration:q(duration),trim:0,volume,fade:.04})}
function visual(start:number,end:number,asset:string,kind:Timeline['clips'][number]['kind'],trim=0,insetSource?:number,entrance:Timeline['clips'][number]['entrance']='none'){
  const duration=q(end)-q(start);if(duration<=0)return;
  timeline.clips.push({id:uid(kind),asset,kind,start:q(start),duration,trim,muted:true,layout:kind==='aroll'||kind==='broll'?'full':'card',entrance});
  if(insetSource!==undefined&&kind!=='aroll')timeline.overlays.push({id:uid('sienna-inset'),asset:aroll,start:q(start),duration,trim:insetSource,blend:'normal',opacity:1,layout:'circle'});
  if(kind==='image'||kind==='broll')graphic(start,Math.min(duration,4),kind==='image'?'Local reference · Qwen Image 2.1':'Local animation · LTX 2.5','credit');
  if(kind==='screen')graphic(start,Math.min(duration,3),'OpenArt · recorded interface','credit');
}
const speechSpans:{sourceStart:number;sourceEnd:number;targetStart:number;section:number}[]=[];
const gaps:{start:number;end:number;section:number}[]=[];
const paragraph=(s:number,i:number)=>paragraphs.find(p=>p.section===s&&p.index===i)!;
const afterFirstCue=(time:number)=>cues.find(c=>c.start===time)!.end;
const breaks=[11.753,147.355,250.430,afterFirstCue(289.625),326.829,afterFirstCue(424.750),afterFirstCue(466.626),afterFirstCue(504.854),alignment.mediaDuration];
for(const [section,s] of alignment.sections.entries()){
  const cut=breaks[section],gap=s.gapSeconds;
  speechSpans.push({sourceStart:s.sourceStart,sourceEnd:cut,targetStart:s.targetStart,section});
  const gapStart=s.targetStart+cut-s.sourceStart;gaps.push({start:gapStart,end:gapStart+gap,section});
  if(cut<s.sourceEnd)speechSpans.push({sourceStart:cut,sourceEnd:s.sourceEnd,targetStart:gapStart+gap,section});
}
// Each narration sample is assigned once, in source order. No stretch or speed filter.
let covered=0;for(const span of speechSpans){assert.ok(Math.abs(span.sourceStart-covered)<.001);covered=span.sourceEnd;timeline.audio.push({id:uid('nelly'),asset:aroll,start:q(span.targetStart),duration:q(span.targetStart+span.sourceEnd-span.sourceStart)-q(span.targetStart),trim:span.sourceStart,volume:1,fade:0})}assert.equal(covered,alignment.mediaDuration);
type Choice={file:string;kind:'aroll'|'image'|'screen'|'broll';weight?:number};
const A:Choice={file:aroll,kind:'aroll'};const I=(s:string,w=1):Choice=>({file:image(s),kind:'image',weight:w});const S=(s:string,w=1):Choice=>({file:screen(s),kind:'screen',weight:w});const M=(s:string,w=1):Choice=>({file:motion(s),kind:'broll',weight:w});
const choices:Choice[][][]=[
  [[A],[I(styles[0]),I(styles[1]),I(styles[2]),I(styles[3]),I(styles[4]),I(styles[5]),I(styles[6])],[A,S('model-selector')]],
  [[A,I(styles[0])],[S('model-selector'),S('image-output')],[S('character-prompt'),I(sheets[0])],[I(sheets[0]),A],[I('badger-expression-sheet'),S('expression-prompt')],[I('badger-empty-kitchen'),S('kitchen-prompt')],[S('video-references'),S('video-output')],[S('animation-prompt'),A],[M(styles[0]),A]],
  [[A,I(styles[1])],[I(sheets[1])],[I(sheets[1]),A],[I(sheets[1])],[I(sheets[1]),A],[S('video-references'),S('watercolor-prompt')],[A,S('video-output')],[M(styles[1]),I(styles[1])]],
  [[A,M(styles[2])],[I(sheets[2])],[S('video-references'),I(sheets[2])],[A,M(styles[2])]],
  [[A,M(styles[3])],[I(sheets[3])],[S('video-output'),I(styles[3])],[M(styles[3]),A]],
  [[A,I(styles[4])],[I(sheets[4])],[I(sheets[4]),A],[I('nineties-room-closed')],[I('nineties-room-closed'),I('nineties-room-open')],[S('dialogue-prompt')],[S('dialogue-prompt'),A],[M(styles[4]),I('nineties-room-open')],[A]],
  [[A,I(sheets[5])],[I(styles[5]),S('video-output')],[M(styles[5]),A]],
  [[A,I(sheets[6])],[I(sheets[6]),I(styles[6])],[S('video-output'),I(styles[6])],[M(styles[6]),A]],
  [[A,I(styles[0]),I(styles[4]),A]],
];
for(const para of paragraphs){
  for(const span of speechSpans.filter(s=>s.section===para.section)){
    const from=Math.max(para.start,span.sourceStart),to=Math.min(para.end,span.sourceEnd);if(to<=from)continue;
    const list=choices[para.section][para.index];assert.ok(list,`Missing visual recipe ${para.section}/${para.index}`);
    const total=list.reduce((n,c)=>n+(c.weight??1),0);let cursor=from;
    for(const [i,c] of list.entries()){
      const end=i===list.length-1?to:cursor+(to-from)*(c.weight??1)/total;
      const target=span.targetStart+cursor-span.sourceStart;const available=durations.get(c.file)??Infinity;
      const used=Math.min(end-cursor,available-.04);
      visual(target,target+used,c.file,c.kind,c.kind==='aroll'?cursor:0,c.kind==='aroll'||c.kind==='broll'?undefined:cursor,c.kind==='image'?'rise':'none');
      if(used<end-cursor)visual(target+used,target+end-cursor,aroll,'aroll',cursor+used);
      cursor=end;
    }
  }
}
for(const gap of gaps){
  const duration=gap.end-gap.start;if(duration<.04)continue;
  if(gap.section===0){
    const file=motion(styles[4]),n=Math.min(duration,durations.get(file)!-.04);visual(gap.start,gap.start+n,file,'broll');sound(gap.start,file,n,.8);
    const unit=(duration-n)/styles.length;styles.forEach((s,i)=>visual(gap.start+n+i*unit,gap.start+n+(i+1)*unit,image(s),'image',0,undefined,'swipe'));
  }else if(gap.section===8){visual(gap.start,gap.end,image(styles[6]),'image')}
  else{
    const index=gap.section-1,file=motion(styles[index]),clipDuration=durations.get(file)!-.04;
    const first=Math.min(duration,clipDuration);visual(gap.start,gap.start+first,file,'broll');sound(gap.start,file,first,.8);
    const last=Math.min(duration-first,clipDuration),middle=duration-first-last;
    if(middle>.04){visual(gap.start+first,gap.start+first+middle,image(sheets[index]),'image',0,undefined,'rise');graphic(gap.start+first,middle,'CHECK THE REFERENCES','lower-third')}
    if(last>.04){const start=gap.end-last;visual(start,gap.end,file,'broll');sound(start,file,last,.8)}
  }
}
timeline.clips.sort((a,b)=>a.start-b.start);
for(const [i,s] of alignment.sections.entries())if(i>0&&i<8){graphic(s.targetStart+.3,3.5,`${String(i).padStart(2,'0')} / ${labels[i-1]}`,'lower-third');sound(s.targetStart+.2,whoosh.file,1.2,.12)}
for(const [section,index,text] of [[1,4,'A consistent character also needs clear expressions.'],[5,0,'Give every speaker a clear line and a distinct reaction.']] as const){const para=paragraph(section,index),span=speechSpans.find(s=>s.section===section&&para.start>=s.sourceStart&&para.start<s.sourceEnd)!;const start=span.targetStart+para.start-span.sourceStart;graphic(start,3.5,text,'center-text');sound(start,whoosh.file,1.2,.1)}
for(const c of timeline.clips.filter(c=>c.kind==='screen'))sound(c.start+.1,click.file,.433,.09);
// Keep captions as an optional sidecar. The reference uses sparse graphics,
// rather than a permanently displayed subtitle panel over its demonstrations.
const retimed=cues.flatMap(c=>speechSpans.filter(s=>c.end>s.sourceStart&&c.start<s.sourceEnd).map(s=>({start:s.targetStart+Math.max(c.start,s.sourceStart)-s.sourceStart,end:s.targetStart+Math.min(c.end,s.sourceEnd)-s.sourceStart,text:c.text})));
const stamp=(s:number)=>{const ms=Math.round(s*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`};
await fs.writeFile(path.join(dir,'Remake captions.srt'),retimed.map((c,i)=>`${i+1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n'));
const checked=await validateTimeline(id,timeline);
await atomicJson(path.join(dir,'Edit decision list.json'),{referenceDuration:751,sourceSpeechDuration:alignment.mediaDuration,speechSpans,gaps,paragraphs,timeline:checked,limitations:['Existing user-accepted 1.5x voice','Local illustrations and motion replace provider example outputs','Exact semantic frame match requires final audiovisual review']});
await mutate(id,p=>{p.timeline=checked;event(p,'timeline','Saved the complete 12:31 test edit: original narration order, exact cue boundaries, local examples, real OpenArt recordings and filmmaking-pack SFX. Final audiovisual review is still required.')});
console.log(JSON.stringify({duration:Math.max(...checked.clips.map(c=>c.start+c.duration)),clips:checked.clips.length,audio:checked.audio.length,overlays:checked.overlays.length,captions:retimed.length}));
