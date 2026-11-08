import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
const registered = new Map();
class NodeMock {
  constructor() { this.nodes = new Map(); this.listeners = new Map(); this.dataset = {}; this.value = ''; this.textContent = ''; }
  querySelector(s) { return this.nodes.get(s) || null; }
  querySelectorAll(s) { return this.nodes.has(s) ? [this.nodes.get(s)] : []; }
  reportValidity() { return true; }
  addEventListener(type, fn) { const handlers=this.listeners.get(type)||[];handlers.push(fn);this.listeners.set(type,handlers); }
  dispatchEvent(event) { for(const fn of this.listeners.get(event.type)||[]) fn(event); }
}
const context = { HTMLElement: class { attachShadow() { this.shadowRoot = new NodeMock(); } },
  customElements: { get: n => registered.get(n), define: (n,c) => registered.set(n,c) },
  localStorage: {getItem:()=>null}, window: {setTimeout,clearTimeout},
  MutationObserver: class { observe() {} disconnect() {} }, Node: { ELEMENT_NODE: 1 }, document: {documentElement:{},children:[]}, Intl, Date, URL, setTimeout, clearTimeout };
vm.createContext(context);
vm.runInContext(await readFile(new URL('../custom_components/water_treatment/frontend/water-treatment-panel.js',import.meta.url),'utf8'),context);
const Panel = registered.get('nikas-water-treatment-panel');
function fixture() {
  const p = new Panel(); const root = new NodeMock(); p._views.set('filters',root);root.nodes=p.shadowRoot.nodes;
  for(const [id,value] of Object.entries({'filter-profile':'wound','filter-volume':'200','filter-months':'6','filter-mode':'volume','filter-people':'3','filter-hardness':'4.1','filter-auto':'auto','months-ferrostop':'6','months-softening':'6','months-postcarbon':'6'})) {
    const node=new NodeMock();node.value=value;root.nodes.set('#'+id,node);
  }
  p._filterData={revision:3};p._paintFilters=()=>{};
  p.shadowRoot.nodes.set('[data-filter-message]',new NodeMock());
  p.shadowRoot.nodes.set('[data-filter-settings-message]',new NodeMock());
  for (const key of ['main','ferrostop','softening','postcarbon']) {
    p.shadowRoot.nodes.set('[data-filter-feedback="'+key+'"]',new NodeMock());
    const date=new NodeMock();date.value='2026-11-05';p.shadowRoot.nodes.set('#date-'+key,date);
  }
  return p;
}
test('settings submit custom controls and revision without replacement baseline',async()=>{
  const p=fixture();let sent;p._hass={callWS:async msg=>{sent=msg;return {revision:4};}};
  await p._filterAction({dataset:{filterAction:'settings'},disabled:false});
  assert.equal(sent.payload.main.volume,200);assert.equal(sent.payload.people,3);
  assert.equal(sent.payload.hardness,4.1);assert.equal(sent.revision,3);
  assert.equal(sent.payload.main.baseline,undefined);assert.equal(sent.payload.main.date,undefined);
  assert.equal(p.shadowRoot.querySelector('[data-filter-settings-message]').textContent,'Сохранено');
});
test('failed save preserves loaded revision and reports failure',async()=>{
  const p=fixture();p._hass={callWS:async()=>{throw new Error('conflict');}};
  await p._filterAction({dataset:{filterAction:'settings'},disabled:false});
  assert.equal(p._filterData.revision,3);
  assert.equal(p.shadowRoot.querySelector('[data-filter-message]').textContent,'');
  assert.match(p.shadowRoot.querySelector('[data-filter-settings-message]').textContent,/Не сохранено: conflict/);
});
test('refresh failure clears stale success rather than showing resource as current',async()=>{
  const p=fixture();p._hass={callWS:async()=>{throw new Error('offline');}};
  await p._loadFilters();assert.equal(p._filterData,null);
  assert.match(p.shadowRoot.querySelector('[data-filter-message]').textContent,/offline/);
  assert.match(p.shadowRoot.querySelector('[data-filter-settings-message]').textContent,/Не удалось получить данные.*offline/);
});

test('a successful read updates the settings page load status',async()=>{
  const p=fixture();p._hass={callWS:async()=>({revision:4})};
  p.shadowRoot.querySelector('[data-filter-message]').textContent='Не удалось получить данные: offline';
  await p._loadFilters();
  assert.equal(p.shadowRoot.querySelector('[data-filter-message]').textContent,'');
  assert.equal(p.shadowRoot.querySelector('[data-filter-settings-message]').textContent,'Данные водоподготовки актуальны');
});

test('replacement date validation stays beside the affected cartridge',async()=>{
  const p=fixture();p.shadowRoot.querySelector('#date-postcarbon').value='';
  p._hass={callWS:async()=>{throw new Error('validation must prevent a write');}};
  await p._filterAction({dataset:{filterAction:'record',filter:'postcarbon'},disabled:false});
  assert.equal(p.shadowRoot.querySelector('[data-filter-feedback="postcarbon"]').textContent,'Укажите дату замены');
  assert.equal(p.shadowRoot.querySelector('[data-filter-feedback="main"]').textContent,'');
  assert.equal(p.shadowRoot.querySelector('[data-filter-message]').textContent,'');
});

test('failed cartridge save remains beside its draft through a healthy poll and successful retry',async()=>{
  const p=fixture();let failWrite=true;const sent=[];
  p._hass={callWS:async msg=>{sent.push(msg);if(msg.action && failWrite)throw new Error('disk full');return {revision:msg.action?4:3};}};
  const button={dataset:{filterAction:'record',filter:'postcarbon'},disabled:false};
  await p._filterAction(button);
  const feedback=p.shadowRoot.querySelector('[data-filter-feedback="postcarbon"]');
  assert.match(feedback.textContent,/Не сохранено: disk full/);
  assert.equal(p.shadowRoot.querySelector('#date-postcarbon').value,'2026-11-05');
  await p._loadFilters();
  assert.match(feedback.textContent,/Не сохранено: disk full/);
  assert.equal(p.shadowRoot.querySelector('[data-filter-message]').textContent,'');
  failWrite=false;await p._filterAction(button);
  assert.equal(feedback.textContent,'Сохранено');
  assert.equal(sent.at(-1).payload.filter,'postcarbon');
  assert.equal(sent.at(-1).payload.date,'2026-11-05');
  assert.equal(sent.at(-1).revision,3);
});

test('editing a cartridge clears the acknowledgement of its previous saved value',()=>{
  const p=fixture();
  for (const [id,key] of [['date-postcarbon','postcarbon'],['baseline-main','main']]) {
    p._filterMessage('Сохранено','record',key);
    p._recordFilterEdit(id);
    assert.equal(p.shadowRoot.querySelector('[data-filter-feedback="'+key+'"]').textContent,'');
    assert.ok(p._filterDirtyControls.has(id));
  }
});

test('a cartridge acknowledgement distinguishes an edit made while its write was pending',async()=>{
  const p=fixture();const write=deferred();p._hass={callWS:()=>write.promise};
  const saving=p._filterAction({dataset:{filterAction:'record',filter:'postcarbon'},disabled:false});
  p.shadowRoot.querySelector('#date-postcarbon').value='2026-11-06';
  p._recordFilterEdit('date-postcarbon');
  write.resolve({revision:4});await saving;
  assert.match(p.shadowRoot.querySelector('[data-filter-feedback="postcarbon"]').textContent,/Новые изменения ещё не сохранены/);
  assert.ok(p._filterDirtyControls.has('date-postcarbon'));
});

test('salt topup submits mass only and clears input on success',async()=>{
 const p=fixture();const root=p._views.get('filters');const kg=new NodeMock();kg.value='25';kg.reportValidity=()=>true;root.nodes.set('#salt-kg',kg);
 let sent;p._hass={callWS:async msg=>{sent=msg;return {revision:4};}};
 await p._filterAction({dataset:{filterAction:'salt_topup'},disabled:false});
 assert.equal(sent.action,'salt_topup');assert.equal(sent.payload.kg,25);assert.equal(sent.revision,3);assert.equal(kg.value,'');
});

function saltSnapshot(revision, kg = null) {
  return {revision, today:'2026-10-27', meter:353.456,
    settings:{people:3,hardness:null,softening_auto:true,
      main:{profile:'wound',volume:200,months:6,mode:'volume',date:null,baseline:null},
      cartridges:Object.fromEntries(['ferrostop','softening','postcarbon'].map(key=>[key,{months:6,date:null}])),
      salt:{model:'Ёлка WSC-0,5-Rx-(SC)',dose:1.5,check_days:6,level:'unknown',last_checked:null,
        last_added:kg === null ? null : '2026-10-27',last_added_kg:kg,
        history:kg === null ? [] : [{action:'topup',date:'2026-10-27',kg}]}},
    salt_status:{state:'unknown',days:null,estimated_remaining_kg:null},
    status:Object.fromEntries(['main','ferrostop','softening','postcarbon'].map(key=>[key,{state:'unconfigured',days:null,used:null,remaining:null,percent:null}]))};
}

function saltFixture() {
  const p=fixture();
  delete p._paintFilters; // Exercise real painting as well as request creation.
  p._filterData=saltSnapshot(3);
  const root=p._views.get('filters');
  for(const [id,value] of Object.entries({'salt-kg':'5','salt-level':'enough','salt-days':'6','salt-dose':'1.5'})) {
    const node=new NodeMock();node.value=value;node.reportValidity=()=>true;
    root.nodes.set('#'+id,node);
  }
  for(const [selector,node] of root.nodes) p.shadowRoot.nodes.set(selector,node);
  for(const selector of ['[data-salt-status]','[data-salt-detail]','[data-salt-history]','[data-salt-message]','[data-salt-card]'])
    p.shadowRoot.nodes.set(selector,new NodeMock());
  p._hass={user:{is_admin:true}};
  return p;
}

function deferred() {
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}

test('a topup during background refresh waits and saves once with the refreshed revision',async()=>{
  const p=saltFixture();const read=deferred();const sent=[];
  p._hass.callWS=async msg=>{
    sent.push(msg);
    return msg.action ? saltSnapshot(5,5) : read.promise;
  };
  const loading=p._loadFilters();
  const button={dataset:{filterAction:'salt_topup'},disabled:false};
  const saving=p._filterAction(button);
  await p._filterAction(button); // Duplicate press while the first awaits the read.
  read.resolve(saltSnapshot(4));
  await Promise.all([loading,saving]);
  assert.equal(sent.length,2);
  assert.equal(sent[1].action,'salt_topup');assert.equal(sent[1].revision,4);
  assert.equal(sent[1].payload.kg,5);
  assert.equal(p._filterData.settings.salt.last_added_kg,5);
  assert.match(p.shadowRoot.querySelector('[data-salt-detail]').textContent,/5 кг/);
  assert.match(p.shadowRoot.querySelector('[data-salt-message]').textContent,/5.*кг/);
  assert.equal(p._filterBusy,false);assert.equal(button.disabled,false);
});

test('salt write failure keeps the draft and confirmed revision with a nearby error',async()=>{
  const p=saltFixture();p._hass.callWS=async()=>{throw new Error('disk full');};
  await p._filterAction({dataset:{filterAction:'salt_topup'},disabled:false});
  assert.equal(p._views.get('filters').querySelector('#salt-kg').value,'5');
  assert.equal(p._filterData.revision,3);
  assert.equal(p._filterData.settings.salt.last_added_kg,null);
  assert.match(p.shadowRoot.querySelector('[data-salt-message]').textContent,/Не сохранено.*disk full/);
});

test('acknowledgement does not clear a newer salt draft typed during the write',async()=>{
  const p=saltFixture();const write=deferred();p._hass.callWS=()=>write.promise;
  const saving=p._filterAction({dataset:{filterAction:'salt_topup'},disabled:false});
  const input=p._views.get('filters').querySelector('#salt-kg');input.value='10';
  write.resolve(saltSnapshot(4,5));await saving;
  assert.equal(input.value,'10');
  assert.match(p.shadowRoot.querySelector('[data-salt-detail]').textContent,/5 кг/);
});

test('failed background read rejects a pending topup visibly without losing its mass',async()=>{
  const p=saltFixture();const read=deferred();const sent=[];
  p._hass.callWS=msg=>{sent.push(msg);return read.promise;};
  const loading=p._loadFilters();
  const button={dataset:{filterAction:'salt_topup'},disabled:false};
  const saving=p._filterAction(button);
  read.reject(new Error('offline'));
  await Promise.all([loading,saving]);
  assert.equal(sent.length,1);
  assert.equal(p._views.get('filters').querySelector('#salt-kg').value,'5');
  assert.match(p.shadowRoot.querySelector('[data-salt-message]').textContent,/Не сохранено/);
  assert.equal(p._filterBusy,false);assert.equal(button.disabled,false);
});

test('a new panel paints the saved topup while keeping inspection unknown',async()=>{
  const p=saltFixture();p._hass.callWS=async()=>saltSnapshot(4,5);
  await p._loadFilters();
  assert.match(p.shadowRoot.querySelector('[data-salt-detail]').textContent,/27\.10\.2026.*5 кг/);
  assert.match(p.shadowRoot.querySelector('[data-salt-history]').textContent,/досыпано 5 кг/);
  assert.match(p.shadowRoot.querySelector('[data-salt-status]').textContent,/ещё не проверен/);
});

test('a settings edit keeps its original revision across a background read to detect conflicts',async()=>{
  const p=saltFixture();const read=deferred();let submitted;
  p._hass.callWS=msg=>{
    if (!msg.action) return read.promise;
    submitted=msg;
    if (msg.revision !== 4) return Promise.reject(new Error('Настройки изменились'));
    return Promise.resolve(saltSnapshot(5));
  };
  const loading=p._loadFilters();
  const saving=p._filterAction({dataset:{filterAction:'settings'},disabled:false});
  read.resolve(saltSnapshot(4));await Promise.all([loading,saving]);
  assert.equal(submitted.revision,3);
  assert.equal(p.shadowRoot.querySelector('[data-filter-message]').textContent,'');
  assert.match(p.shadowRoot.querySelector('[data-filter-settings-message]').textContent,/Не сохранено.*Настройки изменились/);
});

test('a newly entered identical topup mass remains a draft after an earlier save',async()=>{
  const p=saltFixture();p._bindShellEvents();
  const write=deferred();p._hass.callWS=()=>write.promise;
  const saving=p._filterAction({dataset:{filterAction:'salt_topup'},disabled:false});
  const input=p._views.get('filters').querySelector('#salt-kg');input.id='salt-kg';
  input.value='10';p.shadowRoot.dispatchEvent({type:'input',target:input});
  input.value='5';p.shadowRoot.dispatchEvent({type:'input',target:input});
  write.resolve(saltSnapshot(4,5));await saving;
  assert.equal(input.value,'5');
  assert.equal(p._filterData.settings.salt.history.length,1);
});

function treatmentFixture() {
  const p=saltFixture();const root=p._views.get('filters');
  for(const [id,value] of Object.entries({
    'salt-event-date':'2026-10-27','salt-remaining':'0','salt-added':'5','salt-removed':'','salt-refill-l':'3',
    'salt-remove-kg':'1','cycle-salt':'','cycle-water':'0.39','cycle-refill':'3','cycle-result':'unverified',
    'gh-date':'2026-10-27','gh-point':'softener','gh-drops':'14',
    'treatment-resin':'8','treatment-resin-basis':'assumed','treatment-cycle':'1.2','treatment-cycle-basis':'temporary_setting',
    'treatment-max-days':'6','treatment-backwash':'10','treatment-brine':'75','treatment-refill':'1','treatment-rinse':'6',
    'treatment-daily':'','treatment-resin-year':'','treatment-resin-date':'','salt-dose-basis':'assumed'
  })) {
    const node=new NodeMock();node.value=value;node.reportValidity=()=>true;root.nodes.set('#'+id,node);p.shadowRoot.nodes.set('#'+id,node);
  }
  for(const id of ['gh-apply','cycle-completed']) {const node=new NodeMock();node.checked=true;root.nodes.set('#'+id,node);}
  for(const selector of ['[data-treatment-message]','[data-treatment-summary]','[data-gh-message]','[data-gh-history]','[data-salt-balance]','[data-salt-coverage]']) p.shadowRoot.nodes.set(selector,new NodeMock());
  context.window.confirm=()=>true;
  return p;
}

test('tank service submits explicit zero remaining and separate salt and refill units',async()=>{
  const p=treatmentFixture();let sent;p._hass.callWS=async msg=>{sent=msg;return saltSnapshot(4,5);};
  await p._filterAction({dataset:{filterAction:'salt_service'},disabled:false});
  assert.equal(sent.action,'salt_service');assert.equal(sent.payload.remaining_kg,0);
  assert.equal(sent.payload.added_kg,5);assert.equal(sent.payload.refill_l,3);
  assert.equal(sent.payload.removed_kg,null);assert.equal(sent.payload.date,'2026-10-27');
});

test('GH journal submits raw drops and explicit application of the softener outlet sample',async()=>{
  const p=treatmentFixture();let sent;p._hass.callWS=async msg=>{sent=msg;return saltSnapshot(4);};
  await p._filterAction({dataset:{filterAction:'treatment_gh'},disabled:false});
  assert.equal(sent.payload.drops,14);assert.equal(sent.payload.sample_ml,5);
  assert.equal(sent.payload.point,'softener');assert.equal(sent.payload.apply_to_filter,true);
  assert.equal(sent.payload.hardness,undefined);
});

test('BARRIER outlet GH cannot be submitted as BARRIER input hardness',async()=>{
  const p=treatmentFixture();p._views.get('filters').querySelector('#gh-point').value='barrier';let calls=0;
  p._hass.callWS=async()=>{calls++;return saltSnapshot(4);};
  await p._filterAction({dataset:{filterAction:'treatment_gh'},disabled:false});
  assert.equal(calls,0);assert.match(p.shadowRoot.querySelector('[data-gh-message]').textContent,/выходе умягчителя/);
});

test('regeneration requires completed confirmation and preserves separate measured fields',async()=>{
  const p=treatmentFixture();let sent;p._hass.callWS=async msg=>{sent=msg;return saltSnapshot(4);};
  await p._filterAction({dataset:{filterAction:'salt_regeneration'},disabled:false});
  assert.equal(sent.payload.completed,true);assert.equal(sent.payload.salt_kg,null);
  assert.equal(sent.payload.water_m3,0.39);assert.equal(sent.payload.refill_l,3);
  assert.equal(sent.payload.result,'unverified');
  p._views.get('filters').querySelector('#cycle-completed').checked=false;sent=null;
  await p._filterAction({dataset:{filterAction:'salt_regeneration'},disabled:false});
  assert.equal(sent,null);
});

test('profile saves editable assumptions rather than deriving salt consumption from minutes',async()=>{
  const p=treatmentFixture();let sent;p._hass.callWS=async msg=>{sent=msg;return saltSnapshot(4);};
  await p._filterAction({dataset:{filterAction:'treatment_settings'},disabled:false});
  assert.equal(sent.payload.resin_l,8);assert.equal(sent.payload.cycle_m3,1.2);
  assert.equal(sent.payload.refill_min,1);assert.equal(sent.payload.resin_basis,'assumed');
  assert.equal(sent.payload.daily_service_m3,null);assert.equal(sent.payload.dose,undefined);
});

test('saved treatment data renders source points, tentative parameters and estimated stock separately',()=>{
  const p=treatmentFixture();const data=fullTreatmentSnapshot(4);
  p._filterData=data;p._paintFilters(true);
  assert.match(p.shadowRoot.querySelector('[data-salt-balance]').textContent,/нет полных данных.*оценка по дозам: 4.*кг/);
  assert.match(p.shadowRoot.querySelector('[data-treatment-summary]').textContent,/92 мин.*8.*предварительно/);
  assert.match(p.shadowRoot.querySelector('[data-gh-history]').textContent,/вход БАРЬЕР.*14.*4,99/);
  assert.equal(p.shadowRoot.querySelector('#salt-dose-basis').value,'assumed');
  assert.equal(p.shadowRoot.querySelector('#treatment-resin').value,8);
});

function fullTreatmentSnapshot(revision) {
  const data=saltSnapshot(revision,5);
  data.settings.salt={...data.settings.salt,dose:1,dose_basis:'assumed',regenerations:1};
  data.salt_status={...data.salt_status,known_remaining_kg:null,estimated_remaining_kg:4,full_cycles:4,nominal_m3:4.8,scenario_days:null};
  data.settings.treatment={profile:{resin_l:8,resin_basis:'assumed',cycle_m3:1.2,cycle_basis:'temporary_setting',max_days:6,
    mode:'A-01',time:'03:00',volume_unit:'HU-01',backwash_mode:'F-00',signal:'b-01',
    backwash_min:10,brine_min:75,refill_min:1,fast_rinse_min:6,daily_service_m3:null},resin_since_year:null,resin_replaced:null,gh_history:[]};
  data.treatment_status={stage_minutes:92,latest_gh:[{date:'2026-10-27',point:'softener',drops:14,dgh:14,zh:4.9924}]};
  return data;
}

function edit(p,id,value,type='input') {
  const node=p._views.get('filters').querySelector('#'+id);
  node.id=id;node.value=value;p.shadowRoot.dispatchEvent({type,target:node});
}

test('a newer treatment draft survives acknowledgement of its previous value',async()=>{
  const p=treatmentFixture();p._filterData=fullTreatmentSnapshot(3);p._bindShellEvents();
  const write=deferred();p._hass.callWS=()=>write.promise;
  const saving=p._filterAction({dataset:{filterAction:'treatment_settings'},disabled:false});
  edit(p,'treatment-resin','9');
  write.resolve(fullTreatmentSnapshot(4));await saving;
  assert.equal(p.shadowRoot.querySelector('#treatment-resin').value,'9');
});

test('saving salt does not overwrite an unrelated unsaved treatment draft',async()=>{
  const p=treatmentFixture();p._filterData=fullTreatmentSnapshot(3);p._bindShellEvents();
  edit(p,'treatment-resin','9');
  p._hass.callWS=async()=>fullTreatmentSnapshot(4);
  await p._filterAction({dataset:{filterAction:'salt_topup'},disabled:false});
  assert.equal(p.shadowRoot.querySelector('#treatment-resin').value,'9');
});

test('a second cycle cannot inherit measured consumption or confirmed effectiveness from the first',async()=>{
  const p=treatmentFixture();const root=p._views.get('filters');
  root.querySelector('#cycle-salt').value='0.8';root.querySelector('#cycle-result').value='confirmed';
  const sent=[];p._hass.callWS=async msg=>{sent.push(msg);return saltSnapshot(4);};
  await p._filterAction({dataset:{filterAction:'salt_regeneration'},disabled:false});
  assert.equal(root.querySelector('#cycle-salt').value,'');
  assert.equal(root.querySelector('#cycle-water').value,'');
  assert.equal(root.querySelector('#cycle-refill').value,'');
  assert.equal(root.querySelector('#cycle-result').value,'unverified');
  root.querySelector('#cycle-completed').checked=true;
  await p._filterAction({dataset:{filterAction:'salt_regeneration'},disabled:false});
  assert.equal(sent[1].payload.salt_kg,null);assert.equal(sent[1].payload.water_m3,null);
  assert.equal(sent[1].payload.result,'unverified');
});

test('successful service removal and GH clear committed mass or drops to prevent accidental repeat',async()=>{
  for(const [action,ids] of [['salt_service',['salt-remaining','salt-added','salt-removed','salt-refill-l']],['salt_remove',['salt-remove-kg']],['treatment_gh',['gh-drops']]]) {
    const p=treatmentFixture();p._hass.callWS=async()=>saltSnapshot(4);
    await p._filterAction({dataset:{filterAction:action},disabled:false});
    for(const id of ids) assert.equal(p._views.get('filters').querySelector('#'+id).value,'',action+' '+id);
  }
});

test('a new measured event draft typed during a write survives event reset',async()=>{
  const p=treatmentFixture();p._bindShellEvents();const write=deferred();p._hass.callWS=()=>write.promise;
  const saving=p._filterAction({dataset:{filterAction:'salt_regeneration'},disabled:false});
  edit(p,'cycle-water','0.5');
  write.resolve(saltSnapshot(4));await saving;
  assert.equal(p._views.get('filters').querySelector('#cycle-water').value,'0.5');
});

test('invalid unfinished GH input does not prevent saving independent cartridge settings',async()=>{
  const p=treatmentFixture();const root=p._views.get('filters');const gh=root.querySelector('#gh-drops');gh.reportValidity=()=>false;
  root.querySelectorAll=selector=>selector==='.filter-settings input' ? [gh] : [];
  let sent;p._hass.callWS=async msg=>{sent=msg;return saltSnapshot(4);};
  await p._filterAction({dataset:{filterAction:'settings'},disabled:false});
  assert.equal(sent?.action,'settings');
});

test('a completed background refresh cannot conceal a conflict with a dirty treatment form',async()=>{
  const p=treatmentFixture();p._filterData=fullTreatmentSnapshot(3);p._filtersFilled=true;p._bindShellEvents();
  edit(p,'treatment-resin','9');const remote=fullTreatmentSnapshot(4);remote.settings.treatment.profile.resin_l=10;
  let sent;p._hass.callWS=async msg=>{
    if(!msg.action)return remote;
    sent=msg;if(msg.revision!==4)throw new Error('Настройки изменились');return fullTreatmentSnapshot(5);
  };
  await p._loadFilters();
  await p._filterAction({dataset:{filterAction:'treatment_settings'},disabled:false});
  assert.equal(sent.revision,3);
  assert.match(p.shadowRoot.querySelector('[data-treatment-message]').textContent,/Не сохранено.*Настройки изменились/);
  assert.equal(p.shadowRoot.querySelector('#treatment-resin').value,'9');
});

test('an unrelated successful salt write can advance a dirty form revision when its settings are unchanged',async()=>{
  const p=treatmentFixture();p._filterData=fullTreatmentSnapshot(3);p._bindShellEvents();edit(p,'treatment-resin','9');
  const sent=[];p._hass.callWS=async msg=>{sent.push(msg);return fullTreatmentSnapshot(sent.length===1?4:5);};
  await p._filterAction({dataset:{filterAction:'salt_topup'},disabled:false});
  await p._filterAction({dataset:{filterAction:'treatment_settings'},disabled:false});
  assert.equal(sent[1].revision,4);assert.equal(sent[1].payload.resin_l,9);
});

test('a new GH journal entry does not create a false conflict with unchanged treatment parameters',async()=>{
  const p=treatmentFixture();p._filterData=fullTreatmentSnapshot(3);p._filtersFilled=true;p._bindShellEvents();edit(p,'treatment-resin','9');
  const remote=fullTreatmentSnapshot(4);remote.settings.treatment.gh_history=[{date:'2026-10-27',point:'softener',drops:14,dgh:14,zh:4.9924,sample_ml:5}];
  let sent;p._hass.callWS=async msg=>{if(!msg.action)return remote;sent=msg;return fullTreatmentSnapshot(5);};
  await p._loadFilters();await p._filterAction({dataset:{filterAction:'treatment_settings'},disabled:false});
  assert.equal(sent.revision,4);assert.equal(sent.payload.resin_l,9);
});

test('a remote update refreshes untouched controls before a new local edit can overwrite it',async()=>{
  const p=saltFixture();p._filterData.settings.main.volume=100;p._paintFilters(true);
  const remote=saltSnapshot(4);remote.settings.main.volume=250;
  let sent;p._hass.callWS=async msg=>{if(!msg.action)return remote;sent=msg;return remote;};
  await p._loadFilters();
  assert.equal(Number(p.shadowRoot.querySelector('#filter-volume').value),250);
  p.shadowRoot.querySelector('#filter-people').value='4';p._recordFilterEdit('filter-people');
  await p._filterAction({dataset:{filterAction:'settings'},disabled:false});
  assert.equal(sent.payload.main.volume,250);assert.equal(sent.payload.people,4);assert.equal(sent.revision,4);
});

test('a background read preserves an already dirty section and its original conflict revision',async()=>{
  const p=saltFixture();p._filterData.settings.main.volume=100;p._paintFilters(true);
  p.shadowRoot.querySelector('#filter-people').value='4';p._recordFilterEdit('filter-people');
  const remote=saltSnapshot(4);remote.settings.main.volume=250;
  let sent;p._hass.callWS=async msg=>{if(!msg.action)return remote;sent=msg;throw new Error('Настройки изменились');};
  await p._loadFilters();
  assert.equal(Number(p.shadowRoot.querySelector('#filter-volume').value),100);
  assert.equal(p.shadowRoot.querySelector('#filter-people').value,'4');
  await p._filterAction({dataset:{filterAction:'settings'},disabled:false});
  assert.equal(sent.revision,3);assert.match(p.shadowRoot.querySelector('[data-filter-settings-message]').textContent,/Не сохранено/);
});

test('a successfully saved settings section becomes eligible for later remote refreshes',async()=>{
  const p=saltFixture();p._paintFilters(true);
  p.shadowRoot.querySelector('#filter-volume').value='300';p._recordFilterEdit('filter-volume');
  const saved=saltSnapshot(4);saved.settings.main.volume=300;
  p._hass.callWS=async()=>saved;
  await p._filterAction({dataset:{filterAction:'settings'},disabled:false});
  const remote=saltSnapshot(5);remote.settings.main.volume=400;
  p._hass.callWS=async()=>remote;await p._loadFilters();
  assert.equal(Number(p.shadowRoot.querySelector('#filter-volume').value),400);
});

test('a failed read replaces stale save confirmations on the softener and quality tabs',async()=>{
  const p=treatmentFixture();
  p._setText('[data-salt-message]','Сохранено');p._setText('[data-gh-message]','Сохранено');
  p._hass.callWS=async()=>{throw new Error('offline');};await p._loadFilters();
  assert.match(p.shadowRoot.querySelector('[data-salt-message]').textContent,/offline/);
  assert.match(p.shadowRoot.querySelector('[data-gh-message]').textContent,/offline/);
});

test('structured errors are readable and stale load errors clear after recovery',async()=>{
  const p=fixture();
  for(const key of ['salt','treatment','gh']) p.shadowRoot.nodes.set(`[data-${key}-message]`,new NodeMock());
  p._hass={callWS:async()=>{throw {error:{code:'not_loaded',message:'Интеграция не загружена'}};}};
  await p._loadFilters();
  assert.match(p.shadowRoot.querySelector('[data-salt-message]').textContent,/Интеграция не загружена/);
  p._hass={callWS:async()=>({revision:4})};
  await p._loadFilters();
  for(const key of ['salt','treatment','gh']) assert.equal(p.shadowRoot.querySelector(`[data-${key}-message]`).textContent,'');
});

test('a lost write response reuses the operation id on explicit retry',async()=>{
  const p=fixture(); const kg=new NodeMock();kg.value='5';p.shadowRoot.nodes.set('#salt-kg',kg);
  p.shadowRoot.nodes.set('[data-salt-message]',new NodeMock());
  const sent=[];p._hass={callWS:async msg=>{sent.push(msg);if(sent.length===1)throw {code:'disconnected'};return {revision:4};}};
  const button={dataset:{filterAction:'salt_topup'},disabled:false};
  await p._filterAction(button);await p._filterAction(button);
  assert.ok(sent[0].operation_id);
  assert.equal(sent[0].operation_id,sent[1].operation_id);
});

test('reopening a panel after a lost response retains the pending operation',async()=>{
  const storage=new Map();
  context.sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  try {
    const sent=[];
    for(let attempt=0;attempt<2;attempt++) {
      const p=fixture();const kg=new NodeMock();kg.value='5';p.shadowRoot.nodes.set('#salt-kg',kg);
      p.shadowRoot.nodes.set('[data-salt-message]',new NodeMock());
      p._hass={callWS:async msg=>{sent.push(msg);if(attempt===0)throw {code:'disconnected'};return {revision:4};}};
      await p._filterAction({dataset:{filterAction:'salt_topup'},disabled:false});
    }
    assert.equal(sent[0].operation_id,sent[1].operation_id);
    assert.equal(storage.size,0);
  } finally { delete context.sessionStorage; }
});
