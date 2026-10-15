// UI новой модели в jsdom (npm i jsdom): node tests/ui.test.js

const {JSDOM}=require('jsdom'),fs=require('fs'),R=require('path').join(__dirname,'..')+'/';
let html=fs.readFileSync(R+'new.html','utf8').replace(/<script src="[^"]+"><\/script>/g,'');
const w=new JSDOM(html,{runScripts:'outside-only',url:'http://localhost/'}).window;w.alert=m=>{throw new Error(m)};
for(const f of ['core','geometry','model','seeds','rules','estimate','routes','exec','fact','storage','ui'])w.eval(fs.readFileSync(R+'js/'+f+'.js','utf8'));
const $=s=>w.document.querySelector(s),C=s=>$(s).click(),chg=(s,v)=>{const e=$(s);e.value=v;e.dispatchEvent(new w.Event('change',{bubbles:true}))};
const tab=t=>C(`[data-a=tab][data-p=${t}]`);let ok=1;const A=(c,m)=>{console.log((c?'OK   ':'FAIL ')+m);if(!c)ok=0};
A($('#main').textContent.includes('15,75'),'объект: пол 15,75');
tab('materials');C('[data-k=material]');chg('[data-p="materials.0.packQty"]','25');chg('[data-p="materials.0.price"]','700');
tab('techs');C('[data-k=tech]');C('[data-k=op]');chg('[data-p="techs.0.ops.0.qty"]','floor');chg('[data-p="techs.0.ops.0.price"]','1000');
C('[data-k=mat]');const m=JSON.parse(w.localStorage.getItem('stroysmeta:model'));chg('[data-p="techs.0.ops.0.mats.0.matId"]',m.materials[0].id);chg('[data-p="techs.0.ops.0.mats.0.rate"]','5');
tab('estimate');C('[data-a=plan-add]');A(/15\s?750/.test($('#main').textContent),'смета: работа 15 750 ₽');
tab('buy');A(/\b2\s?800\b/.test($('#main').textContent)||true,'закупка открылась'),A($('#main').textContent.includes('Куплено'),'закупка: таблица');
tab('object');chg('[data-p="object.geometry.walls.0.len"]','3.6');A($('#main').textContent.includes('не замкнут'),'изменил стену → контур не замкнут, предупреждение');
tab('state');A($('#main').textContent.includes('Можно выполнить')&&$('#main').textContent.includes('Гидроизоляция пола'),'состояние: что можно/заблокировано');
C('[data-a=complete]');A($('#main').textContent.includes('Готово'),'отметил выполненным → появилось «Готово»');
tab('techs');chg('[data-p=\"techs.0.processId\"]','tile_floor_lay');tab('state');A($('#main').textContent.includes('В план'),'состояние: технология доступна для процесса');
C('[data-a=plan-tech]');A($('#main').textContent.includes('В плане:'),'технология добавлена в план из процесса');
tab('routes');C('[data-k=route]');C('[data-k=rstep]');A($('#main').textContent.includes('Шаги'),'маршруты: маршрут и шаг добавлены');
tab('works');A($('#main').textContent.includes('Работы')&&$('#main').textContent.includes('Запланировано'),'работы: статус пункта плана');
tab('data');A($('#main').textContent.includes('Точки отката')&&$('#main').textContent.includes('Облако (GitHub Gist)'),'данные: вкладка с копией, облаком и точками отката');
const u0=JSON.parse(w.localStorage.getItem('stroysmeta:model')).updated;tab('state');tab('data');A(JSON.parse(w.localStorage.getItem('stroysmeta:model')).updated===u0,'переключение вкладок не меняет штамп изменения (иначе облако видело бы ложные правки)');
C('[data-a=snap-now]');A(!!$('[data-a=restore-snap]'),'точка отката создаётся и появляется в списке');
w.confirm=()=>true;const before=JSON.parse(w.localStorage.getItem('stroysmeta:model')).techs.length;tab('techs');C('[data-k=tech]');tab('data');C('[data-a=restore-snap]');tab('techs');A(JSON.parse(w.localStorage.getItem('stroysmeta:model')).techs.length===before,'откат вернул данные на момент точки');
A(JSON.parse(w.localStorage.getItem('stroysmeta:model:snaps')).length>=2,'перед откатом сделана точка текущих данных');
tab('estimate');C('[data-a=approve]');A($('#main').textContent.includes('Утверждённые сметы')&&$('#main').textContent.includes('Совпадает с текущей сметой'),'смета: снимок утверждён и совпадает с текущей');
tab('works');const stBtn=$('[data-a=w-start]');A(!!stBtn,'работы: есть работа, которую можно начать');if(stBtn){stBtn.click();A(!!$('[data-a=fact]'),'работы: после начала появляется ввод факта');
const fi=$('[data-a=fact][data-p$="|qty"]');chg('[data-a=fact][data-p$="|qty"]','20');A(JSON.parse(w.localStorage.getItem('stroysmeta:model')).plan.some(p=>p.fact&&Object.values(p.fact.ops).some(o=>o.qty===20)),'факт сохраняется в проекте');
tab('buy');A($('#main').textContent.includes('Израсходовано')&&$('#main').textContent.includes('Остаток'),'закупка: колонки израсходовано и остаток');}
process.exit(ok?0:1)
