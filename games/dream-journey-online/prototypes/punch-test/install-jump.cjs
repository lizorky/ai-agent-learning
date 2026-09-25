const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const root=__dirname;
if(!path.resolve(root).toLowerCase().startsWith('e:\\codex projects\\'))throw Error('E drive required');
function edit(file,fn){const p=path.join(root,file),old=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'),next=fn(old);if(next===old)throw Error('No changes '+file);const patch='*** Begin Patch\n*** Update File: '+p.replace(/\\/g,'/')+'\n@@\n'+old.trimEnd().split('\n').map(x=>'-'+x).join('\n')+'\n'+next.trimEnd().split('\n').map(x=>'+'+x).join('\n')+'\n*** End Patch';const r=spawnSync('C:/Users/xsy66/AppData/Local/OpenAI/Codex/bin/247581e40ee272fb/codex.exe',['--codex-run-as-apply-patch',patch],{encoding:'utf8'});console.log(r.stdout,r.stderr);if(r.status)throw Error('Patch failed');}
edit('movement-demo.mjs',s=>s
.replace("import { RunInput }", "import { createJump, requestJump, updateJump, jumpDrawing } from './jump.mjs';\nimport { RunInput }")
.replace('run:[]}', 'run:[],takeoff:[],rise:[],fall:[],land:[]}')
.replace('const runInput=new RunInput();','const runInput=new RunInput();\nlet jump=createJump();\nfunction leap(){if(!ready||pause||attack||motion.state===\'turn\')return;if(requestJump(jump))canvas.focus();}\n$(\'jump\').onclick=leap;')
.replace('!ready||pause||attack)return;if(motion',"!ready||pause||attack||jump.state!=='ground')return;if(motion")
.replace('function reset(){x=558;', 'function reset(){jump=createJump();x=558;')
.replace("['a','d','j','h','escape']", "['a','d','j','h','escape',' ']")
.replace("if(k==='j')start();", "if(k===' ')leap();else if(k==='j')start();")
.replace('function getDrawing(){if(attack)',"function getDrawing(){const jd=jumpDrawing(jump);if(jd)return{...jd,sign:motion.direction};if(attack)")
.replace('ctx.translate(x,floor);', 'ctx.translate(x,floor-jump.height);')
.replace('ctx.drawImage(item.image,-item.anchor,-m.bottom)', 'ctx.drawImage(item.image,-item.anchor,-(item.baseline??m.bottom))')
.replace('y:floor-180,w:100', 'y:floor-jump.height-180,w:100')
.replace("'转身':motion.state", "'转身':motion.state")
.replace("pause?'暂停':attack?", "pause?'暂停':jump.state!=='ground'?({takeoff:'起跳',air:jump.count===2?'二段跳':'腾空',land:'落地'})[jump.state]:attack?")
.replace('let travel=updateMotion(motion,intent,step,false,runInput.running(intent));', "updateJump(jump,step);let travel=0;if(jump.state==='ground')travel=updateMotion(motion,intent,step,false,runInput.running(intent));else if(jump.state==='air')travel=intent*(runInput.running(intent)?240:130)*step;")
.replace("queuedPunch&&motion.state!=='turn'", "queuedPunch&&motion.state!=='turn'&&jump.state==='ground'")
.replace("['run',15,'run-v1/frames','run',1]", "['run',15,'run-v1/frames','run',1],['takeoff',6,'jump-v1/takeoff','takeoff',1],['rise',3,'jump-v1/rise','rise',1],['fall',4,'jump-v1/fall','fall',1],['land',7,'jump-v1/land','land',1]")
.replace("}else{const heights=list.map", "}else if(['takeoff','rise','fall','land'].includes(clip)){const ratio=metrics[0].height/clips.takeoff[0].metric.height;for(const item of list){item.scale=scale*ratio;item.anchor=item.metric.center;}}else{const heights=list.map")
.replace('ready=true;', 'ready=true;')
.replace('反向先转身，J 出拳。', '反向先转身，J 地面出拳。空格起跳，腾空后再按空格二段跳；落地后可再次跳跃。')
.replace('练拳场 / 行走 · 转身 · 第一拳','练拳场 / 走跑 · 跳跃 · 第一拳')
.replace('A / D 行走 · 双击并按住跑步 · J 出拳','A / D 行走 · 双击跑步 · 空格 / 再按空格二段跳 · J 出拳')
.replace("getState:()=>({ready,x,", "getState:()=>({ready,jump:{...jump},x,"));
edit('index.html',s=>s.replace('<button id="attack">','<button id="jump">跳跃 / 二段跳 Space</button><button id="attack">').replace('<kbd>J</kbd> 出拳','<kbd>Space</kbd> 跳跃 / 二段跳　<kbd>J</kbd> 出拳'));
