/** View-only camera. A tap inspects; drag, wheel, pinch and cancel never buy. */
export function createCamera(root,plane,output,onInspect) {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let width=1000,height=850,cam={x:500,y:425,z:1},target={...cam},frame=0,last=0,pointers=new Map(),gesture=null,blocked=false,sheet=0,bounds=null;
  const clampZ=z=>Math.max(.35,Math.min(1.7,z));
  const center=()=>({x:(root.clientWidth-sheet)/2,y:root.clientHeight/2});
  const draw=()=>{
    const c=center();plane.style.transform=`translate3d(${c.x-cam.x*cam.z}px,${c.y-cam.y*cam.z}px,0) scale(${cam.z})`;
    plane.style.setProperty('--inverse',1/cam.z);output.textContent=Math.round(cam.z*100)+'%';
  };
  const animate=now=>{
    const dt=Math.min(48,now-last||16);last=now;
    const k=reduced.matches?1:1-Math.exp(-dt/65);
    for(const key of ['x','y','z'])cam[key]+=(target[key]-cam[key])*k;
    draw();
    if(Math.abs(cam.x-target.x)+Math.abs(cam.y-target.y)+Math.abs(cam.z-target.z)*500>.05)frame=requestAnimationFrame(animate);
    else {cam={...target};draw();frame=0;}
  };
  const schedule=()=>{if(!frame){last=0;frame=requestAnimationFrame(animate);}};
  const constrain=()=>{
    // Keep a useful portion of the paper in view instead of panning into blanks.
    const halfX=Math.min(width/2,Math.max(0,(root.clientWidth-sheet-70)/2/target.z)),halfY=Math.min(height/2,Math.max(0,(root.clientHeight-40)/2/target.z));
    target.x=Math.max(halfX,Math.min(width-halfX,target.x));target.y=Math.max(halfY,Math.min(height-halfY,target.y));
  };
  const fit=()=>{const free=root.clientWidth-sheet;target={x:width/2,y:height/2,z:clampZ(Math.min((free-70)/width,(root.clientHeight-40)/height))};schedule();};
  const focus=(x,y)=>{target={x,y,z:Math.max(target.z,.82)};schedule();};
  const zoom=(factor,x,y)=>{
    const c=center();x??=c.x;y??=c.y;const z=clampZ(target.z*factor);
    target.x+=(x-c.x)/target.z-(x-c.x)/z;target.y+=(y-c.y)/target.z-(y-c.y)/z;target.z=z;constrain();schedule();
  };
  const measure=()=>{const p=[...pointers.values()];return p.length>1?{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2,d:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)}:{...p[0],d:0};};
  const down=e=>{
    if(e.button>0)return;
    if(!pointers.size){blocked=false;bounds=root.getBoundingClientRect();}
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size>1)blocked=true;
    gesture={...measure(),cx:target.x,cy:target.y,z:target.z};
    // Keep the button as the tap target until a drag has actually begun.
    if(blocked)root.setPointerCapture(e.pointerId);
  };
  const move=e=>{
    if(!pointers.has(e.pointerId)||!gesture)return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const m=measure();
    if(!blocked&&Math.hypot(m.x-gesture.x,m.y-gesture.y)<7)return;
    blocked=true;root.setPointerCapture(e.pointerId);root.classList.add('dragging');e.preventDefault();
    const z=gesture.d?clampZ(gesture.z*m.d/gesture.d):gesture.z,c=center();
    target={x:gesture.cx+(gesture.x-bounds.left-c.x)/gesture.z-(m.x-bounds.left-c.x)/z,y:gesture.cy+(gesture.y-bounds.top-c.y)/gesture.z-(m.y-bounds.top-c.y)/z,z};
    constrain();schedule();
  };
  const up=e=>{
    pointers.delete(e.pointerId);root.classList.remove('dragging');
    gesture=pointers.size?{...measure(),cx:target.x,cy:target.y,z:target.z}:null;
  };
  const cancel=e=>{pointers.delete(e.pointerId);gesture=null;blocked=true;root.classList.remove('dragging');};
  const click=e=>{if(blocked){e.preventDefault();e.stopImmediatePropagation();blocked=false;return;}const el=e.target.closest('[data-node],[data-gateway]');if(el)onInspect(el.dataset.node||el.dataset.gateway,el.hasAttribute('data-gateway'));};
  const wheel=e=>{e.preventDefault();const r=root.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top);};
  const key=e=>{if(e.target!==root)return;const moves={ArrowLeft:[-70,0],ArrowRight:[70,0],ArrowUp:[0,-70],ArrowDown:[0,70]};if(moves[e.key]){e.preventDefault();target.x+=moves[e.key][0]/target.z;target.y+=moves[e.key][1]/target.z;constrain();schedule();}else if(['+','=','-','Home'].includes(e.key)){e.preventDefault();e.key==='Home'?fit():zoom(e.key==='-'?1/1.2:1.2);}};
  const events=[['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['lostpointercapture',e=>{if(pointers.has(e.pointerId))cancel(e);}],['click',click,true],['wheel',wheel,{passive:false}],['keydown',key]];
  events.forEach(args=>root.addEventListener(...args));
  let measuredWidth=root.clientWidth,measuredHeight=root.clientHeight;
  const resize=new ResizeObserver(()=>{const w=root.clientWidth,h=root.clientHeight;if(w!==measuredWidth||h!==measuredHeight){measuredWidth=w;measuredHeight=h;constrain();schedule();}});resize.observe(root);
  return {fit,focus,zoom,frame(x,y,z){target={x,y,z:clampZ(z)};schedule();},configure(w,h){width=w;height=h;fit();},setSheet(px){sheet=px;schedule();},snapshot(){return {...target};},destroy(){cancelAnimationFrame(frame);resize.disconnect();events.forEach(args=>root.removeEventListener(...args));}};
}
