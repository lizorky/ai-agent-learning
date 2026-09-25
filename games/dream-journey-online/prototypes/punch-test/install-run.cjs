const fs=require('fs'),cp=require('child_process'),path=require('path');
const root=__dirname;
const edits={
'locomotion.mjs':[
['blocked=false)','blocked=false, running=false)'],
["if(intent){m.state='walk';m.walkTime=(m.walkTime+dt)%WALK_DURATION;return intent*130*dt;}","if(intent){m.state=running?'run':'walk';m.walkTime=(m.walkTime+dt)%(running?.625:WALK_DURATION);return intent*(running?240:130)*dt;}"]],
'movement-demo.mjs':[
["const clips={punch:[],walk:[],turn:[]}","const clips={punch:[],walk:[],turn:[],run:[]}"],
["const metrics=[];","const metrics=[];\nconst runInput=new RunInput();"],
["import { FPS, ACTIVE, createAttack, advanceAttack } from './combat.mjs';","import { FPS, ACTIVE, createAttack, advanceAttack } from './combat.mjs';\nimport { RunInput } from './run-input.mjs';"],
["keys.clear();","keys.clear();runInput.clear();"],
["if(e.repeat)return;if(k==='j')", "if(e.repeat)return;if(k==='a'||k==='d')runInput.down(k,performance.now());if(k==='j')"],
["window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));","window.addEventListener('keyup',e=>{const k=e.key.toLowerCase();keys.delete(k);runInput.up(k);});"],
["if(motion.state==='walk')return", "if(motion.state==='run')return{clip:'run',index:Math.min(14,Math.floor(motion.walkTime*24)),sign:motion.direction};if(motion.state==='walk')return"],
["motion.state==='walk'?'行走':'待机'", "motion.state==='run'?'跑步':motion.state==='walk'?'行走':'待机'"],
["updateMotion(motion,intent,step)","updateMotion(motion,intent,step,false,runInput.running(intent))"],
["['turn',12,'locomotion-v1/turn','turn',1]", "['turn',12,'locomotion-v1/turn','turn',1],['run',15,'run-v1/frames','run',1]"],
["行走与转身已加载：A / D 移动，反向时播放0.4秒转身；转身中按 J 会在转完后出拳。", "A / D 按住走路；250毫秒内双击同方向并按住第二下跑步，松键退出跑步。反向先转身，J 出拳。"],
["白毛猴 · 行走与试打","白毛猴 · 走跑与试打"],
["A / D 行走，反向输入先转身，J 出拳","A / D 行走 · 双击并按住跑步 · J 出拳"],
["motion:{...motion},drawing", "running:runInput.running(motion.direction),motion:{...motion},drawing"]],
'index.html':[["<kbd>A</kbd> / <kbd>D</kbd> 移动", "<kbd>A</kbd> / <kbd>D</kbd> 走路，双击并按住跑步"]]
};
for(const [file,changes]of Object.entries(edits)){const dest=path.join(root,file),old=fs.readFileSync(dest,'utf8').trimEnd();let next=old;for(const [a,b]of changes){if(!next.includes(a))throw Error('Missing replacement '+a);next=next.split(a).join(b);}const patch='*** Begin Patch\n*** Update File: '+dest+'\n@@\n'+old.split(/\r?\n/).map(x=>'-'+x).join('\n')+'\n'+next.split(/\r?\n/).map(x=>'+'+x).join('\n')+'\n*** End Patch';const r=cp.spawnSync('C:/Users/xsy66/AppData/Local/OpenAI/Codex/bin/247581e40ee272fb/codex.exe',['--codex-run-as-apply-patch',patch],{encoding:'utf8'});console.log(r.stdout,r.stderr);if(r.status)process.exit(r.status);}
