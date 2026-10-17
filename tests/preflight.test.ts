import test from 'node:test';
import assert from 'node:assert/strict';
import {fingerprint,validateScriptPlan,sourceBeats,checkExport,checkRuntime,checkReferenceStyle} from '../src/preflight.js';
import {directorInputSchema} from '../src/director-contract.js';
test('preflight refuses shortened, stale, or incomplete timing plans',()=>{
  const reference={duration:20,captions:[{start:0,end:10,text:'One two three four five.'},{start:10,end:20,text:'Six seven eight nine ten.'}]},script='One two three four five.\n\nSix seven eight nine ten.';
  const plan={targetDuration:20,sourceHash:fingerprint(JSON.stringify(reference.captions)),narrationHash:fingerprint(script),sections:[{start:0,end:10,sourceWords:5,text:'One two three four five.'},{start:10,end:20,sourceWords:5,text:'Six seven eight nine ten.'}]};
  assert.equal(validateScriptPlan(script,reference,plan).sections,2);
  assert.throws(()=>validateScriptPlan('Short replacement',reference,plan),/Narration changed/);
  assert.throws(()=>validateScriptPlan(script,{...reference,duration:30},plan),/runtime/);
  assert.throws(()=>validateScriptPlan(script,{...reference,captions:[]},plan),/Reference changed/);
  const gap=structuredClone(plan);gap.sections[1].start=11;assert.throws(()=>validateScriptPlan(script,reference,gap),/gaps/);
  const condensed=structuredClone(plan);condensed.sections[1].sourceWords=10;assert.throws(()=>validateScriptPlan(script,reference,condensed),/Source word budgets/);
  const nonfinite=structuredClone(plan);nonfinite.targetDuration=NaN;assert.throws(()=>validateScriptPlan(script,reference,nonfinite));
});

test('rolling captions contribute each word once and keep original timestamps',()=>{
  assert.deepEqual(sourceBeats([{start:0,end:3,text:'One two three'},{start:2,end:5,text:'two three four five'}]),[{start:0,end:3,text:'One two three'},{start:2,end:5,text:'four five'}]);
});
test('exports fail for silent audio, wrong dimensions, rate, or duration',()=>{
  const info={duration:751,video:true,audio:true,streams:[{codec_type:'video',width:1920,height:1080,avg_frame_rate:'30/1'}]};
  assert.doesNotThrow(()=>checkExport(info,751,-3));
  assert.throws(()=>checkExport({...info,audio:false},751,-3),/audio/);
  assert.throws(()=>checkExport(info,751,-Infinity),/silent/);
  assert.throws(()=>checkExport({...info,duration:700},751,-3),/duration/);
  assert.throws(()=>checkExport({...info,streams:[{...info.streams[0],width:1280}]},751,-3),/1920/);
  assert.throws(()=>checkExport({...info,streams:[{...info.streams[0],avg_frame_rate:'24/1'}]},751,-3),/30 fps/);
  assert.throws(()=>checkRuntime(750,751),/runtime/);
});
test('typed operations reject guessed fields and invented actions',()=>{
  assert.equal(directorInputSchema.safeParse({projectId:'example',operation:{name:'heygen.submit_video',args:{ref:'e123'}}}).success,true);
  assert.equal(directorInputSchema.safeParse({projectId:'example',operation:{name:'heygen.submit_video',args:{ref:'e123',force:true}}}).success,false);
  assert.equal(directorInputSchema.safeParse({projectId:'example',operation:{name:'heygen.retry',args:{}}}).success,false);
  assert.equal(directorInputSchema.safeParse({projectId:'example',operation:{name:'reference.read',args:{limit:10000}}}).success,false);
});

test('source style rejects invented subtitles, labels and presenter insets on clean cards',()=>{
  const reference={visualStyle:{burnedInCaptions:false,addedLabels:false,presenterInsetOnScreensOnly:true}};
  const timeline={captions:[],graphics:[],clips:[{kind:'image',start:0,duration:4},{kind:'screen',start:4,duration:4}],overlays:[]};
  assert.doesNotThrow(()=>checkReferenceStyle(timeline,reference));
  assert.throws(()=>checkReferenceStyle({...timeline,captions:[{start:0,end:1,text:'Unrequested captions'}]},reference),/no burned-in/);
  assert.throws(()=>checkReferenceStyle({...timeline,graphics:[{kind:'lower-third'}]},reference),/added titles/);
  assert.throws(()=>checkReferenceStyle({...timeline,overlays:[{layout:'circle',start:0,duration:4}]},reference),/clean example/);
  assert.doesNotThrow(()=>checkReferenceStyle({...timeline,overlays:[{layout:'circle',start:4,duration:4}]},reference));
});
