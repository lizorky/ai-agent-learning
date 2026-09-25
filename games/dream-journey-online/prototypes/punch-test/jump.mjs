export const GRAVITY = 1800;
export const createJump = (characterHeight=299.52) => ({state:'ground',time:0,height:0,velocity:0,count:0,maxHeight:characterHeight*1.2});
const launchVelocity = j => Math.sqrt(2*GRAVITY*j.maxHeight);
export function requestJump(j) {
 if(j.state==='ground') {j.state='takeoff';j.time=0;j.count=1;return true;}
 if(j.state==='air'&&j.count<2) {j.velocity=launchVelocity(j);j.count++;j.time=0;return true;}
 return false;
}
export function updateJump(j,dt) {
 if(j.state==='ground')return;
 j.time+=dt;
 if(j.state==='takeoff') {if(j.time>=.18){j.state='air';j.time=0;j.velocity=launchVelocity(j);}return;}
 if(j.state==='land') {if(j.time>=.21){j.state='ground';j.time=0;}return;}
 j.height+=j.velocity*dt-GRAVITY*dt*dt/2;j.velocity-=GRAVITY*dt;
 if(j.height<=0) {j.height=0;j.velocity=0;j.count=0;j.state='land';j.time=0;}
}
export function jumpDrawing(j) {
 if(j.state==='takeoff')return {clip:'takeoff',index:Math.min(5,Math.floor(j.time/.18*6))};
 if(j.state==='land')return {clip:'land',index:Math.min(6,Math.floor(j.time/.21*7))};
 if(j.state==='air')return j.velocity>60?{clip:'rise',index:Math.min(2,Math.floor(j.time*18))}:{clip:'fall',index:Math.min(3,Math.floor(Math.max(0,60-j.velocity)/160))};
 return null;
}
