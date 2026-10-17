import fs from 'node:fs/promises';
import {setTimeout} from 'node:timers/promises';
const token=await fs.readFile('data/runtime-token','utf8');
async function post(route:string,body:unknown){const r=await fetch('http://127.0.0.1:4317'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Editor-Token':token},body:JSON.stringify(body)});const result:any=await r.json();if(!r.ok)throw new Error(result.error);return result}
const project=await post('/api/projects',{title:'Capture and export verification',referenceUrl:'https://www.youtube.com/watch?v=rOl7ZLG4BRg',avatar:'Test only - no HeyGen generation',voice:'No voice generated'});
const act=(name:string,args={})=>post(`/api/projects/${project.id}/action`,{name,args});
const open=await act('browser.open',{kind:'walkthrough',url:'http://127.0.0.1:4317'});console.log('Opened',open.url);
await act('record.start');await setTimeout(1500);
let snap=await act('browser.snapshot',{kind:'walkthrough'});
const tab=snap.elements.find((e:any)=>e.text==='Media & capture');if(!tab)throw new Error('Expected capture tab missing.');
await act('browser.act',{kind:'walkthrough',action:'click',ref:tab.ref});await setTimeout(1500);
const recorded=await act('record.stop');console.log('Recorded',recorded.file);
await act('timeline.save',{timeline:{title:'Browser capture verification',accent:'#d4fa72',fps:30,width:1920,height:1080,clips:[{id:'capture',asset:recorded.file,start:0,duration:3,trim:0,kind:'screen',muted:true}],captions:[{start:.5,end:2.8,text:'Real browser capture • local export test'}],graphics:[{start:0,duration:2.5,text:'Browser recording verified',kind:'lower-third'}]}});
const rendered=await act('render');console.log(JSON.stringify({projectId:project.id,recording:recorded.file,render:rendered.render},null,2));
await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/recording-render-proof.json',JSON.stringify({projectId:project.id,recording:recorded.file,render:rendered.render},null,2));
