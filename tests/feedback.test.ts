import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createFeedbackStore,feedbackCollectionBatches} from '../src/feedback.js';
import {directorInputSchema} from '../src/director-contract.js';

const url='https://review.example.test/video',version='master-a';
const batch={reviewUrl:url,version,comments:[{at:1,text:'Missing the Google logo here on the card'},{at:24,text:'She is talking too fast compared with the source'}]};
async function setup(t:any){const base=path.resolve('test-results');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'frame01-feedback-'));t.after(async()=>{if(path.dirname(root)!==base)throw new Error('Test cleanup must stay inside test-results');await fs.rm(root,{recursive:true,force:true})});for(const id of ['one','two']){await fs.mkdir(path.join(root,'projects',id),{recursive:true});await fs.writeFile(path.join(root,'projects',id,'project.json'),'{}')}return {root,store:createFeedbackStore(root)}}
async function proof(root:string,id:string){
  // Synthetic bytes test the evidence contract only, not media or editorial quality.
  const artifactSha256=createHash('sha256').update('synthetic video fixture').digest('hex');
  await fs.writeFile(path.join(root,'projects/one/master.mp4'),'synthetic video fixture');
  const report={artifactSha256,method:'audiovisual-review',comments:[{id,passed:true,summary:'Compared the corrected shot against the saved source frames.',checks:[{name:'source comparison',passed:true,detail:'Synthetic evidence for the persistence test only.'}]}]};
  await fs.writeFile(path.join(root,'projects/one/proof.json'),JSON.stringify(report));return report;
}
test('feedback import is durable, idempotent and scoped to project and video version',async t=>{
  const {root,store}=await setup(t);assert.equal((await store.import('one',batch)).added,2);assert.equal((await store.import('one',batch)).added,0);
  assert.equal((await createFeedbackStore(root).context('one')).pending.length,2);
  assert.equal((await store.context('two')).pending.length,0);
  assert.equal((await store.import('one',{...batch,version:'master-b'})).added,2);
  assert.equal((await store.reviews()).length,2);
});
test('unverified or unrecognized feedback never becomes a global creative instruction',async t=>{
  const {store}=await setup(t);await store.import('one',{...batch,comments:[...batch.comments,{at:3,text:'Use this specific look here'}]});
  const a=await store.context('one'),b=await store.context('two');assert.equal(a.pending.length,3);assert.deepEqual(a.pending[2].topics,[]);assert.equal(b.learnedChecks.length,0);
});
test('verified corrections teach conditional checks without copying exact logo choices',async t=>{
  const {root,store}=await setup(t);await store.import('one',batch);const id=(await store.context('one')).pending[0].id;await proof(root,id);
  const result=await store.verify('one',{commentIds:[id],artifact:'master.mp4',evidence:'proof.json'});assert.equal(result.ownerApproved,false);
  const future=await store.context('two');assert.equal(future.learnedChecks.length,1);assert.equal(future.pending.length,0);assert.ok(!future.learnedChecks[0].check.includes('Google'));
  assert.equal((await store.context('one')).pending.length,1);
  await store.reopen('one',id,'Owner says this correction did not solve the problem');assert.equal((await store.context('two')).learnedChecks.length,0);assert.equal((await store.context('one')).pending.length,2);
});
test('a changed artifact or absent per-comment evidence cannot close feedback',async t=>{
  const {root,store}=await setup(t);await store.import('one',batch);const [a,b]=(await store.context('one')).pending;await proof(root,a.id);
  await assert.rejects(store.verify('one',{commentIds:[a.id,b.id],artifact:'master.mp4',evidence:'proof.json'}),/Every resolved comment/);
  assert.equal((await store.context('one')).pending.length,2);
  await fs.appendFile(path.join(root,'projects/one/master.mp4'),'changed');await assert.rejects(store.verify('one',{commentIds:[a.id],artifact:'master.mp4',evidence:'proof.json'}),/different rendered artifact/);
  await assert.rejects(store.verify('one',{commentIds:[a.id],artifact:'../two/master.mp4',evidence:'proof.json'}),/inside the project/);
});
test('failed checks, wrong project IDs, invalid input and corrupted stores fail closed',async t=>{
  const {root,store}=await setup(t);await store.import('one',batch);const id=(await store.context('one')).pending[0].id;const report=await proof(root,id);report.comments[0].checks[0].passed=false;
  await fs.writeFile(path.join(root,'projects/one/proof.json'),JSON.stringify(report));await assert.rejects(store.verify('one',{commentIds:[id],artifact:'master.mp4',evidence:'proof.json'}));
  await assert.rejects(store.classify('two',id,['picture-quality']),/Unknown/);
  await assert.rejects(store.import('one',{...batch,comments:[{at:Infinity,text:'Bad timestamp'}]}));
  await fs.writeFile(path.join(root,'feedback/reviews.json'),'broken');await assert.rejects(store.context('one'));
});
test('imports serialize and preserve distinct concurrent comments',async t=>{
  const {store}=await setup(t);await Promise.all(Array.from({length:12},(_,i)=>store.import('one',{...batch,comments:[{at:i,text:`Note ${i}`}]})));
  assert.equal((await store.context('one')).total,12);
});
test('typed feedback tools cannot authorize paid actions or forge owner approval',()=>{
  assert.equal(directorInputSchema.safeParse({projectId:'one',operation:{name:'feedback.import',args:{...batch,resetHeygen:true}}}).success,false);
  assert.equal(directorInputSchema.safeParse({projectId:'one',operation:{name:'feedback.verify',args:{commentIds:['a'.repeat(64)],artifact:'master.mp4',evidence:'proof.json',ownerApproved:true}}}).success,false);
});

test('browser collection preserves mixed video versions and deduplicates previously exported legacy notes',async t=>{
  const {store}=await setup(t),a='a'.repeat(64),b='b'.repeat(64);
  await store.import('one',{reviewUrl:url,version:a,comments:[{at:12.08,text:'Existing review note'}]});
  const batches=feedbackCollectionBatches({reviewUrl:url,comments:[{id:'legacy-existing',version:a,at:12.0812,text:'Existing review note'},{id:'new-stable-id',version:b,at:19.432,sourceAt:20,text:'New review note'}]});
  assert.equal((await store.import('one',batches[0])).added,0);assert.equal((await store.import('one',batches[1])).added,1);assert.equal((await store.import('one',batches[1])).added,0);
  const context=await store.context('one');assert.equal(context.total,2);assert.deepEqual(context.pending.map(n=>n.version),[a,b]);
  assert.throws(()=>feedbackCollectionBatches({reviewUrl:url,comments:[{id:'unknown',version:'unversioned',at:1,text:'Do not guess this cut'}]}));
});
