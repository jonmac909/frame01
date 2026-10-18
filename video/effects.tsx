import React from 'react';
import {AbsoluteFill,Img,OffthreadVideo,Sequence,useCurrentFrame} from 'remotion';
import {effectProgress,type Effect,type TimedEffect} from './effect-contract';

const url=(base:string,file:string)=>base+'/'+file.split(/[\\/]/).map(encodeURIComponent).join('/');
export function EffectVisual({effect:e,length,baseUrl}:{effect:Effect;length:number;baseUrl:string}){
  const f=useCurrentFrame(),p=effectProgress(f,length,e),xy='x'in e?{left:e.x*1920,top:e.y*1080}:{};
  if(e.kind==='flash')return <AbsoluteFill style={{background:e.color,opacity:p.flash,mixBlendMode:'screen',pointerEvents:'none'}}/>;
  if(e.kind==='diagonal-sweep')return <div style={{position:'absolute',...xy,width:e.width*1920,height:e.height*1080,overflow:'hidden',pointerEvents:'none'}}><div style={{position:'absolute',height:'200%',width:'22%',top:'-50%',left:`${-50+p.progress*200}%`,background:`linear-gradient(90deg,transparent,${e.color},transparent)`,transform:`rotate(${e.angle}deg)`}}/></div>;
  if(e.kind==='dotted-connector')return <div style={{position:'absolute',...xy,width:e.width*1920*p.eased,borderTop:`${e.dotSize}px dotted ${e.color}`,filter:`drop-shadow(0 0 4px ${e.color})`}}/>;
  if(e.kind==='word-reveal')return <div style={{position:'absolute',...xy,transform:'translate(-50%,-50%)',fontSize:e.fontSize,fontWeight:700,color:e.color,whiteSpace:'pre-wrap',textAlign:'center'}}>{e.text}</div>;
  if(e.kind==='cta')return <div style={{position:'absolute',...xy,transform:`translate(-50%,${(1-p.eased)*120}px)`,opacity:p.eased,background:e.background,color:e.color,padding:'22px 36px',borderRadius:18,fontSize:40,fontWeight:700,maxWidth:1500,textAlign:'center'}}>{e.text}</div>;
  if(e.kind==='camera')return <div style={{position:'absolute',...xy,width:e.width*1920,height:e.height*1080,overflow:'hidden'}}><Img src={url(baseUrl,e.asset)} style={{width:'100%',height:'100%',objectFit:'contain',transform:`scale(${e.scaleFrom+(e.scaleTo-e.scaleFrom)*p.eased})`,transformOrigin:`${e.focusX*100}% ${e.focusY*100}%`}}/></div>;
  return <div style={{position:'absolute',...xy,width:e.width*1920,height:e.height*1080,borderRadius:e.circle?'50%':16,border:`5px solid ${e.color}`,overflow:'hidden'}}><OffthreadVideo src={url(baseUrl,e.asset)} startFrom={e.trim} muted style={{width:'100%',height:'100%',objectFit:'cover'}}/></div>;
}
export function EffectLayer({effects,baseUrl,offset=0,length=Infinity}:{effects:TimedEffect[];baseUrl:string;offset?:number;length?:number}){return <>{effects.filter(e=>e.from<offset+length&&e.to>offset).map(e=><Sequence key={e.id} from={e.from-offset} durationInFrames={e.to-e.from}><EffectVisual effect={e.effect} length={e.to-e.from} baseUrl={baseUrl}/></Sequence>)}</>}
