const wrap=x=>((x%1)+1)%1;
function random(a,b,seed){let h=Math.imul(a,374761393)^Math.imul(b,668265263)^Math.imul(seed,1274126177);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;}
export function axisAt(bottomUp,s){return (s.spiralOrigin||0)/360+s.spiralDirection*Math.tan(s.spiralAngle*Math.PI/180)*s.height*bottomUp/(Math.PI*s.diameter);}
export function boundary(row,s){return Math.round(axisAt((row+.5)/s.spiralTurns,s)*s.spiralColumns);}
export function drawAxis(canvas,s){
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,rows=s.spiralTurns;
  ctx.save();ctx.strokeStyle='#ff6347';ctx.lineWidth=2;
  for(let r=0;r<rows;r++){
    const x=wrap(boundary(r,s)/s.spiralColumns)*w,y=h*(1-r/rows),top=h*(1-(r+1)/rows);
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,top);ctx.stroke();
    if(r+1<rows){let dx=(boundary(r+1,s)-boundary(r,s))/s.spiralColumns;dx-=Math.round(dx);for(const offset of [-w,0,w]){ctx.beginPath();ctx.moveTo(x+offset,top);ctx.lineTo(x+offset+dx*w,top);ctx.stroke();}}
  }
  ctx.setLineDash([3,4]);ctx.strokeStyle='#00e5ff';ctx.lineWidth=1;
  for(let y=1;y<h;y++){const a=wrap(axisAt(1-(y-1)/h,s))*w,b=wrap(axisAt(1-y/h,s))*w;if(Math.abs(a-b)<w/2){ctx.beginPath();ctx.moveTo(a,y-1);ctx.lineTo(b,y);ctx.stroke();}}
  ctx.restore();
}
export function spiralGrid(u,topDown,s){
  const columns=s.spiralColumns,rows=s.spiralTurns,dir=s.spiralDirection;
  const y=Math.max(0,Math.min(1-1e-12,1-topDown))*rows,row=Math.floor(y),fy=y-row;
  // A fixed rectangular lattice samples a rotating white-to-black reset axis.
  const x=wrap(u)*columns,col=Math.floor(x),start=boundary(row,s);
  const order=((col-start)%columns+columns)%columns;
  const progress=order/(columns-1);
  const jitter=(random(col,row,s.seed)*2-1)*s.spiralVariation;
  const grey=Math.max(0,Math.min(1,progress+jitter));
  const gap=s.spiralGap,fx=x-col;
  if(!gap)return grey;
  const edge=Math.min(fx,1-fx,fy,1-fy),t=Math.max(0,Math.min(1,edge/gap));
  return grey*t*t*(3-2*t);
}
