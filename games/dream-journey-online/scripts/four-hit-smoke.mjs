import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/xsy66/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const temp='E:/codex projects/games/dream-journey-online/.tmp/browser-four-hit';
fs.mkdirSync(temp,{recursive:true});process.env.TEMP=temp;process.env.TMP=temp;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
const page=await browser.newPage({viewport:{width:1280,height:850}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4174/prototypes/punch-test/index.html?four-hit-v1');
await page.waitForFunction(()=>window.punchDemo?.getState().ready);
await page.keyboard.down('a');await page.waitForTimeout(1100);await page.keyboard.up('a');
await page.keyboard.down('d');await page.waitForTimeout(220);await page.keyboard.up('d');await page.waitForTimeout(300);
await page.evaluate(()=>document.getElementById('debug').checked=true);
for(let i=0;i<4;i++){await page.keyboard.press('j');if(i<3)await page.waitForTimeout(65);}
await page.waitForFunction(()=>{const s=window.punchDemo.getState();return s.attackStage===3&&s.frame>=7&&s.frame<=10},null,{timeout:4000,polling:'raf'});
await page.keyboard.press('Escape');
const third=await page.evaluate(()=>window.punchDemo.getState());
assert.equal(third.drawing.clip,'turnPunch');
assert.equal(third.anchors.turnPunch.length,20);
assert.equal(new Set(third.anchors.turnPunch.map(i=>i.anchor)).size,1);
await page.screenshot({path:'verification/four-hit-third.png'});
await page.keyboard.press('Escape');
await page.waitForFunction(()=>window.punchDemo.getState().attackStage===4,null,{timeout:4000,polling:'raf'});
const fourth=await page.evaluate(()=>window.punchDemo.getState());
assert.equal(fourth.drawing.clip,'punch3');
await page.waitForFunction(()=>!window.punchDemo.getState().attack);
await page.keyboard.press('j');await page.waitForTimeout(600);await page.keyboard.press('j');
const expired=await page.evaluate(()=>window.punchDemo.getState());assert.equal(expired.attackStage,1);
await page.waitForTimeout(650);
for(let i=0;i<4;i++){await page.keyboard.press('j');if(i<3)await page.waitForTimeout(420);}
const paced=await page.evaluate(()=>window.punchDemo.getState());assert.equal(paced.attackStage,4);
// Isolate the third strike against a stationary target. Test hooks exist only in this routed response.
await page.route('**/movement-demo.mjs',async route=>{
 const response=await route.fetch();
 let body=await response.text();
 body=body.replace("if(pause){ctx.fillStyle=","if(false){ctx.fillStyle=");
 body+="\nwindow.thirdProbe=()=>{reset();enemy.cooldown=99;beginAttack(3);frame=6;attack.elapsed=6/FPS;updateDrawing();const box=fistBox(frame);const result=advanceAttack(attack,0,box,target,ATTACK_CONFIG[3].active,20);pause=true;draw();return {box,target,result};};";
 body+="\nwindow.launchProbe=()=>{reset();enemy.cooldown=99;pause=false;beginAttack(3);};";
 await route.fulfill({response,body});
});
await page.reload();
await page.waitForFunction(()=>window.punchDemo?.getState().ready);
const impact=await page.evaluate(()=>{document.getElementById('debug').checked=true;return window.thirdProbe();});
assert.equal(impact.result.hit,true,'third strike must hit the nearby target during its rising fist frame');
await page.screenshot({path:'verification/four-hit-third-impact.png'});
console.log(JSON.stringify({thirdImpact:impact},null,2));
await page.evaluate(()=>window.launchProbe());
await page.waitForFunction(()=>window.punchDemo.getState().enemy.airHeight>80,null,{polling:'raf'});
const airborne=await page.evaluate(()=>window.punchDemo.getState());
assert.equal(airborne.enemy.state,'airborne');
assert.equal(airborne.hits,1);
await page.screenshot({path:'verification/third-launch.png'});
await page.waitForFunction(()=>window.punchDemo.getState().enemy.state==='idle');
assert.equal((await page.evaluate(()=>window.punchDemo.getState())).enemy.airHeight,0);
console.log('Third attack launch integration: PASS');
assert.deepEqual(errors,[]);
console.log(JSON.stringify({rapid:[third.attackStage,fourth.attackStage],thirdClip:third.drawing.clip,thirdBox:third.box,oldUppercut:fourth.drawing.clip,expired:expired.attackStage,paced:paced.attackStage,errors},null,2));
} finally {await browser.close();}
