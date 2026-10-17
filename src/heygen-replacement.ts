import fs from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {projectDir,readProject,mutate,event,atomicJson,hash,serial} from './core.js';
import {checkSavedScriptPlan,checkReferenceScan} from './preflight.js';

const authorizationFile='HeyGen replacement authorization.json';
const verificationFile='HeyGen replacement verification.json';
const receiptFile='heygen-replacement-video-attempt.json';
const normalize=(text:string)=>text.replace(/\s+/g,' ').trim();
const authorizationSchema=z.object({
  userInstruction:z.string().min(20),authorizedOnPacificDate:z.string().min(10),
  maximumReplacementSubmissions:z.literal(1),avatarLookId:z.string().regex(/^[a-f0-9]{32}$/),
  motionModel:z.literal('Avatar III'),voice:z.literal('Nelly'),tone:z.literal('Warm'),voiceSpeed:z.literal(1),
  scriptFile:z.literal('Rewritten narration.txt'),previousVideoId:z.string().regex(/^[a-f0-9]{32}$/),
  previousMediaMustBePreserved:z.literal(true),replacementSubmissionRecorded:z.boolean(),
}).passthrough();
const verificationSchema=z.object({
  at:z.string().datetime(),draftUrl:z.string().url(),avatarLookId:z.string(),avatar:z.string(),
  motionModel:z.string(),voice:z.string(),tone:z.string(),voiceSpeed:z.number(),script:z.string(),
  completeScriptMatch:z.literal(true),landscape:z.literal(true),previewVisuallyVerified:z.literal(true),
}).passthrough();

// This explicit exception preserves the original one-video guard and all original receipts.
// Supported Chrome control must call this guard before opening the generation flow,
// and must never repeat a generation click after a timeout or uncertain outcome.
export async function reserveReplacement(id:string){
  return serial('heygen-replacement:'+id,async()=>{
    const dir=projectDir(id),p=await readProject(id);
    const auth=authorizationSchema.parse(JSON.parse(await fs.readFile(path.join(dir,authorizationFile),'utf8')));
    if(auth.replacementSubmissionRecorded)throw new Error('Replacement attempt already consumed. Reconcile; never resubmit.');
    if(!p.heygen.video?.url||!p.heygen.video.url.includes(auth.previousVideoId))throw new Error('Replacement authorization must identify the preserved original video.');
    if(!auth.userInstruction.includes(auth.avatarLookId)||!/redo heygen video at 1x speed/i.test(auth.userInstruction))throw new Error('Missing explicit authorization for this exact normal-speed replacement look.');
    const v=verificationSchema.parse(JSON.parse(await fs.readFile(path.join(dir,verificationFile),'utf8')));
    const u=new URL(v.draftUrl);
    if(u.hostname!=='app.heygen.com'||!/^\/create-v4\/[a-f0-9]{32}$/.test(u.pathname)||u.pathname.endsWith(auth.previousVideoId))throw new Error('Verify the actual saved replacement draft URL.');
    if(Date.now()-Date.parse(v.at)>30*60*1000||Date.parse(v.at)>Date.now()+60000)throw new Error('Replacement verification is stale. Inspect the same draft again.');
    for(const key of ['avatarLookId','motionModel','voice','tone','voiceSpeed'] as const)if(v[key]!==auth[key])throw new Error(`Replacement ${key} does not match authorization.`);
    if(p.voice!==auth.voice||p.model!==auth.motionModel||p.tone!==auth.tone||(p.voiceSpeed??1)!==1)throw new Error('Project settings no longer match this replacement authorization.');
    const narration=await fs.readFile(path.join(dir,auth.scriptFile),'utf8');
    if(!p.script.trim()||normalize(v.script)!==normalize(p.script)||normalize(narration)!==normalize(p.script))throw new Error('Complete observed narration must match both saved script and project script.');
    await checkSavedScriptPlan(dir,p);checkReferenceScan(p.reference);
    const receipt={attemptedAt:new Date().toISOString(),kind:'replacement-video',state:'pending',authorization:auth,verification:v,scriptHash:hash(p.script),originalHeyGenHash:hash(JSON.stringify(p.heygen)),draftUrl:v.draftUrl};
    const handle=await fs.open(path.join(dir,receiptFile),'wx').catch(e=>{if(e.code==='EEXIST')throw new Error('Replacement attempt already consumed. Reconcile; never resubmit.');throw e});
    try{await handle.writeFile(JSON.stringify(receipt,null,2));await handle.sync()}finally{await handle.close()}
    await atomicJson(path.join(dir,authorizationFile),{...auth,replacementSubmissionRecorded:true,replacementAttemptedAt:receipt.attemptedAt,replacementDraftUrl:v.draftUrl,replacementState:'pending',attemptReceipt:receiptFile});
    await mutate(id,p=>event(p,'heygen-replacement-reserved',`Explicit human authorization recorded: ONE replacement at 1.0x, look ${auth.avatarLookId}, saved draft ${u.pathname}. Original media, ledger and consumed receipts preserved. An uncertain outcome consumes this attempt.`));
    return {attemptedAt:receipt.attemptedAt,draftUrl:v.draftUrl,scriptHash:receipt.scriptHash,state:receipt.state};
  });
}

export async function reconcileReplacement(id:string,input:{state:'uncertain'|'confirmed';url?:string;note:string}){
  return serial('heygen-replacement:'+id,async()=>{
    const dir=projectDir(id),receipt=JSON.parse(await fs.readFile(path.join(dir,receiptFile),'utf8'));
    const auth=JSON.parse(await fs.readFile(path.join(dir,authorizationFile),'utf8'));
    let videoId:string|undefined;
    if(input.url){const u=new URL(input.url);videoId=u.pathname.match(/^\/(?:videos|video)\/(?:[a-z0-9]+(?:-[a-z0-9]+)*-)?([a-f0-9]{32})$/)?.[1];if(u.hostname!=='app.heygen.com'||!videoId||[auth.previousVideoId,auth.avatarLookId].includes(videoId))throw new Error('Use the actual observed replacement video URL, never the old video or look ID.');}
    if(input.state==='confirmed'&&!videoId)throw new Error('Confirmed submission requires an observed video URL.');
    const at=new Date().toISOString();const history=[...(receipt.history||[]),{at,...input,videoId}];
    await atomicJson(path.join(dir,receiptFile),{...receipt,state:input.state,...(input.url?{url:input.url,videoId}:{}),history});
    await atomicJson(path.join(dir,authorizationFile),{...auth,replacementSubmissionRecorded:true,replacementState:input.state,...(input.url?{replacementVideoId:videoId,replacementVideoUrl:input.url}:{}),lastObservedAt:at,lastObservation:input.note});
    await mutate(id,p=>event(p,'heygen-replacement-'+input.state,input.note+(input.url?' '+input.url:'')));
    return {state:input.state,videoId,url:input.url};
  });
}

export async function markReplacementSubmit(id:string){
  const dir=projectDir(id),p=await readProject(id);
  const receipt=JSON.parse(await fs.readFile(path.join(dir,receiptFile),'utf8'));
  const v=JSON.parse(await fs.readFile(path.join(dir,verificationFile),'utf8'));
  if(receipt.state!=='pending'||receipt.scriptHash!==hash(p.script)||receipt.originalHeyGenHash!==hash(JSON.stringify(p.heygen)))throw new Error('Reserved replacement or original ledger changed. Reconcile the same draft.');
  if(v.outputResolution!=='1080p'||v.format!=='MP4'||v.watermark!=='Off'||v.voiceSpeed!==1||normalize(v.script)!==normalize(p.script))throw new Error('Verify final 1080p MP4 output, watermark off and complete 1.0x narration.');
  if(new URL(v.draftUrl).pathname!==new URL(receipt.draftUrl).pathname||Date.now()-Date.parse(v.at)>10*60*1000)throw new Error('Inspect the reserved draft and final export settings again.');
  const file=path.join(dir,'heygen-replacement-submit-click.json');
  const handle=await fs.open(file,'wx').catch(e=>{if(e.code==='EEXIST')throw new Error('Final replacement submit already recorded. Never click again.');throw e});
  const intent={at:new Date().toISOString(),draftUrl:receipt.draftUrl,verification:v,scriptHash:receipt.scriptHash};
  try{await handle.writeFile(JSON.stringify(intent,null,2));await handle.sync()}finally{await handle.close()}
  return {at:intent.at,draftUrl:intent.draftUrl,submitClicksAuthorized:1};
}
