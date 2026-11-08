// Real-browser acceptance of treatment detail readability. Only the HA API is
// replaced; the server serves the generated production bundle unchanged.
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
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = resolve(process.env.TREATMENT_READABILITY_OUTPUT || resolve(root, '../qa/readability'));
await mkdir(output, {recursive:true});
const registeredTabs = JSON.parse(execFileSync('python', ['-c', `
import ast,json,sys
tree=ast.parse(open(sys.argv[1],encoding='utf-8').read())
metadata=next(node.value for node in tree.body if isinstance(node,ast.Assign) and any(isinstance(target,ast.Name) and target.id=='PANEL_METADATA' for target in node.targets))
tabs=next(value for key,value in zip(metadata.keys,metadata.values) if isinstance(key,ast.Constant) and key.value=='tabs')
print(json.dumps(ast.literal_eval(tabs)))
`, resolve(root,'custom_components/water_treatment/panel.py')], {encoding:'utf8'}));
const fixture = overviewFixture();
fixture.today = '2026-11-08';
fixture.settings.salt.check_days = 12;
fixture.settings.salt.last_checked = '2026-11-08';
fixture.salt_status.days = 12;
fixture.salt_status.scenario_days = 14.117647;
// Synthetic readings, intentionally two on the same date. Keep the API order.
const samples = [
  {date:'2026-11-08',point:'softener',sample_ml:5,drops:5,dgh:5,zh:1.783},
  {date:'2026-11-08',point:'mains',sample_ml:5,drops:18,dgh:18,zh:6.4188},
  {date:'2026-11-05',point:'softener',sample_ml:5,drops:4,dgh:4,zh:1.4264},
];
fixture.treatment_status.latest_gh = samples;
fixture.settings.treatment.gh_history = [...samples].reverse();
const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>:root{--primary-background-color:#101820;--card-background-color:#1b2733;--ha-card-background:#1b2733;--secondary-background-color:#14202b;--primary-text-color:#f1f5f8;--secondary-text-color:#afc1d1;--divider-color:#334653;--primary-color:#52b2ed;color-scheme:dark}html[data-theme=light]{--primary-background-color:#f4f7fa;--card-background-color:#fff;--ha-card-background:#fff;--secondary-background-color:#f2f5f8;--primary-text-color:#20242a;--secondary-text-color:#5d6878;--divider-color:#dce4ed;--primary-color:#1688f8;color-scheme:light}html,body{margin:0;height:100%;overflow:hidden}nikas-water-treatment-panel{height:100%;display:block}ha-icon{display:inline-block;width:var(--mdc-icon-size,24px);height:var(--mdc-icon-size,24px)}</style>
<script src="/preview/ha-icon.js"></script><script src="/custom_components/water_treatment/frontend/water-treatment-panel.js"></script><body><script>
window.fixture=${JSON.stringify(fixture)};window.requests=[];window.serviceCalls=[];window.failRead=false;
window.panel=document.createElement('nikas-water-treatment-panel');
window.panel.panel={config:{tabs:${JSON.stringify(registeredTabs)}}};
window.fixtureHass={locale:{language:'ru'},user:{is_admin:true},connection:{connected:true},states:{},
callWS:async message=>{window.requests.push(structuredClone(message));if(message.action)throw new Error('Unexpected write in readability test');if(window.failRead)throw new Error('fixture offline');return structuredClone(window.fixture)},
callService:async(...args)=>{window.serviceCalls.push(args)}};
window.panel.hass=window.fixtureHass;document.body.append(window.panel);
</script></body></html>`;
const server = createServer(async (request,response) => {
  try {
    const url = new URL(request.url,'http://localhost');
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
try {
  const engine=process.env.OVERVIEW_BROWSER==='webkit'?playwright.webkit:playwright.chromium;
  browser=await engine.launch({headless:true,executablePath:process.env.OVERVIEW_BROWSER_PATH||undefined,
    args:engine===playwright.chromium?['--no-sandbox']:[]});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'ru-RU'});
  const page=await context.newPage();
  page.setDefaultTimeout(10000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const by=selector=>page.locator('nikas-water-treatment-panel').locator(selector);
  const tick=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const open=async view=>{
    await by('.tabbar [data-view="'+view+'"]').click();
    await page.waitForFunction(view=>panel._view===view && !panel._filterLoadPromise,view);
    await tick();
  };
  const value=key=>by('[data-detail-value="'+key+'"]');
  const number=text=>Number(text.replace(/\u00a0|\u202f/g,' ').match(/-?\d+(?:[.,]\d+)?/)?.[0].replace(',','.'));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>window.panel?._filterData);
  await open('quality');
  const rows=by('ol[data-gh-history] [data-gh-row]:visible');
  assert.equal(await rows.count(),3,'Each API sample gets its own visible row, including same-day readings');
  for(const [index,sample] of samples.entries()){
    const leaf=name=>by('[data-gh-'+name+'="'+index+'"]');
    assert.match(await leaf('date').innerText(),new RegExp(sample.date.split('-').reverse().join('\\.')));
    assert.match(await leaf('point').innerText(),sample.point==='mains'?/до.*Ёлки/i:/после.*Ёлки/i);
    assert.equal(number(await leaf('drops').innerText()),sample.drops,'Saved drop count');
    assert.equal(number(await leaf('dgh').innerText()),sample.dgh,'Saved dGH');
    assert.equal(number(await leaf('zh').innerText()),Number(sample.zh.toFixed(2)),'Rounded saved approximate Ж');
    assert.match(await leaf('zh').innerText(),/≈/,'Converted value remains explicitly approximate');
    assert.equal(number(await leaf('sample').innerText()),sample.sample_ml,'Saved sample volume');
  }
  assert.notEqual(await by('[data-gh-point="0"]').innerText(),await by('[data-gh-point="1"]').innerText());
  console.log('PASS separate GH samples preserve dates, order, sampling point, drops and approximate conversion');

  await by('#gh-drops').fill('7');
  await by('#gh-drops').focus();
  await page.evaluate(()=>{
    const root=panel.shadowRoot;
    window.ghRows=[...root.querySelectorAll('[data-gh-row]')];
    window.ghLeaves=[...root.querySelectorAll('[data-gh-date],[data-gh-point],[data-gh-drops],[data-gh-dgh],[data-gh-zh]')];
    window.ghControl=root.querySelector('#gh-drops');
    root.querySelector('.canvas-viewport').scrollTop=80;
    window.beforeScroll=root.querySelector('.canvas-viewport').scrollTop;
  });
  await tick();
  await page.evaluate(()=>panel._loadFilters());
  await tick();
  const continuity=await page.evaluate(()=>{
    const root=panel.shadowRoot;
    return{rows:ghRows.every((node,index)=>node===root.querySelectorAll('[data-gh-row]')[index]),
      leaves:ghLeaves.every((node,index)=>node===root.querySelectorAll('[data-gh-date],[data-gh-point],[data-gh-drops],[data-gh-dgh],[data-gh-zh]')[index]),
      control:ghControl===root.querySelector('#gh-drops'),focus:root.activeElement===ghControl,
      before:beforeScroll,after:root.querySelector('.canvas-viewport').scrollTop};
  });
  assert.ok(continuity.rows && continuity.leaves && continuity.control && continuity.focus,'Identical poll preserves history nodes and focused input');
  assert.ok(continuity.before>0,'The scroll preservation check exercises a nonzero position');
  assert.equal(continuity.after,continuity.before,'Identical poll preserves canvas scroll');
  assert.equal(await by('#gh-drops').inputValue(),'7','GH draft survives polling');

  await open('filters');
  for(const [key,expected] of [['main-days',145],['main-used',12],['main-remaining',88],['main-percent',88]]){
    assert.equal(number(await value(key).innerText()),expected,key+' reports saved status');
  }
  assert.match(await value('main-deadline').innerText(),/01\.04\.2027/);
  await page.evaluate(async()=>{window.savedMain=structuredClone(fixture.status.main);Object.assign(fixture.status.main,{state:'unknown',used:null,remaining:null,percent:null});await panel._loadFilters();});
  for(const key of ['main-used','main-remaining','main-percent']){
    assert.match(await value(key).innerText(),/нет|неизвест|—/i,key+' explicitly distinguishes missing values from zero');
  }
  await page.evaluate(async()=>{fixture.status.main=window.savedMain;await panel._loadFilters();});
  await open('softener');
  assert.match(await by('.page-softener').innerText(),/WSC-0,5-Rx-\(SC\)/);
  assert.match(await by('.page-softener').innerText(),/Runxin F69A3/);
  assert.match(await value('salt-checked').innerText(),/08\.11\.2026/);
  assert.match(await value('salt-next').innerText(),/12/);
  assert.equal(number(await value('salt-added').innerText()),5,'Saved top-up mass');
  assert.match(await by('[data-detail-note="salt-added"]').innerText(),/04\.11\.2026/,'Saved top-up date');
  assert.match(await value('stock-known').innerText(),/нет|неизвест|—/i);
  assert.equal(number(await value('stock-estimated').innerText()),4);
  assert.equal(number(await value('profile-resin').innerText()),8);
  assert.equal(number(await value('profile-volume').innerText()),1.2);
  console.log('PASS filter metrics, unknown state, equipment and salt/profile values retain their meaning');

  // Exercise the complete visible pages; closed details are also opened so the
  // date inputs and profile settings cannot hide horizontal overflow.
  for(const width of [320,390,430])for(const theme of ['light','dark']){
    await page.setViewportSize({width,height:844});
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    for(const view of ['filters','softener','quality','settings']){
      await open(view);
      await by('.page-'+view+' details').evaluateAll(nodes=>nodes.forEach(node=>{node.open=true;}));
      await tick();
      const layout=await by('.page-'+view).evaluate(view=>{
        const root=view.getRootNode();
        const visible=[view,...view.querySelectorAll('*')].filter(node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0;});
        const overflow=visible.filter(node=>getComputedStyle(node).display!=='inline' && node.scrollWidth>node.clientWidth+2)
          .map(node=>node.id||node.getAttribute('data-detail-value')||node.className||node.tagName);
        const dates=[...view.querySelectorAll('input[type="date"]')].filter(node=>node.getBoundingClientRect().width>0).map(node=>{
          const r=node.getBoundingClientRect(),p=node.parentElement.getBoundingClientRect();
          return{id:node.id,width:r.width,parentWidth:p.width,left:r.left,right:r.right};
        });
        const splitDates=[...view.querySelectorAll('[data-detail-value],[data-detail-note]')]
          .filter(node=>/^\d{2}\.\d{2}\.\d{4}$/.test(node.textContent.trim()))
          .filter(node=>{
            const range=document.createRange();range.selectNodeContents(node);
            return new Set([...range.getClientRects()].filter(rect=>rect.width>0).map(rect=>Math.round(rect.top))).size>1;
          }).map(node=>node.getAttribute('data-detail-value')||node.getAttribute('data-detail-note'));
        return{overflow,dates,splitDates,width:innerWidth,headerTop:root.querySelector('.app-header').getBoundingClientRect().top,
          tabsBottom:root.querySelector('.tabbar').getBoundingClientRect().bottom,height:innerHeight};
      });
      assert.deepEqual(layout.overflow,[],`${view} horizontal overflow at ${width}px/${theme}`);
      assert.ok(layout.dates.every(date=>date.width<=date.parentWidth+2 && date.left>=-1 && date.right<=layout.width+1),`${view} date fields fit at ${width}px/${theme}`);
      assert.deepEqual(layout.splitDates,[],`${view} displayed dates remain intact at ${width}px/${theme}`);
      assert.ok(Math.abs(layout.headerTop)<2 && Math.abs(layout.tabsBottom-layout.height)<2,'NikaS header and tabs remain fixed');
      await page.evaluate(()=>{panel.shadowRoot.querySelector('.canvas-viewport').scrollTop=0;});
      await page.screenshot({path:resolve(output,`${view}-${width}-${theme}.png`)});
      if(view==='quality')await by('ol[data-gh-history]').screenshot({path:resolve(output,`gh-history-${width}-${theme}.png`)});
      if(view==='softener'){
        await by('.salt-balance-section').screenshot({path:resolve(output,`salt-balance-${width}-${theme}.png`)});
        await by('.page-softener > .filter-settings > .detail-metrics').screenshot({path:resolve(output,`profile-${width}-${theme}.png`)});
      }
      if(view==='settings'){
        await by('.softening-basis details').evaluateAll(nodes=>nodes.forEach(node=>{node.open=false;}));
        await by('.softening-basis').screenshot({path:resolve(output,`softening-basis-${width}-${theme}.png`)});
      }
    }
  }
  console.log('PASS 320/390/430px in light/dark: all detail pages and expanded date fields fit; screenshots captured');

  await open('settings');
  assert.equal(await by('#months-softening').isDisabled(),true,'Automatic interval cannot be edited as manual');
  assert.equal(await by('#months-softening').isVisible(),false,'Automatic mode shows the saved basis instead of a manual interval');
  assert.match(await by('[data-softening-interval]').innerText(),/2/,'Saved automatic interval is explained');
  await by('#filter-auto').selectOption('manual');
  assert.equal(await by('#months-softening').isDisabled(),false,'Manual mode enables the interval');
  assert.equal(await by('#months-softening').isVisible(),true,'Manual mode reveals the interval');
  await by('#months-softening').fill('3');
  await by('#filter-hardness').fill('2.5');
  await by('#filter-hardness').focus();
  await page.evaluate(()=>panel._loadFilters());
  assert.equal(await by('#filter-auto').inputValue(),'manual');
  assert.equal(await by('#months-softening').isDisabled(),false);
  assert.equal(await by('#months-softening').inputValue(),'3','Interval draft survives polling');
  assert.equal(await by('#filter-hardness').inputValue(),'2.5','Hardness draft survives polling');
  assert.equal(await by('#filter-hardness').evaluate(node=>node.getRootNode().activeElement===node),true);
  await open('quality');
  assert.equal(await by('#gh-drops').inputValue(),'7','Independent GH draft survives tab changes');
  await open('settings');
  assert.equal(await by('#filter-hardness').inputValue(),'2.5','Settings draft survives tab changes');
  await by('#filter-auto').selectOption('auto');
  assert.equal(await by('#months-softening').isDisabled(),true,'Returning to automatic mode disables manual interval');
  assert.equal(await by('#months-softening').isVisible(),false,'A manual draft cannot appear as a saved automatic interval');
  assert.equal(number(await by('[data-softening-interval]').innerText()),2,'The saved calculation remains separate from the manual draft');
  await by('#filter-auto').selectOption('manual');
  assert.equal(await by('#months-softening').inputValue(),'3','Switching modes retains the manual draft');
  await by('#filter-auto').selectOption('auto');

  await open('quality');
  await page.evaluate(async()=>{
    window.historyContainer=panel.shadowRoot.querySelector('[data-gh-history]');
    window.detailNodes=[...panel.shadowRoot.querySelectorAll('[data-detail-value]')];
    window.detailGroups=[...panel.shadowRoot.querySelectorAll('.detail-metrics')];
    window.failRead=true;
    await panel._loadFilters();
  });
  assert.equal(await rows.count(),0,'Failed read hides stale measurements');
  assert.equal(await by('[data-gh-empty]').innerText(),'Нет данных');
  assert.ok(await page.evaluate(()=>detailNodes.every(node=>node.textContent==='Нет данных')),'Failed read clears stale metric values');
  await page.evaluate(async()=>{window.failRead=false;await panel._loadFilters();});
  assert.equal(await rows.count(),3,'Measurements return after read recovery');
  assert.equal(await page.evaluate(()=>{
    const root=panel.shadowRoot;
    return historyContainer===root.querySelector('[data-gh-history]')
      && ghRows.every((node,index)=>node===root.querySelectorAll('[data-gh-row]')[index])
      && detailNodes.every((node,index)=>node===root.querySelectorAll('[data-detail-value]')[index])
      && detailGroups.every((node,index)=>node===root.querySelectorAll('.detail-metrics')[index]);
  }),true,'Failure/recovery retains history rows and metric wrappers');
  assert.equal(await by('#gh-drops').inputValue(),'7','Read failure/recovery preserves unsaved GH draft');
  assert.equal(number(await by('[data-gh-zh="2"]').innerText()),1.43,'Recovered sample is restored');
  console.log('PASS failed reads clear stale values and recover without replacing history or metric wrappers');
  assert.equal(await page.evaluate(()=>requests.some(message=>message.action)),false,'Viewing, refreshing and drafting issue no API writes');
  assert.deepEqual(await page.evaluate(()=>serviceCalls),[],'No physical-device commands');
  assert.deepEqual(errors,[],'No browser errors');
  console.log('PASS unchanged polling preserves focus/scroll/nodes and drafts; automatic/manual modes switch correctly');
  console.log('Treatment readability browser acceptance PASS; screenshots:',output);
} finally {
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
