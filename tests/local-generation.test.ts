import test from 'node:test';
import assert from 'node:assert/strict';
import {assertLocalIdle} from '../src/local-generation.js';
test('local examples cannot start while GPU1 has active or queued work',()=>{
  const q={jobs:[],autoaigen_busy:[],autoaigen_waiting:[],switching:null},g={gpus:[{id:'gpu1',state:'available',generator_busy:false,jobs:[],queued:0,upcoming:[]}]};
  assert.doesNotThrow(()=>assertLocalIdle(q,g));
  assert.throws(()=>assertLocalIdle({...q,jobs:[{}]},g),/busy/);
  assert.throws(()=>assertLocalIdle({...q,autoaigen_waiting:[{}]},g),/busy/);
  assert.throws(()=>assertLocalIdle(q,{gpus:[{...g.gpus[0],queued:1}]}),/queued/);
  assert.throws(()=>assertLocalIdle(q,{gpus:[{...g.gpus[0],state:'busy'}]}),/active/);
  assert.throws(()=>assertLocalIdle({},g),/unavailable/);
});
