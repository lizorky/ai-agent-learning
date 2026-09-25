import test from 'node:test';
import assert from 'node:assert/strict';
import {createJump,requestJump,updateJump,jumpDrawing} from './jump.mjs';
test('takeoff, two jumps only, land and reset',()=>{const j=createJump();assert(requestJump(j));assert.equal(jumpDrawing(j).clip,'takeoff');assert(!requestJump(j));for(let i=0;i<20;i++)updateJump(j,.01);assert.equal(j.state,'air');assert(requestJump(j));assert.equal(j.count,2);assert(!requestJump(j));for(let i=0;i<200;i++)updateJump(j,.01);assert.equal(j.state,'ground');assert.equal(j.height,0);assert.equal(j.count,0);assert(requestJump(j));});
test('second jump never replays grounded anticipation',()=>{const j=createJump();requestJump(j);updateJump(j,.18);updateJump(j,.15);requestJump(j);assert.equal(jumpDrawing(j).clip,'rise');assert(j.height>0);});
