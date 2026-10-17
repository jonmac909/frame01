import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
await fs.mkdir('test-results',{recursive:true});const temp=await fs.mkdtemp(path.resolve('test-results/test-'));process.env.EDITOR_DATA_DIR=temp;
const core=await import('../src/core.js');const {parseVtt}=await import('../src/reference.js');
test('one draft reservation survives reread and simultaneous duplicate attempts',async()=>{
  const p=await core.createProject({title:'test',referenceUrl:'https://www.youtube.com/watch?v=test',avatar:'Avatar',voice:'Voice'});
  const attempts=await Promise.allSettled([core.reserveHeyGen(p.id,'draft'),core.reserveHeyGen(p.id,'draft'),core.reserveHeyGen(p.id,'draft')]);
  assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await core.readProject(p.id)).heygen.draft?.state,'pending');
  await assert.rejects(core.reserveHeyGen(p.id,'draft'),/already used/);
});
test('video submission requires verified current script and is single attempt',async()=>{
  const p=await core.createProject({title:'submit',referenceUrl:'https://youtu.be/test',avatar:'Avatar',voice:'Voice'});
  await assert.rejects(core.reserveHeyGen(p.id,'video'),/Confirm/);
  await core.mutate(p.id,p=>{p.script='Final narration';p.heygen.draft={attemptedAt:new Date().toISOString(),state:'confirmed',url:'https://app.heygen.com/video/abc'};p.heygen.verified={avatar:p.avatar,voice:p.voice,model:p.model,tone:p.tone,at:new Date().toISOString(),scriptHash:core.hash('old script')}});
  await assert.rejects(core.reserveHeyGen(p.id,'video'),/Verify/);
  await core.mutate(p.id,p=>{p.heygen.verified!.scriptHash=core.hash(p.script);p.heygen.verified!.voiceSpeed=1});
  await assert.rejects(core.reserveHeyGen(p.id,'video'),/Reference runtime/);
  const reference={duration:10,captions:[{start:0,end:10,text:'Final narration'}]};
  await core.mutate(p.id,p=>{p.reference=reference});
  await core.atomicJson(path.join(core.projectDir(p.id),'Reference timing.json'),{targetDuration:10,sourceHash:core.hash(JSON.stringify(reference.captions)),narrationHash:core.hash('Final narration'),sections:[{start:0,end:10,sourceWords:2,text:'Final narration'}]});
  await assert.rejects(core.reserveHeyGen(p.id,'video'),/4 fps/);
  assert.equal((await core.readProject(p.id)).heygen.video,undefined);
  await core.mutate(p.id,p=>{p.reference={...p.reference,analysis:{sampleFps:4,frameCount:40,mediaDuration:10,source:'reference/source.mp4'},frames:Array.from({length:40},(_,i)=>({seconds:i/4,file:`reference/frame-${i}.jpg`}))}});
  await core.reserveHeyGen(p.id,'video');
  await assert.rejects(core.reserveHeyGen(p.id,'video'),/already used/);
});

test('crash after exclusive receipt creation cannot reopen the allowance',async()=>{
  const p=await core.createProject({title:'crash',referenceUrl:'https://youtu.be/test',avatar:'Sienna',voice:'Nelly'});
  await fs.writeFile(path.join(core.projectDir(p.id),'heygen-draft-attempt.json'),'reserved before crash',{flag:'wx'});
  assert.equal((await core.readProject(p.id)).heygen.draft,undefined);
  await assert.rejects(core.reserveHeyGen(p.id,'draft'),/already used/);
});

test('timeline rejects wrong reference duration before accessing any media',async()=>{
  const p=await core.createProject({title:'runtime',referenceUrl:'https://youtu.be/test',avatar:'Sienna',voice:'Nelly'});
  await core.mutate(p.id,p=>{p.reference={duration:751}});
  await assert.rejects(core.validateTimeline(p.id,{title:'Wrong length',clips:[{id:'a',asset:'missing.mp4',start:0,duration:400,kind:'aroll'}]}),/runtime/);
});
test('a changed voice tone invalidates a prior submission verification',async()=>{
  const p=await core.createProject({title:'tone',referenceUrl:'https://youtu.be/test',avatar:'Sienna',voice:'Nelly'});
  assert.equal(p.model,'Avatar III');assert.equal(p.tone,'Warm');
  await core.mutate(p.id,p=>{p.script='Narration';p.heygen.draft={attemptedAt:new Date().toISOString(),state:'confirmed',url:'https://app.heygen.com/create-v4/example'};p.heygen.verified={avatar:p.avatar,voice:p.voice,model:p.model,tone:'Neutral',at:new Date().toISOString(),scriptHash:core.hash(p.script)}});
  await assert.rejects(core.reserveHeyGen(p.id,'video'),/Verify/);
  assert.equal((await core.readProject(p.id)).heygen.video,undefined);
});

test('accelerated or unverified speech cannot consume the video allowance',async()=>{
  const p=await core.createProject({title:'speed',referenceUrl:'https://youtu.be/test',avatar:'Sienna',voice:'Nelly'});
  assert.equal(p.voiceSpeed,1);
  await core.mutate(p.id,p=>{p.script='Narration';p.heygen.draft={attemptedAt:new Date().toISOString(),state:'confirmed',url:'https://app.heygen.com/create-v4/example'};p.heygen.verified={avatar:p.avatar,voice:p.voice,model:p.model,tone:p.tone,voiceSpeed:1.5,at:new Date().toISOString(),scriptHash:core.hash(p.script)}});
  await assert.rejects(core.reserveHeyGen(p.id,'video'),/voice speed/);
  assert.equal((await core.readProject(p.id)).heygen.video,undefined);
});

async function replacementFixture(){
  const p=await core.createProject({title:'replacement',referenceUrl:'https://youtu.be/test',avatar:'Sienna',voice:'Nelly'});
  const dir=core.projectDir(p.id),previousVideoId='045fdb164a324611b8d2cd88ea336d50',avatarLookId='cb0e64d5ef4d4548988c1f49c2b8fe58';
  const reference={duration:10,captions:[{start:0,end:10,text:'Final narration'}],analysis:{sampleFps:4,frameCount:40,mediaDuration:10,source:'reference/source.mp4'},frames:Array.from({length:40},(_,i)=>({seconds:i/4,file:`reference/frame-${i}.jpg`}))};
  await core.mutate(p.id,p=>{p.script='Final narration';p.reference=reference;p.heygen.video={attemptedAt:new Date().toISOString(),state:'confirmed',url:`https://app.heygen.com/videos/${previousVideoId}`};p.heygen.asset='assets/original.mp4'});
  await core.atomicJson(path.join(dir,'Reference timing.json'),{targetDuration:10,sourceHash:core.hash(JSON.stringify(reference.captions)),narrationHash:core.hash('Final narration'),sections:[{start:0,end:10,sourceWords:2,text:'Final narration'}]});
  await fs.writeFile(path.join(dir,'Rewritten narration.txt'),'Final narration');
  await core.atomicJson(path.join(dir,'HeyGen replacement authorization.json'),{userInstruction:`actually redo heygen video at 1x speed first using ${avatarLookId}`,authorizedOnPacificDate:'2026-10-16',maximumReplacementSubmissions:1,avatarLookId,motionModel:'Avatar III',voice:'Nelly',tone:'Warm',voiceSpeed:1,scriptFile:'Rewritten narration.txt',previousVideoId,previousMediaMustBePreserved:true,replacementSubmissionRecorded:false});
  const verification={at:new Date().toISOString(),draftUrl:'https://app.heygen.com/create-v4/2388109a9b1f485794191d8042820f0d',avatarLookId,avatar:'Sienna Cole - Shop Drop',motionModel:'Avatar III',voice:'Nelly',tone:'Warm',voiceSpeed:1,script:'Final\n narration',completeScriptMatch:true,landscape:true,previewVisuallyVerified:true};
  await core.atomicJson(path.join(dir,'HeyGen replacement verification.json'),verification);
  return {p,dir,verification};
}
test('explicit replacement reserves only once concurrently and preserves the original ledger',async()=>{
  const {p,dir}=await replacementFixture(),before=(await core.readProject(p.id)).heygen;
  const results=await Promise.allSettled([core.reserveHeyGen(p.id,'replacement-video'),core.reserveHeyGen(p.id,'replacement-video')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.deepEqual((await core.readProject(p.id)).heygen,before);
  assert.equal(JSON.parse(await fs.readFile(path.join(dir,'HeyGen replacement authorization.json'),'utf8')).replacementSubmissionRecorded,true);
  await assert.rejects(core.reserveHeyGen(p.id,'video'),/already used/);
  const {reconcileReplacement}=await import('../src/heygen-replacement.js');
  await reconcileReplacement(p.id,{state:'uncertain',note:'Timeout after click'});
  await assert.rejects(core.reserveHeyGen(p.id,'replacement-video'),/already consumed/);
  await assert.rejects(reconcileReplacement(p.id,{state:'confirmed',url:before.video!.url,note:'wrong ID'}),/actual observed/);
});
test('wrong speed and altered narration do not consume replacement authorization',async()=>{
  const {p,dir,verification}=await replacementFixture();
  await core.atomicJson(path.join(dir,'HeyGen replacement verification.json'),{...verification,voiceSpeed:1.5});
  await assert.rejects(core.reserveHeyGen(p.id,'replacement-video'),/voiceSpeed/);
  await core.atomicJson(path.join(dir,'HeyGen replacement verification.json'),{...verification,script:'Shortened'});
  await assert.rejects(core.reserveHeyGen(p.id,'replacement-video'),/Complete observed narration/);
  await assert.rejects(fs.access(path.join(dir,'heygen-replacement-video-attempt.json')));
});
test('replacement receipt left by a crash blocks a second submission',async()=>{
  const {p,dir}=await replacementFixture();
  await fs.writeFile(path.join(dir,'heygen-replacement-video-attempt.json'),'reserved before crash',{flag:'wx'});
  await assert.rejects(core.reserveHeyGen(p.id,'replacement-video'),/already consumed/);
});
test('final replacement click requires verified output settings and cannot repeat',async()=>{
  const {p,dir,verification}=await replacementFixture();
  await core.reserveHeyGen(p.id,'replacement-video');
  const {markReplacementSubmit,reconcileReplacement}=await import('../src/heygen-replacement.js');
  await assert.rejects(markReplacementSubmit(p.id),/final 1080p/);
  await core.atomicJson(path.join(dir,'HeyGen replacement verification.json'),{...verification,outputResolution:'1080p',format:'MP4',watermark:'Off'});
  const clicks=await Promise.allSettled([markReplacementSubmit(p.id),markReplacementSubmit(p.id)]);
  assert.equal(clicks.filter(r=>r.status==='fulfilled').length,1);
  await reconcileReplacement(p.id,{state:'confirmed',url:'https://app.heygen.com/videos/frame-01-sienna-shop-drop-1x-replacement-2388109a9b1f485794191d8042820f0d',note:'Actual canonical completed page'});
  await assert.rejects(markReplacementSubmit(p.id),/Reserved replacement/);
  const auth=JSON.parse(await fs.readFile(path.join(dir,'HeyGen replacement authorization.json'),'utf8'));
  assert.equal(auth.replacementVideoId,'2388109a9b1f485794191d8042820f0d');
});
test('media paths cannot escape project roots',()=>{assert.throws(()=>core.safePath(temp,'../secret'),/inside/);assert.throws(()=>core.projectDir('../abc'));assert.ok(core.safePath(temp,'assets/video.mp4').startsWith(temp));});
test('caption parser strips inline markup and duplicate adjacent cues',()=>{assert.deepEqual(parseVtt('WEBVTT\n\n00:00:00.000 --> 00:00:02.500\n<c>Hello</c> world\n\n00:00:02.500 --> 00:00:03.000\nHello world'),[{start:0,end:2.5,text:'Hello world'}]);});
test.after(async()=>{await fs.rm(temp,{recursive:true,force:true})});
