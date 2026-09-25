const {chromium}=require('C:/Users/xsy66/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
process.env.TEMP=process.env.TMP='E:/codex projects/games/dream-journey-online/.tmp/browser-four-hit';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4174/prototypes/punch-test/index.html?polish-v1');
 await page.waitForFunction(()=>window.punchDemo?.getState().ready);
 for(const interval of [65,420]){
 await page.evaluate(()=>{
 window.punchDemo.reset();window.samples=[];
 window.recorder=setInterval(()=>{const s=window.punchDemo.getState();window.samples.push({stage:s.attackStage,hits:s.hits,taken:s.playerHitsTaken,enemy:s.enemy.state,lift:255-s.bodyBox.y});},8);
 });
 for(let i=0;i<4;i++){await page.keyboard.press('j');if(i<3)await page.waitForTimeout(interval);}
 await page.waitForFunction(()=>window.punchDemo.getState().attackStage===4);
 await page.waitForFunction(()=>!window.punchDemo.getState().attack);
 const samples=await page.evaluate(()=>{clearInterval(window.recorder);return window.samples});
 const result={interval,hits:Math.max(...samples.map(s=>s.hits)),taken:Math.max(...samples.map(s=>s.taken)),air:samples.some(s=>s.enemy==='airborne'),lift:Math.max(...samples.map(s=>s.lift))};
 console.log(result);assert.equal(result.hits,4);assert.equal(result.taken,0);assert.equal(result.air,true);assert.ok(result.lift>20);
 }
 await page.evaluate(()=>window.punchDemo.reset());
 const sequential=[];
 for(let expected=1;expected<=4;expected++){
   if(expected>1)await page.waitForFunction(()=>window.punchDemo.getState().comboReady&&!window.punchDemo.getState().attack);
   await page.keyboard.press('j');
   await page.waitForFunction(n=>window.punchDemo.getState().attackStage===n,expected);
   if(expected===4){await page.waitForFunction(()=>window.punchDemo.getState().frame>=5);await page.keyboard.press('h');await page.screenshot({path:'verification/fourth-punch-angle.png'});await page.keyboard.press('h');}
   await page.waitForFunction(()=>!window.punchDemo.getState().attack);
   const s=await page.evaluate(()=>window.punchDemo.getState());
   sequential.push({stage:expected,hits:s.hits,enemy:s.enemy.state,air:Math.round(s.enemy.airHeight)});
 }
 assert.deepEqual(sequential.map(s=>s.hits),[1,2,3,4]);
 console.log({sequential});
 await page.screenshot({path:'verification/combat-polish.png'});
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
