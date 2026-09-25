export const TURN_DURATION = .3;
export const WALK_DURATION = 1;
export const RUN_DURATION = 13 / 24;
export function createMotion() { return {direction:1,state:'idle',time:0,from:1,to:1,walkTime:0}; }
export function updateMotion(m, intent, dt, blocked=false, running=false) {
  if(blocked) {m.state='idle';m.time=0;return 0;}
  if(m.state==='turn') {
    m.time+=dt;
    if(m.time>=TURN_DURATION){m.direction=m.to;m.state='idle';m.time=0;m.walkTime=0;}
    return 0;
  }
  if(intent && intent!==m.direction){m.state='turn';m.from=m.direction;m.to=intent;m.time=0;return 0;}
  if(intent){m.state=running?'run':'walk';m.walkTime=(m.walkTime+dt)%(running?RUN_DURATION:WALK_DURATION);return intent*(running?280:160)*dt;}
  m.state='idle';m.walkTime=0;return 0;
}
