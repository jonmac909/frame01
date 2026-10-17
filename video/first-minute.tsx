import React from 'react';
import {AbsoluteFill,Audio,Composition,Easing,Img,OffthreadVideo,Sequence,interpolate,registerRoot,useCurrentFrame} from 'remotion';

export type NarrationCut={start:number;end:number;trim:number};
export type OpeningProps={baseUrl:string;aroll:string;whoosh:string;audioCuts:NarrationCut[]};
const bg='radial-gradient(ellipse at 50% 48%,#0ba4cf 0%,#057e9d 44%,#033e4e 100%)';
const url=(base:string,file:string)=>base+'/'+file.split(/[\\/]/).map(encodeURIComponent).join('/');
const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp'} as const;
const ease=(n:number,a:number,b:number,x:number,y:number)=>interpolate(n,[a,b],[x,y],{...clamp,easing:Easing.inOut(Easing.cubic)});
const out=(n:number,a:number,b:number,x:number,y:number)=>interpolate(n,[a,b],[x,y],{...clamp,easing:Easing.out(Easing.cubic)});
function Logo({kind}:{kind:'banana'|'seedance'|'openart'}){
 return <div style={{width:420,height:420,borderRadius:78,background:'#eeeeeb',display:'flex',alignItems:'center',justifyContent:'center'}}>{kind==='banana'?<span style={{fontSize:275,lineHeight:1}}>🍌</span>:kind==='seedance'?<svg viewBox="0 0 240 200" width="300"><path fill="#3479c7" d="M15 25h40v155l-40-12z"/><path fill="#4956b7" d="M75 75l40 13v65l-40 13z"/><path fill="#21bcae" d="M135 65l40-12v115l-40-10z"/><path fill="#98e0cb" d="M195 20h35v150l-35 10z"/></svg>:<svg width="300" viewBox="0 0 220 140"><path d="M28 99V45q0-28 23-12l97 67c47 30 70-46 28-64-25-12-39 3-65 27L49 111q-19 15-21-12Z" fill="none" stroke="#111" strokeWidth="17" strokeLinecap="round" strokeLinejoin="round"/><path d="m30 43 34 25" stroke="#eee" strokeWidth="13"/></svg>}</div>
}
function Video({baseUrl,file,trim=0,style={}}:{baseUrl:string;file:string;trim?:number;style?:React.CSSProperties}){return <OffthreadVideo src={url(baseUrl,file)} startFrom={Math.round(trim*30)} muted style={{width:'100%',height:'100%',objectFit:'cover',...style}}/>}
function Narration({baseUrl,aroll,cut,circle=false}:{baseUrl:string;aroll:string;cut:NarrationCut;circle?:boolean}){
 const f=useCurrentFrame();
 const scale=1.25+out(f,0,Math.round((cut.end-cut.start)*30),0,.035);
 return <Video baseUrl={baseUrl} file={aroll} trim={cut.trim} style={{transform:circle?'none':`scale(${scale})`,transformOrigin:'50% 38%'}}/>;
}
function Intro(){const t=useCurrentFrame()/30,split=ease(t,2.65,3.2,0,1),rise=out(t,0,.8,330,0),leave=ease(t,4.5,5.2,0,-1250);return <AbsoluteFill style={{background:bg,overflow:'hidden'}}><div style={{position:'absolute',left:960,top:540+rise+leave}}><div style={{position:'absolute',left:-210-350*split,top:-210}}><Logo kind="banana"/></div>{t>=2.65&&<><div style={{position:'absolute',left:-350*split+210,top:0,width:280*split,borderTop:'7px dotted #caf6ff',filter:'drop-shadow(0 0 5px white)'}}/><div style={{position:'absolute',left:140+ease(t,2.65,3.2,550,0),top:-210,opacity:split}}><Logo kind="seedance"/></div></>}</div></AbsoluteFill>}
function Teaser({baseUrl}:{baseUrl:string}){
 const t=useCurrentFrame()/30,absolute=t+4.6;
 // The source cuts wide -> reaction -> speaker -> two-shot -> wide.
 const scale=absolute<11.1667?1:absolute<13.1333?2.7:absolute<17.7667?2.7:absolute<19.8?1.65:1;
 const origin=absolute<13.1333?'64% 55%':absolute<17.7667?'38% 57%':'50% 64%';
 return <AbsoluteFill style={{transform:`translateY(${ease(absolute,4.6,5.2333,1080,0)}px)`,overflow:'hidden'}}>
 <div style={{width:'100%',height:'100%',transform:`scale(${scale})`,transformOrigin:origin}}>
 <Sequence from={0} durationInFrames={18}><Img src={url(baseUrl,'assets/local-opening-workshop-wide.png')} style={{width:'100%',height:'100%',objectFit:'cover'}}/></Sequence>
 <Sequence from={18} durationInFrames={299}><Video baseUrl={baseUrl} file="assets/opening-dialogue-first-timed.mp4"/></Sequence>
 <Sequence from={317} durationInFrames={300}><Video baseUrl={baseUrl} file="assets/opening-dialogue-second-clean.mp4"/></Sequence>
 </div></AbsoluteFill>
}
function Card({baseUrl,file,x=0,y=0,trim=0,blur=0}:{baseUrl:string;file:string;x?:number;y?:number;trim?:number;blur?:number}){return <div style={{position:'absolute',left:180,top:108,width:1560,height:864,transform:`translate(${x}px,${y}px)`,border:'3px solid #6ed8f5',borderRadius:22,overflow:'hidden',boxShadow:'0 0 15px #40d2ff55',filter:blur?`blur(${blur}px)`:'none'}}><Video baseUrl={baseUrl} file={file} trim={trim}/></div>}
function Stage({baseUrl}:{baseUrl:string}){const t=useCurrentFrame()/30;return <AbsoluteFill style={{background:bg}}><Card baseUrl={baseUrl} file="assets/local-rubber-hose-magic-motion.mp4" y={out(t,0,1,1150,0)} trim={.5}/></AbsoluteFill>}
const positions=[0,1.1,1.55,1.85,2.08,2.33,2.65,3.25];
const values=[0,0,1,2,3,4,5,6];
function Montage({baseUrl}:{baseUrl:string}){const t=useCurrentFrame()/30;const pos=interpolate(t,positions,values,{...clamp,easing:Easing.inOut(Easing.cubic)});const old=interpolate(t-1/30,positions,values,{...clamp,easing:Easing.inOut(Easing.cubic)});const blur=Math.min(11,Math.abs(pos-old)*48);const files=['3d-badger-scene','watercolor-village','rubber-hose-magic','paper-underwater','nineties-dialogue','anime-bridge','clay-kite'];return <AbsoluteFill style={{background:bg,overflow:'hidden'}}>{files.map((key,i)=>Math.abs(i-pos)<1.6&&<Card key={key} baseUrl={baseUrl} file={`assets/local-${key}-motion.mp4`} trim={1} x={(i-pos)*1650} y={out(t,0,.55,1200,0)} blur={blur}/>)}</AbsoluteFill>}
function OpenArtLogo(){const t=useCurrentFrame()/30;return <AbsoluteFill style={{background:bg,alignItems:'center',justifyContent:'center'}}><div style={{transform:`translateY(${out(t,0,.45,220,0)}px) scale(.93)`}}><Logo kind="openart"/></div><div style={{position:'absolute',top:780,font:'700 160px Arial',color:'transparent',WebkitTextStroke:'3px #dcfbff',textShadow:'0 0 16px #8bdef5',opacity:out(t,.65,1.1,0,1)}}>OpenArt</div></AbsoluteFill>}
function HomeScreen({baseUrl,aroll,trim}:{baseUrl:string;aroll:string;trim:number}){const f=useCurrentFrame();return <AbsoluteFill style={{transform:`translateX(${out(f,0,14,700,0)}px) scale(${out(f,0,14,1.3,1)})`}}><Img src={url(baseUrl,'assets/openart-home-capture.jpg')} style={{width:'100%',height:'100%',objectFit:'cover'}}/><div style={{position:'absolute',right:25,top:20,width:320,height:320,borderRadius:'50%',overflow:'hidden',border:'6px solid #12cffa',boxShadow:'0 0 18px #10d2ff88'}}><Video baseUrl={baseUrl} file={aroll} trim={trim}/></div></AbsoluteFill>}
function Flash(){const f=useCurrentFrame();return <AbsoluteFill style={{background:`linear-gradient(100deg,transparent,#54cfff 35%,#fff 46%,#fff4 65%,transparent)`,opacity:interpolate(f,[0,4,12],[0,.7,0],clamp),mixBlendMode:'screen',transform:`translateX(${interpolate(f,[0,12],[-1000,1000])}px)`}}/>}
export function FirstMinute(p:OpeningProps){const f=useCurrentFrame(),last=p.audioCuts[p.audioCuts.length-1];const cut=p.audioCuts.find(c=>f>=Math.round(c.start*30)&&f<Math.round(c.end*30))??(last&&f>=Math.round(last.end*30)?last:undefined);return <AbsoluteFill style={{background:'#10141d',overflow:'hidden'}}>
 {p.audioCuts.map((c,i)=><Sequence key={i} from={Math.round(c.start*30)} durationInFrames={Math.round(c.end*30)-Math.round(c.start*30)}><Audio src={url(p.baseUrl,p.aroll)} startFrom={Math.round(c.trim*30)} volume={1}/></Sequence>)}
 <Sequence from={156} durationInFrames={299}><Audio src={url(p.baseUrl,'assets/opening-dialogue-first-timed.mp4')} volume={v=>v<87?.08:.7}/></Sequence>
 <Sequence from={455} durationInFrames={277}><Audio src={url(p.baseUrl,'assets/local-opening-dialogue-second.mp4')} volume={.7}/></Sequence>
 {cut&&<Sequence from={Math.round(cut.start*30)} durationInFrames={Math.round((cut===p.audioCuts[p.audioCuts.length-1]?60:cut.end)*30)-Math.round(cut.start*30)}><Narration baseUrl={p.baseUrl} aroll={p.aroll} cut={cut}/></Sequence>}
 <Sequence from={0} durationInFrames={158}><Intro/></Sequence>
 <Sequence from={138} durationInFrames={597}><Teaser baseUrl={p.baseUrl}/></Sequence>
 <Sequence from={896} durationInFrames={111}><Stage baseUrl={p.baseUrl}/></Sequence>
 <Sequence from={1007} durationInFrames={112}><Video baseUrl={p.baseUrl} file="recordings/openart-model-and-image-settings.mp4" trim={52} style={{transform:'scale(1.3)',transformOrigin:'50% 20%'}}/></Sequence>
 <Sequence from={1110} durationInFrames={113}><Montage baseUrl={p.baseUrl}/></Sequence>
 <Sequence from={1324} durationInFrames={48}><OpenArtLogo/></Sequence>
 <Sequence from={1600} durationInFrames={94}><HomeScreen baseUrl={p.baseUrl} aroll={p.aroll} trim={40.686}/></Sequence>
 <Sequence from={1764} durationInFrames={36}><Video baseUrl={p.baseUrl} file="assets/local-3d-badger-scene-motion.mp4" trim={1}/><Audio src={url(p.baseUrl,'assets/local-3d-badger-scene-motion.mp4')} startFrom={30} volume={.45}/></Sequence>
 {[731,1370].map(n=><Sequence key={n} from={n} durationInFrames={13}><Flash/></Sequence>)}
 {[0,2.8,4.65,29.7,37,38.35,38.7,39.05,39.35,39.75,44.1333,53.33].map((s,i)=><Sequence key={i} from={Math.round(s*30)} durationInFrames={24}><Audio src={url(p.baseUrl,p.whoosh)} volume={i<3?.07:.045}/></Sequence>)}
 </AbsoluteFill>}
registerRoot(()=> <Composition id="FirstMinute" component={FirstMinute} durationInFrames={1800} fps={30} width={1920} height={1080} defaultProps={{baseUrl:'',aroll:'',whoosh:'',audioCuts:[]}}/>);
