import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {projectDir,atomicJson} from '../src/core.js';
import {sourceShots,sourceCameraShots} from '../video/source-shots.js';
import type {FullPlan,FullShot,Pose} from '../video/full-types.js';
const id='nano-banana-cartoon-workflow-28043a87',dir=projectDir(id),f=(s:number)=>Math.round(s*30);
const choices=JSON.parse(await fs.readFile(path.join(dir,'Editorial runtime choices.json'),'utf8'));
const pace=JSON.parse(await fs.readFile(path.join(dir,'Complete narration pace map.json'),'utf8'))as {file:string;frames:number;pieces:{sourceFrom:number;sourceTo:number;from:number;to:number;rate:number}[];openingAcousticBoundaries:Record<string,number>;demoAcousticBoundaries:number[]};
const pf=(s:number)=>{const q=pace.pieces.find(q=>s<q.sourceTo-.00001)??pace.pieces.at(-1)!;return Math.min(pace.frames,Math.round(q.from+(s-q.sourceFrom)/q.rate*30));};
const gaps=(choices.gaps as {raw:number;start:number;end:number;seconds:number}[]).map((g,i)=>({...g,raw:pace.demoAcousticBoundaries[i],seconds:g.end-g.start}));
const removed:{a:number;b:number}[]=[];
const walkthrough=[...JSON.parse(await fs.readFile(path.join(dir,'Walkthrough insert manifest.json'),'utf8')),...JSON.parse(await fs.readFile(path.join(dir,'Active walkthrough repair manifest.json'),'utf8'))]as {key:string;duration:number}[];
const first=pace.openingAcousticBoundaries['anchor-first-sentence'],beforeStart=pace.openingAcousticBoundaries['anchor-before-start'],beforeEnd=pace.openingAcousticBoundaries['anchor-before-end'];
const preVoiceFrames=pf(first)+pf(beforeEnd)-pf(beforeStart),openingGap=f(24.4)-preVoiceFrames;
assert(preVoiceFrames<=f(4.6)+18+45,'Opening narration must finish before the existing dialogue begins.');
const rawFrame=(raw:number,source:number)=>pf(raw)+openingGap+gaps.filter(g=>source>=g.end-1e-6).reduce((n,g)=>n+f(g.seconds),0);
// Explicit semantic anchors: source visual moments -> exported narration cue starts.
// Duplicate raw anchors delimit genuine demonstration gaps, not slowed speech.
const semantic:[number,number][]=[
 [55,56.03],[62.25,73.536],[74.4,92.37],[85,110.511],[100.7667,139.234],[118.4667,151.7],[133.2,164.883],[151.2667,181.93],[172,203.459],
 [190.2333,221.117],[204.31,221.117],[210,238.347],[222,252.211],[237.7333,272.065],[258.7333,293.822],[264.7333,313.879],[283.2667,338.254],[295.5,362.166],
 [304.5,375.468],[326.64,375.468],[342.7333,392.867],[360.5,408.049],[371.7333,421.479],[377.5,436.159],[399.2,436.159],[404,448.229],
 [420.5,461.813],[426.7333,475.486],[437.5,489.956],[459.4,489.956],[465.25,503.562],[486.25,520.982],[508.5,542.109],[522,560.578],[530.7333,576.058],[542.5,596.142],[547.25,615.893],
 [556.25,638.828],[577.96,638.828],[596.7333,654.931],[598,668.324],[603.2333,680.641],[617.2333,698],[623.5,699.635],[645.88,699.635],[652,714.523],
 [659.7333,726.84],[674.4667,740.772],[683.2333,754.971],[689.5,757.13],[721.48,757.13],[732.7333,776.437],[735,778.5],[740.5,785.5],[751,801.367]
];
for(const g of gaps)for(const k of semantic)if(Math.abs(k[0]-g.start)<.001||Math.abs(k[0]-g.end)<.001)k[1]=g.raw;
// Reference entry is one sentence, followed by prompt/speaker direction.
semantic.find(k=>k[0]===547.25)![1]=604.883;semantic.push([546,601.48]);semantic.sort((a,b)=>a[0]-b[0]);
const knots:[number,number][]=[[0,0],[4.6,f(4.6)],[24.4,f(24.4)],[29.7,rawFrame(21.496,29.7)],[33.5667,rawFrame(23.8,33.5667)],[37,rawFrame(25.09,37)],[40.7667,rawFrame(32.983,40.7667)],[44.1333,rawFrame(49.264,44.1333)],[45.7333,rawFrame(50.86,45.7333)],[53.3333,rawFrame(54,53.3333)],...semantic.map(([s,r]):[number,number]=>[s,rawFrame(r,s)])];
for(let i=1;i<knots.length;i++)assert(knots[i][0]>knots[i-1][0]&&knots[i][1]>=knots[i-1][1],`Nonmonotonic semantic anchor ${i}`);
function at(s:number){let i=knots.findIndex(k=>k[0]>=s);if(i<0)return knots.at(-1)![1];if(i===0)return knots[0][1];const [a,b]=[knots[i-1],knots[i]];return Math.round(a[1]+(s-a[0])/(b[0]-a[0])*(b[1]-a[1]));}
const frames=at(751),speech:FullPlan['speech']=[];
let cursor=0;
function talk(a:number,b:number){const start=pf(a),end=pf(b),n=end-start;assert(n>=0);if(n){speech.push({from:cursor,to:cursor+n,trim:start});cursor+=n}}
// Provider cue 1 ends inside “workflow”. The actual quiet gap is 3.88–4.44s.
// Keep that whole word before the teaser; the remaining opening ends at the
// same frame, with a short silent presenter hold after the teaser.
talk(0,first);talk(beforeStart,beforeEnd);assert.equal(cursor,preVoiceFrames);cursor=f(24.4);talk(first,beforeStart);
let raw=beforeEnd;for(const g of gaps){talk(raw,g.raw);cursor+=f(g.seconds);raw=g.raw}talk(raw,801.367);assert.equal(cursor,frames);assert(frames/30>=721&&frames/30<=781,'Runtime must respect the latest ±30-second allowance.');
const sorted=speech.map(s=>[s.trim,s.trim+s.to-s.from]).sort((a,b)=>a[0]-b[0]);let coverage=0;for(const [a,b]of sorted){assert.equal(a,coverage,'Missing or duplicated original narration');coverage=b}assert.equal(coverage,pace.frames);
const cameraProof:any[]=[];
function retime(poses:Pose[],length:number,key:string){
 const sourceFrames=poses.length;
 if(length<sourceFrames){cameraProof.push({key,sourceFrames,outputFrames:length,method:'sample full measured path into shorter editorial shot'});return Array.from({length},(_,i)=>({...poses[Math.round(i*(sourceFrames-1)/Math.max(1,length-1))],frame:i}));}
 const output:Pose[]=poses.map((p,i)=>({...p,frame:i}));
 while(output.length<length)output.push({...poses.at(-1)!,frame:output.length});
 cameraProof.push({key,sourceFrames,outputFrames:length,method:'preserve the complete measured movement at its native speed, then hold the final pose'});return output;
}
const sound:FullPlan['sound']=[];
const demos:Record<string,{end:number;clips:[string,number,number,number?,string?][]}>={
 '3d-badger-scene-motion':{end:210,clips:[['3d-badger-scene-motion',6.5,0],['badger-pie-reaction',6.8,.3,1.35,'50% 45%'],['3d-badger-scene-motion',4,4,1.1],['badger-pie-reaction',6.5,2,1.65,'50% 45%']]},
 'watercolor-village-motion':{end:342.7333,clips:[['watercolor-village-motion',3,0],['watercolor-journey',6,0],['watercolor-journey',5,4,1.35,'45% 55%'],['watercolor-reunion',6.5,0],['watercolor-reunion',5,4,1.4,'50% 55%'],['watercolor-village-motion',5,0],['watercolor-journey',5,3],['watercolor-reunion',6,3]]},
 'rubber-hose-magic-motion':{end:404,clips:[['rubber-hose-magic-motion',4,0],['rubber-magic-surprise',7,0],['rubber-magic-surprise',3,6,1.45,'55% 50%'],['rubber-magic-payoff',8,0],['rubber-magic-payoff',4,5,1.4],['rubber-magic-surprise',5,2],['rubber-magic-payoff',6,3]]},
 'paper-underwater-motion':{end:465.25,clips:[['paper-underwater-motion',4,0],['paper-underwater-reveal',7,0],['paper-underwater-reaction',7,0],['paper-underwater-reaction',4,5,1.5,'55% 50%'],['paper-underwater-motion',5,1],['paper-underwater-reveal',6,3],['paper-underwater-reaction',6,3]]},
 'nineties-dialogue-motion':{end:596.7333,clips:[['opening-dialogue-first-timed',9.96,0,1.35,'40% 50%'],['opening-dialogue-second-clean',7,0,1.4,'65% 50%'],['nineties-hatch-action',7.5,1.5],['nineties-exit-action',8,0],['nineties-hatch-action',4,4],['nineties-exit-action',8,1]]},
 'anime-bridge-motion':{end:652,clips:[['anime-bridge-motion',4,0],['anime-bridge-leap',7,0],['anime-bridge-leap',3,6,1.5,'50% 40%'],['anime-bridge-landing',7,0],['anime-bridge-motion',4,3],['anime-bridge-leap',5,4],['anime-bridge-landing',6,3]]},
 'clay-kite-motion':{end:732.7333,clips:[['clay-kite-motion',4,0],['clay-kite-mishap',7,0],['clay-kite-mishap',3,6,1.4,'55% 55%'],['clay-kite-rescue',8,0],['clay-kite-payoff',8,0],['clay-kite-motion',4,4],['clay-kite-mishap',5,3],['clay-kite-rescue',6,3],['clay-kite-payoff',6,3]]}
};
const shots:FullShot[]=[];
for(const [i,s]of sourceShots.entries()){
 const shot:FullShot={id:`source-${i+1}`,from:at(s.start),to:at(s.end),sourceStart:f(s.start),sourceEnd:f(s.end),kind:s.kind,note:s.note};
 if(shot.to<=shot.from)continue;
 if(s.kind==='image'){
   const corrected=['watercolor-fox-sheet','paper-octopus-sheet','rubber-hat-sheet','rubber-empty-stage','clay-empty-hill'].includes(s.asset!)?s.asset+'-corrected':s.asset;
   shot.asset=`assets/local-${corrected}.png`;shot.card=s.asset!=='anime-empty-bridge';
   const track=sourceCameraShots.find(c=>Math.abs(c.start-s.start)<.04);
   const camera=track?JSON.parse(await fs.readFile(path.join(dir,'reference/cameras',track.key+'.poses.json'),'utf8')):s.start===84.9667?JSON.parse(await fs.readFile(path.join(dir,'reference/character-sheet-camera.json'),'utf8')):undefined;
   if(camera)shot.camera=retime(camera,shot.to-shot.from,track?.key??'approved-badger-sheet');
 }else if(s.kind==='screen'){
   if(s.asset==='home'){shot.asset='assets/openart-home-capture.jpg';shot.kind='screen-still';}
   else{let asset=s.asset!;const style=s.start<210?undefined:s.start<342.7333?'watercolor':s.start<404?'rubber':s.start<465.25?'paper':s.start<598?'nineties':s.start<652?'anime':'clay';
    if(style){if(['character-prompt','watercolor-prompt'].includes(asset))asset=`${style}-image-prompt-v2`;else if(['animation-prompt','dialogue-prompt'].includes(asset))asset=`${style}-video-prompt-v2`;}
    if(style==='nineties'&&s.start>=522&&s.start<542.5)asset='nineties-room-edit-v2';
    if(asset==='model-selector')asset='model-and-output-v4';else if(asset==='image-output')asset='image-output-v3';else if(asset==='video-output')asset='video-output-active-v4';else if(asset==='video-references')asset=style==='nineties'?'reference-upload-v4':'reference-entry-v4';
    if(s.note?.includes('audio setting'))asset='audio-control-v4';
    shot.asset=`recordings/shots/${asset}.mp4`;const duration=walkthrough.find(w=>w.key===asset)?.duration??({['model-selector']:15,['image-output']:9,['character-prompt']:10,['expression-prompt']:18,['kitchen-prompt']:18,['video-references']:8,['video-output']:10,['animation-prompt']:40,['watercolor-prompt']:8,['dialogue-prompt']:32}as Record<string,number>)[asset];
    assert(duration>0,`Unknown screen duration ${asset}`);
    shot.parts=[{from:0,to:Math.min(shot.to-shot.from,f(duration)),asset:shot.asset,trim:0}];
    const length=shot.parts[0].to;shot.camera=[{frame:0,x:0,y:0,scale:1},{frame:Math.max(1,length-1),x:-.025,y:-.012,scale:1.05}];
   }
 }else if(s.kind==='example'){
   if(s.asset==='opening-dialogue')shot.kind='teaser';
   else{
    const demo=demos[s.asset!],isResult=demo&&Math.abs(demo.end-s.end)<.1;
    let clips=isResult?demo.clips:[[s.asset!,Math.min(9.5,(shot.to-shot.from)/30),0]as [string,number,number]];
    if(s.note?.includes('hatch action insert'))clips=[['nineties-hatch-action',9.5,0]];
    shot.card=s.start===29.7;shot.parts=[];let pos=0,index=0;
    while(pos<shot.to-shot.from){const [key,seconds,trim,scale,origin]=clips[index%clips.length];const n=Math.min(f(seconds),shot.to-shot.from-pos);const asset=key.startsWith('opening-')?`assets/${key}.mp4`:`assets/local-${key}.mp4`;shot.parts.push({from:pos,to:pos+n,asset,trim:f(trim),scale,origin});
      // Only play dialogue in actual narration gaps. Repeat review footage stays muted.
      if(key.startsWith('opening-')&&s.asset!=='nineties-dialogue-motion'&&gaps.some(g=>shot.from+pos>=at(g.start)&&shot.from+pos+n<=at(g.end)))sound.push({from:shot.from+pos,to:shot.from+pos+n,asset,trim:f(trim),gain:.7});
      pos+=n;index++;
    }
    if(isResult&&s.asset==='nineties-dialogue-motion'){
      sound.push({from:shot.from,to:shot.from+299,asset:'assets/opening-dialogue-first-timed.mp4',trim:0,gain:.7},{from:shot.from+299,to:shot.from+598,asset:'assets/local-opening-dialogue-second.mp4',trim:0,gain:.7});
    }else if(isResult){const gap=gaps.find(g=>Math.abs(g.start-s.start)<.05);assert(gap,'A demo sound bed requires its measured narration gap.');sound.push({from:shot.from,to:Math.min(shot.to,at(gap.end)),asset:`assets/complete-bed-${s.asset}.wav`,trim:0,gain:1});}
   }
 }
 if(shot.kind==='screen'&&shot.parts&&shot.parts[0].to<shot.to-shot.from){const end=shot.to,split=shot.from+shot.parts[0].to;shot.to=split;shots.push(shot,{id:shot.id+'-explanation',from:split,to:end,sourceStart:shot.sourceStart,sourceEnd:shot.sourceEnd,kind:'presenter',note:'Complete spoken explanation returns to presenter instead of looping an unrelated static menu.'});}
 else shots.push(shot);
}
const names=['Opening','3D cartoon','Watercolor','Rubber hose','Paper cutouts','Nineties dialogue','Anime','Clay animation','Wrap-up'];
const boundaries=[0,55,210,342.7333,404,465.25,598,652,732.7333,751];
const plan:FullPlan={fps:30,frames,baseUrl:`http://127.0.0.1:4317/media/${id}`,aroll:pace.file,whoosh:'assets/pack-266499c7cc095eec-Whoosh_1.mp3',shots,speech,sound,sfx:shots.filter(s=>['image','screen','screen-still','intro','montage','logo'].includes(s.kind)).map(s=>s.from),sections:names.map((name,i)=>({name,from:at(boundaries[i]),to:at(boundaries[i+1]),sourceFrom:boundaries[i],sourceTo:boundaries[i+1]})),limitations:['Complete original narration retained once, with section-specific pitch-preserving pace matched to measured source cadence. Latest user runtime allowance is721–781 seconds.','The existing source-derived visual map, original artwork and real UI footage remain; longer spoken explanations return to the presenter instead of looping menus.','Reference-upload footage shows five files loading and one observed selected artwork; it does not prove five final attachments or OpenArt generation.','All new illustration/motion assets are local Qwen/LTX examples. Existing nonverbal demo sound is restored; no source narration is borrowed.','Full corrected render, final speech/audio/presenter checks, source comparison and owner creative approval remain pending.']};
assert.equal(shots[0].from,0);assert.equal(shots.at(-1)!.to,frames);for(let i=1;i<shots.length;i++)assert.equal(shots[i].from,shots[i-1].to);
for(const layer of sound)assert(!speech.some(c=>Math.min(c.to,layer.to)>Math.max(c.from,layer.from)),'Demonstration sound must stay inside a narration gap.');
await atomicJson(path.join(dir,'Complete narration repair plan.json'),plan);
await atomicJson(path.join(dir,'Complete narration timing proof.json'),{frames,duration:frames/30,narrationFrames:speech.reduce((n,s)=>n+s.to-s.from,0),originalNarrationRetained:true,removedCues:0,paceMap:'Complete narration pace map.json',cueCoverage:'All paced source frames partitioned exactly once, with acoustic pauses for opening rearrangement and seven demo inserts.',openingGap:openingGap/30,openingNarrationEnd:preVoiceFrames/30,gaps,removed,knots,cameraProof,userChoices:{runtime:'Source ±30seconds; speaking pace may match source; restore complete narration.'},approved:false});
console.log(JSON.stringify({frames,duration:frames/30,shots:shots.length,sections:plan.sections.map(s=>({name:s.name,seconds:(s.to-s.from)/30})),sound:sound.length}));
