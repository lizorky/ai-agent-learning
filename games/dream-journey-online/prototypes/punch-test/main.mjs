import { FPS, ACTIVE, createAttack, advanceAttack } from './combat.mjs';
const $ = id => document.getElementById(id), canvas = $('game'), ctx = canvas.getContext('2d');
const frames = [], metrics = [], keys = new Set();
const floor = 435, scale = .64, target = { x: 690, y: 260, w: 62, h: 175 };
let x = 500, direction = 1, attack = null, frame = 0, hits = 0, pause = false, freeze = 0, flash = 0, shake = 0, last = 0, ready = false, lastResult = '—';
function scan(image) {
  const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
  const q = c.getContext('2d', { willReadFrequently: true }); q.drawImage(image, 0, 0);
  const { data } = q.getImageData(0, 0, c.width, c.height);
  let bottom = 0, top = c.height;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (data[(y*c.width+x)*4+3] > 180) { bottom = Math.max(bottom,y); top = Math.min(top,y); }
  let foot = c.width;
  for (let y = bottom-35; y <= bottom; y++) for (let x = 0; x < c.width; x++) if (data[(y*c.width+x)*4+3] > 180) foot = Math.min(foot,x);
  // The extended fist is the rightmost opaque region at chest height.
  const start = Math.round(top+(bottom-top)*.29), end = Math.round(top+(bottom-top)*.54);
  let right = 0;
  for (let y = start; y < end; y++) for (let x = 0; x < c.width; x++) if (data[(y*c.width+x)*4+3] > 180) right = Math.max(right,x);
  let sum = 0, count = 0;
  for (let y = start; y < end; y++) for (let xx = right-10; xx <= right; xx++) if(data[(y*c.width+xx)*4+3]>180) { sum += y; count++; }
  return { foot, bottom, fistX:right-12, fistY:count?sum/count:(start+end)/2 };
}
function fistBox(index) {
  const m=metrics[index]; if(!m)return null;
  const cx=x+direction*(m.fistX-m.foot)*scale, cy=floor+(m.fistY-m.bottom)*scale;
  return {x:cx-16,y:cy-14,w:32,h:28};
}
function start() { if (!ready || pause || attack) return; attack=createAttack(); frame=0; lastResult='挥拳中'; canvas.focus(); }
function reset() { x=500;direction=1;attack=null;frame=0;hits=0;freeze=flash=shake=0;lastResult='—'; }
$('attack').onclick=start; $('reset').onclick=reset;
$('left').onclick=()=>{if(!attack&&!pause){x=Math.max(120,x-25);direction=-1;}};
$('right').onclick=()=>{if(!attack&&!pause){x=Math.min(640,x+25);direction=1;}};
function togglePause(){pause=!pause;$('pause').textContent=pause?'继续':'暂停';keys.clear();}
$('pause').onclick=togglePause;
window.addEventListener('keydown',e=>{if(['INPUT','SELECT'].includes(e.target.tagName))return;const k=e.key.toLowerCase();if(['a','d','j','h','escape'].includes(k))e.preventDefault(); if(e.repeat)return;if(k==='j')start();else if(k==='h')$('debug').checked=!$('debug').checked;else if(k==='escape')togglePause();keys.add(k);});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>{keys.clear();if(ready&&!pause)togglePause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&ready&&!pause)togglePause();});
function outline(b,color,label){ctx.strokeStyle=color;ctx.lineWidth=2;ctx.strokeRect(b.x,b.y,b.w,b.h);ctx.fillStyle=color;ctx.font='12px sans-serif';ctx.fillText(label,b.x,b.y-8);}
function draw(){
  ctx.clearRect(0,0,1100,540); const g=ctx.createLinearGradient(0,0,0,540);g.addColorStop(0,'#243a32');g.addColorStop(1,'#14221e');ctx.fillStyle=g;ctx.fillRect(0,0,1100,540);
  ctx.strokeStyle='#354a3d';ctx.lineWidth=1;for(let i=0;i<1100;i+=55){ctx.beginPath();ctx.moveTo(i,435);ctx.lineTo(i-100,540);ctx.stroke();}ctx.fillStyle='#617354';ctx.fillRect(0,floor,1100,2);
  ctx.fillStyle='#8c9d83';ctx.font='14px sans-serif';ctx.fillText('练拳场 / 第一拳',34,40);ctx.fillText('靠近木桩，观察拳头与判定框',34,66);
  ctx.save();if(shake>0)ctx.translate(Math.sin(shake*180)*3,0);
  ctx.fillStyle='#0e1915';ctx.beginPath();ctx.ellipse(721,floor+5,58,11,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=flash>0?'#fff7db':'#96734a';ctx.fillRect(target.x,target.y,target.w,target.h);ctx.strokeStyle='#4e3926';ctx.lineWidth=4;ctx.strokeRect(target.x,target.y,target.w,target.h);
  ctx.fillStyle=flash>0?'#fff':'#c7a270';ctx.fillRect(677,308,88,15);ctx.fillRect(684,382,75,12);ctx.strokeStyle='#674b32';ctx.lineWidth=2;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(706+i*13,273);ctx.lineTo(704+i*13,425);ctx.stroke();}
  ctx.fillStyle='#decea4';ctx.font='15px sans-serif';ctx.fillText('训练木桩',690,240);
  if(ready){const m=metrics[frame];ctx.save();ctx.translate(x,floor);ctx.scale(direction*scale,scale);ctx.drawImage(frames[frame],-m.foot,-m.bottom);ctx.restore();}
  if(flash>0){ctx.fillStyle='#ffe3a1';ctx.font='bold 26px sans-serif';ctx.fillText('命中',760,290-flash*60);}
  if($('debug').checked&&ready){outline({x:direction===1?x+14:x-114,y:floor-180,w:100,h:180},'#79c8ed','角色受击');outline(target,'#e5c379','木桩');if(attack&&ACTIVE.has(frame))outline(fistBox(frame),'#ff735e','攻击有效');}
  ctx.restore();if(pause){ctx.fillStyle='#0a1519b8';ctx.fillRect(0,0,1100,540);ctx.fillStyle='#eee4c5';ctx.font='28px sans-serif';ctx.fillText('已暂停 · Esc 继续',425,245);}
  $('phase').textContent=pause?'暂停':attack?(ACTIVE.has(frame)?'击出':frame<4?'起手':'收招'):'待机';$('frame').textContent=`${frame+1} / 14`;$('hits').textContent=hits;$('result').textContent=lastResult;
}
function tick(time){let dt=Math.min((time-last)/1000,.025);last=time;if(!pause&&ready){flash=Math.max(0,flash-dt);shake=Math.max(0,shake-dt);if(freeze>0)freeze=Math.max(0,freeze-dt);else if(attack){const step=dt*Number($('speed').value);const next=Math.min(13,Math.floor((attack.elapsed+step)*FPS));const state=advanceAttack(attack,step,fistBox(next),target);frame=state.frame;if(state.hit){hits++;freeze=.055;flash=.17;shake=.13;lastResult='命中一次';}if(state.done){lastResult=attack.hit?'命中一次':'未命中';attack=null;frame=0;}}else{const move=Number(keys.has('d'))-Number(keys.has('a'));if(move){direction=move;x=Math.max(120,Math.min(640,x+move*210*dt));}}}draw();requestAnimationFrame(tick);}
try{for(let i=1;i<=14;i++){const img=new Image();img.src=`../../assets/white-monkey/punch-01-v1/frames/punch-${String(i).padStart(2,'0')}.png`;await img.decode();frames.push(img);metrics.push(scan(img));}ready=true;$('status').textContent='素材已加载。移动到合适距离后按 J；红色攻击框只在第5—7帧出现。';}catch(e){$('status').textContent=`素材加载失败：${e.message}`;}
window.punchDemo={getState:()=>({ready,x,frame,hits,attack:Boolean(attack),pause,lastResult,box:ready?fistBox(frame):null,metrics}),reset};
requestAnimationFrame(tick);
