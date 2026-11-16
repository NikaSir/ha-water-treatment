import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {overviewFixture} from "./overview_fixtures.mjs";

const playwright = await import("playwright").catch(error => {
  if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw error;
  return createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + "/package.json")("playwright");
});
const engine = process.env.OVERVIEW_BROWSER === "webkit" ? playwright.webkit : playwright.chromium;
const browser = await engine.launch({
  headless: true,
  executablePath: process.env.OVERVIEW_BROWSER_PATH || undefined,
  args: engine === playwright.chromium ? ["--no-sandbox"] : [],
});
const component = "../custom_components/water_treatment/";
const {ui_version: uiVersion} = JSON.parse(await readFile(new URL(component + "panel_manifest.json", import.meta.url), "utf8"));
const {version: integrationVersion} = JSON.parse(await readFile(new URL(component + "manifest.json", import.meta.url), "utf8"));
const origin = "http://water-treatment.test";
const bundleUrl = "/water_treatment_panel/water-treatment-panel.js";
const html = `<!doctype html>
<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root{color-scheme:light;--primary-background-color:#f6f8fb;--card-background-color:#fff;--primary-text-color:#20242a;--divider-color:#dce4ed;--primary-color:#1688f8}
  :root[data-dark]{color-scheme:dark;--primary-background-color:#101820;--card-background-color:#1b2733;--primary-text-color:#f1f5f8;--divider-color:#334653}
  html,body{height:100%;margin:0}body{display:grid;grid-template-columns:var(--sidebar,0px) minmax(0,1fr)}
  ha-panel{min-height:0;min-width:0}nikas-water-treatment-panel{height:100%}
</style>
<script src="/ha-icon.js"></script><script src="${bundleUrl}?v=${uiVersion}"></script>
<body><aside></aside><ha-panel></ha-panel></body></html>`;

try {
  const page = await browser.newPage({viewport: {width: 430, height: 932}, colorScheme: "dark"});
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route(origin + "/**", async route => {
    const {pathname} = new URL(route.request().url());
    if (pathname === "/dashboard-water-treatment") {
      return route.fulfill({contentType: "text/html; charset=utf-8", body: html});
    }
    if (pathname === "/ha-icon.js") {
      return route.fulfill({path: fileURLToPath(new URL("../preview/ha-icon.js", import.meta.url))});
    }
    if (pathname === bundleUrl || /^\/water_treatment_panel\/assets\/[\w-]+\.png$/.test(pathname)) {
      const path = pathname.replace("/water_treatment_panel/", component + "frontend/");
      return route.fulfill({path: fileURLToPath(new URL(path, import.meta.url))});
    }
    return route.abort();
  });
  await page.goto(origin + "/dashboard-water-treatment?return_to=/dashboard-actions/home");
  await page.evaluate(({snapshot, integrationVersion, uiVersion}) => {
    window.events = [];
    window.requests = [];
    window.serviceCalls = [];
    window.hass = {
      user: {is_admin: true}, states: {}, connection: {connected: true}, themes: {darkMode: false},
      callWS: async request => {
        requests.push(request);
        if (window.failRead) throw new Error("Journal unavailable");
        return structuredClone(snapshot);
      },
      callService: async (...args) => {
        serviceCalls.push(args);
        window.refreshStarted = performance.now();
        return window.serviceResult;
      },
    };
    window.panel = document.createElement("nikas-water-treatment-panel");
    window.panelConfig = {ui_version: uiVersion, integration_version: integrationVersion, parent_route: "/home/overview"};
    panel.panel = {config: panelConfig};
    panel.hass = hass;
    document.querySelector("ha-panel").append(panel);
    document.addEventListener("hass-toggle-menu", event => events.push(["menu", event.bubbles, event.composed]));
    window.addEventListener("location-changed", () => events.push(["location", location.pathname]));
  }, {snapshot: overviewFixture(), integrationVersion, uiVersion});
  await page.waitForFunction(() => panel._filterData);

  const by = selector => page.locator("nikas-water-treatment-panel").locator(selector);
  const caption = by(".header-title small");
  const refresh = by("#refresh");
  const icon = by("#refresh ha-icon");
  const title = by("#return-source");
  const setTheme = dark => page.evaluate(dark => {
    document.documentElement.toggleAttribute("data-dark", dark);
    hass.themes = {darkMode: dark};
    panel.hass = {...hass};
  }, dark);
  const tick = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const select = view => by(`.tabbar [data-view="${view}"]`).click();
  const waitForGlyph = glyph => page.waitForFunction(glyph =>
    panel.shadowRoot.querySelector("#refresh ha-icon").getAttribute("icon") === glyph, glyph);
  const glyphColor = () => icon.evaluate(node => getComputedStyle(node).color);

  assert.equal(await caption.textContent(), `UI v${uiVersion} / ${integrationVersion}`);
  await page.evaluate(() => {
    window.headerNodes = [...panel.shadowRoot.querySelectorAll(".app-header, #menu, #return-source, #refresh")];
    panel.panel = {config: {...panelConfig, ui_version: "9.9.9-beta999", integration_version: "1.9.11-beta007"}};
  });
  await tick();
  assert.equal(await caption.textContent(), `UI v${uiVersion} / 1.9.11-beta007`);
  await page.evaluate(() => {panel.panel = {config: {...panelConfig, integration_version: undefined}};});
  await tick();
  assert.equal(await caption.textContent(), `UI v${uiVersion} / —`);
  await page.evaluate(() => {panel.panel = {config: panelConfig};});

  for (const [width, height, sidebar = 0] of [
    [320, 640], [390, 844], [430, 932], [932, 430], [768, 1024], [1024, 768], [1440, 900], [1440, 900, 256],
  ]) {
    await page.setViewportSize({width, height});
    await page.evaluate(sidebar => document.body.style.setProperty("--sidebar", sidebar + "px"), sidebar);
    for (const dark of [false, true]) {
      await setTheme(dark);
      await tick();
      const header = await by(".app-header").boundingBox();
      const plaque = await title.boundingBox();
      const menu = await by("#menu").boundingBox();
      const action = await refresh.boundingBox();
      assert.equal(header.height, 60);
      assert.equal(header.width, width - sidebar);
      assert.equal(header.x, sidebar);
      assert.equal(plaque.height, 52);
      assert.ok(Math.abs(plaque.x + plaque.width / 2 - (header.x + header.width / 2)) < 1);
      assert.equal(menu.x + menu.width / 2 - header.x, header.x + header.width - (action.x + action.width / 2));
      assert.deepEqual([menu.width, menu.height, action.width, action.height], [44, 44, 44, 44]);
      assert.equal(await glyphColor(), dark ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)");
      const surface = await refresh.evaluate(node => getComputedStyle(node).backgroundColor);
      assert.equal(surface === "rgb(255, 255, 255)", !dark);
      for (const part of [caption, by(".header-title strong")]) {
        assert.ok(await part.evaluate(node => node.scrollWidth <= node.clientWidth &&
          getComputedStyle(node).whiteSpace === "nowrap"), `Header text fits at ${width - sidebar}px`);
      }
      assert.equal(await caption.evaluate(node => getComputedStyle(node).fontWeight), "500");
      assert.equal(await by(".header-title strong").evaluate(node => getComputedStyle(node).fontWeight), "700");
    }
  }

  await page.setViewportSize({width: 390, height: 650});
  await page.evaluate(() => document.body.style.removeProperty("--sidebar"));
  await setTheme(false);
  await select("settings");
  await by("#filter-volume").fill("125");
  const viewport = by(".canvas-viewport");
  const scroll = await viewport.evaluate(node => {node.scrollTop = 55; return node.scrollTop;});
  assert.ok(scroll > 0);
  const originalHeader = await by(".app-header").boundingBox();
  const originalRefresh = await refresh.boundingBox();
  const noNewSample = await by('[data-overview="salt-detail"]').textContent();
  await refresh.click();
  assert.equal(await refresh.getAttribute("aria-busy"), "true");
  assert.equal(await refresh.isDisabled(), true);
  assert.equal(await glyphColor(), "rgb(0, 0, 0)");
  assert.equal(await icon.evaluate(node => getComputedStyle(node).animationDuration), "0.9s");
  assert.deepEqual(await page.evaluate(() => serviceCalls), [["homeassistant", "update_entity",
    {entity_id: ["sensor.schetchik_vody_svd_20_0020989_pokazaniia"]}]]);
  await waitForGlyph("mdi:check");
  assert.ok(await page.evaluate(() => performance.now() - refreshStarted >= 899));
  assert.equal(await glyphColor(), "rgb(67, 160, 71)");
  assert.equal(await refresh.getAttribute("aria-label"), "Запрос обновления выполнен");
  assert.equal(await by(".panel-toast").textContent(), "Запрос обновления выполнен");
  assert.equal(await viewport.evaluate(node => node.scrollTop), scroll);
  assert.equal(await by("#filter-volume").inputValue(), "125");
  assert.equal(await by('[data-overview="salt-detail"]').textContent(), noNewSample);
  assert.deepEqual(await by(".app-header").boundingBox(), originalHeader);
  assert.deepEqual(await refresh.boundingBox(), originalRefresh);

  // A deliberate retry during the check is blocked only by its own pending request.
  await page.evaluate(() => {window.serviceResult = new Promise(resolve => {window.releaseRefresh = resolve;});});
  await refresh.press("Enter");
  await refresh.dispatchEvent("click");
  await page.evaluate(() => panel._refresh());
  await select("filters");
  await setTheme(true);
  await tick();
  assert.equal(await glyphColor(), "rgb(255, 255, 255)");
  assert.equal(await page.evaluate(() => serviceCalls.length), 2);
  await page.waitForFunction(() => performance.now() - refreshStarted > 1500);
  assert.equal(await refresh.isDisabled(), true);
  assert.equal(await icon.getAttribute("icon"), "mdi:refresh");
  await page.evaluate(() => releaseRefresh(false));
  await waitForGlyph("mdi:alert-circle-outline");
  assert.equal(await glyphColor(), "rgb(229, 57, 53)");
  assert.equal(await by(".panel-toast.visible").textContent(), "Не удалось обновить данные");
  assert.equal(await refresh.isEnabled(), true);
  const resultTimer = await page.evaluate(() => panel._refreshResultTimer);
  await select("settings");
  assert.equal(await page.evaluate(() => panel._refreshResultTimer), resultTimer);
  await waitForGlyph("mdi:refresh");

  await page.emulateMedia({reducedMotion: "reduce"});
  await page.evaluate(() => {window.serviceResult = undefined; window.failRead = true;});
  await refresh.click();
  assert.equal(await icon.evaluate(node => getComputedStyle(node).animationName), "none");
  assert.equal(await refresh.evaluate(node => getComputedStyle(node).outlineStyle), "dashed");
  await waitForGlyph("mdi:alert-circle-outline");
  assert.equal(await by(".panel-toast.visible").textContent(), "Не удалось обновить данные");
  await page.evaluate(() => {
    window.failRead = false;
    panel.panel = {config: {...panelConfig, entities: {drinking_total: null}}};
  });
  await refresh.click();
  await waitForGlyph("mdi:alert-circle-outline");
  assert.equal(await page.evaluate(() => serviceCalls.length), 3);

  await page.evaluate(() => {
    panel.panel = {config: panelConfig};
    window.serviceResult = new Promise(resolve => {window.releaseRefresh = resolve;});
  });
  await refresh.click();
  await page.evaluate(() => {
    panel.remove();
    document.querySelector("ha-panel").append(panel);
    releaseRefresh();
  });
  await tick();
  assert.equal(await refresh.isEnabled(), true);
  assert.equal(await icon.getAttribute("icon"), "mdi:refresh");
  assert.equal(await page.evaluate(() => panel._refreshResultTimer), null);
  assert.equal(await by("#filter-volume").inputValue(), "125");
  assert.equal(await page.evaluate(() => headerNodes.every((node, i) =>
    node === [...panel.shadowRoot.querySelectorAll(".app-header, #menu, #return-source, #refresh")][i])), true);
  assert.ok(await page.evaluate(() => requests.every(request => request.type === "water_treatment/filters" && !request.action)));

  await by("#menu").click();
  await title.press("Enter");
  assert.deepEqual(await page.evaluate(() => events), [["menu", true, true], ["location", "/home/overview"]]);
  assert.deepEqual(errors, []);
  console.log("Header browser checks passed: both versions, host geometry, themes, navigation and read-only refresh.");
} finally {
  await browser.close();
}
