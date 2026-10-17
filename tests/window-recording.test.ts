import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRecordingWindow,type CaptureWindow} from '../src/window-recording.js';
import {operationSchema} from '../src/director-contract.js';
const window=(hwnd:number,title:string):CaptureWindow=>({hwnd,pid:100,title,process:'chrome',width:1920,height:1300,outerWidth:1942,outerHeight:1311,minimized:false,foreground:false,captureHwnd:hwnd,captureWidth:1920,captureHeight:1080});
test('unattended capture never guesses among unrelated Chrome windows',()=>{
 const windows=[window(123,'OpenArt'),window(456,'Other work')];
 assert.throws(()=>selectRecordingWindow(windows,{}),/exactly one/);
 assert.equal(selectRecordingWindow(windows,{windowId:123}).hwnd,123);
 assert.throws(()=>selectRecordingWindow(windows,{windowId:789}),/found 0/);
 assert.throws(()=>selectRecordingWindow([windows[0],{...windows[0],hwnd:999}],{title:'OpenArt'}),/found 2/);
 assert.throws(()=>selectRecordingWindow([{...windows[0],minimized:true}],{windowId:123}),/Restore/);
});
test('agent can select a capture window and duration without extension attachment',()=>{
 assert.doesNotThrow(()=>operationSchema.parse({name:'record.start',args:{windowId:123,maxSeconds:60,viewport:{width:1280,height:720}}}));
 assert.throws(()=>operationSchema.parse({name:'record.start',args:{windowId:-1}}));
 assert.throws(()=>operationSchema.parse({name:'record.start',args:{maxSeconds:999999}}));
 assert.doesNotThrow(()=>operationSchema.parse({name:'record.prepare',args:{url:'https://openart.ai/home'}}));
});
