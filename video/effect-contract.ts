import {z} from 'zod';

const color=z.string().regex(/^#[a-f\d]{6}$/i),pos=z.number().finite().min(0).max(1);
const box={x:pos,y:pos,width:z.number().positive().max(1),height:z.number().positive().max(1)};
// Versions change when timing or pixels change. No arbitrary CSS/code in model inputs.
export const effectSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('diagonal-sweep'),version:z.literal(1),...box,color,angle:z.number().min(-75).max(75),travelFrames:z.number().int().min(2).max(90)}).strict(),
  z.object({kind:z.literal('dotted-connector'),version:z.literal(1),x:pos,y:pos,width:pos,color,dotSize:z.number().min(2).max(20),travelFrames:z.number().int().min(2).max(90)}).strict(),
  z.object({kind:z.literal('word-reveal'),version:z.literal(1),text:z.string().min(1).max(180),color,fontSize:z.number().min(24).max(160),x:pos,y:pos}).strict(),
  z.object({kind:z.literal('flash'),version:z.literal(1),color,opacity:z.number().min(0).max(.8),attackFrames:z.number().int().min(1).max(12)}).strict(),
  z.object({kind:z.literal('cta'),version:z.literal(1),text:z.string().min(1).max(100),color,background:color,x:pos,y:pos,enterFrames:z.number().int().min(2).max(30)}).strict(),
  z.object({kind:z.literal('camera'),version:z.literal(1),asset:z.string().min(1),...box,scaleFrom:z.number().min(1).max(3),scaleTo:z.number().min(1).max(3),focusX:pos,focusY:pos}).strict(),
  z.object({kind:z.literal('presenter-inset'),version:z.literal(1),asset:z.string().min(1),trim:z.number().int().nonnegative(),...box,color,circle:z.boolean()}).strict(),
]);
export type Effect=z.infer<typeof effectSchema>;
export type TimedEffect={id:string;from:number;to:number;effect:Effect};
export const effectCatalog={version:1,fps:30,dimensions:[1920,1080],kinds:['diagonal-sweep','dotted-connector','word-reveal','flash','cta','camera','presenter-inset'],policy:'Use only effects present in the reference or requested by the owner. Each word reveal is one measured word anchor; never guess equal word intervals.'};
export const clamp01=(v:number)=>Math.max(0,Math.min(1,v));
export function effectProgress(frame:number,length:number,effect:Effect){
  const travel='travelFrames' in effect?effect.travelFrames:'enterFrames' in effect?effect.enterFrames:Math.max(1,length-1);
  const p=clamp01(frame/travel);
  return {progress:p,eased:1-(1-p)**3,flash:effect.kind==='flash'?clamp01(frame<effect.attackFrames?frame/effect.attackFrames:(length-1-frame)/Math.max(1,length-1-effect.attackFrames))*effect.opacity:0};
}
