// Real-browser acceptance for the date of a manually recorded regeneration.
// The production bundle is unchanged; only the Home Assistant API is mocked.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {overviewFixture} from './overview_fixtures.mjs';

let playwright;
try { playwright = await import('playwright'); }
catch (error) {
  if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw error;
  playwright = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/package.json')('playwright');
}
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const output=resolve(process.env.REGENERATION_DATE_OUTPUT || resolve(root,'../qa/regeneration-date'));
await mkdir(output,{recursive:true});
const registeredTabs=JSON.parse(execFileSync('python',['-c',`
import ast,json,sys
tree=ast.parse(open(sys.argv[1],encoding='utf-8').read())
metadata=next(node.value for node in tree.body if isinstance(node,ast.Assign) and any(isinstance(target,ast.Name) and target.id=='PANEL_METADATA' for target in node.targets))
tabs=next(value for key,value in zip(metadata.keys,metadata.values) if isinstance(key,ast.Constant) and key.value=='tabs')
print(json.dumps(ast.literal_eval(tabs)))
`,resolve(root,'custom_components/water_treatment/panel.py')],{encoding:'utf8'}));
const fixture=overviewFixture();
fixture.today='2026-11-08';
fixture.settings.salt.last_tank_service='2026-11-01';
const html=`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>:root{--primary-background-color:#101820;--card-background-color:#1b2733;--ha-card-background:#1b2733;--secondary-background-color:#14202b;--primary-text-color:#f1f5f8;--secondary-text-color:#afc1d1;--divider-color:#334653;--primary-color:#52b2ed;color-scheme:dark}html[data-theme=light]{--primary-background-color:#f4f7fa;--card-background-color:#fff;--ha-card-background:#fff;--secondary-background-color:#f2f5f8;--primary-text-color:#20242a;--secondary-text-color:#5d6878;--divider-color:#dce4ed;--primary-color:#1688f8;color-scheme:light}html,body{margin:0;height:100%;overflow:hidden}nikas-water-treatment-panel{height:100%;display:block}ha-icon{display:inline-block;width:var(--mdc-icon-size,24px);height:var(--mdc-icon-size,24px)}</style>
<script src="/preview/ha-icon.js"></script><script src="/custom_components/water_treatment/frontend/water-treatment-panel.js"></script><body><script>
window.fixture=${JSON.stringify(fixture)};window.requests=[];window.serviceCalls=[];window.pendingWrite=null;
window.panel=document.createElement('nikas-water-treatment-panel');
window.panel.panel={config:{tabs:${JSON.stringify(registeredTabs)}}};
window.fixtureHass={locale:{language:'ru'},user:{is_admin:true},connection:{connected:true},states:{},
callWS:async message=>{
  window.requests.push(structuredClone(message));
  if(!message.action)return structuredClone(window.fixture);
  if(message.action!=='salt_regeneration')throw new Error('Unexpected write in regeneration date test');
  if(message.revision!==window.fixture.revision)throw new Error('Настройки изменились');
  if(window.pendingWrite)await window.pendingWrite;
  // Acknowledge only the event under test. Salt arithmetic is tested in Python.
  const event=message.payload,salt=window.fixture.settings.salt;
  salt.history.push({action:'regeneration',date:event.date,result:event.result,salt_kg:event.salt_kg,
    estimated_salt_kg:event.salt_kg==null?salt.dose:null,water_m3:event.water_m3,refill_l:event.refill_l});
  salt.regenerations++;
  window.fixture.revision++;
  return structuredClone(window.fixture);
},callService:async(...args)=>{window.serviceCalls.push(args)}};
window.panel.hass=window.fixtureHass;document.body.append(window.panel);
</script></body></html>`;
const server=createServer(async(request,response)=>{
  try{
    const url=new URL(request.url,'http://localhost');
    if(url.pathname==='/'){response.setHeader('Content-Type','text/html; charset=utf-8');response.end(html);return;}
    const pathname=url.pathname.startsWith('/water_treatment_panel/')
      ? '/custom_components/water_treatment/frontend/'+url.pathname.slice('/water_treatment_panel/'.length)
      : url.pathname;
    const file=resolve(root,'.'+pathname);
    if(!file.startsWith(root+sep)){response.writeHead(403);response.end();return;}
    response.setHeader('Content-Type',{'.js':'text/javascript','.mjs':'text/javascript','.png':'image/png','.css':'text/css'}[extname(file)]||'application/octet-stream');
    response.end(await readFile(file));
  }catch{response.writeHead(404);response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  const engine=process.env.OVERVIEW_BROWSER==='webkit'?playwright.webkit:playwright.chromium;
  browser=await engine.launch({headless:true,executablePath:process.env.OVERVIEW_BROWSER_PATH||undefined,
    args:engine===playwright.chromium?['--no-sandbox']:[]});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'ru-RU'});
  const page=await context.newPage();
  page.setDefaultTimeout(10000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const by=selector=>page.locator('nikas-water-treatment-panel').locator(selector);
  const date=by('#cycle-date'), serviceDate=by('#salt-event-date');
  const save=by('[data-filter-action="salt_regeneration"]'), feedback=by('[data-cycle-message]');
  const tick=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const open=async view=>{
    await by('.tabbar [data-view="'+view+'"]').click();
    await page.waitForFunction(view=>panel._view===view&&!panel._filterLoadPromise,view);
    await tick();
  };
  const writes=()=>page.evaluate(()=>requests.filter(message=>message.action==='salt_regeneration'));
  const waitSaved=()=>page.waitForFunction(()=>!panel._filterBusy&&/Сохранено|сохранена/.test(panel.shadowRoot.querySelector('[data-cycle-message]')?.textContent||''));
  const expectFeedbackDate=async iso=>{
    const text=await feedback.innerText();
    assert.ok(text.includes(iso)||text.includes(iso.split('-').reverse().join('.')),'Local save confirmation names the saved date: '+text);
  };
  const scrollToCycle=()=>page.evaluate(()=>{
    const root=panel.shadowRoot,heading=[...root.querySelectorAll('.page-softener h3')].find(node=>node.textContent.includes('Полный цикл завершён'));
    const viewport=root.querySelector('.canvas-viewport');
    viewport.scrollTop+=heading.getBoundingClientRect().top-viewport.getBoundingClientRect().top-12;
  });
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>window.panel?._filterData);
  await open('softener');
  assert.equal(await date.count(),1,'The regeneration section has its own date field');
  await by('.page-softener summary').filter({hasText:'Остаток, очистка бака и регенерации'}).click();
  assert.equal(await date.getAttribute('type'),'date');
  assert.equal(await date.evaluate(node=>node.required),true,'A regeneration must have an explicit date');
  assert.equal(await date.inputValue(),fixture.today,'Default date comes from the HA snapshot');
  assert.equal(await date.getAttribute('max'),fixture.today,'Future dates are bounded by HA today');
  assert.equal(await date.getAttribute('min'),fixture.settings.salt.last_tank_service,'A recorded cycle cannot predate the latest tank service');
  assert.match(await date.evaluate(node=>[...node.labels].map(label=>label.textContent).join(' ')),/дат/i,'Date field has an associated visible label');
  assert.equal(await date.evaluate(node=>node.closest('.filter-form').querySelector('input,select')===node),true,'The cycle date is the first control in its section');

  await serviceDate.fill('2026-11-06');
  await date.fill('2026-11-03');
  await date.focus();
  await page.evaluate(()=>{
    window.cycleControl=panel.shadowRoot.querySelector('#cycle-date');
    window.cycleFocus=panel.shadowRoot.activeElement;
  });
  await page.evaluate(()=>panel._loadFilters());
  assert.equal(await date.inputValue(),'2026-11-03');
  assert.equal(await serviceDate.inputValue(),'2026-11-06','The maintenance date remains independent');
  assert.equal(await date.evaluate(node=>node===window.cycleControl&&node.getRootNode().activeElement===node),true,'Polling preserves the date control and focus');
  await open('overview');
  await open('softener');
  assert.equal(await date.inputValue(),'2026-11-03','Navigation preserves the selected cycle date');
  assert.equal(await serviceDate.inputValue(),'2026-11-06');

  await date.fill('');
  await page.evaluate(()=>panel._loadFilters());
  assert.equal(await date.inputValue(),'','Polling must not refill an intentionally cleared date');
  await open('overview');
  await open('softener');
  assert.equal(await date.inputValue(),'','Navigation must not refill an intentionally cleared date');
  await by('#cycle-completed').check();
  for(const [invalid,flag] of [['','valueMissing'],['2026-11-09','rangeOverflow'],['2026-10-31','rangeUnderflow']]){
    await date.fill(invalid);
    assert.equal(await date.evaluate((node,flag)=>node.validity[flag],flag),true,'Native date constraint: '+flag);
    await save.click();
    await tick();
    assert.equal((await writes()).length,0,'Invalid date '+JSON.stringify(invalid)+' must not reach the API');
    assert.match(await feedback.innerText(),/дат|не сохранено/i,'Invalid date has local feedback');
    assert.equal(await feedback.isVisible(),true,'Date feedback is in the expanded cycle section');
  }
  console.log('PASS independent date, HA default/bounds, polling/navigation drafts and invalid-date send prevention');

  // An unknown service date removes only the lower bound, not the selected date.
  await date.fill('2026-11-03');
  await page.evaluate(async()=>{fixture.settings.salt.last_tank_service=null;await panel._loadFilters();});
  assert.equal(await date.evaluate(node=>node.min),'');
  assert.equal(await date.inputValue(),'2026-11-03');
  await page.evaluate(async()=>{fixture.settings.salt.last_tank_service='2026-11-01';await panel._loadFilters();});
  assert.equal(await date.evaluate(node=>node.min),'2026-11-01');
  await save.click();
  await waitSaved();
  const first=(await writes()).at(-1);
  assert.equal(first.payload.date,'2026-11-03','Payload uses the selected cycle date, not the maintenance date or today');
  assert.equal(first.payload.completed,true);
  assert.equal(await page.evaluate(()=>fixture.settings.salt.history.at(-1).date),'2026-11-03');
  assert.equal(await date.inputValue(),'2026-11-03','Successful save retains the cycle date');
  assert.equal(await serviceDate.inputValue(),'2026-11-06','Cycle save leaves the maintenance date intact');
  await expectFeedbackDate('2026-11-03');
  const nearby=await feedback.evaluate(node=>{
    const button=node.getRootNode().querySelector('[data-filter-action="salt_regeneration"]');
    return Math.abs(node.getBoundingClientRect().top-button.getBoundingClientRect().bottom);
  });
  assert.ok(nearby<64,'Save confirmation stays beside the cycle action');
  await feedback.scrollIntoViewIfNeeded();
  await page.screenshot({path:resolve(output,'regeneration-saved-390-dark.png')});
  await page.evaluate(()=>panel._loadFilters());
  await open('overview');
  await open('softener');
  assert.equal(await date.inputValue(),'2026-11-03','The saved cycle date survives refresh and navigation');
  await expectFeedbackDate('2026-11-03');

  await date.fill('2026-11-05');
  await by('#cycle-completed').check();
  await page.evaluate(()=>{window.pendingWrite=new Promise(resolve=>{window.releaseWrite=resolve;});});
  await save.click();
  await page.waitForFunction(()=>panel._filterBusy&&requests.filter(message=>message.action==='salt_regeneration').length===2);
  await date.fill('2026-11-07');
  await date.focus();
  await page.evaluate(()=>{window.releaseWrite();window.pendingWrite=null;});
  await waitSaved();
  assert.equal((await writes()).at(-1).payload.date,'2026-11-05','In-flight payload retains the date at submission');
  assert.equal(await page.evaluate(()=>fixture.settings.salt.history.at(-1).date),'2026-11-05');
  assert.equal(await date.inputValue(),'2026-11-07','A newer date draft survives the completed write');
  assert.equal(await date.evaluate(node=>node.getRootNode().activeElement===node),true,'The newer focused date stays focused after acknowledgement');
  await expectFeedbackDate('2026-11-05');
  await page.evaluate(()=>panel._loadFilters());
  assert.equal(await date.inputValue(),'2026-11-07');
  console.log('PASS selected-date payload and local confirmation; successful and in-flight saves preserve dates and newer drafts');

  for(const width of [320,390])for(const theme of ['light','dark']){
    await page.setViewportSize({width,height:844});
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    await scrollToCycle();
    await tick();
    const layout=await date.evaluate(node=>{
      const view=node.closest('.page-softener'),root=node.getRootNode(),label=node.labels[0];
      const field=node.getBoundingClientRect(),caption=label.getBoundingClientRect(),viewport=root.querySelector('.canvas-viewport').getBoundingClientRect();
      const overflow=[...view.querySelectorAll('*')].filter(element=>{
        const rect=element.getBoundingClientRect();
        return rect.width>0&&rect.height>0&&getComputedStyle(element).display!=='inline'&&element.scrollWidth>element.clientWidth+2;
      }).map(element=>element.id||element.className||element.tagName);
      return{overflow,width:innerWidth,field:{left:field.left,right:field.right,width:field.width,top:field.top,bottom:field.bottom},
        label:{left:caption.left,right:caption.right,width:caption.width,top:caption.top,text:label.textContent.trim()},
        viewTop:viewport.top,viewBottom:viewport.bottom,headerTop:root.querySelector('.app-header').getBoundingClientRect().top,
        tabsBottom:root.querySelector('.tabbar').getBoundingClientRect().bottom,height:innerHeight};
    });
    assert.deepEqual(layout.overflow,[],`Expanded softener content has no horizontal overflow at ${width}px/${theme}`);
    assert.ok(layout.field.width<=layout.label.width+2&&layout.field.left>=0&&layout.field.right<=width,`Cycle date fits its label at ${width}px/${theme}`);
    assert.ok(layout.label.top>=layout.viewTop&&layout.field.bottom<=layout.viewBottom,`Date and label are visible together at ${width}px/${theme}`);
    assert.match(layout.label.text,/дат/i);
    assert.ok(Math.abs(layout.headerTop)<2&&Math.abs(layout.tabsBottom-layout.height)<2,'NikaS shell stays fixed');
    await page.screenshot({path:resolve(output,`regeneration-date-${width}-${theme}.png`)});
  }
  assert.equal((await writes()).length,2,'Only the two valid, explicitly saved cycles reach the API');
  assert.equal(await page.evaluate(()=>requests.some(message=>message.action&&message.action!=='salt_regeneration')),false,'No unrelated journal changes');
  assert.deepEqual(await page.evaluate(()=>serviceCalls),[],'No physical-device service commands');
  assert.deepEqual(errors,[],'No browser errors');
  console.log('PASS date/label fit at 320/390px in light/dark; only the two intended mock journal writes occurred');
  console.log('Regeneration date browser acceptance PASS; screenshots:',output);
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
