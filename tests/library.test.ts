import test from 'node:test';
import assert from 'node:assert/strict';
import {timelineSchema} from '../src/core.js';
import {parseVtt} from '../src/reference.js';
test('SRT millisecond commas are parsed accurately',()=>{assert.deepEqual(parseVtt('1\n00:00:01,250 --> 00:00:03,500\nHello world'),[{start:1.25,end:3.5,text:'Hello world'}])});
test('SFX gains and timing reject out-of-range values',()=>{const timeline={title:'test',clips:[{id:'a',asset:'a.mp4',start:0,duration:3,kind:'screen'}],audio:[{id:'sfx',asset:'click.mp3',start:1,duration:1,volume:4}]};assert.equal(timelineSchema.safeParse(timeline).success,false);timeline.audio[0].volume=.2;assert.equal(timelineSchema.safeParse(timeline).success,true)});
