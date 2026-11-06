import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const registry=new Map();
const context={HTMLElement:class {attachShadow(){this.shadowRoot={};}},
  customElements:{get:key=>registry.get(key),define:(key,value)=>registry.set(key,value)},
  localStorage:{getItem:()=>null},window:{setTimeout,clearTimeout},
  MutationObserver:class {observe(){} disconnect(){}}, Node:{ELEMENT_NODE:1},
  document:{documentElement:{},children:[]},Intl,Date,URL,setTimeout,clearTimeout};
vm.createContext(context);
const code=await readFile(new URL('../custom_components/water_treatment/frontend/water-treatment-panel.js',import.meta.url),'utf8');
vm.runInContext(code,context);
const Panel=registry.get('nikas-water-treatment-panel');
assert.ok(Panel);
const p=new Panel();
assert.equal(p._config().title,'Водоподготовка');
assert.deepEqual(Array.from(p._config().tabs,tab=>tab[0]),['filters','softener','quality']);
assert.match(p._viewMarkup('filters'),/Картридж заменён/);
assert.doesNotMatch(p._viewMarkup('filters'),/salt-kg|gh-drops/);
assert.match(p._viewMarkup('softener'),/salt-kg/);
assert.doesNotMatch(p._viewMarkup('softener'),/gh-drops/);
assert.match(p._viewMarkup('quality'),/gh-drops/);
assert.doesNotMatch(code,/recorder\/statistics_during_period|pressure_irrigation|irrigation_total|water_accounting\/filters/);
assert.match(code,/water_treatment\/filters/);
console.log('Treatment split: independent identity, tabs, API and drinking meter only PASS');
