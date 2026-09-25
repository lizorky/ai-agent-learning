// Shared swept horizontal movement for walking, running and attack lunges.
export function resolvePlayerX(x,distance,target,{left,right,radius,top,bottom}){
 let next=Math.max(left,Math.min(right,x+distance));
 const overlapsHeight=bottom>target.y&&top<target.y+target.h;
 if(!overlapsHeight)return next;
 const center=target.x+target.w/2;
 if(distance>0&&x<center)next=Math.min(next,Math.max(x,target.x-radius));
 if(distance<0&&x>center)next=Math.max(next,Math.min(x,target.x+target.w+radius));
 return next;
}
export function createFootwork(){
 return {phase:.75,travel:0,enabled:false,settling:false,settled:true,settleTime:0,settleStart:.75,settleDelta:0};
}
export function advanceFootwork(gait,distance,direction){
 if(Math.abs(distance)<.001)return;
 gait.phase=((gait.phase+distance*direction/160)%1+1)%1;
 gait.travel+=Math.abs(distance);
 gait.enabled=true;gait.settling=false;gait.settled=false;gait.settleTime=0;
}
export function settleFootwork(gait,dt){
 if(!gait.enabled||gait.settled)return;
 if(!gait.settling){
  gait.settling=true;gait.settleStart=gait.phase;
  gait.settleDelta=((.75-gait.phase+1.5)%1)-.5;gait.settleTime=0;
 }
 gait.settleTime=Math.min(.16,gait.settleTime+dt);
 const t=gait.settleTime/.16,ease=t*t*(3-2*t);
 gait.phase=(gait.settleStart+gait.settleDelta*ease+1)%1;
 if(t===1){gait.phase=.75;gait.settling=false;gait.settled=true;}
}
