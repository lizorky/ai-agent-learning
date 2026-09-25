import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEnemy,launchEnemy,staggerEnemy,updateEnemy,enemyFrame} from './enemy-combat.mjs';
test('stagger interrupts a swing but enemy recovers and attacks again',()=>{
 const e=createEnemy(),box={x:0,y:0,w:100,h:100};
 e.state='attack';e.attackTime=.6;staggerEnemy(e);
 for(let i=0;i<40;i++)assert.equal(updateEnemy(e,1/60,true,box,box).hit,false);
 assert.equal(e.state,'stunned');
 let hit=false;
 for(let i=0;i<150;i++)hit=updateEnemy(e,1/60,true,box,box).hit||hit;
 assert.equal(hit,true);
});
test('launch interrupts attack, cannot damage while airborne, and lands with cooldown',()=>{
 const e=createEnemy(), box={x:0,y:0,w:100,h:100};
 e.state='attack';e.attackTime=.6;launchEnemy(e);
 let peak=0;
 for(let i=0;i<80;i++){
   assert.equal(updateEnemy(e,1/60,true,box,box).hit,false);
   peak=Math.max(peak,e.airHeight);
   if(e.state==='airborne')assert.equal(enemyFrame(e).active,false);
 }
 assert.ok(peak>136&&peak<138);
 assert.equal(e.airHeight,0);assert.equal(e.state,'idle');assert.ok(e.cooldown>0);
});
