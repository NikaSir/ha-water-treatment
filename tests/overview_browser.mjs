// Browser acceptance of the production bundle. Uses an installed Playwright;
// tests only replace the Home Assistant API boundary, not panel methods.
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
// Home Assistant supplies these registered tabs, overriding the JS fallback.
const registeredTabs = JSON.parse(execFileSync('python',['-c',`
import ast,json,sys
tree=ast.parse(open(sys.argv[1],encoding='utf-8').read())
metadata=next(node.value for node in tree.body if isinstance(node,ast.Assign) and any(isinstance(target,ast.Name) and target.id=='PANEL_METADATA' for target in node.targets))
tabs=next(value for key,value in zip(metadata.keys,metadata.values) if isinstance(key,ast.Constant) and key.value=='tabs')
print(json.dumps(ast.literal_eval(tabs)))
`,resolve(root,'custom_components/water_treatment/panel.py')],{encoding:'utf8'}));
const output = resolve(root, '.superpowers/sdd/2026-11-07-overview-settings/browser');
await mkdir(output, {recursive: true});
const fixture = overviewFixture();
fixture.settings.salt.check_days = 12;
fixture.settings.salt.last_checked = fixture.today;
fixture.settings.salt.history.at(-1).date = fixture.today;
fixture.salt_status.days = 12;
const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>:root{--primary-background-color:#101820;--card-background-color:#1b2733;--ha-card-background:#1b2733;--secondary-background-color:#14202b;--primary-text-color:#f1f5f8;--secondary-text-color:#afc1d1;--divider-color:#334653;--primary-color:#52b2ed;color-scheme:dark}html[data-theme=light]{--primary-background-color:#f4f7fa;--card-background-color:#fff;--ha-card-background:#fff;--secondary-background-color:#f2f5f8;--primary-text-color:#20242a;--secondary-text-color:#5d6878;--divider-color:#dce4ed;--primary-color:#1688f8;color-scheme:light}html,body{margin:0;height:100%;overflow:hidden}nikas-water-treatment-panel{height:100%;display:block}ha-icon{display:inline-block;width:var(--mdc-icon-size,24px);height:var(--mdc-icon-size,24px)}</style>
<script src="/preview/ha-icon.js"></script><script src="/custom_components/water_treatment/frontend/water-treatment-panel.js"></script><body><script>
window.fixture=${JSON.stringify(fixture)};window.failRead=false;window.failWrite=false;window.allowedWrites=[];window.requests=[];window.serviceCalls=[];
window.panel=document.createElement('nikas-water-treatment-panel');
window.panel.panel={config:{tabs:${JSON.stringify(registeredTabs)}}};
window.fixtureHass={locale:{language:'ru'},user:{is_admin:true},connection:{connected:true},states:{},
callWS:async message=>{
  window.requests.push(structuredClone(message));
  if(!message.action){if(window.failRead)throw new Error('offline');return structuredClone(window.fixture)}
  if(!window.allowedWrites.includes(message.action))throw new Error('Unexpected write from read-only overview');
  if(window.failWrite)throw new Error('disk full');
  if(message.revision!==window.fixture.revision)throw new Error('Настройки изменились');
  // Acknowledge only the form fields under test. Backend calculations have their own tests.
  const payload=message.payload,settings=window.fixture.settings;
  if(message.action==='settings'){
    Object.assign(settings.main,payload.main);
    Object.assign(settings,{people:payload.people,hardness:payload.hardness,softening_auto:payload.softening_auto});
    for(const [key,months] of Object.entries(payload.months))settings.cartridges[key].months=months;
  }else if(message.action==='salt_check'){
    settings.salt.level=payload.level;settings.salt.last_checked=window.fixture.today;
    settings.salt.history.push({action:'check',date:window.fixture.today,level:payload.level});
    Object.assign(window.fixture.salt_status,{state:payload.level==='enough'?'ok':payload.level,days:settings.salt.check_days});
  }
  window.fixture.revision++;
  return structuredClone(window.fixture);
},callService:async(...args)=>{window.serviceCalls.push(args)}};
window.panel.hass=window.fixtureHass;document.body.append(window.panel);
</script></body></html>`;
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/') {response.setHeader('Content-Type', 'text/html; charset=utf-8');response.end(html);return;}
    const pathname = url.pathname.startsWith('/water_treatment_panel/')
      ? '/custom_components/water_treatment/frontend/' + url.pathname.slice('/water_treatment_panel/'.length)
      : url.pathname;
    const file = resolve(root, '.' + pathname);
    if (!file.startsWith(root + sep)) {response.writeHead(403);response.end();return;}
    const mime = {'.js':'text/javascript', '.mjs':'text/javascript', '.png':'image/png', '.css':'text/css'}[extname(file)] || 'application/octet-stream';
    response.setHeader('Content-Type', mime);
    response.end(await readFile(file));
  } catch {response.writeHead(404);response.end();}
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port;
const engine = process.env.OVERVIEW_BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;
const browser = await engine.launch({headless:true, executablePath:process.env.OVERVIEW_BROWSER_PATH || undefined,
  args: engine === playwright.chromium ? ['--no-sandbox'] : []});
const context = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const by = selector => page.locator('nikas-water-treatment-panel').locator(selector);
const tick = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
try {
  await page.goto(url);
  await page.waitForFunction(() => window.panel?._filterData);
  assert.equal(await page.evaluate(() => window.panel._view), 'overview', 'New panel must open the overview');
  assert.deepEqual(await by('.tabbar button small').allTextContents(), ['Обзор','Фильтры','Ёлка','Жёсткость','Настройки']);
  assert.equal(await by('[data-overview-notice]').isVisible(), false, 'Healthy future maintenance must not appear as a pending action');
  assert.equal(await by('[data-overview-salt-next-check]').innerText(), 'Следующая проверка через 12 дней');
  assert.match(await by('[data-overview="main-used"]').innerText(), /12/);
  assert.equal(await page.getByRole('button', {name:/Магистральный.*Ресурс есть.*12 м³/}).count(), 1,
    'A focused overview card must expose its current readings in its accessible name');
  assert.equal(await page.getByRole('button', {name:/Ёлка.*Соль проверена.*4 кг/}).count(), 1);
  assert.equal(await page.getByRole('button', {name:/БАРЬЕР.*Смягчение.*24 дня/}).count(), 1);
  assert.equal(await by('.overview-card img').count(), 3);
  await page.waitForFunction(() => [...window.panel.shadowRoot.querySelectorAll('.overview-card img')].every(image => image.complete && image.naturalWidth > 0));
  await page.evaluate(() => {window.mounted = [...panel.shadowRoot.querySelectorAll('.overview-card,.overview-card img,.app-header,.tabbar')];});
  console.log('PASS overview opens first with live snapshot and three local illustrations');

  // Canonical NikaS viewport matrix plus the two narrower phone widths.
  for (const [width,height] of [[320,640],[390,844],[430,932],[932,430],[768,1024],[1024,768],[1440,900]]) {
    await page.setViewportSize({width,height});
    for (const theme of ['dark','light']) {
      await page.evaluate(theme => document.documentElement.dataset.theme=theme, theme);
      await tick();
      const layout = await page.evaluate(() => {
        const root=panel.shadowRoot;
        const header=root.querySelector('.app-header').getBoundingClientRect();
        const tabs=root.querySelector('.tabbar').getBoundingClientRect();
        const view=root.querySelector('.page-overview');
        const overflow=[...view.querySelectorAll('*')].filter(node=>node.getBoundingClientRect().width && node.scrollWidth>node.clientWidth+2 && getComputedStyle(node).display!=='inline').map(node=>node.className || node.tagName);
        const small=[...view.querySelectorAll('span,strong,p,h1')].filter(node=>node.getBoundingClientRect().width && parseFloat(getComputedStyle(node).fontSize)<12).map(node=>node.className);
        const tabLabels=[...root.querySelectorAll('.tabbar button small')].map(node=>({
          label:node.textContent,width:node.clientWidth,needed:node.scrollWidth,font:parseFloat(getComputedStyle(node).fontSize),
          fullName:node.parentElement.getAttribute('aria-label'),overflow:getComputedStyle(node).textOverflow}));
        return {headerTop:header.top,tabsBottom:tabs.bottom,width:innerWidth,height:innerHeight,overflow,small,tabLabels,viewWidth:view.getBoundingClientRect().width};
      });
      assert.ok(Math.abs(layout.headerTop)<2);
      assert.ok(Math.abs(layout.tabsBottom-layout.height)<2);
      assert.ok(layout.viewWidth <= layout.width-20);
      assert.deepEqual(layout.overflow, [], `horizontal overflow ${width}/${theme}`);
      assert.deepEqual(layout.small, [], `small meaningful text ${width}/${theme}`);
      assert.ok(layout.tabLabels.every(label=>label.font>=12), `small tab labels ${width}/${theme}`);
      assert.ok(layout.tabLabels.every(label=>label.fullName===label.label && label.overflow==='ellipsis'),
        `full accessible names and canonical overflow ${width}/${theme}`);
      if(width<=430 && theme==='dark')console.log(`${width}px canonical tab label measurements:`,JSON.stringify(layout.tabLabels));
      await page.screenshot({path:resolve(output,`overview-${width}-${theme}.png`)});
    }
  }
  console.log('PASS seven phone/tablet/desktop sizes, dark/light, without horizontal overflow or small text');

  await by('[data-overview-card="main"]').click();
  assert.equal(await page.evaluate(()=>panel._view),'filters');
  await page.waitForFunction(()=>panel.shadowRoot.activeElement?.dataset.filterCard==='main');
  assert.equal(await by('[data-filter-card="main"]').evaluate(node=>node===node.getRootNode().activeElement),true);
  await by('.tabbar [data-view="overview"]').click();
  await by('[data-overview-card="softener"]').click();
  assert.equal(await page.evaluate(()=>panel._view),'softener');
  await by('#salt-kg').fill('25');
  await by('.tabbar [data-view="overview"]').click();
  await page.evaluate(async()=>{fixture.status.main.used=13;fixture.status.main.remaining=87;fixture.status.main.percent=87;await panel._loadFilters();});
  await by('.tabbar [data-view="softener"]').click();
  assert.equal(await by('#salt-kg').inputValue(),'25');
  await by('.tabbar [data-view="overview"]').click();
  await page.evaluate(async()=>{Object.assign(fixture.status.softening,{state:'due',days:-104});await panel._loadFilters();});
  await by('[data-overview-notice]').click();
  assert.equal(await page.evaluate(()=>panel._view),'filters');
  await page.waitForFunction(()=>panel.shadowRoot.activeElement?.dataset.filterCard==='softening');
  assert.equal(await by('[data-filter-card="softening"]').evaluate(node=>node===node.getRootNode().activeElement),true);
  assert.equal(await page.evaluate(()=>scrollY),0);
  await by('.tabbar [data-view="overview"]').click();
  console.log('PASS cards/notice open the correct detail, native shell stays fixed, salt draft survives');

  await page.evaluate(async()=>{window.failRead=true;await panel._loadFilters();});
  assert.equal(await by('[data-overview="main-used"]').innerText(),'— м³');
  assert.equal(await by('[data-overview="salt-value"]').innerText(),'— кг');
  assert.equal(await by('[data-overview-salt-next-check]').isVisible(),false);
  assert.equal(await by('[data-overview-card="main"]').getAttribute('data-status'),'unknown');
  assert.match(await by('[data-overview="notice-title"]').innerText(),/Обновить/);
  await page.evaluate(async()=>{window.failRead=false;await panel._loadFilters();});
  assert.match(await by('[data-overview="main-used"]').innerText(),/13/);
  assert.equal(await by('[data-overview-salt-next-check]').innerText(),'Следующая проверка через 12 дней');
  assert.equal(await page.evaluate(()=>mounted.every((node,index)=>node===[...panel.shadowRoot.querySelectorAll('.overview-card,.overview-card img,.app-header,.tabbar')][index])),true);
  console.log('PASS failure clears stale values and recovery preserves card/image/shell nodes');

  await page.evaluate(()=>{fixtureHass.connection.connected=false;panel.hass=fixtureHass;});
  await tick();
  assert.equal(await by('[data-overview="main-used"]').innerText(),'— м³');
  assert.equal(await by('[data-overview-salt-next-check]').isVisible(),false);
  await page.evaluate(async()=>{fixtureHass.connection.connected=true;panel.hass=fixtureHass;await panel._loadFilters();});
  await tick();
  assert.match(await by('[data-overview="main-used"]').innerText(),/13/);
  console.log('PASS disconnect/reconnect does not leave a healthy stale overview');

  await page.setViewportSize({width:320,height:600});
  await page.evaluate(()=>{panel.shadowRoot.querySelector('.canvas-viewport').scrollTop=60;});
  const scrollBefore=await by('.canvas-viewport').evaluate(node=>node.scrollTop);
  assert.ok(scrollBefore>0);
  const headerBefore=await by('.app-header').boundingBox();
  const tabsBefore=await by('.tabbar').boundingBox();
  await page.evaluate(async()=>{fixture.status.main.used=14;await panel._loadFilters();});
  assert.equal(await by('.canvas-viewport').evaluate(node=>node.scrollTop),scrollBefore);
  assert.deepEqual(await by('.app-header').boundingBox(),headerBefore);
  assert.deepEqual(await by('.tabbar').boundingBox(),tabsBefore);
  assert.equal(await page.evaluate(()=>requests.some(message=>message.action && message.action!=='get')),false);
  assert.deepEqual(await page.evaluate(()=>serviceCalls),[], 'Overview navigation and refresh must not issue HA service commands');
  console.log('PASS point updates preserve scroll, never issue writes, and emit no page errors');

  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});
  await by('.tabbar [data-view="settings"]').click();
  assert.equal(await page.evaluate(()=>panel._view),'settings');
  assert.equal(await by('.page-filters #filter-volume').count(),0);
  assert.equal(await by('.page-settings #filter-volume').count(),1);
  assert.equal(await by('#filter-volume').count(),1);
  assert.equal(await by('.page-filters #date-main').count(),1);
  assert.equal(await by('.page-filters [data-filter-action="replace"]').count(),4);
  assert.equal(await by('#filter-volume').inputValue(),'100');
  assert.equal(await by('#filter-people').inputValue(),'3');
  assert.equal(await by('#filter-hardness').inputValue(),'1.4264');
  assert.equal(await by('[data-filter-settings-message]').isVisible(),true);
  for(const width of [320,390,430]) {
    await page.setViewportSize({width,height:844});
    await tick();
    const overflow=await by('.page-settings').evaluate(view=>[...view.querySelectorAll('*')]
      .filter(node=>node.getBoundingClientRect().width && node.scrollWidth>node.clientWidth+2 && getComputedStyle(node).display!=='inline')
      .map(node=>node.id || node.className || node.tagName));
    assert.deepEqual(overflow,[],`settings overflow at ${width}px`);
    await page.screenshot({path:resolve(output,`settings-${width}-dark.png`)});
  }
  await page.setViewportSize({width:390,height:844});
  await by('#filter-volume').fill('125');
  await by('#filter-people').fill('4');
  await by('#filter-auto').selectOption('manual');
  await by('#months-softening').fill('3');
  await by('.tabbar [data-view="overview"]').click();
  await page.evaluate(async()=>{fixture.status.main.used=15;await panel._loadFilters();});
  await by('.tabbar [data-view="settings"]').click();
  assert.equal(await by('#filter-volume').inputValue(),'125');
  assert.equal(await by('#filter-people').inputValue(),'4');
  assert.equal(await by('#months-softening').inputValue(),'3');
  await page.evaluate(()=>{window.allowedWrites=['settings','salt_check'];});
  await by('[data-filter-action="settings"]').click();
  await page.waitForFunction(()=>!panel._filterBusy && panel.shadowRoot.querySelector('[data-filter-settings-message]').textContent==='Сохранено');
  const saved=await page.evaluate(()=>requests.filter(message=>message.action==='settings').at(-1));
  assert.equal(saved.revision,4);
  assert.deepEqual(saved.payload,{main:{profile:'mechanical',volume:125,months:6,mode:'volume'},people:4,hardness:1.4264,
    softening_auto:false,months:{ferrostop:6,softening:3,postcarbon:6}});
  assert.deepEqual(await page.evaluate(()=>({date:fixture.settings.main.date,baseline:fixture.settings.main.baseline})),
    {date:'2026-10-01',baseline:100});
  assert.equal(await by('[data-filter-settings-message]').isVisible(),true);
  console.log('PASS settings controls moved once, drafts survive tabs/polling, save preserves dates and baseline');

  await by('#filter-volume').fill('126');
  await page.evaluate(()=>{window.failWrite=true;});
  await by('[data-filter-action="settings"]').click();
  await page.waitForFunction(()=>!panel._filterBusy && panel.shadowRoot.querySelector('[data-filter-settings-message]').textContent.includes('disk full'));
  assert.equal(await by('#filter-volume').inputValue(),'126');
  assert.equal(await page.evaluate(()=>panel._filterData.revision),5);
  assert.equal(await by('[data-filter-settings-message]').isVisible(),true);
  await page.evaluate(async()=>{window.failWrite=false;fixture.settings.main.volume=180;fixture.revision++;await panel._loadFilters();});
  assert.equal(await by('#filter-volume').inputValue(),'126');
  await by('[data-filter-action="settings"]').click();
  await page.waitForFunction(()=>!panel._filterBusy && panel.shadowRoot.querySelector('[data-filter-settings-message]').textContent.includes('Настройки изменились'));
  assert.equal(await page.evaluate(()=>requests.filter(message=>message.action==='settings').at(-1).revision),5);
  assert.equal(await by('#filter-volume').inputValue(),'126');
  assert.equal(await page.evaluate(()=>fixture.settings.main.volume),180);
  assert.equal(await by('[data-filter-settings-message]').isVisible(),true);
  console.log('PASS settings failure/conflict stays beside Save and preserves the draft with its original revision');

  await page.evaluate(async()=>{
    Object.assign(fixture.status.softening,{state:'ok',days:24});
    fixture.settings.salt.last_checked='2026-10-26';
    Object.assign(fixture.salt_status,{state:'check',days:0});
    fixture.revision++;
    await panel._loadFilters();
  });
  await by('.tabbar [data-view="overview"]').click();
  assert.equal(await by('[data-overview="notice-title"]').innerText(),'Проверить запас соли');
  assert.equal(await by('[data-overview-salt-next-check]').isVisible(),false);
  await by('[data-overview-notice]').click();
  assert.equal(await page.evaluate(()=>panel._view),'softener');
  await by('#salt-level').selectOption('enough');
  await by('[data-filter-action="salt_check"]').click();
  await page.waitForFunction(()=>!panel._filterBusy && panel.shadowRoot.querySelector('[data-salt-message]').textContent==='Сохранено');
  await by('.tabbar [data-view="overview"]').click();
  assert.equal(await by('[data-overview-notice]').isVisible(),false);
  assert.equal(await by('[data-overview="softener-status"]').innerText(),'Соль проверена');
  assert.equal(await by('[data-overview="salt-detail"]').innerText(),'Проверка 07.11.2026');
  assert.equal(await by('[data-overview-salt-next-check]').innerText(),'Следующая проверка через 12 дней');
  await page.screenshot({path:resolve(output,'overview-after-salt-check-390-dark.png')});
  await by('.tabbar [data-view="settings"]').click();
  assert.equal(await by('#filter-volume').inputValue(),'126','A salt check must not discard a separate settings draft');
  assert.deepEqual(await page.evaluate(()=>serviceCalls),[],'Form writes use the journal API without physical-device service calls');
  assert.deepEqual(errors,[]);
  console.log('PASS recording a salt check removes the current reminder and moves the next check to the card');
  console.log('Browser acceptance PASS; screenshots:',output);
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
