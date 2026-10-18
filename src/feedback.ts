import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {DATA,atomicJson,idSchema,safePath,serial} from './core.js';

// These are conditional quality checks, never fixed creative choices from another video.
export const feedbackChecks = {
  'source-graphics':'Inventory the current reference logos, card decorations, connectors and titles. Map each required element to an implemented shot; use only those appropriate to this reference.',
  'picture-quality':'Use the best available original for crops. Inspect the final export at delivery size for blur, stretching and repeated transcoding; do not judge quality from a proxy alone.',
  'speech-pace':'Compare equivalent spoken phrases at player 1x, excluding demos and silence. Preserve complete thoughts and natural pauses; do not force runtime by rushing speech.',
  'source-transitions':'Map the current reference transitions explicitly. Include its requested transitions and check every join for unintended flashes; do not add a flash to every future video.',
  'source-cta':'Inventory the current reference calls to action and preserve their editorial role using the owner\'s accurate wording and destination. Do not invent an offer or someone else\'s affiliation.',
  'source-typography':'Match the current reference title placement, font treatment and movement, and anchor text reveals to the corresponding spoken words. Do not reuse another video\'s exact font by default.',
  'example-audio':'Keep each example\'s native audio paired with its visual source, trim and speed. Check all example windows for sync and unintended repeated dialogue or substituted loops.',
  'source-captions':'Check whether the current reference has visible captions before adding them. Timed transcription is timing evidence and does not itself authorize a caption layer.',
} as const;
export type FeedbackTopic=keyof typeof feedbackChecks;
const topics=Object.keys(feedbackChecks) as [FeedbackTopic,...FeedbackTopic[]];
const topicSchema=z.enum(topics);
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const url=z.string().url().refine(v=>{const u=new URL(v);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password},'Use a review URL without credentials');
export const feedbackImportSchema=z.object({reviewUrl:url,version:z.string().trim().min(1).max(180),comments:z.array(z.object({at:z.number().finite().nonnegative(),sourceAt:z.number().finite().nonnegative().optional(),text:z.string().trim().min(1).max(4000),externalId:z.string().min(1).max(180).optional()}).strict()).max(1000)}).strict();
export const feedbackVerifySchema=z.object({commentIds:z.array(digest).min(1).max(100),artifact:z.string().min(1),evidence:z.string().min(1)}).strict();
const collectionSchema=z.object({reviewUrl:url,comments:z.array(z.object({id:z.string().min(1).max(180),version:digest,at:z.number().finite().nonnegative(),sourceAt:z.number().finite().nonnegative().optional(),text:z.string().trim().min(1).max(4000)}).strict()).max(1000)}).strict();
// A DOM snapshot can contain comments from several cuts. Preserve each note's own version.
export function feedbackCollectionBatches(input:unknown){
  const snapshot=collectionSchema.parse(input),groups=new Map<string,z.infer<typeof feedbackImportSchema>>();
  for(const n of snapshot.comments){
    const batch=groups.get(n.version)??{reviewUrl:snapshot.reviewUrl,version:n.version,comments:[]};
    const legacy=n.id.startsWith('legacy-');
    batch.comments.push({at:legacy?Number(n.at.toFixed(2)):n.at,sourceAt:n.sourceAt,text:n.text,...legacy?{}:{externalId:n.id}});groups.set(n.version,batch);
  }
  return [...groups.values()].map(batch=>feedbackImportSchema.parse(batch));
}
const verification=z.object({artifact:z.string(),artifactSha256:digest,evidence:z.string(),evidenceSha256:digest,at:z.string(),method:z.enum(['audiovisual-review','automated-check']),summary:z.string()});
const comment=z.object({id:digest,projectId:idSchema,reviewUrl:url,version:z.string(),at:z.number(),sourceAt:z.number().optional(),text:z.string(),createdAt:z.string(),topics:z.array(topicSchema),verification:verification.optional(),history:z.array(z.object({at:z.string(),reason:z.string(),verification:verification})).default([])});
const stateSchema=z.object({schemaVersion:z.literal(1),comments:z.array(comment),reviews:z.array(z.object({projectId:idSchema,url,version:z.string()}))});
type State=z.infer<typeof stateSchema>;
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
async function fileHash(file:string){const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex')}

export function classifyFeedback(text:string):FeedbackTopic[]{
  const tests:[FeedbackTopic,RegExp][]=[
    ['source-graphics',/logo|diagonal|dotted|connector|card.*effect/i],
    ['picture-quality',/blurr|low (quality|res)|high quality|crop.*quality|stretch/i],
    ['speech-pace',/talk.*fast|speaking.*speed|rushed|narrat.*pace|clipped.*word/i],
    ['source-transitions',/flash|transition/i],
    ['source-cta',/call to action|\bcta\b|link.*description/i],
    ['source-typography',/font|title text|text.*(timing|speaking|sync)|timing.*text/i],
    ['example-audio',/audio.*(loop|sync)|example.*audio|dialogue.*repeat/i],
    ['source-captions',/caption|subtitle/i],
  ];
  return tests.filter(([,pattern])=>pattern.test(text)).map(([topic])=>topic);
}

export function createFeedbackStore(root=DATA){
  const dir=path.join(root,'feedback'),file=path.join(dir,'reviews.json');
  const read=async():Promise<State>=>{try{return stateSchema.parse(JSON.parse(await fs.readFile(file,'utf8')))}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {schemaVersion:1,comments:[],reviews:[]};throw e}};
  const edit=<T>(fn:(state:State)=>T|Promise<T>)=>serial('feedback:'+root,async()=>{
    await fs.mkdir(dir,{recursive:true});
    // A second process must retry later; it must never overwrite a concurrent review update.
    const lock=path.join(dir,'write.lock');let handle;
    try{handle=await fs.open(lock,'wx')}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')throw new Error('Feedback is locked by another writer. Inspect the recorded PID before recovering a stale lock.');throw e}
    try{await handle.writeFile(String(process.pid));const state=await read(),result=await fn(state);await atomicJson(file,state);return result}finally{await handle.close();await fs.unlink(lock)}
  });
  const projectRoot=(id:string)=>path.join(root,'projects',idSchema.parse(id));
  return {
    async import(projectId:string,input:unknown){
      idSchema.parse(projectId);await fs.access(path.join(projectRoot(projectId),'project.json'));
      const batch=feedbackImportSchema.parse(input);
      return edit(state=>{
        let added=0;
        for(const n of batch.comments){
          const id=hash(JSON.stringify([projectId,batch.reviewUrl,batch.version,n.externalId??[n.at,n.text]]));
          const prior=state.comments.find(c=>c.id===id);
          if(prior){if(prior.text!==n.text||prior.at!==n.at)throw new Error('A comment ID changed content; import the revision under a new ID.');continue}
          state.comments.push({id,projectId,reviewUrl:batch.reviewUrl,version:batch.version,at:n.at,sourceAt:n.sourceAt,text:n.text,createdAt:new Date().toISOString(),topics:classifyFeedback(n.text),history:[]});added++;
        }
        if(!state.reviews.some(r=>r.projectId===projectId&&r.url===batch.reviewUrl&&r.version===batch.version))state.reviews.push({projectId,url:batch.reviewUrl,version:batch.version});
        return {added,duplicates:batch.comments.length-added,total:state.comments.filter(c=>c.projectId===projectId).length};
      });
    },
    async context(projectId:string){
      idSchema.parse(projectId);const state=await read(),own=state.comments.filter(c=>c.projectId===projectId);
      const learned=topics.flatMap(topic=>{
        const sources=state.comments.filter(c=>c.verification&&c.topics.includes(topic));
        return sources.length?[{topic,check:feedbackChecks[topic],verifiedCorrections:sources.length,sourceCommentIds:sources.map(c=>c.id)}]:[];
      });
      return {projectId,total:own.length,pending:own.filter(c=>!c.verification),verified:own.filter(c=>c.verification).map(c=>({id:c.id,at:c.at,version:c.version,verification:c.verification})),learnedChecks:learned,
        projectChecks:[...new Set(own.filter(c=>!c.verification).flatMap(c=>c.topics))].map(topic=>({topic,check:feedbackChecks[topic]})),
        policy:'Original comments apply only to their project/version. Learned checks are conditional guidance, not owner approval or automatic creative overrides. Unknown topics remain pending for editorial interpretation. Technical evidence alone cannot prove creative acceptance.'};
    },
    async classify(projectId:string,id:string,assigned:FeedbackTopic[]){
      idSchema.parse(projectId);digest.parse(id);z.array(topicSchema).max(topics.length).parse(assigned);
      return edit(state=>{const c=state.comments.find(c=>c.id===id&&c.projectId===projectId);if(!c)throw new Error('Unknown project comment');if(c.verification)throw new Error('Reopen a verified comment before changing its interpretation');c.topics=[...new Set(assigned)];return {id,topics:c.topics}});
    },
    async verify(projectId:string,input:unknown){
      const args=feedbackVerifySchema.parse(input),base=projectRoot(projectId);
      const artifact=safePath(base,args.artifact),evidence=safePath(base,args.evidence);
      if(!/\.(mp4|mov|webm)$/i.test(artifact)||!evidence.endsWith('.json'))throw new Error('Verification requires a rendered video and a JSON evidence report inside this project.');
      const [artifactSha256,evidenceText]=await Promise.all([fileHash(artifact),fs.readFile(evidence,'utf8')]);
      const report=z.object({artifactSha256:digest,method:z.enum(['audiovisual-review','automated-check']),comments:z.array(z.object({id:digest,passed:z.literal(true),summary:z.string().min(20),checks:z.array(z.object({name:z.string().min(3),passed:z.literal(true),detail:z.string().min(10)})).min(1)})).min(1)}).parse(JSON.parse(evidenceText));
      if(report.artifactSha256!==artifactSha256)throw new Error('Evidence belongs to a different rendered artifact. Recheck the actual output.');
      return edit(state=>{
        for(const id of args.commentIds){
          const c=state.comments.find(c=>c.id===id&&c.projectId===projectId),proof=report.comments.find(r=>r.id===id);
          if(!c||!proof)throw new Error('Every resolved comment needs its own passing evidence.');
          if(c.verification)c.history.push({at:new Date().toISOString(),reason:'Reverified against a new evidence report',verification:c.verification});
          c.verification={artifact:args.artifact,artifactSha256,evidence:args.evidence,evidenceSha256:hash(evidenceText),method:report.method,summary:proof.summary,at:new Date().toISOString()};
        }
        return {verified:args.commentIds.length,artifactSha256,ownerApproved:false};
      });
    },
    async reopen(projectId:string,id:string,reason:string){
      idSchema.parse(projectId);digest.parse(id);z.string().min(5).max(1000).parse(reason);
      return edit(state=>{const c=state.comments.find(c=>c.id===id&&c.projectId===projectId);if(!c)throw new Error('Unknown project comment');if(c.verification)c.history.push({at:new Date().toISOString(),reason,verification:c.verification});delete c.verification;return {id,pending:true}});
    },
    async reviews(){return (await read()).reviews},
  };
}
export const feedback=createFeedbackStore();
