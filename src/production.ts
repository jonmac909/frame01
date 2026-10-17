import fs from 'node:fs/promises';
import path from 'node:path';
import {atomicJson,readProject,mutate,event,projectDir,validateTimeline} from './core.js';
import {checkSavedScriptPlan,checkReferenceScan,fingerprint,sourceBeats,sourceSection,validateScriptPlan,words,type ScriptPlan} from './preflight.js';
import {compactProject} from './director-contract.js';

export async function readReference(id:string,offset=0,limit=20){
  const p=await readProject(id),r=p.reference;
  if(!r?.captions)throw new Error('Ingest the reference first.');
  const beats=sourceBeats(r.captions);
  return {sourceHash:fingerprint(JSON.stringify(r.captions)),duration:r.duration,totalBeats:beats.length,totalWords:beats.reduce((n,c)=>n+words(c.text),0),offset,nextOffset:offset+limit<beats.length?offset+limit:null,beats:beats.slice(offset,offset+limit)};
}
export async function readScript(id:string,section?:number){
  const p=await readProject(id),plan:ScriptPlan=JSON.parse(await fs.readFile(path.join(projectDir(id),'Reference timing.json'),'utf8'));
  const check=validateScriptPlan(p.script,p.reference as {duration:number;captions:unknown},plan);
  if(section===undefined)return {...check,sourceHash:plan.sourceHash,narrationHash:plan.narrationHash,sections:plan.sections.map((s,index)=>({index,start:s.start,end:s.end,sourceWords:s.sourceWords,words:words(s.text)}))};
  const s=plan.sections[section];if(!s)throw new Error('Unknown script section.');
  return {section,...s,sourceText:sourceSection(p.reference?.captions,s.start,s.end),sourceHash:plan.sourceHash};
}
export async function saveScriptPlan(id:string,args:{sourceHash:string;sections:{start:number;end:number;text:string}[]}){
  return mutate(id,async p=>{
    if(p.heygen.video)throw new Error('The A-roll has already been submitted. Keep its script fixed.');
    if(!p.reference?.duration)throw new Error('Ingest the reference first.');
    const script=args.sections.map(s=>s.text.trim()).join('\n\n');
    const plan={targetDuration:Number(p.reference.duration),sourceHash:args.sourceHash,narrationHash:fingerprint(script),sections:args.sections.map(s=>({...s,text:s.text.trim(),sourceWords:words(sourceSection(p.reference?.captions,s.start,s.end))}))};
    validateScriptPlan(script,p.reference as {duration:number;captions:unknown},plan);
    await atomicJson(path.join(projectDir(id),'Reference timing.json'),plan);
    p.script=script;delete p.heygen.verified;
    event(p,'script-validated','Saved complete narration with source-derived word budgets and reference timing.');
  });
}
export async function preflight(id:string){
  const p=await readProject(id),checks:{name:string;ok:boolean;detail:string}[]=[];
  const check=async(name:string,fn:()=>unknown|Promise<unknown>)=>{try{await fn();checks.push({name,ok:true,detail:'Passed'})}catch(e){checks.push({name,ok:false,detail:e instanceof Error?e.message:String(e)})}};
  await check('script',()=>checkSavedScriptPlan(projectDir(id),p));
  const consumed:Record<string,boolean>={};
  for(const kind of ['draft','video'] as const)consumed[kind]=!!p.heygen[kind]||await fs.access(path.join(projectDir(id),`heygen-${kind}-attempt.json`)).then(()=>true,()=>false);
  await check('reference visuals',()=>checkReferenceScan(p.reference));
  if(checks.at(-1)!.ok)checks.at(-1)!.detail='Complete 4 fps scan verified. Semantic visual review is documented separately; extraction alone does not prove matching.';
  await check('A-roll',()=>{if(!p.assets.some(a=>a.kind==='aroll'))throw new Error('Download and import the sole existing HeyGen video.');});
  await check('voice speed',()=>{if(p.heygen.video&&p.heygen.verified?.voiceSpeed!==(p.voiceSpeed??1)&&!(p.heygen.acceptedTestVoiceSpeed!==undefined&&p.heygen.acceptedTestVoiceSpeed===p.heygen.verified?.voiceSpeed))throw new Error(`Submitted voice speed is ${p.heygen.verified?.voiceSpeed??'unverified'}×; required ${p.voiceSpeed??1}×. This A-roll needs correction. Do not resubmit automatically.`);});
  if(p.heygen.acceptedTestVoiceSpeed)checks.find(c=>c.name==='voice speed')!.detail=`User authorized this test with the existing ${p.heygen.acceptedTestVoiceSpeed}× A-roll. Future videos require 1.0×.`;
  await check('timeline',()=>{if(!p.timeline)throw new Error('Assemble and validate the edit timeline after importing the media.');return validateTimeline(id,p.timeline)});
  const nextAction=!checks[0].ok?'reference.read / script.plan.save':consumed.video?(!p.heygen.video?.url?'heygen.link existing video (never resubmit)':!p.assets.some(a=>a.kind==='aroll')?'heygen.download':!checks.find(c=>c.name==='reference visuals')?.ok?'reference.analyze':!checks.find(c=>c.name==='timeline')?.ok?'timeline.save':'render'):!p.heygen.draft?.url?'heygen.link existing draft':!p.heygen.verified?'heygen.verify':'heygen.submit_video';
  const speedIssue=checks.find(c=>c.name==='voice speed'&&!c.ok)?.detail;
  return {project:compactProject(p),consumed,checks,nextAction:speedIssue?'Resolve the submitted voice speed error without another submission':nextAction,nextStep:speedIssue||(consumed.video&&!p.heygen.video?.url?'Wait for the submitted HeyGen video, then link that result. Do not submit again.':nextAction),measurement:'Word budgets do not prove speech or graphics alignment. Measure the rendered A-roll before final editing.'};
}
