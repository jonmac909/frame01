import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {projectDir,atomicJson} from '../src/core.js';
import {sourceShots,sourceCameraShots} from '../video/source-shots.js';
import type {FullPlan,FullShot,Pose} from '../video/full-types.js';
const id='nano-banana-cartoon-workflow-28043a87',dir=projectDir(id),f=(s:number)=>Math.round(s*30);
const choices=JSON.parse(await fs.readFile(path.join(dir,'Editorial runtime choices.json'),'utf8'));
const gaps=choices.gaps as {raw:number;start:number;end:number;seconds:number}[];
const removed=(choices.removed as {start:number;end:number}[]).map(r=>({a:f(r.start),b:f(r.end)}));
const walkthrough=JSON.parse(await fs.readFile(path.join(dir,'Walkthrough insert manifest.json'),'utf8'))as {key:string;duration:number}[];
const edited=(n:number)=>n-removed.reduce((sum,r)=>sum+Math.max(0,Math.min(n,r.b)-r.a),0);
const openingGap=594;
const rawFrame=(raw:number,source:number)=>edited(f(raw))+openingGap+gaps.filter(g=>source>=g.end-1e-6).reduce((n,g)=>n+f(g.seconds),0);
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
const knots:[number,number][]=[[0,0],[4.6,266],[24.4,860],[29.7,rawFrame(21.496,29.7)],[33.5667,rawFrame(23.8,33.5667)],[37,rawFrame(25.09,37)],[40.7667,rawFrame(32.983,40.7667)],[44.1333,rawFrame(49.264,44.1333)],[45.7333,rawFrame(50.86,45.7333)],[53.3333,rawFrame(54,53.3333)],...semantic.map(([s,r]):[number,number]=>[s,rawFrame(r,s)])];
for(let i=1;i<knots.length;i++)assert(knots[i][0]>knots[i-1][0]&&knots[i][1]>=knots[i-1][1],`Nonmonotonic semantic anchor ${i}`);
function at(s:number){let i=knots.findIndex(k=>k[0]>=s);if(i<0)return knots.at(-1)![1];if(i===0)return knots[0][1];const [a,b]=[knots[i-1],knots[i]];return Math.round(a[1]+(s-a[0])/(b[0]-a[0])*(b[1]-a[1]));}
const frames=at(751),speech:FullPlan['speech']=[];
let cursor=0;
function talk(a:number,b:number){let start=f(a),end=f(b);for(const r of removed.filter(r=>r.b>start&&r.a<end)){if(r.a>start){const n=r.a-start;speech.push({from:cursor,to:cursor+n,trim:start});cursor+=n}start=Math.max(start,r.b)}if(start<end){const n=end-start;speech.push({from:cursor,to:cursor+n,trim:start});cursor+=n}}
talk(0,3.383);talk(12.122,17.619);assert.equal(cursor,266);cursor+=openingGap;talk(3.383,12.122);
let raw=17.619;for(const g of gaps){talk(raw,g.raw);cursor+=f(g.seconds);raw=g.raw}talk(raw,801.367);assert.equal(cursor,frames);
const sorted=[...speech.map(s=>[s.trim,s.trim+s.to-s.from]),...removed.map(r=>[r.a,r.b])].sort((a,b)=>a[0]-b[0]);let coverage=0;for(const [a,b]of sorted){assert.equal(a,coverage,'Unaccounted speech removal or duplicate');coverage=b}assert.equal(coverage,f(801.367));
const cameraProof:any[]=[];
function retime(poses:Pose[],length:number,key:string){
 const sourceFrames=poses.length;
 if(length<sourceFrames){cameraProof.push({key,sourceFrames,outputFrames:length,method:'sample full measured path into shorter editorial shot'});return Array.from({length},(_,i)=>({...poses[Math.round(i*(sourceFrames-1)/Math.max(1,length-1))],frame:i}));}
 const stable=poses.map((p,i)=>i===0?1:Math.abs(p.scale-poses[i-1].scale)+Math.abs(p.x-poses[i-1].x)+Math.abs(p.y-poses[i-1].y)<.0015?1:0);
 const count=stable.reduce((a,b)=>a+b,0)||1;let accumulator=0,output:Pose[]=[];
 for(let i=0;i<sourceFrames;i++){output.push({...poses[i],frame:output.length});accumulator+=(length-sourceFrames)*stable[i]/count;while(accumulator>=1-.000001&&output.length<length){output.push({...poses[i],frame:output.length});accumulator-=1;}}
 while(output.length<length)output.push({...poses.at(-1)!,frame:output.length});
 cameraProof.push({key,sourceFrames,outputFrames:length,method:'preserve movement speed; insert extra hold frames at stable poses'});return output;
}
const sound:FullPlan['sound']=[];
const demos:Record<string,{end:number;clips:[string,number,number,number?,string?][]}>={
 '3d-badger-scene-motion':{end:210,clips:[['3d-badger-scene-motion',6.5,0],['badger-pie-reaction',6.8,.3,1.35,'50% 45%'],['3d-badger-scene-motion',4,4,1.1],['badger-pie-reaction',6.5,2,1.65,'50% 45%']]},
 'watercolor-village-motion':{end:342.7333,clips:[['watercolor-village-motion',3,0],['watercolor-journey',6,0],['watercolor-journey',5,4,1.35,'45% 55%'],['watercolor-reunion',6.5,0],['watercolor-reunion',5,4,1.4,'50% 55%'],['watercolor-village-motion',5,0],['watercolor-journey',5,3],['watercolor-reunion',6,3]]},
 'rubber-hose-magic-motion':{end:404,clips:[['rubber-hose-magic-motion',4,0],['rubber-magic-surprise',7,0],['rubber-magic-surprise',3,6,1.45,'55% 50%'],['rubber-magic-payoff',8,0],['rubber-magic-payoff',4,5,1.4],['rubber-magic-surprise',5,2],['rubber-magic-payoff',6,3]]},
 'paper-underwater-motion':{end:465.25,clips:[['paper-underwater-motion',4,0],['paper-underwater-reveal',7,0],['paper-underwater-reaction',7,0],['paper-underwater-reaction',4,5,1.5,'55% 50%'],['paper-underwater-motion',5,1],['paper-underwater-reveal',6,3],['paper-underwater-reaction',6,3]]},
 'nineties-dialogue-motion':{end:596.7333,clips:[['nineties-hatch-action',1.5,0],['opening-dialogue-first-timed',9.96,0,1.35,'40% 50%'],['opening-dialogue-second-clean',9.96,0,1.4,'65% 50%'],['nineties-dialogue-motion',3,4,1.6,'50% 60%'],['nineties-exit-action',8,0],['nineties-hatch-action',4,4],['opening-dialogue-first-timed',9.96,0],['opening-dialogue-second-clean',9.96,0],['nineties-exit-action',6,3]]},
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
    if(style){if(['character-prompt','watercolor-prompt'].includes(asset))asset=`${style}-image-prompt-v2`;else if(['animation-prompt','dialogue-prompt'].includes(asset))asset=`${style}-video-prompt-v2`;else if(asset==='video-references'&&style!=='watercolor'&&style!=='nineties')asset='video-output';}
    if(style==='nineties'&&s.start>=522&&s.start<542.5)asset='nineties-room-edit-v2';
    if(['model-selector','image-output','video-output','video-references'].includes(asset))asset+='-v3';
    shot.asset=`recordings/shots/${asset}.mp4`;const duration=walkthrough.find(w=>w.key===asset)?.duration??({['model-selector']:15,['image-output']:9,['character-prompt']:10,['expression-prompt']:18,['kitchen-prompt']:18,['video-references']:8,['video-output']:10,['animation-prompt']:40,['watercolor-prompt']:8,['dialogue-prompt']:32}as Record<string,number>)[asset];
    assert(duration>0,`Unknown screen duration ${asset}`);
    shot.parts=[];for(let n=0;n<shot.to-shot.from;n+=f(duration)){shot.parts.push({from:n,to:Math.min(shot.to-shot.from,n+f(duration)),asset:shot.asset,trim:0})}
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
      if(key.startsWith('opening-')&&gaps.some(g=>shot.from+pos>=at(g.start)&&shot.from+pos+n<=at(g.end)))sound.push({from:shot.from+pos,to:shot.from+pos+n,asset,trim:f(trim),gain:.7});
      pos+=n;index++;
    }
   }
 }
 shots.push(shot);
}
const names=['Opening','3D cartoon','Watercolor','Rubber hose','Paper cutouts','Nineties dialogue','Anime','Clay animation','Wrap-up'];
const boundaries=[0,55,210,342.7333,404,465.25,598,652,732.7333,751];
const plan:FullPlan={fps:30,frames,baseUrl:`http://127.0.0.1:4317/media/${id}`,aroll:'assets/sienna-shop-drop-1x-2388109a9b1f485794191d8042820f0d.mp4',whoosh:'assets/pack-266499c7cc095eec-Whoosh_1.mp3',shots,speech,sound,sfx:shots.filter(s=>['image','screen','screen-still','intro','montage','logo'].includes(s.kind)).map(s=>s.from),sections:names.map((name,i)=>({name,from:at(boundaries[i]),to:at(boundaries[i+1]),sourceFrom:boundaries[i],sourceTo:boundaries[i+1]})),limitations:['Latest human correction requires a runtime similar to the source; 40 complete redundant caption cues removed at native speech rate. Full original paid narration preserved.','Source shot order and semantic cue anchors authored from visual review; native cut-refinement comparisons still pending.','Later styles reuse real generic output controls where existing recordings do not contain their specific prompts. No interface or account results fabricated.','All local illustration and motion assets are Qwen Image 2.1 / LTX 2.5 examples, not OpenArt generation evidence.','Full render, audiovisual QA, source comparison, deployment and full-video human approval remain pending.']};
assert.equal(shots[0].from,0);assert.equal(shots.at(-1)!.to,frames);for(let i=1;i<shots.length;i++)assert.equal(shots[i].from,shots[i-1].to);
await atomicJson(path.join(dir,'Source-runtime remake plan.json'),plan);
await atomicJson(path.join(dir,'Source-runtime timing proof.json'),{frames,duration:frames/30,narrationFrames:speech.reduce((n,s)=>n+s.to-s.from,0),narrationRate:1,cueCoverage:'Kept native speech plus explicitly documented removed complete cues partition the original recording exactly once. First complete cues reordered around teaser.',openingGap:openingGap/30,gaps,removed,knots,cameraProof,userChoices:{runtime:choices.instruction,walkthrough:'Use only existing recordings'},approved:false});
console.log(JSON.stringify({frames,duration:frames/30,shots:shots.length,sections:plan.sections.map(s=>({name:s.name,seconds:(s.to-s.from)/30})),sound:sound.length}));
