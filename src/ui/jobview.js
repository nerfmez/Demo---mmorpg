import {createWheel} from './wheel-view.js';

// The Job Tree screen: the wheel tree (data/jobtree.json, phase C) as the field journal of maps.
export function jobView(){return '<div class="wheel-tree"></div>';}
export function mountJobNetwork(ui,opts){
 const journal=createWheel(ui.body.querySelector('.wheel-tree'),ui,opts);ui.jobJournal=journal;
 return ()=>{journal.destroy();if(ui.jobJournal===journal)ui.jobJournal=null;};
}
