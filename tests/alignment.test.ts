import test from 'node:test';
import assert from 'node:assert/strict';
import {alignSections} from '../src/alignment.js';
test('section alignment uses actual cue boundaries and preserves speech speed',()=>{
  const sections=[{start:0,end:10,sourceWords:2,text:'Hello there.'},{start:10,end:20,sourceWords:2,text:'Good bye.'}];
  const cues=[{start:0,end:3,text:'Hello there.'},{start:3,end:7,text:'Good bye.'}];
  const result=alignSections('Hello there.\n\nGood bye.',sections,cues,8);
  assert.deepEqual(result.map(s=>[s.sourceStart,s.sourceEnd,s.gapSeconds]),[[0,3,7],[3,8,5]]);
  assert.throws(()=>alignSections('Changed narration',sections,cues,8),/complete saved narration/);
  assert.throws(()=>alignSections('Hello there. Good bye.',sections,[{start:0,end:7,text:'Hello there. Good bye.'}],8),/inside a caption/);
  assert.throws(()=>alignSections('Hello there. Good bye.',sections,[{start:0,end:3,text:'Hello there.'},{start:3,end:9,text:'Good bye.'}],8),/inside the measured/);
  assert.throws(()=>alignSections('Hello there. Good bye.',[{...sections[0],end:2},sections[1]],cues,8),/Do not accelerate/);
});
