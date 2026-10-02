import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publishedRun} from '../../scripts/preserve-published-lab.mjs';
const deployed={steps:[{name:'Run actions/deploy-pages@v4',conclusion:'success'}]};
test('retain the last actual publish even when later live checks failed',()=>{
 const runs=[{id:4,conclusion:'success'},{id:3,conclusion:'failure'},{id:2,conclusion:'success'}];
 const jobs={4:[deployed],3:[deployed],2:[deployed]};
 assert.equal(publishedRun(runs,id=>jobs[id],4),3);
});
test('a built artifact without a successful deployment cannot replace a published Lab',()=>{
 const runs=[{id:3},{id:2}];const jobs={3:[{steps:[{name:'Run actions/deploy-pages@v4',conclusion:'skipped'}]}],2:[deployed]};
 assert.equal(publishedRun(runs,id=>jobs[id]),2);
 assert.throws(()=>publishedRun([{id:3}],id=>jobs[id]),/refusing to overwrite/);
});
