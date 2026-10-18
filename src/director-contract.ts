import {z} from 'zod';
import {idSchema,timelineSchema,type Project} from './core.js';
import {feedbackImportSchema,feedbackVerifySchema,feedbackChecks} from './feedback.js';
import {editContractSchema} from './edit-contract.js';
import {sectionPlanSchema} from './section-plan.js';
import {evidenceIndexSchema,evidenceSearchSchema,evidenceFramesSchema,evidenceInspectSchema,evidenceBurstSchema} from './evidence.js';

const empty=z.object({}).strict();
const kind=z.enum(['heygen','walkthrough']);
const file=z.string().min(1);
const op=<N extends string,S extends z.ZodType>(name:N,args:S)=>z.object({name:z.literal(name),args});
export const operationSchema=z.discriminatedUnion('name',[
  op('project.read',empty),op('project.summary',empty),op('preflight.check',empty),
  op('evidence.index',evidenceIndexSchema),op('evidence.list',empty),op('evidence.search',evidenceSearchSchema),
  op('evidence.frames',evidenceFramesSchema),op('evidence.inspect',evidenceInspectSchema),op('evidence.burst',evidenceBurstSchema),
  op('effects.catalog',empty),op('contract.check',empty),op('contract.save',z.object({contract:editContractSchema}).strict()),
  op('contract.events',z.object({offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(30).default(20)}).strict()),
  op('jobs.read',z.object({jobId:z.string().uuid()}).strict()),
  op('plan.save',z.object({plan:sectionPlanSchema}).strict()),
  op('plan.read',z.object({file:z.string().regex(/^[^/\\]+\.json$/),offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(30).default(20)}).strict()),
  op('render.sections',z.object({planFile:z.string().regex(/^[^/\\]+\.json$/),exportName:z.string().regex(/^[a-z0-9-]+$/),sections:z.array(z.number().int().nonnegative()).min(1).max(100)}).strict()),
  op('render.assemble',z.object({exportName:z.string().regex(/^[a-z0-9-]+$/),name:z.string().regex(/^[-a-zA-Z0-9 _]+\.mp4$/)}).strict()),
  op('feedback.context',z.object({offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(30).default(20)}).strict()),op('feedback.import',feedbackImportSchema),op('feedback.verify',feedbackVerifySchema),
  op('feedback.classify',z.object({commentId:z.string().regex(/^[a-f0-9]{64}$/),topics:z.array(z.enum(Object.keys(feedbackChecks) as [keyof typeof feedbackChecks,...(keyof typeof feedbackChecks)[]])).max(8)}).strict()),
  op('feedback.reopen',z.object({commentId:z.string().regex(/^[a-f0-9]{64}$/),reason:z.string().min(5).max(1000)}).strict()),
  op('course.index',empty),op('library.index',empty),op('reference.ingest',empty),
  op('render',empty),op('heygen.verify',empty),op('record.stop',empty),op('record.windows',empty),op('record.status',empty),
  op('record.prepare',z.object({url:z.string().url()}).strict()),
  op('record.start',z.object({windowId:z.number().int().positive().optional(),title:z.string().min(1).optional(),maxSeconds:z.number().int().min(2).max(7200).optional(),viewport:z.object({width:z.number().int().min(320),height:z.number().int().min(180)}).strict().optional()}).strict()),
  op('project.save',z.object({script:z.string().max(100000).optional(),notes:z.string().max(100000).optional()}).strict()),
  op('reference.read',z.object({offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(40).default(20)}).strict()),
  op('reference.frames',z.object({offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(64).default(32)}).strict()),
  op('script.read',z.object({section:z.number().int().nonnegative().optional()}).strict()),
  op('script.plan.save',z.object({sourceHash:z.string().length(64),sections:z.array(z.object({start:z.number().nonnegative(),end:z.number().positive(),text:z.string().min(1).max(20000)}).strict()).min(1).max(100)}).strict()),
  op('course.search',z.object({query:z.string().min(1)}).strict()),
  op('library.search',z.object({query:z.string().default(''),category:z.enum(['sfx','font','transition','background','lut']).optional()}).strict()),
  op('library.import',z.object({assetId:file}).strict()),
  op('asset.grade',z.object({file,lut:file}).strict()),
  op('media.inspect',z.object({file}).strict()),
  op('reference.analyze',z.object({file}).strict()),
  op('asset.import',z.object({path:file,kind:z.enum(['aroll','screen','broll','reference','narration'])}).strict()),
  op('captions.import',z.object({path:file}).strict()),
  op('aroll.align',z.object({file,path:file}).strict()),
  op('local.generate',z.object({assetKey:z.string().regex(/^[a-z0-9][a-z0-9-]{0,60}$/),kind:z.enum(['image','video']),prompt:z.string().min(20).max(5000),sourceImage:file.optional(),sound:z.boolean().optional()}).strict()),
  op('local.collect',z.object({assetKey:z.string().regex(/^[a-z0-9][a-z0-9-]{0,60}$/)}).strict()),
  op('timeline.save',z.object({timeline:timelineSchema}).strict()),
  op('browser.open',z.object({kind,url:z.string().url().optional()}).strict()),
  op('browser.snapshot',z.object({kind}).strict()),
  op('browser.navigate',z.object({kind,url:z.string().url()}).strict()),
  op('browser.act',z.object({kind,action:z.enum(['click','fill','press','scroll']),ref:file.optional(),value:z.string().optional()}).strict()),
  op('heygen.create_draft',z.object({ref:file}).strict()),
  op('heygen.submit_video',z.object({ref:file}).strict()),
  op('heygen.download',z.object({ref:file}).strict()),
  op('heygen.link',z.object({kind:z.enum(['draft','video']),url:z.string().url()}).strict()),
]);
export const directorInputSchema=z.object({projectId:idSchema,operation:operationSchema,requestKey:z.string().min(1).max(200).optional()});

export function compactProject(p:Project){
  return {id:p.id,title:p.title,referenceUrl:p.referenceUrl,avatar:p.avatar,voice:p.voice,model:p.model,tone:p.tone,voiceSpeed:p.voiceSpeed??1,
    script:{words:p.script.trim()?p.script.trim().split(/\s+/).length:0,read:'script.read'},
    reference:p.reference?{title:p.reference.title,duration:p.reference.duration,captions:Array.isArray(p.reference.captions)?p.reference.captions.length:0,frames:Array.isArray(p.reference.frames)?p.reference.frames.length:0,read:'reference.read',visuals:'reference.frames'}:null,
    heygen:p.heygen,assets:p.assets,timeline:p.timeline?{clips:p.timeline.clips.length,duration:Math.max(...p.timeline.clips.map(c=>c.start+c.duration))}:null,
    render:p.render,events:p.events.slice(-5)};
}
