import React,{useEffect,useState} from 'react';
import {AbsoluteFill,Img,cancelRender,continueRender,delayRender,interpolate,useCurrentFrame} from 'remotion';
import type {FullPlan,TimedWord} from './full-types';

const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp'}as const;
const bg='radial-gradient(ellipse at 50% 48%,#0ba4cf 0%,#057e9d 44%,#033e4e 100%)';
const assetUrl=(plan:FullPlan,file:string)=>plan.baseUrl+'/'+file.split(/[\\/]/).map(encodeURIComponent).join('/');

// Block capture until the actual packaged font is available. A fallback changes
// line breaks and was one of the reviewed defects.
export function ReviewFont({plan,fontDataUrl}:{plan:FullPlan;fontDataUrl?:string}){
 const [handle]=useState(()=>delayRender('Load review title font'));
 useEffect(()=>{let active=true;const face=new FontFace('FrameReview',`url("${fontDataUrl||assetUrl(plan,plan.reviewEffects!.font)}")`,{weight:'700'});face.load().then(loaded=>{document.fonts.add(loaded);if(active)continueRender(handle)}).catch(cancelRender);return()=>{active=false}},[handle,fontDataUrl,plan.baseUrl,plan.reviewEffects?.font]);
 return null;
}

function Sweep({start}:{start:number}){
 const f=useCurrentFrame(),x=interpolate(f,[start,start+18],[-550,650],clamp);
 return <div style={{position:'absolute',inset:-200,background:'linear-gradient(115deg,transparent 42%,#ffffff12 46%,#ffffffe8 49%,#ffffff38 52%,transparent 56%)',transform:`translateX(${x}px)`,opacity:f>=start&&f<start+19?1:0,pointerEvents:'none'}}/>;
}

export function ReviewIntro({plan,length}:{plan:FullPlan;length:number}){
 const f=useCurrentFrame(),split=interpolate(f,[80,96],[0,1],clamp),rise=330*Math.pow(1-Math.min(1,f/24),3),leave=-1250*Math.pow(Math.max(0,(f-length+21)/21),3);
 const card:React.CSSProperties={position:'absolute',top:-210,width:420,height:420,borderRadius:78,overflow:'hidden',background:'#eeeeeb'};
 return <AbsoluteFill style={{background:bg,overflow:'hidden'}}><div style={{position:'absolute',left:960,top:540+rise+leave}}>
  <div style={{...card,left:-210-350*split}}><Img src={assetUrl(plan,plan.reviewEffects!.bananaCard)} style={{width:'100%',height:'100%'}}/><Sweep start={43}/></div>
  {f>=80&&<><svg width={280*split} height={30} style={{position:'absolute',left:210-350*split,top:-15,overflow:'hidden',filter:'drop-shadow(0 0 6px #d8fbff)'}}><line x1="0" y1="15" x2="280" y2="15" stroke="#caf6ff" strokeWidth="7" strokeLinecap="round" strokeDasharray="1 19" strokeDashoffset={-(f-80)*1.7}/></svg>
   <div style={{...card,left:140+550*Math.pow(1-split,3),opacity:split,display:'flex',alignItems:'center',justifyContent:'center'}}><svg viewBox="0 0 240 200" width="300"><path fill="#3479c7" d="M15 25h40v155l-40-12z"/><path fill="#4956b7" d="M75 75l40 13v65l-40 13z"/><path fill="#21bcae" d="M135 65l40-12v115l-40-10z"/><path fill="#98e0cb" d="M195 20h35v150l-35 10z"/></svg><Sweep start={102}/></div></>}
 </div></AbsoluteFill>;
}

export function ReviewWordCard({words}:{words:TimedWord[]}){
 const f=useCurrentFrame();
 return <AbsoluteFill style={{background:bg,alignItems:'center',justifyContent:'center',padding:'0 250px'}}><div style={{fontFamily:'FrameReview',fontWeight:700,fontSize:60,lineHeight:1.25,color:'white',width:1420}}>{words.map((word,i)=>{const age=f-word.from;return <React.Fragment key={i}><span style={{display:'inline-block',whiteSpace:'pre',opacity:interpolate(age,[0,5],[0,1],clamp),filter:`blur(${interpolate(age,[0,6],[9,0],clamp)}px)`,transform:`translateY(${interpolate(age,[0,6],[8,0],clamp)}px)`,color:word.highlight?'#fff066':'white',textShadow:word.highlight?'0 0 18px #fff06699':'0 0 10px #ffffff44'}}>{word.text}</span>{' '}</React.Fragment>})}</div></AbsoluteFill>;
}

export function ReviewCta({length}:{length:number}){
 const f=useCurrentFrame(),a=interpolate(f,[0,8,length-8,length],[0,1,1,0],clamp),rise=interpolate(f,[0,10],[120,0],clamp);
 return <AbsoluteFill style={{alignItems:'center',justifyContent:'flex-end',paddingBottom:100,pointerEvents:'none'}}><div style={{display:'flex',alignItems:'center',gap:22,opacity:a,transform:`translateY(${rise}px)`,filter:'drop-shadow(0 0 13px #48dfff)'}}><div style={{width:82,height:82,border:'5px solid #c3f8ff',borderRadius:'50%',background:'#09a6d8',display:'flex',alignItems:'center',justifyContent:'center'}}><svg width="44" height="48" viewBox="0 0 44 48"><path d="M7 13 22 28 37 13M7 26 22 41 37 26" fill="none" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/></svg></div><div style={{background:'#0aa8d6',border:'4px solid #b6f8ff',borderRadius:55,padding:'21px 45px',font:'700 52px FrameReview',color:'white',boxShadow:'inset 0 0 18px #51e4ff88'}}>LINK IN DESCRIPTION</div></div></AbsoluteFill>;
}

export function ReviewTitle({text,length}:{text:string;length:number}){
 const f=useCurrentFrame(),a=interpolate(f,[0,6,length-6,length],[0,1,1,0],clamp);
 return <AbsoluteFill style={{background:bg,alignItems:'center',justifyContent:'center',padding:200}}><div style={{font:'700 112px FrameReview',lineHeight:1.18,textAlign:'center',color:'white',opacity:a,transform:`scale(${interpolate(f,[0,9],[.94,1],clamp)})`,textShadow:'0 0 20px #d0faff55'}}>{text}</div></AbsoluteFill>;
}
