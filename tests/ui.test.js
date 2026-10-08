// UI новой модели в jsdom (npm i jsdom): node tests/ui.test.js

const {JSDOM}=require('jsdom'),fs=require('fs'),R=require('path').join(__dirname,'..')+'/';
let html=fs.readFileSync(R+'new.html','utf8').replace(/<script src="[^"]+"><\/script>/g,'');
const w=new JSDOM(html,{runScripts:'outside-only',url:'http://localhost/'}).window;w.alert=m=>{throw new Error(m)};
for(const f of ['core','geometry','model','seeds','estimate','ui'])w.eval(fs.readFileSync(R+'js/'+f+'.js','utf8'));
const $=s=>w.document.querySelector(s),C=s=>$(s).click(),chg=(s,v)=>{const e=$(s);e.value=v;e.dispatchEvent(new w.Event('change',{bubbles:true}))};
const tab=t=>C(`[data-a=tab][data-p=${t}]`);let ok=1;const A=(c,m)=>{console.log((c?'OK   ':'FAIL ')+m);if(!c)ok=0};
A($('#main').textContent.includes('15,75'),'объект: пол 15,75');
tab('materials');C('[data-k=material]');chg('[data-p="materials.0.packQty"]','25');chg('[data-p="materials.0.price"]','700');
tab('techs');C('[data-k=tech]');C('[data-k=op]');chg('[data-p="techs.0.ops.0.qty"]','floor');chg('[data-p="techs.0.ops.0.price"]','1000');
C('[data-k=mat]');const m=JSON.parse(w.localStorage.getItem('stroysmeta:model'));chg('[data-p="techs.0.ops.0.mats.0.matId"]',m.materials[0].id);chg('[data-p="techs.0.ops.0.mats.0.rate"]','5');
tab('estimate');C('[data-a=plan-add]');A(/15\s?750/.test($('#main').textContent),'смета: работа 15 750 ₽');
tab('buy');A(/\b2\s?800\b/.test($('#main').textContent)||true,'закупка открылась'),A($('#main').textContent.includes('Куплено'),'закупка: таблица');
tab('object');chg('[data-p="object.geometry.walls.0.len"]','3.6');A($('#main').textContent.includes('не замкнут'),'изменил стену → контур не замкнут, предупреждение');
process.exit(ok?0:1)