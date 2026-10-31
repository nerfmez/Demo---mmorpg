// Frontier skill expansion. Pure simulation helpers; all content/tuning comes from data.
import { angleTo, angleDiff, dist, DEG } from './math.js';
import { executeRogue, tickRogue } from './rogue.js';

export const EXTRA_FIELDS = ['dashTime','cutDelay','shadowStep','guard','positionalMult','frontMult','exposure','stun','poison','width','aimDuringCast','taunt','waves','waveInterval','channel','wall','cleanse','aura','rush','lightWall','rage','spirit','stealth','steal','shatter','afterShock','shockCharge','arrows','trap','root','bleed'];
export function compileFrontier(s, def, activeMods) {
  for (const key of EXTRA_FIELDS) if (def[key] !== undefined) s[key] = Array.isArray(def[key]) ? [...def[key]] : typeof def[key] === 'object' ? { ...def[key] } : def[key];
  s.modEffects = {};
  for (const { mod, level } of activeMods) for (const [key, value] of Object.entries(mod.effect))
    s.modEffects[key] = Array.isArray(value) ? value[Math.min(level, value.length) - 1] : value;
  const e = s.modEffects;
  if (e.arcMult) s.arc *= e.arcMult;
  // reach, a lane's width, a chain's jumps (Wide Spread, Far Reach, Long Rend, Conductive Arc); a
  // channel's spread is whatever its shape has: a cone's angle, a beam's width, or a circle's radius
  if (e.spreadMult) { if (s.arc) s.arc *= e.spreadMult; else if (s.width) s.width *= e.spreadMult; else if (s.radius) s.radius *= e.spreadMult; }
  if (e.rangeMult) s.range *= e.rangeMult;
  // Stagger (a control mod): every hit stuns; a skill's own stun keeps the longer of the two
  if (e.hitStun) s.stun = { duration: Math.max(s.stun?.duration || 0, e.hitStun), bossDuration: Math.max(s.stun?.bossDuration || 0, e.hitStunBoss) };
  // Lasting Control: stuns, chills, curses and walls of this skill last longer
  if (e.controlMult) {
    if (s.stun) s.stun = { ...s.stun, duration: s.stun.duration * e.controlMult, bossDuration: (s.stun.bossDuration || 0) * e.controlMult };
    if (s.chill) s.chill.duration *= e.controlMult;
    if (s.kind === 'curse_zone' || s.kind === 'wall') s.duration *= e.controlMult;
  }
  if (e.widthMult && s.width) s.width *= e.widthMult;
  if (e.chainFalloffSet) s.chainFalloff = e.chainFalloffSet;
  if (e.chainRangeMult) s.chainRange *= e.chainRangeMult;
  if(e.returnMult)s.pierce=Infinity;
  if (e.healMult && s.heal) s.heal *= e.healMult;
  if (e.barrierMult && s.barrier) s.barrier *= e.barrierMult;
  // Wide Field trades a little of a buff's strength for its larger circle.
  if (e.buffMult) { if (s.damageBuff) s.damageBuff *= e.buffMult; if (s.aura) s.aura.mpRegen *= e.buffMult; }
  // Building Power on a charged shot: a stronger full charge that takes longer to reach.
  if (e.chargeMaxAdd && s.charge) { s.charge.maxDamageMult += e.chargeMaxAdd; s.charge.duration *= e.chargeDurationMult; }
  if (e.triggerCost && s.trigger) s.trigger.cost = true;
  if(s.summon&&e.summonDamage&&!e.extraSummons)s.summon.damage*=1+e.summonDamage;
  if (s.summon) s.summon = { ...s.summon, tauntRadius:def.summon.tauntRadius, tauntInterval:def.summon.tauntInterval, tauntDuration:def.summon.tauntDuration, effects:e, skill:s.id };
}

const inArc = (p,m,aim,s) => dist(p.x,p.z,m.x,m.z)-m.r <= s.range && Math.abs(angleDiff(aim.angle,angleTo(p.x,p.z,m.x,m.z))) <= (s.arc || 360)*DEG/2;
const units = g => g.units().filter(u => !u.dead && u.life !== 0 && u.hp > 0);
const activeAura = (g,a) => {const s=g.skills[a.slot];return s?.id===a.skill.id&&s.requirementsMet&&(a.skill.aura?!!s.aura:!!s.modEffects?.buffAura);};
export function manaLimit(g) {
  let reserve=0;
  for(const a of Object.values(g.player.auras || {})) if(activeAura(g,a)) reserve += a.reserve;
  return g.player.maxMp * (1 - Math.min(.8,reserve));
}
export function cancelChannel(g) {
  const c=g.player.channeling;
  if (!c) return;
  g.player.cooldowns[c.slot]=Math.max(g.player.cooldowns[c.slot],c.skill.cooldown);
  g.player.channeling=null;
  // Release Burst: letting go after a held channel bursts ahead in the skill's element, stronger the longer it was held
  const s=c.skill,e=s.modEffects||{},p=g.player,held=c.t-s.castTime;
  if(e.releaseMult&&held>=e.releaseMin&&!p.dead){const r=s.range*.6;secondaryBurst(g,p.x+Math.sin(p.facing)*r,p.z+Math.cos(p.facing)*r,e.releaseRadius,s.damage*e.releaseMult*Math.min(held,e.releaseCap)*g.playerDamageMult(),s.element,s.id,'release_burst');}
  g.emit({type:'channelEnd'});
}
export function startChannel(g,s) {
  const p=g.player;
  p.queued=null;
  p.mp-=s.cost;
  p.channeling={slot:s.slot,skill:s,t:0,next:s.castTime};
  g.emit({type:'channelStart',skill:s.id,slot:s.slot,total:s.castTime,weapon:g.derived.weaponType});
}
export function commandAllies(g,command,targetId=null) {
  if(!['attack','follow','guard'].includes(command))return false;
  const target=targetId && g.monsterById(targetId);
  if(command==='attack'&&(!target||target.dead||dist(target.x,target.z,g.player.x,g.player.z)>16))return false;
  for(const a of g.allies){a.command=command;a.targetId=command==='attack'?target.id:null;a.state='follow';a.stateT=0;}
  return true;
}
export function healUnit(g,u,amount,s,mult=1) {
  if(u.dead||u.hp<=0)return;
  const e=s?.modEffects || {},part=e.healBarrier || 0;
  const actual=amount*mult;
  if(u===g.player)g.healPlayer(actual*(1-part));
  else {const got=Math.min(u.maxHp-u.hp,actual*(1-part));u.hp+=got;if(got>0)g.emit({type:'heal',amount:Math.round(got),x:u.x,z:u.z});}
  if(part){u.barrier=Math.max(u.barrier||0,Math.min(u.maxHp*e.healBarrierCap,actual*part));u.barrierT=Math.max(u.barrierT||0,e.healBarrierDuration);}
}
export function executeFrontier(g,s,aim,mult,triggered) {
  const p=g.player,e=s.modEffects || {};
  if(executeRogue(g,s,aim,mult))return true;
  if(s.channel){if(!p.channeling)startChannel(g,s);return true;}
  if(s.kind==='heal_target'){
    g.emit({type:'healCast',skill:s.id,x:p.x,z:p.z,radius:1.2});
    const candidates=units(g).filter(u=>dist(p.x,p.z,u.x,u.z)<=s.range);
    // Manual point selects nearest ally; quick cast selects the most injured ratio.
    candidates.sort((a,b)=>aim.targetId?(a.id===aim.targetId?-1:b.id===aim.targetId?1:0):(a.hp/a.maxHp-b.hp/b.maxHp));
    const hit=new Set();let u=candidates[0]||p,heal=s.heal*mult;
    for(let i=0;i<= (e.healChain||0)&&u;i++){
      hit.add(u.id);healUnit(g,u,heal,s);
      const status=s.cleanse.find(k=>u.statuses?.[k]);if(status)delete u.statuses[status];
      const source=u;u=units(g).filter(q=>!hit.has(q.id)&&q.hp<q.maxHp&&dist(q.x,q.z,source.x,source.z)<=e.healChainRange).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
      heal*=e.healChainFalloff || 1;
    }
    return true;
  }
  if(s.kind==='aura'||e.buffAura){
    p.auras ||= {};
    if(p.auras[s.slot])delete p.auras[s.slot];
    else p.auras[s.slot]={slot:s.slot,skill:s,reserve:s.aura?.reserve||e.auraReserve,tick:s.aura?.tick||.5,next:0};
    p.mp=Math.min(p.mp,manaLimit(g));
    g.emit({type:'auraToggle',skill:s.id,active:!!p.auras[s.slot],x:p.x,z:p.z,radius:s.radius});
    return true;
  }
  if(s.kind==='counter_stance'){
    if(s.counterStrike){
      p.riposte=null;
      for(const m of g.monsters)if(!m.dead&&inArc(p,m,aim,s))g.hitMonster(m,s.damage*mult,g.hitOpts(s,{crit:g.rollCrit()}));
      g.emit({type:'slash',skill:s.id,x:p.x,z:p.z,angle:aim.angle,arc:s.arc,range:s.range,element:s.element});
    }else {
      p.riposte={skill:s,guardUntil:g.time+s.guard.duration,readyUntil:0};
      // Spiked Ward on a stance draws nearby monsters into the guard instead of taunting on a barrier.
      if(s.tauntRadius)for(const m of g.monsters)if(!m.dead&&dist(p.x,p.z,m.x,m.z)<s.tauntRadius){m.forcedTargetId=p.id;m.tauntT=Math.max(m.tauntT||0,s.guard.duration);}
      g.emit({type:'guardStance',x:p.x,z:p.z,duration:s.guard.duration});
    }
    return true;
  }
  // Thunder Lance (s.afterShock): the lane it struck crackles again a moment later, weaker, and shocks
  if(s.kind==='melee_line'){
    const x=p.x,z=p.z,a=aim.angle,A=s.afterShock;
    strikeLane(g,s,x,z,a,s.range,mult);
    if(A&&!triggered)g.later(A.delay,()=>strikeLane(g,s,x,z,a,s.range,mult*A.mult,{shock:{duration:A.shock}},true));
    return true;
  }
  // Blink Draw (dash_line): the hero dashes along the aim (walls and cliffs stop it, no
  // invulnerability); the lane it crossed is cut when it arrives (Game.updatePlayer, strikeLane)
  if(s.kind==='dash_line'){
    const v=s.range/s.dashTime;
    // Line Breaker (s.rush): the shield hits what it runs into on the way (rushContact), not on arrival
    p.dash={t:0,dur:s.dashTime,vx:Math.sin(aim.angle)*v,vz:Math.cos(aim.angle)*v,inv:false,kind:s.rush?'shield_rush':'draw_cut',skill:s,mult,fromX:p.x,fromZ:p.z,angle:aim.angle,hit:new Set()};
    g.emit({type:'dashStrike',skill:s.id,x:p.x,z:p.z,angle:aim.angle,range:s.range,time:s.dashTime,element:s.element});
    return true;
  }
  // Wall of Faith: a band of light offset ahead of the hero, across the aim. Monsters walk through it
  // (slowed); their shots stop at it; the hero and allies on the hero's side take less (coverMult).
  if(s.kind==='light_wall'){
    const L=s.lightWall,x=p.x+Math.sin(aim.angle)*L.offset,z=p.z+Math.cos(aim.angle)*L.offset;
    g.spawnArea({owner:'player',kind:'faith_wall',skill:s,x,z,radius:L.length/2,angle:aim.angle+Math.PI/2,facing:aim.angle,duration:s.duration,lightWall:L});
    return true;
  }
  if(s.kind==='wall'){
    const axis=aim.angle+Math.PI/2,half=s.wall.length/2,walls=[];
    // Two safe endpoints leave a route around the wall; reject enclosed/occupied placement.
    const ends=[-half-s.wall.minGap,half+s.wall.minGap];
    if(!ends.every(d=>g.world.isFree(aim.x+Math.sin(axis)*d,aim.z+Math.cos(axis)*d,p.r)))return true;
    for(let i=-1;i<=1;i++){
      const x=aim.x+Math.sin(axis)*i*s.wall.length/3,z=aim.z+Math.cos(axis)*i*s.wall.length/3,r=s.wall.length/6;
      if(!g.world.isFree(x,z,r)||[...units(g),...g.monsters.filter(m=>!m.dead)].some(u=>dist(x,z,u.x,u.z)<r+u.r))return true;
      walls.push({x,z,r});
    }
    for(const w of walls)g.spawnArea({owner:'player',kind:'crystal_wall',skill:s,...w,radius:w.r,angle:axis,duration:s.duration,wallHp:s.wall.hp.base+s.wall.hp.scale*g.derived.magic,wallHitAt:0});
    return true;
  }
  // Traps (s.trap, the trapper): set at the aim point; armed after arm s, a trap waits (for life s) until a
  // monster comes within trigger m, then springs: one burst of the skill over its radius (updateAreas). A
  // skill keeps at most max traps set (the oldest goes); a field (count) scatters its traps over spread m.
  if(s.trap){placeTraps(g,s,aim,mult);return true;}
  // Flame Arrow Rain (s.arrows): count arrows pin across the circle at land s, one near its middle, the rest
  // spread round it; each burns on its own fuse and bursts (radius blast) at its own time
  if(s.arrows){
    const A=s.arrows,volley=(k,later)=>{
      for(let i=0;i<A.count;i++){
        const a=(i+g.rng.range(0,.8))/A.count*Math.PI*2,d=i===0?g.rng.range(0,.25)*s.radius:s.radius*(.35+.6*Math.sqrt(g.rng.range(0,1)));
        const x=aim.x+Math.cos(a)*d,z=aim.z+Math.sin(a)*d,fuse=A.fuseMin+(A.fuseMax-A.fuseMin)*g.rng.range(0,1);
        const area=g.spawnArea({owner:'player',kind:s.id,skill:s,x,z,radius:A.blast,delay:later+A.land+fuse,duration:.35,damage:s.damage*mult*k,element:s.element,echo:later>0});
        g.emit({type:'arrowPin',skill:s.id,id:area.id,x,z,land:later+A.land,delay:area.delay,fromX:g.player.x,fromZ:g.player.z,i});
      }
    };
    volley(1,0);
    if(s.echo)volley(s.echo.mult,s.echo.delay);
    return true;
  }
  if(s.waves){
    for(let i=0;i<s.waves;i++){
      const wave={owner:'player',kind:s.id,skill:s,x:aim.x,z:aim.z,radius:s.radius,delay:s.delay+i*s.waveInterval,duration:.35,damage:s.damage*mult,element:s.element};
      g.spawnArea(wave);
      if(s.echo)g.spawnArea({...wave,echo:true,delay:wave.delay+s.echo.delay,damage:wave.damage*s.echo.mult});
    }return true;
  }
  return false;
}

/**
 * Line Breaker (dash_line with s.rush), each frame of the dash: every monster the raised shield has
 * reached in the lane (s.width wide, from the start to just ahead of the hero) is hit once and thrown
 * out to the side (rush.knockSide m). A boss or a big monster (radius >= rush.bigRadius) stops the
 * charge where it stands, in front of it, and is stunned for rush.stun s.
 */
export function rushContact(g,d){
  const p=g.player,s=d.skill,R=s.rush,sn=Math.sin(d.angle),cs=Math.cos(d.angle);
  const went=(p.x-d.fromX)*sn+(p.z-d.fromZ)*cs;
  const close=g.monsters.filter(m=>!m.dead&&m.targetable!==false&&!d.hit.has(m.id)).map(m=>{
    const dx=m.x-d.fromX,dz=m.z-d.fromZ;return {m,forward:dx*sn+dz*cs,side:dx*cs-dz*sn};
  }).filter(o=>o.forward>=-o.m.r&&o.forward<=went+p.r+o.m.r&&Math.abs(o.side)<=s.width/2+o.m.r).sort((a,b)=>a.forward-b.forward);
  for(const {m,forward,side} of close){
    d.hit.add(m.id);
    const big=m.boss||m.r>=R.bigRadius;
    g.hitMonster(m,s.damage*d.mult,g.hitOpts(s,{crit:g.rollCrit(),fromX:p.x,fromZ:p.z,...(big?{stun:{duration:R.stun,bossDuration:R.stun}}:{})}));
    if(big){
      // stopped in front of it: back to where the shield meets it
      const stop=Math.max(0,forward-m.r-p.r);
      if(stop<went)g.moveEntity(p,-sn*(went-stop),-cs*(went-stop));
      d.t=d.dur;d.stopped=true;
      g.emit({type:'rushStop',id:m.id,x:p.x,z:p.z,angle:d.angle});
      return;
    }
    if(!m.dead){const k=side>=0?1:-1;g.moveEntity(m,cs*R.knockSide*k,-sn*R.knockSide*k);}
  }
}

/** A straight lane from (x, z) along angle, range long and s.width wide: every monster in it is hit once. */
export function strikeLane(g,s,x,z,angle,range,mult,extra=null,after=false) {
  const e=s.modEffects||{};
  // Far End: the far end of the lane hits harder
  const tip=e.tipMult?range*(1-e.tipShare):Infinity;
  for(const m of g.monsters){
    if(m.dead)continue;const dx=m.x-x,dz=m.z-z;
    const forward=dx*Math.sin(angle)+dz*Math.cos(angle),side=dx*Math.cos(angle)-dz*Math.sin(angle);
    if(forward < -m.r || forward>range+m.r || Math.abs(side)>s.width/2+m.r)continue;
    g.hitMonster(m,s.damage*mult*(forward>=tip?e.tipMult:1),g.hitOpts(s,{crit:g.rollCrit(),fromX:x,fromZ:z,...extra}));
  }
  g.emit({type:'lineStrike',skill:s.id,x,z,angle,range,width:s.width,element:s.element,after});
}

/** Thunder Slash's charge: a hit from one of the hero's main skills (a base cooldown of at most
 * progression.combat.mainSkillCooldown) on a charged monster shocks it once more in lightning, until its
 * shocks or its time run out. */
export function chargeShock(g,m,opts){
  const c=m.statuses.charged;
  if(!c||m.dead||opts.byAlly||opts.secondary||opts.dot||!opts.skill)return;
  const def=g.data.skills.combat[opts.skill];
  if(!def||def.cooldown>g.data.progression.combat.mainSkillCooldown)return;
  c.shocks--;if(c.shocks<=0)delete m.statuses.charged;
  g.emit({type:'chargeShock',id:m.id,x:m.x,z:m.z,left:Math.max(0,c.shocks)});
  g.hitMonster(m,c.damage,{element:'lightning',secondary:true,skill:'thunder_slash'});
}
/** One more poison stack (up to pz.maxStacks), refreshed; every stack poisons for pz.stackDps x amount a second
 * (Venom Arrow's direct hits, Miasma Arrow's mist ticks). */
export function stackPoison(g,m,pz,amount){
  const old=m.statuses.poison,before=old?.stacks||0,stacks=Math.min(pz.maxStacks,before+1);
  m.statuses.poison={dps:stacks*pz.stackDps*amount,t:pz.duration,acc:old?.acc||0,owner:'player',stacks};
  if(stacks>before)g.emit({type:'poisonStack',id:m.id,stacks,x:m.x,z:m.z});
}
export function adjustFrontierHit(g,m,amount,opts) {
  const s=opts.skill && g.skills.find(s=>s?.id===opts.skill),e=opts.modEffects || {};
  if(opts.dot||opts.secondary)return amount;
  // Flank Thrust: harder from the side or behind (positionalMult), weaker from the front (frontMult).
  const behind=Math.abs(angleDiff(m.facing,angleTo(m.x,m.z,opts.fromX??g.player.x,opts.fromZ??g.player.z)))>Math.PI/2;
  if(s?.positionalMult&&behind)amount*=s.positionalMult;
  if(s?.frontMult&&!behind)amount*=s.frontMult;
  if(opts.exposure)m.statuses.exposure={fraction:Math.max(m.statuses.exposure?.fraction||0,opts.exposure.fraction),t:Math.max(m.statuses.exposure?.t||0,opts.exposure.duration),spread:Math.max(m.statuses.exposure?.spread||0,e.curseSpread||0)};
  // Breakbeat Slam: every direct hit stuns (bosses only briefly); a started wind-up is cancelled and
  // a shelled monster is knocked out of its shell.
  if(opts.stun){
    const duration=m.boss?opts.stun.bossDuration:opts.stun.duration;
    if(duration>0){m.state='stunned';m.stateT=0;m.stateDur=duration;m.windup=null;m.melee=null;m.charge=null;m.shell=false;cancelWindup(g,m);g.emit({type:'stunned',id:m.id,x:m.x,z:m.z,duration});}
  }
  // Venom Arrow: each direct hit adds a poison stack (up to maxStacks) and refreshes it; every stack
  // poisons for stackDps x this hit per second.
  if(opts.poison&&!opts.byAlly)stackPoison(g,m,opts.poison,amount);
  // Shock (ชา): the monster twitches to a stop every so often while it lasts (core/ai.js, tickStatuses)
  if(opts.shock&&!opts.byAlly){const old=m.statuses.shock;m.statuses.shock={t:Math.max(old?.t||0,opts.shock.duration),next:old?old.next:0};g.emit({type:'shocked',id:m.id,x:m.x,z:m.z,duration:opts.shock.duration});}
  // Thunder Slash: what it cuts keeps a charge (shocks, each a share of this hit) for the hero's main skills
  if(opts.shockCharge&&!opts.byAlly){const C=opts.shockCharge;m.statuses.charged={t:C.duration,shocks:C.shocks,damage:amount*C.mult};g.emit({type:'charged',id:m.id,x:m.x,z:m.z,duration:C.duration});}
  if(opts.taunt){m.forcedTargetId=g.player.id;m.tauntT=Math.max(m.tauntT||0,opts.taunt.duration);}
  // Net Trap: rooted, it cannot walk (core/ai.js) but still strikes what is in reach
  if(opts.root&&!opts.byAlly){const d=m.boss?opts.root.bossDuration:opts.root.duration;if(d>0){m.statuses.root={t:Math.max(m.statuses.root?.t||0,d)};g.emit({type:'rooted',id:m.id,x:m.x,z:m.z,duration:d});}}
  // Spike Trap: the wound bleeds a share of the hit over its duration
  if(opts.bleed&&!opts.byAlly&&amount>0){const next={dps:amount*opts.bleed.fraction/opts.bleed.duration,t:opts.bleed.duration,acc:0},old=m.statuses.bleed;if(!old||next.dps>=old.dps)m.statuses.bleed=next;}
  if(e.pull&&!m.boss){const a=angleTo(m.x,m.z,opts.fromX??g.player.x,opts.fromZ??g.player.z),d=Math.min(e.pull,dist(m.x,m.z,opts.fromX??g.player.x,opts.fromZ??g.player.z));g.moveEntity(m,Math.sin(a)*d,Math.cos(a)*d);}
  if(e.poisonFraction){const source=amount/(1-e.poisonFraction),old=m.statuses.poison;const next={dps:source*e.poisonFraction/e.poisonDuration,t:e.poisonDuration,acc:0,owner:'player'};if(!old||next.dps>=old.dps)m.statuses.poison=next;}
  if(e.bleedFraction){const source=amount/(1-e.bleedFraction),old=m.statuses.bleed;const next={dps:source*e.bleedFraction/e.bleedDuration,t:e.bleedDuration,acc:0};if(!old||next.dps>=old.dps)m.statuses.bleed=next;}
  if(e.consumeBurn&&m.statuses.burn?.owner==='player'){
    const burn=m.statuses.burn;delete m.statuses.burn;
    secondaryBurst(g,m.x,m.z,e.statusBurstRadius,Math.min(burn.dps*burn.t,amount*e.consumeBurn),'fire',opts.skill);
  }
  if(e.shatter&&m.statuses.chill?.slow>=e.shatterThreshold){
    m.statuses.chill.slow*=.5;opts.consumedChill=true;
    secondaryBurst(g,m.x,m.z,e.shatterRadius,amount*e.shatter,'cold',opts.skill);
  }
  return amount;
}
function cancelWindup(g,m){g.areas=g.areas.filter(a=>{const remove=a.owner==='monster'&&a.sourceId===m.id&&a.t<a.delay;if(remove)g.emit({type:'areaEnd',id:a.id});return !remove;});}
function secondaryBurst(g,x,z,radius,damage,element,skill,kind='mod_burst'){
  for(const q of g.monsters)if(!q.dead&&dist(x,z,q.x,q.z)<=radius+q.r)g.hitMonster(q,damage,{element,secondary:true,skill});
  g.emit({type:'burst',kind,element,x,z,radius});
}
/** Spreading Hex: a dying target passes each spreadable debuff (Hex, armor exposure) with its remaining time to the nearest clean monster. */
export function spreadCurse(g,m){
  for(const key of ['hex','exposure']){
    const h=m.statuses[key];if(!h?.spread||h.t<=0)continue;
    const next=g.monsters.filter(q=>q!==m&&!q.dead&&!q.statuses[key]&&dist(m.x,m.z,q.x,q.z)<=h.spread).sort((a,b)=>dist(m.x,m.z,a.x,a.z)-dist(m.x,m.z,b.x,b.z))[0];
    if(next)next.statuses[key]={...h};
  }
}
/** Shield Fortress held (guard_hold, past its raise): the hit's source is in the front arc. */
export function fortressGuard(g,source){
  const p=g.player,c=p.channeling;
  if(!c||c.skill.kind!=='guard_hold'||c.t<c.skill.castTime||!source||source.x===undefined)return null;
  return Math.abs(angleDiff(p.facing,angleTo(p.x,p.z,source.x,source.z)))<=c.skill.guard.arc*DEG/2?c.skill:null;
}
export function applyGuard(g,amount,source,opts){
  const p=g.player,r=p.riposte;
  // Shield Fortress takes the hit on the shield (guard.taken) and pushes a monster that struck it back
  const fort=!opts.dot&&!opts.unblockable&&fortressGuard(g,source);
  if(fort){
    if(source.kind==='monster'&&!source.dead&&!source.boss&&dist(p.x,p.z,source.x,source.z)<=fort.range+source.r+1){const a=angleTo(p.x,p.z,source.x,source.z);g.moveEntity(source,Math.sin(a)*fort.guard.push,Math.cos(a)*fort.guard.push);}
    g.emit({type:'fortBlock',x:p.x,z:p.z,angle:p.facing,fromX:source.x,fromZ:source.z});
    return {amount:amount*fort.guard.taken,guarded:true,full:fort.guard.taken<=0};
  }
  if(!r||g.time>r.guardUntil||!source||opts.dot||opts.unblockable)return {amount,guarded:false};
  if(Math.abs(angleDiff(p.facing,angleTo(p.x,p.z,source.x,source.z)))>r.skill.guard.arc*DEG/2)return {amount,guarded:false};
  r.guardUntil=0;r.readyUntil=g.time+r.skill.guard.readyDuration;
  // Spiked Ward returns the blocked part; Breaking Ward pushes the crowd back when the guard lands.
  const e=r.skill.modEffects||{};
  if(r.skill.reflect>0&&source.kind==='monster'&&!source.dead)g.hitMonster(source,amount*(1-r.skill.guard.taken)*r.skill.reflect+g.data.progression.combat.reflectFlat,{element:'physical'});
  if(e.barrierBreakKnock)pushAway(g,p,{knock:e.barrierBreakKnock,radius:e.barrierBreakRadius});
  return {amount:amount*r.skill.guard.taken,guarded:true};
}
export function shareGuardDamage(g,amount){
  const p=g.player,a=g.allies.find(a=>!a.dead&&a.life>0&&a.hp>0&&a.effects?.guardShare&&dist(a.x,a.z,p.x,p.z)<=a.effects.guardShareRange);
  if(!a)return amount;
  const share=amount*a.effects.guardShare;g.damageAlly(a,share,null);return amount-share;
}
export function breakBarrier(g,unit){
  const effect=unit.barrierBreak;if(!effect)return;
  unit.barrierBreak=null;
  pushAway(g,unit,effect);
}
function pushAway(g,unit,effect){
  for(const m of g.monsters)if(!m.dead&&dist(unit.x,unit.z,m.x,m.z)<=effect.radius+m.r){const a=angleTo(unit.x,unit.z,m.x,m.z);g.moveEntity(m,Math.sin(a)*effect.knock*(m.boss?.2:1),Math.cos(a)*effect.knock*(m.boss?.2:1));}
  g.emit({type:'nova',element:'arcane',x:unit.x,z:unit.z,radius:effect.radius});
}
/** Mending Chain on a healing field: each tick also mends injured allies just outside it, weakest first. */
export function chainFieldHeal(g,a){
  const e=a.skill?.modEffects;if(!e?.healChain)return;
  let source={x:a.x,z:a.z,r:a.radius},heal=a.heal;const hit=new Set();
  for(let i=0;i<e.healChain;i++){
    const u=units(g).filter(q=>!hit.has(q.id)&&q.hp<q.maxHp&&dist(a.x,a.z,q.x,q.z)>a.radius+q.r&&dist(source.x,source.z,q.x,q.z)<=source.r+e.healChainRange).sort((x,y)=>x.hp/x.maxHp-y.hp/y.maxHp)[0];
    if(!u)return;
    heal*=e.healChainFalloff||1;hit.add(u.id);healUnit(g,u,heal,a.skill);source={x:u.x,z:u.z,r:0};
  }
}
export function wallBlocked(g,e,x,z){
  if(e.def?.flyer)return null;
  return g.areas.find(a=>{
    if(!(a.wallHp>0&&a.t>=a.delay))return false;
    const sn=Math.sin(a.angle),cs=Math.cos(a.angle);
    const sx=(e.x-a.x)*sn+(e.z-a.z)*cs,sz=(e.x-a.x)*cs-(e.z-a.z)*sn;
    const tx=(x-a.x)*sn+(z-a.z)*cs,tz=(x-a.x)*cs-(z-a.z)*sn;
    // Swept segment vs expanded rectangle prevents dashes/knockback tunnelling.
    let enter=0,exit=1;
    for(const [start,end,half]of [[sx,tx,a.r+e.r],[sz,tz,a.skill.wall.thickness/2+e.r]]){
      const d=end-start;if(Math.abs(d)<1e-9){if(Math.abs(start)>=half)return false;continue;}
      const t1=(-half-start)/d,t2=(half-start)/d;enter=Math.max(enter,Math.min(t1,t2));exit=Math.min(exit,Math.max(t1,t2));if(enter>exit)return false;
    }
    return exit>=0&&enter<=1;
  });
}
export function tickFrontier(g,dt){
  const p=g.player;
  tickRogue(g,dt);
  tickLightWalls(g);
  if(p.riposte&&g.time>Math.max(p.riposte.guardUntil,p.riposte.readyUntil))p.riposte=null;
  for(const [key,a] of Object.entries(p.auras||{})){
    if(p.dead||!activeAura(g,a)){delete p.auras[key];continue;}
    a.next-=dt;if(a.next>0)continue;a.next+=a.tick;
    for(const u of units(g))if(dist(p.x,p.z,u.x,u.z)<=a.skill.radius+u.r){
      if(a.skill.aura&&u===p)p.mp=Math.min(manaLimit(g),p.mp+a.skill.aura.mpRegen*a.tick);
      if(a.skill.modEffects.buffAura){
        // Following Aura: the buff's own effects at k of their strength, kept topped up (its own entry, like a cast buff)
        const k=a.skill.modEffects.buffAura,s=a.skill,old=u.buffs[s.id];
        if(!old||(old.damage||0)<=(s.damageBuff||0)*k)u.buffs[s.id]={t:a.tick*2,damage:(s.damageBuff||0)*k,speed:(s.speedBuff||0)*k,
          taken:s.takenMult&&s.takenMult!==1?1+(s.takenMult-1)*k:undefined,steady:s.steady,rage:s.rage?{max:s.rage.max*k,atHp:s.rage.atHp}:undefined,
          leech:s.spirit?s.spirit.leech*k:undefined,mpHit:s.spirit?s.spirit.mp*k:undefined};
      }
    }
  }
  p.mp=Math.min(p.mp,manaLimit(g));
  if(p.channeling){
    const c=p.channeling,s=c.skill;
    if(p.dead||p.dash||!g.skills[c.slot]?.requirementsMet||g.skills[c.slot].id!==s.id){cancelChannel(g);return;}
    c.t+=dt;
    // a raised shield faces where the player aims (pointer or a drag on the button); otherwise the target
    const aimed=s.kind==='guard_hold'&&(g.input.aimFromPointer||g.input.manualAim);
    const aim=aimed?{angle:g.input.aimAngle,x:p.x,z:p.z}:g.resolveAim(s,null);p.facing=aim.angle;
    // Shield Fortress: a held stance, no pulses; it drops on its own after channel.maxDuration
    if(s.kind==='guard_hold'){if(c.t>=s.castTime+s.channel.maxDuration)cancelChannel(g);}
    else if(c.t>=c.next){
      const cost=s.channel.manaPerSecond*s.channel.tick;
      if(p.mp<cost){cancelChannel(g);return;}
      p.mp-=cost;c.next+=s.channel.tick;
      // Building Power: a channel starts weaker and grows while it is held.
      const fx=s.modEffects||{},ramp=fx.rampMax?fx.rampStart+(fx.rampMax-fx.rampStart)*Math.min(1,c.t/fx.rampTime):1;
      for(const m of g.monsters)if(!m.dead&&inArc(p,m,aim,s))g.hitMonster(m,s.damage*s.channel.tick*ramp*g.playerDamageMult(),g.hitOpts(s,{crit:g.rollCrit()}));
      g.emit({type:'channelPulse',skill:s.id,x:p.x,z:p.z,angle:aim.angle,range:s.range,arc:s.arc,element:s.element});
    }
  }
  for(const a of g.allies){
    if(a.barrierT){a.barrierT=Math.max(0,a.barrierT-dt);if(!a.barrierT){a.barrier=0;a.barrierBreak=null;}}
    if(a.tauntRadius&&!a.dead&&a.life>0){a.tauntCd=(a.tauntCd||0)-dt;if(a.tauntCd<=0){a.tauntCd=a.tauntInterval;for(const m of g.monsters)if(!m.dead&&dist(a.x,a.z,m.x,m.z)<=a.tauntRadius){m.forcedTargetId=a.id;m.tauntT=Math.max(m.tauntT||0,a.tauntDuration);}}}
  }
  for(const m of g.monsters){
    for(const k of ['exposure','poise'])if(m.statuses[k]){m.statuses[k].t-=dt;if(m.statuses[k].t<=0)delete m.statuses[k];}
    if(m.wallTarget){const w=g.areas.find(a=>a.id===m.wallTarget);if(!w||w.wallHp<=0||dist(m.x,m.z,w.x,w.z)>m.r+w.r+.8){m.wallTarget=null;continue;}if(m.state!=='chase'){m.wallAttackT=0;continue;}if(!(m.wallAttackT>0))g.emit({type:'wallWindup',x:w.x,z:w.z,radius:w.r+.2,duration:w.skill.wall.breakWindup});m.wallAttackT=(m.wallAttackT||0)+dt;if(m.wallAttackT>=w.skill.wall.breakWindup){m.wallAttackT=0;w.wallHp-=m.damage;g.emit({type:'wallHit',id:w.id,x:w.x,z:w.z});}}
  }
}
/** A point in a light wall's frame: along its length and across it (positive on the far side from the caster). */
function wallFrame(a,x,z){
  const dx=x-a.x,dz=z-a.z;
  return {along:dx*Math.sin(a.angle)+dz*Math.cos(a.angle),across:dx*Math.sin(a.facing)+dz*Math.cos(a.facing)};
}
const lightWalls=g=>g.areas.filter(a=>a.lightWall&&a.t<a.duration);
/** Wall of Faith slows the monsters walking through its band (a short chill refreshed while inside). */
export function tickLightWalls(g){
  for(const a of lightWalls(g))for(const m of g.monsters){
    if(m.dead)continue;
    const f=wallFrame(a,m.x,m.z);
    if(Math.abs(f.along)>a.radius+m.r||Math.abs(f.across)>a.lightWall.thickness/2+m.r)continue;
    m.statuses.chill={slow:Math.max(a.lightWall.slow,m.statuses.chill?.slow||0),t:Math.max(.2,m.statuses.chill?.t||0)};
  }
}
/** A monster shot meets a Wall of Faith: it stops there (true). */
export function lightWallStops(g,pr){
  for(const a of lightWalls(g)){
    const f=wallFrame(a,pr.x,pr.z);
    if(Math.abs(f.along)<=a.radius+pr.radius&&Math.abs(f.across)<=a.lightWall.thickness/2+pr.radius){g.emit({type:'lightWallBlock',id:a.id,x:pr.x,z:pr.z});return true;}
  }
  return false;
}
/**
 * The share of a monster hit a unit still takes from cover: an ally standing behind the hero's raised
 * Shield Fortress (within guard.coverRange), or the hero or an ally on the caster's side of a Wall of Faith
 * (within its length and lightWall.depth) while the attacker is on the far side. The best cover counts.
 */
export function coverMult(g,u,source){
  let k=1;const p=g.player,c=p.channeling;
  if(u!==p&&c?.skill.kind==='guard_hold'&&c.t>=c.skill.castTime&&dist(p.x,p.z,u.x,u.z)<=c.skill.guard.coverRange+u.r){
    const ahead=(u.x-p.x)*Math.sin(p.facing)+(u.z-p.z)*Math.cos(p.facing);
    if(ahead<0)k=Math.min(k,c.skill.guard.coverTaken);
  }
  if(source&&source.x!==undefined)for(const a of lightWalls(g)){
    const f=wallFrame(a,u.x,u.z),s=wallFrame(a,source.x,source.z);
    if(f.across<0&&f.across>=-a.lightWall.depth&&Math.abs(f.along)<=a.radius+u.r&&s.across>0)k=Math.min(k,a.lightWall.taken);
  }
  return k;
}
export function endProjectile(g,pr){
  // Shatter Arrow (s.shatter): stopped by a monster, the arrow breaks into a fan of shards flying on
  // (weaker, not breaking again, never hitting what the arrow hit)
  const S=pr.skill?.shatter;
  if(S&&!pr.shard&&pr.stopOn){
    const step=S.count>1?S.arc*DEG/(S.count-1):0;
    for(let i=0;i<S.count;i++){
      const a=pr.angle+(i-(S.count-1)/2)*step;
      g.spawnProjectile({owner:'player',kind:pr.kind,skill:pr.skill,shard:true,x:pr.x,z:pr.z,y:pr.y??1.05,angle:a,speed:S.speed,radius:.2,range:S.range,damage:pr.damage*S.mult,element:pr.element,pierce:0,chain:0,triggered:pr.triggered,hit:new Set(pr.hit)});
    }
    g.emit({type:'shatter',skill:pr.skill.id,x:pr.x,z:pr.z,angle:pr.angle,arc:S.arc,count:S.count,element:pr.element});
    pr.stopOn=null;
  }
  const e=pr.skill?.modEffects;if(e?.terminalBurst&&(!e.returnMult||pr.returning))secondaryBurst(g,pr.x,pr.z,e.burstRadius,pr.damage*e.terminalBurst,pr.element,pr.kind);
  if(e?.returnMult&&!pr.returning){pr.returning=true;pr.hit.clear();pr.vx*=-1;pr.vz*=-1;pr.angle+=Math.PI;pr.damage*=e.returnMult;pr.travelled=0;pr.range=dist(pr.x,pr.z,pr.startX,pr.startZ);pr.pierce=Infinity;return pr.range>.05;}
  return false;
}

/** The trapper's traps (s.trap): see executeFrontier. A trap is a player area waiting with no delay of its
 *  own (TRAP_WAIT) until updateAreas springs it. */
export const TRAP_WAIT = 1e6;
export function placeTraps(g,s,aim,mult){
  const T=s.trap,n=T.count||1,mine=g.areas.filter(a=>a.trap&&!a.sprung&&a.skill?.id===s.id);
  while(mine.length&&mine.length+n>T.max){const old=mine.shift();g.areas=g.areas.filter(a=>a!==old);g.emit({type:'areaEnd',id:old.id});}
  for(let i=0;i<n;i++){
    const a=(i+g.rng.range(0,.6))/n*Math.PI*2,d=n>1&&i>0?T.spread*(.45+.55*Math.sqrt(g.rng.range(0,1))):0;
    const x=aim.x+Math.cos(a)*d,z=aim.z+Math.sin(a)*d;
    const area=g.spawnArea({owner:'player',kind:s.id,skill:s,x,z,radius:s.radius,delay:TRAP_WAIT,duration:.35,damage:s.damage*mult,element:s.element,trap:{arm:T.arm,life:T.life,trigger:T.trigger}});
    g.emit({type:'trapSet',skill:s.id,id:area.id,x,z,arm:T.arm,life:T.life,fromX:g.player.x,fromZ:g.player.z,i});
  }
}
