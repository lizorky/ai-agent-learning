export class RunInput {
  constructor(){this.clear();}
  clear(){this.held=new Set();this.lastKey=null;this.lastTime=-Infinity;this.runKey=null;}
  down(key,time,repeat=false){if(repeat||this.held.has(key))return;this.held.add(key);if(this.lastKey===key&&time-this.lastTime<=250)this.runKey=key;else this.runKey=null;this.lastKey=key;this.lastTime=time;}
  up(key){this.held.delete(key);if(this.runKey===key)this.runKey=null;}
  running(intent){return (intent===1&&this.runKey==='d'&&this.held.has('d'))||(intent===-1&&this.runKey==='a'&&this.held.has('a'));}
}
