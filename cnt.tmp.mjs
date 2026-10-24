import {chromium} from 'playwright';
const b=await chromium.launch({args:['--no-sandbox']});const p=await b.newPage();await p.goto('http://127.0.0.1:4179/lab.html');
console.log(await p.evaluate(async()=>{const m=await import('/src/render/accepted-scenes/azure-meadow.js?x='+Date.now());m.createAcceptedScene({clipBounds:[-65,65,-65,30]});return JSON.stringify({hc:__hc,hd:__hs.size,fc:__fc,fd:__fs.size});}));await b.close();
