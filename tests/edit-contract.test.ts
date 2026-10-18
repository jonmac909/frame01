import test from 'node:test';
import assert from 'node:assert/strict';
import {compileEditContract,type EditContract,type PlanView} from '../src/edit-contract.js';
import {effectSchema,effectProgress} from '../video/effect-contract.js';
const sha='a'.repeat(64);
export function fixture(){
  const plan:PlanView={frames:120,shots:[{id:'host',from:0,to:60},{id:'example',from:60,to:120,asset:'demo.mp4',trim:0}],speech:[{from:0,to:60,trim:0}],sound:[{from:60,to:120,trim:0,asset:'demo.mp4',gain:.8}]};
  const contract:EditContract={version:1,fps:30,frames:120,planFile:'plan.json',planSha256:sha,runtime:{minFrames:120,maxFrames:120,reason:'Measured natural speech and demonstration.'},source:{file:'source.mp4',sha256:sha,frames:120,audio:true,scanFps:4,reviewedWindows:[{from:0,to:120}]},narration:{file:'voice.mp4',sha256:sha,frames:60,audio:true,textSha256:sha,words:[{id:'hello',text:'Hello',from:0,to:20},{id:'world',text:'world',from:30,to:55}],segments:plan.speech},assets:[{file:'demo.mp4',sha256:sha,frames:120,audio:true},{file:'hit.wav',sha256:sha,frames:30,audio:true}],events:[{id:'title',category:'title',source:{from:0,to:30},description:'One measured title',required:true,disposition:'implemented',target:{shotId:'host',anchor:{kind:'word',wordId:'world',edge:'start',offset:0},duration:20,effect:{kind:'word-reveal',version:1,text:'world',x:.5,y:.5,color:'#ffffff',fontSize:64},sound:{asset:'hit.wav',peakSample:8000,samples:20000,gain:.1}}},{id:'demo',category:'demo',source:{from:60,to:120},description:'Native demonstration',required:true,disposition:'implemented',target:{shotId:'example',anchor:{kind:'frame',frame:60},duration:60}}],demos:[{id:'result',shotId:'example',asset:'demo.mp4',from:60,to:120,trim:0,gain:.8,audio:'native'}]};return {plan,contract};
}
test('word timing drives visual frame and exact audible peak together',()=>{const {plan,contract}=fixture();const c=compileEditContract(contract,plan,'Hello world');assert.equal(c.effects[0].from,30);const s=c.audio.find(a=>a.id==='title')!;assert.equal(s.fromSample+8000-s.trimSample,30*1600);contract.narration.words[1].from=35;const moved=compileEditContract(contract,plan,'Hello world');assert.equal(moved.effects[0].from,35);assert.equal(moved.audio.find(a=>a.id==='title')!.fromSample,s.fromSample+5*1600)});
test('missing inventory, unresolved effects, incomplete narration and split words fail early',()=>{
  {const {plan,contract}=fixture();contract.source.reviewedWindows[0].to=119;assert.throws(()=>compileEditContract(contract,plan,'Hello world'),/Source inventory/)}
  {const {plan,contract}=fixture();contract.events[0].disposition='unresolved';assert.deepEqual(compileEditContract(contract,plan,'Hello world').unresolved,['title'])}
  {const {plan,contract}=fixture();contract.narration.segments=[{from:0,to:59,trim:1}];assert.throws(()=>compileEditContract(contract,plan,'Hello world'),/Narration coverage/)}
  {const {plan,contract}=fixture();plan.speech=[{from:0,to:10,trim:0},{from:10,to:60,trim:10}];contract.narration.segments=plan.speech;assert.throws(()=>compileEditContract(contract,plan,'Hello world'),/splits a word/)}
  {const {plan,contract}=fixture();assert.throws(()=>compileEditContract(contract,plan,'Hello changed world'),/complete narration/)}
});
test('example audio must use the actual visual asset, trim, gain and full duration',()=>{
  for(const mutation of [(p:PlanView)=>p.sound[0].trim=1,(p:PlanView)=>p.sound[0].asset='loop.wav',(p:PlanView)=>p.sound[0].to=119]){const {plan,contract}=fixture();mutation(plan);assert.throws(()=>compileEditContract(contract,plan,'Hello world'),/rendered audio differs/)}
  const {plan,contract}=fixture();contract.demos[0].audio='intentional-silence';assert.throws(()=>compileEditContract(contract,plan,'Hello world'),/needs a reason/);
});
test('bounded effects reject invented code and have pinned timing',()=>{assert.equal(effectSchema.safeParse({kind:'flash',version:1,color:'#ffffff',opacity:1,attackFrames:4}).success,false);const e=effectSchema.parse({kind:'flash',version:1,color:'#ffffff',opacity:.6,attackFrames:4});assert.deepEqual([0,4,12].map(f=>effectProgress(f,13,e).flash),[0,.6,0]);assert.equal(effectSchema.safeParse({...e,css:'alert(1)'}).success,false)});
