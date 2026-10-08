import {allocateJobNode,jobNodeState,cheapestParent} from './character.js';

// Planning never mutates the character. The canonical single-node allocator
// remains the authority for eligibility and charged costs.
export function planJobRoute(ch,data,target,{groupId,tier}={}) {
  const tree=data.jobtree,node=tree.nodes[target];
  const result={target,nodes:[],cost:0,can:false,missing:[],requiresAllFork:false};
  if(!node)return {...result,reason:'unknown'};
  if(node.retired)return {...result,reason:'retired'};
  if(ch.jobNodes.includes(target))return {...result,taken:true,reason:'taken'};
  const nodeTier=tree.sections[node.section]?.tier;
  const stage=tree.presentation?.stages.find(s=>s.id===nodeTier);
  const groups=stage?.nodes?[{id:`stage-${stage.id}`,nodes:stage.nodes}]:stage?.paths||[];
  const memberships=groups.filter(g=>g.nodes.includes(target));
  if(memberships.length>1&&!groupId)return {...result,reason:'ambiguous_group',choices:memberships.map(g=>g.id)};
  const group=groupId?memberships.find(g=>g.id===groupId):memberships[0];
  if(!group||tier!==undefined&&tier!==nodeTier)return {...result,reason:'outside_group',missing:[target]};
  result.groupId=group.id;result.tier=nodeTier;
  const included=new Set(group.nodes),seen=new Set(),visiting=new Set();let invalid=null;
  function visit(id) {
    if(seen.has(id))return;
    const current=tree.nodes[id];
    if(!current){invalid='unknown';return;}
    if(!included.has(id)||tree.sections[current.section]?.tier!==nodeTier){result.missing.push(id);return;}
    if(ch.jobNodes.includes(id))return;
    if(visiting.has(id)){invalid='invalid_graph';return;}
    if(!Array.isArray(current.links)||current.requires!==undefined&&!Array.isArray(current.requires)){invalid='invalid_graph';return;}
    visiting.add(id);
    if(!Array.isArray(current.requires)) {
      // Legacy adjacency does not identify a directed route. Permit an already
      // eligible single purchase, otherwise require an explicit manual choice.
      if(!jobNodeState({...ch,jobPoints:Number.MAX_SAFE_INTEGER},data,id).can)invalid='ambiguous_route';
    } else {
      if(current.requires.filter(k=>!ch.jobNodes.includes(k)&&included.has(k)).length>1)result.requiresAllFork=true;
      for(const parent of current.requires)visit(parent);
      // A meeting point needs one parent: route through the cheapest one on this page.
      const any=cheapestParent(ch,data,id,k=>included.has(k)&&tree.sections[tree.nodes[k]?.section]?.tier===nodeTier);
      if(any)visit(any);
    }
    visiting.delete(id);seen.add(id);result.nodes.push(id);
  }
  visit(target);result.missing=[...new Set(result.missing)];
  // The reviewed graph currently charges one point per node. Valid plans below
  // derive their actual total by running the existing allocator on a scratch copy.
  result.cost=result.nodes.length;
  if(invalid)return {...result,reason:invalid};
  if(result.missing.length)return {...result,reason:'outside_group'};
  const trial={...ch,jobNodes:[...ch.jobNodes],jobPoints:Number.MAX_SAFE_INTEGER};
  for(const id of result.nodes){const state=allocateJobNode(trial,data,id);if(!state.done)return {...result,...state,can:false,failedNode:id};}
  result.cost=Number.MAX_SAFE_INTEGER-trial.jobPoints;
  if(ch.jobPoints<result.cost)return {...result,reason:'no_points',need:result.cost,have:ch.jobPoints};
  return {...result,can:true,reason:'ready'};
}

export function allocateJobRoute(ch,data,target,options={}) {
  const plan=planJobRoute(ch,data,target,options);
  if(!plan.can)return {...plan,done:false};
  if(options.expectedNodes&&(JSON.stringify(options.expectedNodes)!==JSON.stringify(plan.nodes)||options.expectedCost!==plan.cost))
    return {...plan,can:false,done:false,reason:'stale_preview'};
  const trial={...ch,jobNodes:[...ch.jobNodes]};
  for(const id of plan.nodes){const state=allocateJobNode(trial,data,id);if(!state.done)return {...plan,...state,can:false,done:false,failedNode:id};}
  // Commit the two fields once, after every allocation succeeds. No partial save
  // or intermediate notification can escape this transaction.
  ch.jobNodes=trial.jobNodes;ch.jobPoints=trial.jobPoints;
  return {...plan,done:true,acquired:[...plan.nodes]};
}
