const {chromium}=require('C:/Users/xsy66/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
process.env.TEMP=process.env.TMP='E:/codex projects/games/dream-journey-online/.tmp/browser-four-hit';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/movement-demo.mjs',async route=>{
  const response=await route.fetch();let body=await response.text();
  body+='\nwindow.placeForGait=(position,dir)=>{reset();x=position;motion.direction=dir;};';
  await route.fulfill({response,body:body.replace('\\nwindow.placeForGait','\nwindow.placeForGait')});
 });
 await page.goto('http://127.0.0.1:4174/prototypes/punch-test/index.html?walk-gait-v2');
 await page.waitForFunction(()=>window.punchDemo?.getState().ready);
 for(const [position,key,dir]of [[1100,'a',-1],[1400,'d',1]]){
  await page.evaluate(([x,d])=>window.placeForGait(x,d),[position,dir]);
  await page.evaluate(()=>{window.gaitSamples=[];window.gaitTimer=setInterval(()=>{const s=window.punchDemo.getState();if(s.attack)window.gaitSamples.push({stage:s.attackStage,x:s.x,leg:s.gait.frame,enabled:s.gait.enabled});},16);});
  await page.keyboard.down(key);
  for(let i=0;i<4;i++){await page.keyboard.press('j');if(i<3)await page.waitForTimeout(65);}
  await page.waitForFunction(()=>window.punchDemo.getState().attackStage===4);
  await page.waitForFunction(()=>!window.punchDemo.getState().attack);
  await page.keyboard.up(key);
  const samples=await page.evaluate(()=>{clearInterval(window.gaitTimer);return window.gaitSamples;});
  for(const stage of [1,2,4]){
   const part=samples.filter(s=>s.stage===stage);
   assert.ok(new Set(part.map(s=>s.leg)).size>=2,'feet must cycle during attack '+stage);
   assert.ok(part.every(s=>s.enabled));
  }
  assert.ok(dir*(samples.at(-1).x-position)>100);
  const third=samples.filter(s=>s.stage===3);
  assert.ok(third.length>2,'third punch must be sampled');
  assert.ok(Math.max(...third.map(s=>s.x))-Math.min(...third.map(s=>s.x))<.001,'full-body third punch must not slide');
  console.log({key,stages:[...new Set(samples.map(s=>s.stage))],legFrames:[...new Set(samples.map(s=>s.leg))]});
 }
 await page.evaluate(()=>window.placeForGait(602.264,1));
 await page.keyboard.down('d');await page.keyboard.press('j');await page.waitForTimeout(80);
 const held=await page.evaluate(()=>window.punchDemo.getState());
 await page.waitForTimeout(80);
 const blocked=await page.evaluate(()=>window.punchDemo.getState());
 await page.keyboard.up('d');
 assert.equal(held.x,blocked.x);assert.equal(held.gait.phase,blocked.gait.phase);
 await page.screenshot({path:'verification/walk-attack-game.png'});
 assert.deepEqual(errors,[]);
 console.log('Blocked feet stay planted; browser errors: 0');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
