const {chromium}=require('C:/Users/xsy66/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
process.env.TEMP=process.env.TMP='E:/codex projects/games/dream-journey-online/.tmp/browser-four-hit';
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/movement-demo.mjs',async route=>{
   const response=await route.fetch();const body=(await response.text()).replace("isInsideEnemyWeaponRange(target,bodies)&&jump.state==='ground'",'false'); // Isolate movement from enemy hit-stun; combat has its own smoke test.
   await route.fulfill({response,body:body+'\nwindow.place=(v,d)=>{reset();x=v;motion.direction=d;enemy.cooldown=100;};'});
  });
  await p.goto('http://127.0.0.1:4174/prototypes/punch-test/index.html?movement-regression');
  await p.waitForFunction(()=>window.punchDemo?.getState().ready);
  const state=()=>p.evaluate(()=>window.punchDemo.getState());
  for(const [position,key,dir] of [[550,'d',1],[895,'a',-1]]){
   await p.evaluate(([v,d])=>window.place(v,d),[position,dir]);
   await p.keyboard.down(key);await p.keyboard.press('j');
   await p.waitForFunction(()=>!window.punchDemo.getState().attack);
   await p.waitForTimeout(650);
   const s=await state();await p.keyboard.up(key);
   assert.ok(dir===1?s.x<=602.265:s.x>=839.735,'walking after recovery must not cross enemy');
   console.log('Recovery collision',key,s.x);
   const away=dir===1?'a':'d';await p.keyboard.down(away);await p.waitForTimeout(400);await p.keyboard.up(away);
   assert.ok(dir*((await state()).x-s.x)<-10,'must be able to retreat');
  }
  await p.evaluate(()=>window.place(1400,1));
  await p.keyboard.press('j');await p.keyboard.down('a');await p.waitForTimeout(100);
  const reverse=await state();assert.equal(reverse.x,1400,'reverse input must not slide an active punch');
  assert.equal(reverse.direction,1,'active punch facing stays fixed');
  await p.waitForFunction(()=>!window.punchDemo.getState().attack);await p.waitForTimeout(350);
  assert.ok((await state()).x<1390,'held reverse input resumes after recovery');await p.keyboard.up('a');
  await p.evaluate(()=>window.place(1400,1));
  await p.keyboard.down('d');await p.keyboard.press('j');await p.waitForTimeout(80);await p.keyboard.up('d');
  const stopped=await state();await p.waitForTimeout(50);const settling=await state();
  assert.equal(settling.x,stopped.x,'settling cannot slide the character');
  await p.waitForTimeout(200);const settled=await state();
  assert.equal(settled.gait.phase,.75);assert.equal(settled.gait.settled,true);
  await p.waitForTimeout(150);assert.equal((await state()).gait.phase,.75);
  assert.ok(settled.bodyBoxes.length>1,'composited stance must use pose boxes');
  assert.ok(settled.bodyBoxes.every(r=>Number.isFinite(r.x+r.y+r.w+r.h)&&r.w>0&&r.h>0));
  assert.deepEqual(errors,[]);console.log('Release: no slide, planted within 250ms, pose boxes valid; no browser errors');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
