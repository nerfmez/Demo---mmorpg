import {createJournal} from './skill-journal/journal.js';
import {createWheel, isWheelTree} from './wheel-view.js';

// Retained for other UI/data consumers. This is a read-only source index.
export function clusterNodes(tree,category,branch){
 return Object.entries(tree.nodes).filter(([,n])=>n.category===category&&(category!=='specialist'||(n.branch||n.requiresJob)===branch));
}
// The wheel tree (data/wheeltree.json, ?tree=wheel until it replaces the old tree) has its own screen.
export function jobView(ui){return isWheelTree(ui.game.data)?'<div class="wheel-tree"></div>':'<div class="skill-journal" aria-label="สมุดบันทึกเส้นทางพาสซีฟ"></div>';}
export function mountJobNetwork(ui,opts){
 const wheel=ui.body.querySelector('.wheel-tree');
 const journal=wheel?createWheel(wheel,ui,opts):createJournal(ui.body.querySelector('.skill-journal'),ui);ui.jobJournal=journal;
 return ()=>{journal.destroy();if(ui.jobJournal===journal)ui.jobJournal=null;};
}
