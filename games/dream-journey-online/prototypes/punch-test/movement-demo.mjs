import { drawAttackGait, gaitParts, gaitLayout } from './attack-gait.mjs';
import { resolvePlayerX, createFootwork, advanceFootwork, settleFootwork } from './player-movement.mjs';
import { FPS, ACTIVE, createAttack, advanceAttack } from './combat.mjs';
import { createJump, requestJump, updateJump, jumpDrawing } from './jump.mjs';
import { RunInput } from './run-input.mjs';
import { createMotion, updateMotion, TURN_DURATION } from './locomotion.mjs';
import { createEnemy, launchEnemy, staggerEnemy, enemyFrame, enemyAttackBox, enemyWeaponTriggerBox, isInsideEnemyWeaponRange, playerHurtBox, updateEnemy } from './enemy-combat.mjs';
const $=id=>document.getElementById(id), canvas=$('game'),ctx=canvas.getContext('2d');
const clips={punch:[],punch2:[],punch3:[],turnPunch:[],walk:[],turn:[],run:[],takeoff:[],rise:[],fall:[],land:[],hurt:[]},enemyIdle=[],enemyAttack=[],keys=new Set(),floor=435,scale=.64,target={x:661,y:250,w:120,h:185};
let motion=createMotion(),x=558,attack=null,frame=0,hits=0,pause=false,freeze=0,flash=0,shake=0,last=0,ready=false,lastResult='—',buttonIntent=0,buttonTime=0,queuedPunch=false,queuedCombo=0,comboWindow=0,comboNextStage=0,enemyTime=0,playerFlash=0,hurtTime=-1,enemy=createEnemy();
const attackGait=createFootwork();
let frameTravel=0;
let drawing={clip:'punch',index:0,sign:1};
let punchArc=null,punchArc2=null,punchArc3=null;
const ACTION_SPEED=2;
const ATTACK_CONFIG={1:{clip:'punch',frames:14,active:ACTIVE},2:{clip:'punch2',frames:14,active:new Set([5,6,7,8,9])},3:{clip:'turnPunch',frames:20,active:new Set([6,7,8,9,10])},4:{clip:'punch3',frames:18,active:new Set([4,5,6,7,8])}};
const attackConfig=()=>ATTACK_CONFIG[attack?.stage||1];
const ENEMY_HEIGHT_RATIO=.85;
const WORLD_WIDTH=2800,WORLD_LEFT=100,WORLD_RIGHT=WORLD_WIDTH-100;
const camera={zoom:.5,x:550,groundY:470,offsetY:0};
let characterHeight=299.52,maxSpriteHeight=characterHeight;
const metrics=[];
const runInput=new RunInput();
let jump=createJump();
function leap(){if(!ready||pause||attack||hurtTime>=0||motion.state==='turn')return;if(requestJump(jump))canvas.focus();}
$('jump').onclick=leap;
function scan(image){
 const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const q=c.getContext('2d',{willReadFrequently:true});q.drawImage(image,0,0);const {data}=q.getImageData(0,0,c.width,c.height);
 let bottom=0,top=c.height,foot=c.width;const solid=(xx,y)=>data[(y*c.width+xx)*4+3]>180;
 for(let y=0;y<c.height;y++)for(let xx=0;xx<c.width;xx++)if(solid(xx,y)){bottom=Math.max(bottom,y);top=Math.min(top,y);}
 for(let y=bottom-35;y<=bottom;y++)for(let xx=0;xx<c.width;xx++)if(solid(xx,y))foot=Math.min(foot,xx);
 let total=0,count=0;for(let y=Math.round(top+(bottom-top)*.39);y<top+(bottom-top)*.62;y++)for(let xx=0;xx<c.width;xx++){const p=(y*c.width+xx)*4,r=data[p],g=data[p+1],b=data[p+2];if(solid(xx,y)&&g>r*1.2&&g>b*.92&&r<130&&g>35){total+=xx;count++;}}
 const center=count?total/count:foot+90;
 const start=Math.round(top+(bottom-top)*.29),end=Math.round(top+(bottom-top)*.54);let right=0;
 for(let y=start;y<end;y++)for(let xx=0;xx<c.width;xx++)if(solid(xx,y))right=Math.max(right,xx);
 let sum=0,n=0;for(let y=start;y<end;y++)for(let xx=right-10;xx<=right;xx++)if(solid(xx,y)){sum+=y;n++;}
 return {top,bottom,foot,center,fistX:right-12,fistY:n?sum/n:(start+end)/2,height:bottom-top};
}
function fourthAngle(index){
 const t=Math.max(0,Math.min(1,index<4?index/4:index<=9?1:(17-index)/8));
 return .62*t*t*(3-2*t);
}
function fourthPoint(px,py,index){
 const angle=motion.direction*fourthAngle(index),pivotY=floor-characterHeight*.52;
 const dx=px-x,dy=py-pivotY;
 return{x:x+dx*Math.cos(angle)-dy*Math.sin(angle),y:pivotY+dx*Math.sin(angle)+dy*Math.cos(angle)};
}
function compositeLayout(d=getDrawing()){
 if(!attackGait.enabled||!['punch','punch2','punch3'].includes(d.clip))return null;
 const item=clips[d.clip]?.[d.index],leg=clips.walk[Math.floor(attackGait.phase*12)%12];
 if(!item||!leg)return null;
 return gaitLayout(item,d.clip,leg,d.sign,x,floor,d.clip==='punch3'?d.sign*fourthAngle(d.index):0,characterHeight*.52);
}
function playerBodyBoxes(){
 const layout=compositeLayout();
 return layout?layout.bodyBoxes:[baseBodyBox()];
}
function playerBodyBox(){
 const boxes=playerBodyBoxes(),left=Math.min(...boxes.map(b=>b.x)),top=Math.min(...boxes.map(b=>b.y));
 return{x:left,y:top,w:Math.max(...boxes.map(b=>b.x+b.w))-left,h:Math.max(...boxes.map(b=>b.y+b.h))-top};
}
function baseBodyBox(){
 const d=getDrawing(),item=clips[d.clip]?.[d.index];
 const lift=item?Math.max(0,((item.baseline??item.metric.bottom)-item.metric.bottom)*item.scale):0;
 const height=characterHeight*.80,width=characterHeight*.30;
 const box={x:x-width/2,y:floor-jump.height-lift-characterHeight*.92,w:width,h:height};
 if(d.clip!=='punch3')return box;
 const center=fourthPoint(box.x+box.w/2,box.y+box.h/2,d.index);
 return{x:center.x-width/2,y:center.y-height/2,w:width,h:height};
}
const HAND_KEYS={
 1:{4:[.75,.42],5:[.875,.40],6:[.875,.40]},
 2:{5:[.79,.46],6:[.79,.46],7:[.79,.46],8:[.79,.46],9:[.78,.46]},
 3:{6:[535/720,295/720],7:[520/720,100/720],8:[520/720,94/720],9:[516/720,88/720],10:[512/720,88/720]},
 4:{4:[.67,.16],5:[.67,.16],6:[.67,.16],7:[.67,.16],8:[.67,.16]}
};
function moveDuringAttack(distance){
 const before=x;
 x=resolvePlayerX(x,distance,target,{left:WORLD_LEFT,right:WORLD_RIGHT,radius:characterHeight*.15+14,
  top:floor-jump.height-characterHeight*.9,bottom:floor-jump.height});
 const delta=x-before;frameTravel+=Math.abs(delta);
 if(jump.state==='ground')advanceFootwork(attackGait,delta,motion.direction);
}
function walkDuringAttack(step,intent){
 // Preserve authored full-body footwork; held reverse input resumes after recovery.
 if(attack.stage===3||intent!==motion.direction)return;
 attackGait.enabled=attackGait.enabled||Boolean(intent)||attack?.stage===4;
 moveDuringAttack(intent*120*step);
}
function advanceFist(index){
 if(attack.stage===4){
  const t=Math.min(1,index/4),travel=65*t*t*(3-2*t);
  moveDuringAttack(motion.direction*(travel-(attack.lungeTravel||0)));
  attack.lungeTravel=travel;
 }
 return fistBox(index);
}
function fistBox(index){
 const stage=attack?.stage||1,cfg=attackConfig(),item=clips[cfg.clip][index]??clips[cfg.clip][0];
 if(!item)return null;
 const keys=HAND_KEYS[stage],point=keys[index]??Object.values(keys)[0],base=item.baseline??item.metric.bottom;
 const fx=x+motion.direction*(point[0]*item.image.width-item.anchor)*item.scale;
 const fy=floor+(point[1]*item.image.height-base)*item.scale;
 const w=[0,156,174,140,180][stage],h=[0,60,64,120,136][stage];
 if(stage===4){
  const layout=compositeLayout({clip:cfg.clip,index,sign:motion.direction});
  const hand=layout?layout.upperPoint(point[0]*item.image.width,point[1]*item.image.height):fourthPoint(fx,fy,index);
  return{x:hand.x-(motion.direction===1?24:w-24),y:hand.y-h/2,w,h};
 }
 const layout=compositeLayout({clip:cfg.clip,index,sign:motion.direction});
 if(layout){const hand=layout.upperPoint(point[0]*item.image.width,point[1]*item.image.height);return{x:hand.x-(motion.direction===1?20:w-20),y:hand.y-h/2,w,h};}
 return{x:fx-(motion.direction===1?20:w-20),y:fy-h/2,w,h};
}
function beginAttack(stage){const intent=Number(keys.has('d'))-Number(keys.has('a'));if(intent)motion.direction=intent;attack=createAttack();attack.stage=stage;attack.originX=x;attackGait.enabled=attackGait.enabled||Boolean(intent)||stage===4;motion.state='idle';frame=0;comboNextStage=0;if(stage===1){queuedCombo=0;comboWindow=0.5;}if(stage===4)comboWindow=0;lastResult=['','第一拳','第二拳','第三拳','第四拳'][stage];canvas.focus();}
function start(){if(!ready||pause||hurtTime>=0||jump.state!=='ground')return;if(attack){if(attack.stage+queuedCombo<4&&comboWindow>0){queuedCombo++;comboWindow=0.5;lastResult=`第${attack.stage+queuedCombo}拳已输入`;}return;}if(comboNextStage&&comboWindow>0){const next=comboNextStage;comboWindow=0.5;beginAttack(next);return;}if(motion.state==='turn')motion.direction=motion.to;beginAttack(1);}
function reset(){Object.assign(attackGait,createFootwork());frameTravel=0;jump=createJump(characterHeight);x=558;camera.x=550;motion=createMotion();attack=null;frame=0;hits=0;freeze=flash=shake=buttonTime=0;queuedPunch=false;queuedCombo=0;comboWindow=0;comboNextStage=0;playerFlash=0;hurtTime=-1;enemy=createEnemy();target.y=floor-target.h;lastResult='—';keys.clear();runInput.clear();drawing=getDrawing();}
$('attack').onclick=start;$('reset').onclick=reset;
for(const [id,dir]of [['left',-1],['right',1]]){$(id).textContent=dir<0?'向左走 A':'向右走 D';$(id).onclick=()=>{if(!pause){buttonIntent=dir;buttonTime=.75;canvas.focus();}};}
function togglePause(){pause=!pause;$('pause').textContent=pause?'继续':'暂停';keys.clear();runInput.clear();buttonTime=0;}
$('pause').onclick=togglePause;
window.addEventListener('keydown',e=>{if(['INPUT','SELECT'].includes(e.target.tagName))return;const k=e.key.toLowerCase();if(['a','d','j','h','escape','k'].includes(k))e.preventDefault();if(e.repeat)return;if(k==='a'||k==='d')runInput.down(k,performance.now());if(k==='k')leap();else if(k==='j')start();else if(k==='h')$('debug').checked=!$('debug').checked;else if(k==='escape')togglePause();keys.add(k);});
window.addEventListener('keyup',e=>{const k=e.key.toLowerCase();keys.delete(k);runInput.up(k);});
window.addEventListener('blur',()=>{keys.clear();runInput.clear();buttonTime=0;if(ready&&!pause)togglePause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&ready&&!pause)togglePause();});
function getDrawing(){if(hurtTime>=0)return{clip:'hurt',index:Math.min(8,Math.floor(hurtTime*12)),sign:motion.direction};const jd=jumpDrawing(jump);if(jd)return{...jd,sign:motion.direction};if(attack)return{clip:attackConfig().clip,index:frame,sign:motion.direction};if(motion.state==='turn')return{clip:'turn',index:Math.min(11,Math.floor(motion.time/TURN_DURATION*12)),sign:motion.from};if(motion.state==='run')return{clip:'run',index:Math.floor(motion.walkTime*24)%13,sign:motion.direction};if(motion.state==='walk')return{clip:'walk',index:Math.floor(attackGait.phase*12)%12,sign:motion.direction};return{clip:'punch',index:0,sign:motion.direction};}
function updateDrawing(){drawing=getDrawing();}
function sprite(d){
 const item=clips[d.clip][d.index],m=item.metric,s=item.scale,pivot=characterHeight*.52;
 ctx.save();ctx.globalAlpha=1;ctx.filter=playerFlash>0?'brightness(1.22) saturate(1.2)':'none';
 if(compositeLayout(d)){
  const leg=clips.walk[Math.floor(attackGait.phase*clips.walk.length)%clips.walk.length];
  drawAttackGait(ctx,item,d.clip,leg,d.sign,x,floor,d.clip==='punch3'?d.sign*fourthAngle(d.index):0,pivot);
 }else{
  ctx.translate(x,floor-jump.height);
  if(d.clip==='punch3'){ctx.translate(0,-pivot);ctx.rotate(motion.direction*fourthAngle(d.index));ctx.translate(0,pivot);}
  ctx.scale(d.sign*s,s);ctx.drawImage(item.image,-item.anchor,-(item.baseline??m.bottom));
 }
 ctx.restore();
}
function attackEffectSprite(){if(!attack||!attackConfig().active.has(frame))return;const stage=attack.stage,second=stage===2,third=stage>=3,start=stage===3?6:third?4:second?5:3,end=stage===3?10:third?8:second?9:8;if(frame<start||frame>end)return;const image=third?punchArc3:second?punchArc2:punchArc,box=fistBox(frame),progress=Math.max(0,Math.min(1,(frame-start)/(end-start))),pulse=Math.sin(progress*Math.PI);if(!image||!box)return;ctx.save();ctx.globalCompositeOperation='source-over';ctx.globalAlpha=(third?0.7:second?0.76:0.72)+(third?0.3:second?0.24:0.28)*pulse;ctx.shadowColor=third?'#78dcff':second?'#ffb12b':'#ff6a2a';ctx.shadowBlur=third?15:second?11:12;if(third){ctx.translate(motion.direction===1?box.x+box.w*.58:box.x+box.w*.42,box.y+box.h*.46);ctx.rotate(motion.direction*(stage===4?fourthAngle(frame):.08));const s=1.04+.12*pulse;ctx.scale(motion.direction*s,s);ctx.filter='hue-rotate(155deg) saturate(1.35) brightness(1.18)';}else{ctx.translate(motion.direction===1?box.x+box.w*(second?.76:.62):box.x+box.w*(second?.24:.38),box.y+box.h/2);if(second){ctx.rotate(-motion.direction*.18);const s=.86+.1*pulse;ctx.scale(motion.direction*s,s);ctx.filter='sepia(.08) saturate(1.25) brightness(1.08)';}else{ctx.rotate(motion.direction*Math.PI/2);const s=.94+.12*pulse;ctx.scale(s,s);}}ctx.drawImage(image,-64,-64);ctx.restore();}
function enemySprite(){const view=enemyFrame(enemy),list=view.clip==='attack'?enemyAttack:enemyIdle,item=list[view.index];if(!item)return;ctx.save();ctx.translate(target.x+target.w/2,floor-enemy.airHeight);if(enemy.state==='airborne')ctx.rotate(.14);else if(enemy.recoil>0)ctx.rotate(.06);ctx.scale(-item.scale,item.scale);ctx.filter=flash>0?'brightness(1.3) saturate(.8)':'none';ctx.drawImage(item.image,-item.image.width/2,-item.metric.bottom);ctx.restore();}
function outline(b,color,label){ctx.strokeStyle=color;ctx.lineWidth=2;ctx.strokeRect(b.x,b.y,b.w,b.h);ctx.fillStyle=color;ctx.font='12px sans-serif';ctx.fillText(label,b.x,b.y-8);}
function draw(){camera.offsetY=Math.max(0,(jump.height+maxSpriteHeight)*camera.zoom-(camera.groundY-90));if(x-camera.x>160)camera.x=x-160;else if(x-camera.x<-160)camera.x=x+160;camera.x=Math.max(550,Math.min(WORLD_WIDTH-550,camera.x));const screenFloor=camera.groundY+camera.offsetY;ctx.clearRect(0,0,1100,540);const g=ctx.createLinearGradient(0,0,0,540);g.addColorStop(0,'#243a32');g.addColorStop(1,'#14221e');ctx.fillStyle=g;ctx.fillRect(0,0,1100,540);ctx.strokeStyle='#354a3d';ctx.lineWidth=1;const grid=55*camera.zoom,gridStart=(-camera.x*camera.zoom)%grid;for(let i=gridStart;i<1100;i+=grid){ctx.beginPath();ctx.moveTo(i,screenFloor);ctx.lineTo(i-100*camera.zoom,540);ctx.stroke();}ctx.fillStyle='#617354';ctx.fillRect(0,screenFloor,1100,2);ctx.fillStyle='#8c9d83';ctx.font='14px sans-serif';ctx.fillText('练拳场 / 横向长场景 · 四段普攻',34,40);ctx.fillText('A / D 行走 · 双击跑步 · K 二段跳 · 500ms 内连续按 J 接四拳',34,66);
ctx.save();ctx.translate(canvas.width/2,screenFloor);ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x,-floor);if(shake>0)ctx.translate(Math.sin(shake*180)*3,0);ctx.fillStyle='#0e1915';ctx.beginPath();ctx.ellipse(target.x+target.w/2,floor+5,86,13,0,0,Math.PI*2);ctx.fill();enemySprite();ctx.fillStyle='#decea4';ctx.font='15px sans-serif';ctx.fillText('石头怪（原地攻击）',target.x-2,target.y-15);
if(ready&&attack)attackEffectSprite();if(ready)sprite(drawing);if(flash>0){ctx.fillStyle='#ffe3a1';ctx.font='bold 26px sans-serif';ctx.fillText('命中',760,290-flash*60);}if($('debug').checked&&ready){for(const body of playerBodyBoxes())outline(body,'#79c8ed','角色受击');outline(target,'#e5c379','石头怪受击');outline(enemyWeaponTriggerBox(target),'#e7b95e','刀刃触发区');if(enemyFrame(enemy).active)outline(enemyAttackBox(target),'#f28b68','怪物攻击有效');if(attack&&attackConfig().active.has(frame))outline(fistBox(frame),'#ff735e','攻击有效');}ctx.restore();if(pause){ctx.fillStyle='#0a1519b8';ctx.fillRect(0,0,1100,540);ctx.fillStyle='#eee4c5';ctx.font='28px sans-serif';ctx.fillText('已暂停 · Esc 继续',425,245);}
$('phase').textContent=pause?'暂停':hurtTime>=0?'受击':jump.state!=='ground'?({takeoff:'起跳',air:jump.count===2?'二段跳':'腾空',land:'落地'})[jump.state]:attack?(attackConfig().active.has(frame)?'击出':frame<4?'起手':'收招'):motion.state==='turn'?'转身':motion.state==='run'?'跑步':motion.state==='walk'?'行走':'待机';$('frame').textContent=`${drawing.index+1} / ${clips[drawing.clip].length||'—'}`;$('hits').textContent=hits;$('result').textContent=lastResult;}
function tick(time){
 const dt=Math.min((time-last)/1000,.025),realDt=Math.min(Math.max(0,(time-last)/1000),.05);last=time;
 if(!pause&&ready){
  const step=dt*ACTION_SPEED*Number($('speed').value);
  const intent=Number(keys.has('d'))-Number(keys.has('a'))||(buttonTime>0?buttonIntent:0);
  buttonTime=Math.max(0,buttonTime-step);frameTravel=0;
  comboWindow=Math.max(0,comboWindow-realDt);if(comboWindow===0)comboNextStage=0;
  playerFlash=Math.max(0,playerFlash-dt);
  const bodies=playerBodyBoxes();
  const enemyResult=updateEnemy(enemy,step,isInsideEnemyWeaponRange(target,bodies)&&jump.state==='ground',enemyAttackBox(target),bodies);
  target.y=floor-target.h-enemy.airHeight;
  if(enemyResult.hit){
   playerFlash=.09;shake=.08;hurtTime=0;attack=null;frame=0;motion.state='idle';
   queuedPunch=false;queuedCombo=0;comboWindow=0;comboNextStage=0;attackGait.enabled=false;lastResult='受到攻击';
  }
  flash=Math.max(0,flash-dt);shake=Math.max(0,shake-dt);
  const hitStopped=freeze>0;
  if(hurtTime>=0){hurtTime+=step;if(hurtTime>=9/12)hurtTime=-1;}
  else if(hitStopped)freeze=Math.max(0,freeze-step);
  else if(attack){
   walkDuringAttack(step,intent);
   const cfg=attackConfig(),next=Math.min(cfg.frames-1,Math.floor((attack.elapsed+step)*FPS));
   const a=advanceAttack(attack,step,advanceFist(next),target,cfg.active,cfg.frames);frame=a.frame;
   if(a.hit){if(attack.stage===3)launchEnemy(enemy);else staggerEnemy(enemy);hits++;freeze=.055;flash=.17;shake=.13;lastResult='第'+attack.stage+'拳命中';}
   if(a.done){
    const stage=attack.stage,connect=stage<4&&queuedCombo,result=attack.hit;
    if(connect){queuedCombo--;beginAttack(stage+1);}
    else{lastResult=result?'第'+stage+'拳命中':'第'+stage+'拳未命中';attack=null;frame=0;queuedCombo=0;comboNextStage=stage<4?stage+1:0;comboWindow=comboNextStage?0.5:0;}
   }
  }else{
   updateJump(jump,step);let travel=0;
   if(jump.state==='ground')travel=updateMotion(motion,intent,step,false,runInput.running(intent));
   else if(jump.state==='air')travel=intent*(runInput.running(intent)?240:130)*step;
   const before=x;moveDuringAttack(travel);
   if(x===before&&travel&&jump.state==='ground')motion.state='idle';
   if(queuedPunch&&motion.state!=='turn'&&jump.state==='ground'){queuedPunch=false;start();}
  }
  if(hurtTime>=0||jump.state!=='ground'||motion.state==='turn')attackGait.enabled=false;
  else if(!hitStopped&&frameTravel<.001)settleFootwork(attackGait,realDt);
  updateDrawing();
 }
 draw();requestAnimationFrame(tick);
}
try{for(const [clip,count,base,prefix,stride]of [['punch',14,'punch-01-v1/frames','punch',1],['punch2',14,'punch-02-v3/frames','punch-02',1],['punch3',18,'punch-03-v1/frames','punch-03',1],['turnPunch',20,'punch-turn-v1/frames','punch-turn',1],['walk',12,'locomotion-v1/walk','walk',2],['turn',12,'locomotion-v1/turn','turn',1],['run',13,'run-v2/frames','run',1],['takeoff',6,'jump-v1/takeoff','takeoff',1],['rise',3,'jump-v1/rise','rise',1],['fall',4,'jump-v1/fall','fall',1],['land',7,'jump-v1/land','land',1],['hurt',9,'hurt-v1/frames','hurt',1]]){const list=await Promise.all(Array.from({length:count},async(_,i)=>{const image=new Image();image.src=`/assets/white-monkey/${base}/${prefix}-${String(i*stride+1).padStart(2,'0')}.png`;await image.decode();return{image,metric:scan(image)};}));clips[clip]=list;if(clip==='punch'){metrics.push(...list.map(i=>i.metric));for(const item of list){item.scale=scale;item.anchor=item.metric.foot+(metrics[0].center-metrics[0].foot);}}else if(clip==='turnPunch'){const ref=list[list.length-1].metric,ratio=metrics[0].height/ref.height;for(const item of list){item.scale=scale*ratio;item.baseline=ref.bottom;item.anchor=ref.foot+(metrics[0].center-metrics[0].foot)/ratio;}}else if(['punch2','punch3'].includes(clip)){const heights=list.map(i=>i.metric.height).sort((a,b)=>a-b),ratio=metrics[0].height/heights[Math.floor(heights.length/2)];for(const item of list){item.scale=scale*ratio;item.anchor=item.metric.foot+(metrics[0].center-metrics[0].foot)*scale/item.scale;}}else if(['takeoff','rise','fall','land'].includes(clip)){const ratio=metrics[0].height/clips.takeoff[0].metric.height;for(const item of list){item.scale=scale*ratio;item.anchor=item.metric.center;}}else{const heights=list.map(i=>i.metric.height).sort((a,b)=>a-b),ratio=metrics[0].height/heights[Math.floor(heights.length/2)];for(const item of list){item.scale=scale*ratio;item.anchor=item.metric.center;}}}for(let i=1;i<=12;i++){const image=new Image();image.src=`/assets/enemies/golem/runtime/idle/golem-idle-${String(i).padStart(2,'0')}.png`;await image.decode();const metric=scan(image);enemyIdle.push({image,metric,scale:metrics[0].height*scale*ENEMY_HEIGHT_RATIO/metric.height});}for(let i=1;i<=12;i++){const image=new Image();image.src=`/assets/enemies/golem/runtime/attack/golem-attack-${String(i).padStart(2,'0')}.png`;await image.decode();const metric=scan(image);enemyAttack.push({image,metric,scale:metrics[0].height*scale*ENEMY_HEIGHT_RATIO/metric.height});}punchArc=new Image();punchArc.src='/assets/effects/white-monkey/punch-arc-v1/punch-arc.png';await punchArc.decode();punchArc2=new Image();punchArc2.src='/assets/effects/white-monkey/punch-arc-v1/punch-arc-left-fast.png';await punchArc2.decode();punchArc3=new Image();punchArc3.src='/assets/effects/white-monkey/punch-arc-v1/punch-arc-uppercut-temp.png';await punchArc3.decode();characterHeight=metrics[0].height*scale;target.h=characterHeight*ENEMY_HEIGHT_RATIO;target.y=floor-target.h;maxSpriteHeight=Math.max(...Object.values(clips).flat().map(item=>item.metric.height*item.scale));jump=createJump(characterHeight);for(const key of ['punch','punch2','punch3','walk'])for(const item of clips[key])gaitParts(item,key);ready=true;$('status').textContent='A / D 按住走路；250毫秒内双击跑步。连续按 J：右拳、快速左拳、转身上勾拳、升龙拳；相邻按键间隔不超过 500 毫秒可接下一拳，支持快速连按缓存。K 起跳，腾空后再按 K 二段跳。第三拳命中会击飞怪物，腾空期间怪物不能攻击。';}catch(e){$('status').textContent=`素材加载失败：${e.message}`;console.error(e);}
document.querySelector('h1').textContent='白毛猴 · 四段普攻试打';document.querySelector('.tag').textContent='四段连击验收样品';
window.punchDemo={getState:()=>({ready,characterHeight,gait:{...attackGait,frame:Math.floor(attackGait.phase*12)},camera:{...camera},jump:{...jump},x,frame,hits,attack:Boolean(attack),attackStage:attack?.stage||0,queuedCombo,comboWindow,comboReady:Boolean(comboNextStage),comboNextStage,pause,lastResult,direction:motion.direction,running:runInput.running(motion.direction),motion:{...motion},hurtTime,enemy:{...enemy,frame:enemyFrame(enemy),height:target.h},playerHitsTaken:enemy.hits,drawing:{...drawing},box:ready?fistBox(frame):null,bodyBox:ready?playerBodyBox():null,bodyBoxes:ready?playerBodyBoxes():[],metrics,anchors:Object.fromEntries(Object.entries(clips).map(([k,v])=>[k,v.map(i=>({anchor:i.anchor,scale:i.scale,bottom:i.metric.bottom}))]))}),reset};requestAnimationFrame(tick);
