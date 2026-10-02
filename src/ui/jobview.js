import {createJournal} from './skill-journal/journal.js';

// Retained for other UI/data consumers. This is a read-only source index.
export function clusterNodes(tree,category,branch){
 return Object.entries(tree.nodes).filter(([,n])=>n.category===category&&(category!=='specialist'||(n.branch||n.requiresJob)===branch));
}
export function jobView(){return '<div class="skill-journal" aria-label="สมุดบันทึกเส้นทางพาสซีฟ"></div>';}
export function mountJobNetwork(ui){
 const journal=createJournal(ui.body.querySelector('.skill-journal'),ui);ui.jobJournal=journal;
 return ()=>{journal.destroy();if(ui.jobJournal===journal)ui.jobJournal=null;};
}
