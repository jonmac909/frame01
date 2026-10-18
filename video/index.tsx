import React from 'react';
import {AbsoluteFill,Audio,Composition,Easing,Img,OffthreadVideo,Sequence,interpolate,registerRoot,useCurrentFrame,useVideoConfig} from 'remotion';
import type {Timeline} from '../src/core';
import {EffectLayer} from './effects';
import type {TimedEffect} from './effect-contract';
export type Props={timeline:Timeline;baseUrl:string;fontDataUrl?:string;effects?:TimedEffect[]};
const url=(base:string,file:string)=>base+'/'+file.split(/[\\/]/).map(encodeURIComponent).join('/');
function Sound({asset,start,duration,trim,volume,fade,baseUrl}:Timeline['audio'][number]&{baseUrl:string}){const frame=useCurrentFrame();const frames=duration*30;const ramp=Math.max(1,fade*30);const gain=Math.max(0,Math.min(1,frame/ramp,(frames-frame)/ramp));return <Audio src={url(baseUrl,asset)} startFrom={Math.round(trim*30)} volume={volume*gain}/>}
function Graphic({text,kind,accent,hasCaption}:{text:string;kind:string;accent:string;hasCaption:boolean}){
  const f=useCurrentFrame();const y=interpolate(f,[0,12],[30,0],{extrapolateRight:'clamp'});const opacity=interpolate(f,[0,8],[0,1],{extrapolateRight:'clamp'});
  if(kind==='credit')return <AbsoluteFill style={{padding:28,pointerEvents:'none'}}><div style={{alignSelf:'flex-start',background:'#10151ed9',borderRadius:8,padding:'10px 18px',color:'white',fontSize:24,opacity}}>{text}</div></AbsoluteFill>;
  if(kind==='center-text')return <AbsoluteFill style={{background:'radial-gradient(ellipse at center,#14bce8 0%,#08718e 48%,#083e52 100%)',justifyContent:'center',alignItems:'center',padding:250}}><div style={{color:'white',fontSize:58,lineHeight:1.3,fontWeight:700,maxWidth:1400,opacity}}>{text.split(' ').slice(0,Math.max(1,Math.floor(f/3))).join(' ')}</div></AbsoluteFill>;
  return <AbsoluteFill style={{justifyContent:kind==='lower-third'?'flex-end':'flex-start',alignItems:'flex-start',padding:90,paddingBottom:hasCaption?300:155,pointerEvents:'none'}}><div style={{opacity,transform:`translateY(${y}px)`,maxWidth:1400,background:'#10151eea',borderLeft:`8px solid ${accent}`,borderRadius:16,padding:'24px 36px',boxShadow:'0 20px 70px #0005',color:'white',fontSize:kind==='title'?72:44,fontWeight:750,lineHeight:1.12}}>{kind==='step'&&<div style={{fontSize:20,letterSpacing:4,color:accent,marginBottom:12}}>WORKFLOW</div>}{text}</div></AbsoluteFill>;
}
function Visual({clip,baseUrl}:{clip:Timeline['clips'][number];baseUrl:string}){
  const frame=useCurrentFrame(),card=clip.layout==='card';
  const {width,height}=useVideoConfig();
  const progress=interpolate(frame,[0,12],[0,1],{extrapolateRight:'clamp',easing:Easing.out(Easing.cubic)});
  const transform=clip.entrance==='rise'?`translateY(${(1-progress)*220}px)`:clip.entrance==='swipe'?`translateX(${(1-progress)*600}px)`:'none';
  const zoom=interpolate(frame,[0,Math.max(1,clip.duration*30-1)],[clip.zoom??1,clip.zoomEnd??clip.zoom??1],{extrapolateRight:'clamp',easing:Easing.inOut(Easing.cubic)});
  const focusX=interpolate(frame,[0,Math.max(1,clip.duration*30-1)],[clip.focusX??50,clip.focusXEnd??clip.focusX??50],{extrapolateRight:'clamp',easing:Easing.inOut(Easing.cubic)});
  const style:React.CSSProperties={width:'100%',height:'100%',objectFit:'contain',transform:`scale(${zoom})`,transformOrigin:`${focusX}% ${clip.focusY??50}%`};
  const media=clip.kind==='image'?<Img src={url(baseUrl,clip.asset)} style={style}/>:<OffthreadVideo src={url(baseUrl,clip.asset)} startFrom={Math.round(clip.trim*30)} muted={clip.muted} style={style}/>;
  const pose=(key:'scale'|'x'|'y')=>interpolate(frame,clip.camera!.map(p=>p.frame),clip.camera!.map(p=>p[key]),{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const camera=clip.camera?`translate(${pose('x')*width}px,${pose('y')*height}px) scale(${pose('scale')})`:'none';
  return <AbsoluteFill style={{overflow:'hidden',background:card?'radial-gradient(ellipse at center,#10bce8 0%,#08718e 53%,#083e52 100%)':'#10141d'}}><AbsoluteFill style={{alignItems:'center',justifyContent:'center',transform:camera,transformOrigin:'0 0'}}><div style={{width:card?'94%':'100%',height:card?'92%':'100%',borderRadius:card?18:0,border:card?'3px solid #72dbf5':undefined,overflow:'hidden',transform,boxShadow:card?'0 0 18px #18c9f040':undefined}}>{media}</div></AbsoluteFill></AbsoluteFill>;
}
export function Edit({timeline,baseUrl,fontDataUrl,effects=[]}:Props){
  const frame=useCurrentFrame();const {fps}=useVideoConfig();const seconds=frame/fps;
  const caption=timeline.captions.find(c=>seconds>=c.start&&seconds<c.end);
  return <AbsoluteFill style={{backgroundColor:'#10141d',fontFamily:timeline.font?'PackFont, Arial, sans-serif':'Arial, sans-serif'}}>
    {timeline.font&&<style>{`@font-face{font-family:PackFont;src:url("${fontDataUrl||url(baseUrl,timeline.font)}")}`}</style>}
    {timeline.narration&&<Audio src={url(baseUrl,timeline.narration)}/>}
    {(timeline.audio||[]).map(a=><Sequence key={a.id} from={Math.round(a.start*30)} durationInFrames={Math.round(a.duration*30)}><Sound {...a} baseUrl={baseUrl}/></Sequence>)}
    {timeline.clips.map(c=><Sequence key={c.id} from={Math.round(c.start*fps)} durationInFrames={Math.round(c.duration*fps)}><Visual clip={{...c,muted:Boolean(timeline.narration)||c.muted}} baseUrl={baseUrl}/></Sequence>)}
    {(timeline.overlays||[]).map(o=><Sequence key={o.id} from={Math.round(o.start*fps)} durationInFrames={Math.round(o.duration*fps)} style={{mixBlendMode:o.blend,opacity:o.opacity}}><div style={o.layout==='circle'?{position:'absolute',right:35,top:25,width:330,height:330,borderRadius:'50%',overflow:'hidden',border:'5px solid #16c9fa',boxShadow:'0 0 20px #16c9fa88'}:{width:'100%',height:'100%'}}><OffthreadVideo src={url(baseUrl,o.asset)} startFrom={Math.round(o.trim*fps)} muted style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'50% 38%'}}/></div></Sequence>)}
    {timeline.graphics.map((g,i)=><Sequence key={i} from={Math.round(g.start*fps)} durationInFrames={Math.round(g.duration*fps)}><Graphic {...g} accent={timeline.accent} hasCaption={timeline.captions.some(c=>c.end>g.start&&c.start<g.start+g.duration)}/></Sequence>)}
    <EffectLayer effects={effects} baseUrl={baseUrl}/>
    {caption&&<AbsoluteFill style={{justifyContent:'flex-end',alignItems:'center',padding:'0 100px 65px'}}><div style={{background:'#0b101be8',color:'#fff',borderRadius:16,padding:'14px 25px',fontSize:48,fontWeight:750,textAlign:'center',maxWidth:1500,borderBottom:`5px solid ${timeline.accent}`,textShadow:'0 2px 6px #000'}}>{caption.text}</div></AbsoluteFill>}
  </AbsoluteFill>;
}
const defaults:Props={baseUrl:'http://127.0.0.1:4317',timeline:{title:'Video editor',accent:'#d4fa72',fps:30,width:1920,height:1080,clips:[],captions:[],graphics:[],audio:[],overlays:[]}};
registerRoot(()=> <Composition id="CourseEditor" component={Edit} width={1920} height={1080} fps={30} durationInFrames={30} defaultProps={defaults} calculateMetadata={({props})=>({durationInFrames:Math.max(1,Math.ceil(Math.max(...props.timeline.clips.map(c=>c.start+c.duration))*30))})}/>);
