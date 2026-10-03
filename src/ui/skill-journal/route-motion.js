// A successful core allocation is the only caller. Selection/load do not replay routes.
export function createRouteMotion(){
  const active=new Set(),events=[];let serial=0;
  function cancel(){for(const item of [...active])item.finish();}
  function draw(svg,source,target,d){
    if(!svg||!d)return;
    events.push({source,target});if(events.length>100)events.shift();
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const base=[...svg.querySelectorAll('.base-routes path')].find(path=>path.dataset.edge===JSON.stringify([source,target].sort()));if(base){base.classList.add('route-pending');base.classList.remove('learned');}
    const ns='http://www.w3.org/2000/svg',id=`journal-route-${++serial}`,group=document.createElementNS(ns,'g');
    group.classList.add('purchase-route');group.dataset.source=source;group.dataset.target=target;
    const defs=document.createElementNS(ns,'defs'),mask=document.createElementNS(ns,'mask'),reveal=document.createElementNS(ns,'path'),route=document.createElementNS(ns,'path');
    mask.id=id;mask.setAttribute('maskUnits','userSpaceOnUse');mask.setAttribute('x','-100');mask.setAttribute('y','-100');mask.setAttribute('width',svg.getAttribute('width'));mask.setAttribute('height',svg.getAttribute('height'));
    reveal.setAttribute('d',d);reveal.setAttribute('pathLength','1');reveal.setAttribute('fill','none');reveal.setAttribute('stroke','white');reveal.setAttribute('stroke-width','14');reveal.style.strokeDasharray='1';reveal.style.strokeDashoffset='1';
    route.setAttribute('d',d);route.setAttribute('class','edge purchased');route.setAttribute('mask',`url(#${id})`);mask.append(reveal);defs.append(mask);group.append(defs,route);svg.append(group);
    const animation=reveal.animate([{strokeDashoffset:1},{strokeDashoffset:0}],{duration:720,easing:'cubic-bezier(.22,.7,.2,1)',fill:'forwards'});
    let done=false;const item={finish(){if(done)return;done=true;animation.cancel();group.remove();if(base){base.classList.remove('route-pending');base.classList.add('learned');}active.delete(item);}};active.add(item);animation.onfinish=item.finish;animation.oncancel=()=>{group.remove();active.delete(item);};
  }
  return {draw,cancel,snapshot:()=>({active:active.size,events:[...events]})};
}
