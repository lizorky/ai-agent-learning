const {chromium}=require('C:/Users/xsy66/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
process.env.TEMP=process.env.TMP='E:/codex projects/games/dream-journey-online/.tmp/browser-four-hit';
(async()=>{const b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{const p=await b.newPage({viewport:{width:1250,height:1000}});
await p.route('**/movement-demo.mjs',async route=>{
 const response=await route.fetch();let body=await response.text();
 body=body.replaceAll('requestAnimationFrame(tick);','');
 body+='\nwindow.gaitReview=(stage,phase)=>{attack=createAttack();attack.stage=stage;frame=stage===1?5:stage===2?6:5;attackGait.enabled=true;attackGait.phase=phase;motion.direction=1;x=200;drawing=getDrawing();ctx.clearRect(0,0,1100,540);sprite(drawing);return canvas.toDataURL();};';
 await route.fulfill({response,body:body.replace('\\nwindow.gaitReview','\nwindow.gaitReview')});
});
await p.goto('http://127.0.0.1:4174/prototypes/punch-test/index.html?gait-review');
await p.waitForFunction(()=>window.punchDemo?.getState().ready);
await p.evaluate(async()=>{
 const sheet=document.createElement('canvas');sheet.id='sheet';sheet.width=1200;sheet.height=1440;sheet.style.cssText='width:1200px;height:1440px;aspect-ratio:auto;max-width:none';
 const q=sheet.getContext('2d');q.fillStyle='#243a32';q.fillRect(0,0,1200,1440);
 for(let row=0;row<4;row++)for(let col=0;col<3;col++){
 const stage=[1,2,4][col],image=new Image();image.src=window.gaitReview(stage,row*.25);await image.decode();
 q.drawImage(image,0,100,400,350,col*400,row*360,400,350);
 q.fillStyle='white';q.font='18px sans-serif';q.fillText('Attack '+stage+' / gait '+row,col*400+15,row*360+25);
 }document.body.replaceChildren(sheet);
});
await p.locator('#sheet').screenshot({path:'verification/attack-gait-review.jpg',type:'jpeg',quality:85});
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
