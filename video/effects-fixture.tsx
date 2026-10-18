import React from 'react';
import {AbsoluteFill,Composition,registerRoot} from 'remotion';
import {EffectLayer} from './effects';
import type {TimedEffect} from './effect-contract';
const effects:TimedEffect[]=[
  {id:'sweep',from:0,to:45,effect:{kind:'diagonal-sweep',version:1,x:.05,y:.1,width:.3,height:.3,color:'#ffffff',angle:30,travelFrames:30}},
  {id:'connector',from:0,to:60,effect:{kind:'dotted-connector',version:1,x:.5,y:.2,width:.4,color:'#ffffff',dotSize:8,travelFrames:30}},
  {id:'word',from:30,to:60,effect:{kind:'word-reveal',version:1,text:'Measured word',color:'#ffffff',fontSize:64,x:.5,y:.5}},
  {id:'cta',from:0,to:60,effect:{kind:'cta',version:1,text:'Reference-matched CTA',color:'#ffffff',background:'#08718e',x:.5,y:.78,enterFrames:15}},
];
function Fixture(){return <AbsoluteFill style={{background:'#102536',fontFamily:'Arial'}}><EffectLayer effects={effects} baseUrl=""/></AbsoluteFill>}
registerRoot(()=> <Composition id="EffectRegression" component={Fixture} width={1920} height={1080} fps={30} durationInFrames={60}/>);
