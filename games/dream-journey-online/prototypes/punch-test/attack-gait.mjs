// Composite existing walking legs under the attack torso. Coordinates are source pixels.
const HINTS={walk:[.54,.53],punch:[.57,.56],punch2:[.55,.60],punch3:[.55,.48]};
const cache=new WeakMap();
export function gaitParts(item,clip){
 if(cache.has(item))return cache.get(item);
 const image=item.image,w=image.width,h=image.height,[hx,hy]=HINTS[clip];
 const c=document.createElement('canvas');c.width=w;c.height=h;
 const q=c.getContext('2d',{willReadFrequently:true});q.drawImage(image,0,0);
 const pixels=q.getImageData(0,0,w,h).data;
 let best=-1,waistX=hx*w,waistY=hy*h;
 for(let y=Math.round(hy*h-25);y<=hy*h+25;y++){
  let score=0,total=0;
  for(let x=Math.round(hx*w-62);x<hx*w+62;x++){
   const i=(y*w+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2];
   if(pixels[i+3]>180&&r>105&&g>65&&g<r*.92&&b<g*.65){score++;total+=x;}
  }
  if(score>best){best=score;waistX=score?total/score:waistX;waistY=y;}
 }
 // Keep the attack tail with its torso, without carrying walking hands or scarf into the legs.
 const tail=new Uint8Array(w*h);
 for(let y=Math.round(waistY+4);y<Math.min(h,waistY+110);y++)for(let x=0;x<waistX-65;x++){
  const i=(y*w+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2];
  if(pixels[i+3]>100&&r>100&&g>r*.87&&g<r*1.10&&b>g*.85){
   for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
    const xx=x+dx,yy=y+dy;if(xx>=0&&xx<w&&yy>=0&&yy<h)tail[yy*w+xx]=1;
   }
  }
 }
 const torso=document.createElement('canvas');torso.width=w;torso.height=h;
 const legs=document.createElement('canvas');legs.width=w;legs.height=h;
 const upper=q.getImageData(0,0,w,h),lower=q.getImageData(0,0,w,h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;
  if(y>waistY+54&&!tail[y*w+x])upper.data[i+3]=0;
  if(y<waistY+53||tail[y*w+x])lower.data[i+3]=0;
 }
 torso.getContext('2d').putImageData(upper,0,0);
 legs.getContext('2d').putImageData(lower,0,0);
 const cutY=waistY+54;let cutLeft=w,cutRight=0;
 for(let xx=Math.max(0,Math.round(waistX-140));xx<Math.min(w,waistX+140);xx++){
  const i=(cutY*w+xx)*4;if(pixels[i+3]>180&&!tail[cutY*w+xx]){cutLeft=Math.min(cutLeft,xx);cutRight=Math.max(cutRight,xx);}
 }
 if(cutRight<=cutLeft){cutLeft=waistX-45;cutRight=waistX+45;}
 // Hit areas exclude the tail and extended attacking arm.
 function bands(data,y0,y1,count,x0,x1){
  const boxes=[];
  for(let band=0;band<count;band++){
   const lo=Math.max(0,Math.floor(y0+(y1-y0)*band/count)),hi=Math.min(h,Math.ceil(y0+(y1-y0)*(band+1)/count));
   let left=w,right=0,top=h,bottom=0;
   for(let yy=lo;yy<hi;yy++)for(let xx=Math.max(0,Math.floor(x0));xx<Math.min(w,x1);xx++){
    if(data[(yy*w+xx)*4+3]>180){left=Math.min(left,xx);right=Math.max(right,xx);top=Math.min(top,yy);bottom=Math.max(bottom,yy);}
   }
   if(right>left&&bottom>top)boxes.push({x:left,y:top,w:right-left,h:bottom-top});
  }
  return boxes;
 }
 const upperBoxes=bands(upper.data,item.metric.top,cutY,3,waistX-100,waistX+65);
 // Separate opaque runs instead of bridging the empty space between feet.
 const lowerBoxes=[];
 for(let yy=Math.ceil(cutY);yy<item.metric.bottom;yy+=4){
  const end=Math.min(yy+4,item.metric.bottom);let start=-1;
  for(let xx=0;xx<=w;xx++){
   let solid=xx<w;
   for(let y=yy;solid&&y<end;y++)solid=lower.data[(y*w+xx)*4+3]>180;
   if(solid&&start<0)start=xx;
   if(!solid&&start>=0){if(xx-start>=5)lowerBoxes.push({x:start+1,y:yy,w:xx-start-2,h:end-yy});start=-1;}
  }
 }
 const result={torso,legs,waistX,waistY,cutY,cutLeft,cutRight,upperBoxes,lowerBoxes};cache.set(item,result);return result;
}
function triangle(ctx,image,src,dst){
 const [a,b,c]=src,[u,v,z]=dst;
 const den=(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y);
 const m11=((v.x-u.x)*(c.y-a.y)-(z.x-u.x)*(b.y-a.y))/den;
 const m21=((z.x-u.x)*(b.x-a.x)-(v.x-u.x)*(c.x-a.x))/den;
 const m12=((v.y-u.y)*(c.y-a.y)-(z.y-u.y)*(b.y-a.y))/den;
 const m22=((z.y-u.y)*(b.x-a.x)-(v.y-u.y)*(c.x-a.x))/den;
 ctx.save();ctx.beginPath();ctx.moveTo(u.x,u.y);ctx.lineTo(v.x,v.y);ctx.lineTo(z.x,z.y);ctx.closePath();ctx.clip();
 ctx.transform(m11,m12,m21,m22,u.x-m11*a.x-m21*a.y,u.y-m12*a.x-m22*a.y);
 ctx.drawImage(image,0,0);ctx.restore();
}
export function gaitLayout(item,clip,legItem,sign,x,floor,angle,pivot){
 const upper=gaitParts(item,clip),lower=gaitParts(legItem,'walk'),s=item.scale;
 const base=item.baseline??item.metric.bottom;
 const localX=(upper.waistX-item.anchor)*s,localY=(upper.waistY-base)*s;
 const dx=sign*localX,dy=localY+pivot;
 const hipX=x+dx*Math.cos(angle)-dy*Math.sin(angle);
 // Walking proportions are constant; only the small seam under the coat is blended.
 const sx=legItem.scale;
 const sourceTop=lower.cutY-1,sourceBottom=legItem.metric.bottom;
 const seamX=(upper.cutLeft+upper.cutRight)/2;
 const seamDX=sign*(seamX-item.anchor)*s,seamDY=(upper.cutY-base)*s+pivot;
 const oldSeamY=floor-pivot+seamDX*Math.sin(angle)+seamDY*Math.cos(angle);
 const offsetY=floor+(sourceTop-sourceBottom)*sx-oldSeamY;
 const upperPoint=(px,py)=>{
  const ax=sign*(px-item.anchor)*s,ay=(py-base)*s+pivot;
  return{x:x+ax*Math.cos(angle)-ay*Math.sin(angle),y:floor-pivot+ax*Math.sin(angle)+ay*Math.cos(angle)+offsetY};
 };
 const project=(px,py)=>{
  const ux=upper.cutLeft+(px-lower.cutLeft)*(upper.cutRight-upper.cutLeft)/Math.max(1,lower.cutRight-lower.cutLeft);
  const top=upperPoint(ux,upper.cutY);
  const t=Math.max(0,Math.min(1,(py-sourceTop)/42)),blend=t*t*(3-2*t);
  const nx=hipX+sign*(px-lower.waistX)*sx,ny=floor+(py-sourceBottom)*sx;
  return{x:top.x*(1-blend)+nx*blend,y:(top.y+(py-sourceTop)*sx)*(1-blend)+ny*blend};
 };
 function bounds(box,transform){
  const points=[];
  for(const yy of [box.y,box.y+box.h/2,box.y+box.h])for(const xx of [box.x,box.x+box.w/2,box.x+box.w])points.push(transform(xx,yy));
  const left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y));
  return{x:left,y:top,w:Math.max(...points.map(p=>p.x))-left,h:Math.max(...points.map(p=>p.y))-top};
 }
 return {upper,lower,s,base,sx,hipX,offsetY,sourceTop,sourceBottom,upperPoint,project,
  bodyBoxes:[...upper.upperBoxes.map(b=>bounds(b,upperPoint)),...lower.lowerBoxes.map(b=>bounds(b,project))]};
}
export function drawAttackGait(ctx,item,clip,legItem,sign,x,floor,angle,pivot){
 const layout=gaitLayout(item,clip,legItem,sign,x,floor,angle,pivot);
 const {upper,lower,s,base,sx,hipX,offsetY,sourceTop,sourceBottom,project}=layout;
 const seamEnd=Math.min(sourceTop+42,sourceBottom);
 for(let i=0;i<8;i++)for(let j=0;j<12;j++){
  const y0=sourceTop+(seamEnd-sourceTop)*i/8,y1=sourceTop+(seamEnd-sourceTop)*(i+1)/8;
  const x0=legItem.image.width*j/12,x1=legItem.image.width*(j+1)/12;
  const a={x:x0,y:y0},b={x:x1,y:y0},c={x:x1,y:y1},d={x:x0,y:y1};
  triangle(ctx,lower.legs,[a,b,c],[project(a.x,a.y),project(b.x,b.y),project(c.x,c.y)]);
  triangle(ctx,lower.legs,[a,c,d],[project(a.x,a.y),project(c.x,c.y),project(d.x,d.y)]);
 }
 // Shoes, shins and most of the pants keep the original bitmap proportions.
 ctx.save();ctx.translate(hipX,floor);ctx.scale(sign*sx,sx);
 ctx.drawImage(lower.legs,0,seamEnd,legItem.image.width,legItem.image.height-seamEnd,-lower.waistX,seamEnd-sourceBottom,legItem.image.width,legItem.image.height-seamEnd);
 ctx.restore();
 ctx.save();ctx.translate(x,floor-pivot+offsetY);ctx.rotate(angle);ctx.translate(0,pivot);
 ctx.scale(sign*s,s);ctx.drawImage(upper.torso,-item.anchor,-base);ctx.restore();
}
