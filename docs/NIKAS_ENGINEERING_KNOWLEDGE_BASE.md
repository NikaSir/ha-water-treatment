# NikaS Engineering Knowledge Base

**Status:** LIVING DOCUMENT  
**Scope:** Home Assistant custom integrations, integration-owned specialized panels, generated/base panels  
**Normative baseline:** NikaS Specialized Panel UI Standard v2.2 + NikaS Panel Navigation Contract
**Purpose:** preserve engineering experience, failure modes, proven practices and acceptance criteria so new work starts from accumulated knowledge rather than from previous implementations.

This file is intentionally broader than the UI standard. The standard defines mandatory behavior. This knowledge base records *why* those rules exist, what repeatedly failed in real devices, and how integration/backend, frontend, history/statistics and release work should be organized.

---

## 1. Core engineering principle

A NikaS integration/panel is not a page that periodically redraws. It is a small stateful application inside Home Assistant with four independent concerns:

1. **truth acquisition** — reliable states, registries, coordinator/API results;
2. **domain model** — explicit mapping, freshness, availability, derived values and write capabilities;
3. **persistent UI shell** — Header, one work viewport, Bottom Tab Bar, optional peer selector;
4. **incremental rendering** — patch only the values that changed.

Most historical visual defects, flicker, slow startup, broken scrolling and inconsistent state were caused by crossing these boundaries.

### Rule

Before UI work begins, define the data contract and state lifecycle. Before styling begins, create the persistent shell and rendering model. Before adding history, define its request lifecycle and cache. Before publishing, prove version/build parity and real-device behavior.

---

## 2. Lessons learned from previous panels

### 2.1 Stable shell beats repeated rendering

Repeated full `shadowRoot.innerHTML` replacement caused:

- white frames during tab changes;
- background/image re-decoding;
- Header and Bottom Tab Bar movement;
- scroll position jumps;
- gesture state loss;
- flicker during telemetry updates;
- expensive compositor reconstruction in iOS WebView.

**Correct model:** mount the application shell once; update existing text nodes, classes, attributes and CSS variables. Cache visited work-view subtrees and reattach them instead of rebuilding the shell.

### 2.2 The work viewport must be the only scroll owner

Panels that relied on the outer Home Assistant document or independent `position: fixed` layers showed mobile failures: Header could be pulled upward, the bottom menu followed short pages, inertia propagated into HA, and safe-area calculations accumulated.

**Correct model:** height-locked phone shell with exactly one middle work viewport. Header and Bottom Tab Bar occupy fixed grid rows outside it. Prevent scroll chaining.

### 2.3 One zoom engine only

Multiple wrappers, nested transforms or mixing browser zoom, transform pan and native scroll produced jump-to-max zoom, clipped cards and unpredictable panning.

**Correct model:** one zoom viewport. At 100% use native vertical scrolling and no transform pan. Transform panning exists only above 100%, with factual clamping to content edges. Pinch range 75–200%; 97–103% snaps to 100%; two-finger double tap resets scale/translation/native scroll.

### 2.4 Do not shrink typography to solve layout

Unreadable secondary pages and clipped labels were repeatedly caused by compressing text instead of recomposing cards.

**Correct model:** meaningful text stays within 12–25 px. If content does not fit, change geometry, grouping, line breaks or card structure; do not solve it with 9–10 px operational text.

### 2.5 Status transport and freshness are separate facts

A single “Online” indicator hid whether data came locally or from cloud and could incorrectly suggest healthy fresh data.

**Correct model:** when explicitly requested, use two independent dimensions:

- transport: `Локально / Облако / Резерв / Нет связи / Нет данных`;
- freshness: `Данные актуальны / Данные устарели / Нет данных`.

Do not infer outage from stale data. Preserve last-known telemetry only with a stale state.

### 2.6 State-only changes must not alter topology

Flicker appeared after introducing indicators or conditional cards because the changing state controlled element creation/removal.

**Correct model:** stable placeholders; state controls content/classes, not shell topology. Do not use telemetry age, status strings or current values as structural keys.

### 2.7 Images must be persistent assets

Large PNG backgrounds slowed first render and re-render. Reassigning unchanged `src` or rebuilding the image layer made the problem visible.

**Correct model:** optimize assets (prefer WebP where appropriate), mount once, reuse, avoid writing the same `src`, and keep persistent compositor layers stable during scroll and telemetry updates.

### 2.8 Phone acceptance is a separate engineering stage

Desktop/static screenshots did not reveal inertial scroll, iOS safe-area, synthetic click after pinch, WebView flicker or shell movement.

**Correct model:** automated checks are necessary but not sufficient. iPhone Pro Max portrait is the primary acceptance viewport for specialized panels. Regression scenarios are defined before merge.

### 2.9 A common idea is not a common shell

A cross-panel review on phone, tablet landscape and desktop with the Home Assistant sidebar open showed that independently implemented “fixed Header / viewport / Bottom Nav” shells still diverged in top origin, available width, content frame, title centering and bottom-bar attachment. The prose requirements were correct, but phone-first acceptance and approximate geometry allowed every repository to choose a different coordinate system.

**Correct model:** NikaS UI v2.2 binds the shell to the real Home Assistant panel host, defines numeric row sizes and one canonical content frame, and requires the same rectangle checks across phone, tablet and desktop with the Home Assistant menu open and closed. Screenshots of S8, Stark or another panel are visual lineage, not a substitute for the numeric contract.

Five internal destinations are valid. The Keenetic panel has five Bottom Tab destinations and was not the source of this defect; its review finding concerned shell consistency, not tab count.

### 2.10 Peer status and selection are different facts

A selector button answers which peer device is open. Its status lamp answers whether that device is healthy. Recoloring the whole selected button from telemetry mixed these meanings and made selection unstable.

**Correct model:** retain one persistent 9px lamp per peer device with a subtle 3px halo. Green means healthy and current, orange means a documented warning or degraded/reserve state, red means confirmed fault/offline, and gray means unknown or incomplete data. Classification fails closed in the priority fault → warning → healthy → unknown. Selection styling remains independent. Updates patch only lamp color and accessible status text without rebuilding the selector or shell.


### 2.11 Peer selector geometry has one visual reference

Different panels implemented the same peer-device selector as a shared segmented pill, independent cards, or compressed labels. Even when all variants remained usable, the changing frame made the NikaS shell look inconsistent and encouraged selection styling to absorb device health.

**Proven reference:** StarLine UI v0.6.8.

**Correct model for two peers:**

- one 52px selector row immediately below Header and outside the work viewport;
- the row itself has no shared card surface, border, radius or shadow;
- horizontal inset is at least 12px plus the relevant safe-area inset;
- two equal-width independent buttons separated by an 8px gap;
- each button is 44px high, has a 1px border, a 15px radius and the ordinary card surface;
- content is left aligned: persistent 9px status lamp with a subtle 3px halo, then one-line peer name;
- the selected button uses primary-colored text, a primary-color border at about 65% strength and a primary-color surface at about 10% strength;
- device health never recolors the selected surface: health changes only the lamp and accessible status text;
- long peer names use one-line ellipsis and must not change button height or selector topology.

More than two peers may use another explicitly approved adaptive composition only when the 44px touch target and legible names remain intact. Do not squeeze unreadable labels into the two-peer reference geometry.

---

### 2.12 Refresh needs a visible completion result

The user accepted the green completion check in Climate UI 1.4.17, then reported
its absence in the vacuum and irrigation panels. Rotation alone shows that a
request is running; an immediate return to the arrow makes its outcome unclear.
Another S8 failure showed that a generic loading CSS class could distort the
Header button. Use a button-specific state class and preserve plaque geometry.

**Correct model:** one mounted button, four states:
`idle → busy → success/error → idle`. Follow
[Refresh Action Contract v1.1](NIKAS_REFRESH_ACTION_CONTRACT.md):

- busy begins immediately, lasts at least 900 ms and until the request settles;
- explicit success shows green `mdi:check` for 1400 ms;
- failure shows red `mdi:alert-circle-outline` for 1400 ms and an error message;
- the result interval ends by restoring the arrow, with no layout shift;
- duplicate requests are blocked while busy; retry during a result clears its old
  timer so it cannot overwrite the new request;
- HA updates and tab changes preserve the result and its original deadline;
- accessible names and static reduced-motion states explain progress/outcome;
- only an accepted factual sample changes telemetry freshness. A resolved promise
  carrying `false`, a swallowed exception or partial failure is not success.

Completion presentation was added in
[S8 OMNI 1.0.4, PR #129](https://github.com/NikaSir/ha-s8-omni/pull/129) and
[HO-SC-8W 1.0.1, PR #175](https://github.com/NikaSir/ha-ho-sc-8w/pull/175).
Product tests and browser checks are evidence for the tested cases only; these
references do not certify the entire contract or replace physical acceptance.

---

### 2.13 Connection plaque and blue corner must use locked tokens

On 2026-09-08 the user again reported that «Связь» changes position, size and
font, and requested the same strict treatment for the upper-right blue element.
The source comparison found concrete drift:

| Source inspected | Plaque drift | Blue circle drift |
|---|---|---|
| [S8 OMNI `2ed8bac`](https://github.com/NikaSir/ha-s8-omni/tree/2ed8bacb5d3def6141aa118bd6994b036c9f2610) | Proportional width; `min-height:58px`; mobile stacking; text gap 4px | 205px; top −92px / right −70px; theme-dependent blue |
| [HO-SC-8W `dc4afe2`](https://github.com/NikaSir/ha-ho-sc-8w/tree/dc4afe23ddb14850c289c3145526043d0894441c) | Width 168px; minimum height only; vertical centering against controller image; another font stack | 200px; top −90px / right −65px; another blue |
| [Climate `b5fae6c`](https://github.com/NikaSir/ha-nikas-climate/tree/b5fae6ce16b905d1e9c1d42d98d49324ece40772) | Proportional width; 58/64px minimum heights; implicit line-height; another font stack | 220px desktop / 188px mobile; different offsets |

A minimum height is not an exact height: the old S8 text, gap, padding and border
already required about 60.45px. “Use the S8 reference” therefore did not uniquely
specify the result. CSS appended to historical classes could also miss the
current production DOM, while a wildcard connection selector deformed the lamp.

The subsequent user comparison selected the compact S8 phone appearance.
Revision 1.1 restores `168px` width and the phone layout's `13px` top/right
inset (`14px` from the outer card edge with its `1px` border). The agreed
`58px` compact height is fixed explicitly, not represented as a measured
height of the old runtime. Its smaller inner padding reconciles that height
with the unchanged type sizes; the blue corner tokens remain unchanged.

**Required model:** [Connection Plaque and Blue Corner Contract v1.1](NIKAS_CONNECTION_DECORATION_CONTRACT.md).

- «Связь»: exactly 168×58px border-box; top/right 13px from the card's inner
  border edge; radius18; padding11/12; lamp10; column gap9; text gap3.
- One font stack everywhere; main16px/700 with 17px line-height;
  freshness13px/600 with 14px line-height. No product font inheritance.
- Blue decoration: circle205px; top−92/right−70; fixed `rgba(3,169,217,0.07)`;
  no theme-primary input, responsive alternative or status meaning.
- Preserve both DOM nodes and the anchors through every state update. On narrow
  cards the title moves below the plaque; the plaque remains at the top right.
- Replace conflicting CSS at its source. Do not append another patch, shrink
  text, center the plaque against the image or use wildcard internal selectors.
- Production acceptance measures rectangles/computed styles for all label
  lengths, state transitions, peer/tab changes, width boundaries, zoom and themes.

These are intentionally fixed new tokens within UI Standard v2.2. Updating the
knowledge base does not update the three installed panels. Their conformance
remains unverified until individual production changes and acceptance evidence
are recorded; a documentation/hash check is not runtime evidence.

---

## 3. Integration architecture

### 3.1 Backend owns truth; frontend owns presentation

The frontend must consume:

- Home Assistant state objects;
- entity/device/area registries;
- integration-owned coordinator/API data;
- explicit panel/integration mapping contracts.

It must not invent entity IDs, raw datapoints, device capabilities, success results or “healthy” defaults.

### 3.2 Explicit entity/capability mapping

Entity discovery should be registry-driven where practical. Hard-coded entity IDs are allowed only when they are a deliberate, tested public contract. Generated IDs guessed from labels or device names are prohibited.

When operational labels exist (for example `В эксплуатации`, `Резерв`, `На обслуживании`, `Требует замены`, `Выведено`), filtering must occur from the factual metadata/labels rather than by hiding arbitrary entities in the UI.

### 3.3 Coordinator/API lifecycle

For polled integrations:

- one coordinator is the normal source of periodic truth;
- polling cadence is explicit;
- successful sample acceptance updates freshness timestamp;
- failed polls do not erase the last good sample, but mark it stale;
- expensive work is not duplicated by each entity or panel subscriber;
- listeners receive already-normalized domain state.

### 3.3.1 Panel existence is application infrastructure

A configured panel route is registered before fallible device or cloud I/O. Device
reachability changes the panel's content to an explicit unavailable/no-data state; it
does not remove the application surface. First-refresh helpers may still govern
entity setup or config-entry retry, but never route existence. Registration,
collision handling, retries and unload ownership follow
`NIKAS_PANEL_LIFECYCLE_CONTRACT.md`.

### 3.4 Unknown and unavailable are first-class states

Never convert missing input to zero, false, normal or green. Distinguish:

- valid value;
- `unknown`;
- `unavailable`;
- no sample yet;
- preserved stale value;
- source/transport failure.

Derived values fail closed when required inputs are absent.

### 3.5 Read-only versus write-enabled integration

A read-only panel remains read-only. Refresh means refresh telemetry, not a device command.

A write action is allowed only through a registered integration service or a discovered HA entity capability. For every write action:

1. validate capability and target availability;
2. collect/edit value without sending it immediately when the workflow requires confirmation;
3. expose an explicit Apply/Start/Stop action;
4. require confirmation for consequential commands according to the product policy;
5. prevent duplicate submission while busy;
6. await the HA/integration call;
7. show error if the call fails;
8. do not optimistically claim success before factual state confirms it.

This pattern was validated for seasonal irrigation correction and is the default for settings/commands that write to equipment.

---

## 4. Panel construction order

Build a new specialized panel in this order:

### Stage A — contract

Define:

- product identity and panel name;
- read-only/write policy;
- peer devices;
- factual entities/data sources;
- operational and diagnostic fields;
- derived values and their inputs;
- transport/freshness policy if requested;
- history/statistics metrics and periods;
- navigation parent/fallback routes.

### Stage B — shell

Implement only:

- fixed Header;
- optional peer selector;
- one work viewport/canvas;
- fixed Bottom Tab Bar;
- safe area handling;
- navigation return plaque;
- deterministic initial loading surface.

Do not begin rich cards until shell regression tests pass.

### Stage C — rendering engine

Implement:

- one-time mount;
- stable view cache;
- coalesced state updates, max one animation frame;
- changed-value checks before DOM writes;
- tab/peer selection without shell rebuild;
- persistent image/background layers.

### Stage D — gestures

Add native 100% scroll first. Then add pinch/reset and enlarged pan. Verify gesture/click/hold isolation before adding device commands.

### Stage E — operational views

Operational first page should answer “what is happening now?” and avoid deep diagnostics. Diagnostic detail belongs on a separate tab or Infrastructure surface.

### Stage F — diagnostics

Diagnostics should expose all enabled state-bearing entities bound to the device/integration, raw attributes when useful, timestamps/context, and clear source status. It is primarily for service and debugging, not the first page.

### Stage G — statistics/history

Add only after live-state rendering is stable. History must never drive or block the shell.

### Stage H — commands

Add writes last. Every write path receives separate safety, busy-state and failure tests.

---

## 5. UI composition principles

### 5.1 Header

Follow v2.2 exactly. The center title plaque is the sole standard return control. No browser `history.back()`, no separate arrow or “Назад”. Left rail is HA system menu; right rail has at most one panel-global action. All three tracks are positioned inside the Home Assistant panel host, never against the browser viewport.

### 5.2 Bottom navigation

3–5 equal destinations, fixed outside the work viewport, MDI icons through `ha-icon`, minimum touch target 52 px. A short page must not pull the bar upward; a long page must scroll its final control above it.

The bar spans the panel host on phone, tablet and desktop. Five destinations are conforming; a sixth requires a secondary navigation level. An active state may change color and background only, never item size, column width or bar height.

### 5.3 Page hierarchy

Preferred information order:

1. state/scene that gives immediate understanding;
2. primary live facts;
3. actionable warnings;
4. secondary operational parameters;
5. history/statistics;
6. diagnostics/raw data.

Do not duplicate the same parameter on image overlays and cards unless each occurrence serves a distinct task.

### 5.4 Visual scene versus data cards

Use images/scenes when they improve comprehension of physical topology or state. Do not place redundant telemetry on the image simply because there is empty space. Prefer a clean scene with a small number of meaningful overlays and structured cards below/around it.

### 5.5 State imagery

For devices with materially different states (car security, vacuum cleaning/charging/return/attention, network active path), use explicit state scenes rather than tinting one generic image when state is otherwise hard to read.

### 5.6 Controls must match semantics

Do not mix “start now” and “automatic setting enabled” in one control group. If a vendor exposes only Stop for a running station function, represent that factual capability rather than inventing a Start action.

---

## 6. Clean code requirements

### 6.1 Separate layers

Recommended frontend separation:

- constants and UI version;
- route/navigation helpers;
- state/domain normalization;
- shell mount;
- view builders;
- targeted live patchers;
- gestures/viewport controller;
- history/statistics loader;
- command handlers;
- formatting helpers.

Backend separation follows HA conventions: manifest/config flow/constants/coordinator/platforms/services/panel registration with minimal cross-module coupling.

### 6.2 Avoid monolithic render functions

A function that constructs the full panel HTML for every `hass` update is a design defect. Rendering should distinguish structural mount from state patch.

### 6.3 One source of version truth

UI/integration/contract/panel manifest/cache key must be coherent. A behavioral frontend change increments UI version and deterministic cache busting. CI must reject version drift.

### 6.4 Generated production bundle

Exactly one shipped autonomous JS entrypoint. Build-time composition is allowed; runtime imports/CDN dependencies are not. CI regenerates/checks the bundle deterministically and fails if tracked output is stale.

### 6.5 No dead compatibility engines

When shell/zoom/navigation is replaced, remove the superseded runtime implementation from the production path. Do not leave multiple active generations behind “for safety”. Historical code may exist only outside runtime or as source history.

### 6.6 Data formatting is centralized

Units, unknown/unavailable handling, precision and labels belong in reusable formatters. Do not scatter special-case string logic through view templates.

### 6.7 Minimal writes

Before setting `textContent`, class, style variable, ARIA attribute or image source, compare with the current value where practical. Avoid layout writes during scroll/gesture loops.

---

## 7. Performance model

Performance is accepted by behavior, not by subjective code compactness.

### 7.1 Startup

Mount Header/loading work surface/Bottom Tab Bar immediately. Large assets may load after shell mount, but the panel must not show a blank white application frame.

### 7.2 Telemetry updates

- coalesce to one animation frame;
- patch only active/affected elements;
- do not remount backgrounds or fixed chrome;
- do not trigger history requests from ordinary live telemetry;
- skip unchanged DOM writes.

### 7.3 Tab switches

Use lazy view cache. Ten consecutive tab switches are a standard regression scenario: no white frames, no shell motion, no duplicate event handlers, no lost zoom controller.

### 7.4 Asset budget

Prefer compressed local assets; WebP is preferred for photographic/scene backgrounds where it materially reduces size. Keep dimensions close to display needs. Do not repeatedly decode high-resolution PNGs for unchanged scenes.

### 7.5 Expensive queries

Recorder, registries and vendor APIs must have explicit single-flight/cache semantics. Never allow a `hass` setter to multiply asynchronous work.

---

## 8. Statistics and Recorder history

History/statistics is an asynchronous subsystem with its own lifecycle.

### 8.1 Source of truth

Use authenticated Home Assistant Recorder/history APIs or integration-owned statistics. Do not depend on Lovelace-only card helpers from a custom panel runtime unless their availability is explicitly guaranteed.

### 8.2 Define grouping semantically

Statistics groups follow physical meaning, not arbitrary entity order. Example validated for power: `До стабилизаторов` → `После стабилизаторов` → `Неотключаемая линия`; exclude generation/export when the installation has none.

### 8.3 Periods are independent cached loads

Each selected period owns a load object. Returning to a previously loaded/in-flight period must reuse it unless the user explicitly presses Refresh.

### 8.4 Partition large requests

One oversized Recorder response can block all graphs. Prefer per-graph or otherwise bounded requests. LIDER validated a concurrency limit of **2** requests, progressive graph rendering and a **60 s terminal timeout per graph**.

### 8.5 Progressive terminal states

Every graph must eventually show exactly one of:

- data;
- no recorded data;
- Recorder unavailable/error.

Indefinite “Loading…” is a defect.

### 8.6 Telemetry isolation

Live `hass` updates must not restart history. Period switching must not invalidate an unrelated in-flight period. Refresh invalidates only the active period.

### 8.7 SVG/downsampling

When autonomous charts are required, limit *rendered points* rather than silently limiting the requested time range. Preserve period semantics, then downsample for display.

### 8.8 Acceptance sequence

At minimum test: `24h → 7d → 24h → 7d`, then 30d/12m. Confirm reused periods do not restart, completed graphs appear progressively, and shell/zoom/live telemetry remain stable.

---

## 9. Navigation experience

Specialized panels are entered from NikaS base panels. The source route is captured explicitly on activation and consumed according to the navigation contract. Do not recalculate a return route on telemetry updates or depend on browser back history.

Safe route precedence must follow the canonical navigation contract and reject invalid cross-origin/unknown routes.

---

## 10. Diagnostics and observability

Every integration should make failures diagnosable without modifying production code.

Include where relevant:

- source/transport;
- last successful update;
- last attempt/error;
- entity IDs actually bound;
- raw HA state/attributes useful for debugging;
- device identifiers/model/firmware if factual;
- polling/update interval;
- integration/UI version.

Diagnostic rendering must not expose secrets/tokens.

---

## 11. Quality gates

A panel/integration is not “ready” because it loads.

### 11.1 Static/CI gates

Required checks should cover:

- Python/JSON/YAML syntax as applicable;
- Home Assistant/Hassfest expectations;
- HACS validation;
- contract/schema checks;
- UI/integration/version parity;
- deterministic production bundle parity;
- production JS syntax;
- no runtime imports/CDN dependencies;
- one shell/viewport;
- stable-DOM guard;
- navigation contract;
- typography envelope;
- forbidden legacy patterns (`history.back()`, routine full `innerHTML`, old fixed-layer topology, etc.).
- host-bound shell geometry and the absence of `100vw` or hard-coded Home Assistant sidebar offsets;
- numeric Header/work/Bottom Nav rectangle parity across the mandatory v2.2 viewport matrix;
- unchanged chrome coordinates during work scroll, overscroll and Home Assistant sidebar toggles.

### 11.2 Dynamic regression gates

Automate where practical:

- multiple repeated `hass` updates do not replace shell nodes;
- tab cache preserves visited subtrees;
- period history calls are single-flight/cached;
- max history concurrency is enforced;
- command duplicate submission is blocked;
- refresh success/error glyphs last 1400 ms, survive telemetry patches and cannot be reset by an old timer during a newer request;
- unknown/unavailable data does not become healthy;
- the two-peer selector keeps the StarLine reference geometry (52px row, 44px independent buttons, 8px gap) and patches status lamps independently of selection.

### 11.3 Real-device acceptance

Primary phone acceptance checks:

- Header fixed under notch/safe area;
- Bottom Tab Bar fixed above Home Indicator;
- native and inertial scroll only inside work viewport;
- short page does not move chrome;
- long page reaches final content;
- ten tab switches without white frame;
- pinch focal behavior;
- two-finger reset;
- synthetic click suppressed after pinch;
- telemetry updates do not flicker;
- images/background do not reflash;
- peer selector geometry and selection/status separation remain identical on phone, tablet and desktop;
- history period switching does not freeze;
- write confirmation and busy/error states behave correctly.

Phone acceptance is followed by tablet portrait/landscape and desktop checks with the Home Assistant sidebar expanded and collapsed. A panel is not shell-complete when only its phone portrait layout has passed.

---

## 12. Publication policy learned from iterations

Preferred flow:

1. branch from current `main`;
2. implement one coherent change set;
3. run local/static/dynamic checks;
4. open PR;
5. require repository checks + integration validation + HACS/Hassfest as applicable;
6. merge only after green CI;
7. no tag/GitHub Release unless explicitly requested;
8. update/install through HACS or project deployment path;
9. perform real-device acceptance;
10. if phone acceptance reveals a gap, document it explicitly rather than declaring the whole change finished.

Do not keep obsolete draft PRs as parallel sources of truth after replacement; close them with a clear reason.

---

## 13. Anti-pattern register

The following patterns are considered known regressions unless a new design proves otherwise:

- full panel redraw from `set hass()`;
- Header/Bottom Tab Bar inside transformed or scrolling content;
- multiple zoom wrappers;
- horizontal scroll at 100%;
- one-finger transform panning at 100%;
- sticky chrome used as a substitute for fixed shell rows;
- meaningful operational text below 12 px;
- generic “Online” when transport/freshness distinction is required;
- status represented by color only;
- refresh silently returning to the arrow without showing its result, or displaying a green check after a failed/partial request;
- a generic page-loading CSS class applied to a Header action and changing its geometry;
- a shared outer pill around peer-device buttons, or selection styling driven by device health;
- missing/unavailable rendered green or as zero;
- guessed entity IDs;
- write controls that claim success before state confirmation;
- automatic writes on every input change for consequential settings;
- history restarted by telemetry;
- a single unbounded Recorder request for all graphs/periods;
- infinite history loading;
- repeated setting of unchanged image `src`;
- runtime import chain/CDN dependency for the production custom panel;
- unsynchronized UI version/cache key/manifest/contract;
- browser `history.back()` as return navigation;
- “fixing” mobile fit by shrinking type or hiding required content.

---

## 14. Definition of Done

A NikaS integration/panel is complete only when all of the following are true:

- factual data contract is explicit;
- command policy is explicit;
- UI v2.2 shell is compliant across the mandatory viewport matrix;
- live updates are incremental and stable;
- startup has no blank application frame;
- mobile scroll/zoom/safe-area behavior is accepted;
- diagnostics explain source and failures;
- statistics/history has bounded requests, cache and terminal states;
- source code and generated bundle are clean and coherent;
- all automated checks are green;
- target-phone acceptance is performed for the changed behavior;
- documentation/knowledge base is updated when a new failure mode or proven pattern is discovered.

---

## 15. Maintenance rule

This is a living file. After each meaningful defect investigation or successful architectural improvement, update one or more of:

- **Lessons learned** — what failed and why;
- **Proven pattern** — the reusable solution;
- **Anti-pattern register** — what must not return;
- **Quality gates** — how recurrence will be detected automatically;
- **Acceptance** — what must be verified on the real device.

A lesson is not considered preserved until it changes either the design rule, the automated check, or the acceptance checklist.
