import test from 'node:test';
import assert from 'node:assert/strict';
import {createAttack,advanceAttack} from './combat.mjs';
const target={x:100,y:100,w:40,h:80},overlap={x:110,y:110,w:20,h:20},far={x:0,y:0,w:10,h:10};
test('one swing hits only once even while overlapping',()=>{const a=createAttack();let hits=0;for(let i=0;i<70;i++)hits+=Number(advanceAttack(a,1/120,overlap,target).hit);assert.equal(hits,1);});
test('out of range never hits',()=>{const a=createAttack();for(let i=0;i<70;i++)assert.equal(advanceAttack(a,1/120,far,target).hit,false);});
test('startup and recovery do not damage; swing finishes',()=>{const a=createAttack();assert.equal(advanceAttack(a,.1,overlap,target).hit,false);assert.equal(advanceAttack(a,.25,overlap,target).hit,false);assert.equal(advanceAttack(a,.25,overlap,target).done,true);});
