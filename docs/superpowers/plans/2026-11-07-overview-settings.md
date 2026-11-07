# Overview attention and filter settings implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove misleading healthy-state reminders and give filter settings their own fifth tab.

**Architecture:** Keep the existing pure overview model and static point-patched views. Move existing filter controls into a persistent settings view without changing their API, validation or revision guards. The two source changes have separate file ownership and can proceed independently.

**Tech Stack:** JavaScript, existing deterministic bundle builder, Node test harnesses, Playwright, Python unittest.

**Spec:** `docs/superpowers/specs/2026-11-07-overview-settings-design.md`

## Global Constraints

- Version `0.2.0-beta002` throughout integration, UI, manifests and bundle.
- Preserve the canonical NikaS shell, fixed header/footer, scroll and zoom.
- Keep five labels readable at supported phone widths, with text at least 12px.
- Use the existing API and local assets; no persistence/backend data migration.
- Regression checks use synthetic snapshots, never changes to live HA records.
- Browser verification is separate from on-device installation acceptance.

## Review Focus

- A positive manual check with twelve days remaining removes the action banner but preserves a visible future date (Task 1).
- An estimated zero balance still prompts inspection after a recent manual check (Task 1).
- A failed read/disconnect clears future reassurance and recovery restores it (Tasks 1 and 3).
- Settings edits survive navigation and remote refresh, while conflicts remain visible beside the save action (Tasks 2 and 3).
- Five tabs retain full accessible names and the canonical narrow-width ellipsis without shrinking text or changing footer geometry (Task 3).

---

### Task 1: Attention-only overview and future salt check on the card

**Files:** `frontend/src/overview-model.js`, `frontend/src/overview-ui.js` under `custom_components/water_treatment/`; `tests/overview_model.mjs`.

**Interfaces:** `waterOverviewModel(snapshot, options)` adds `softener.nextSaltCheck: string`; empty string means hidden. `paintWaterOverview(panel)` patches a persistent `[data-overview-salt-next-check]` node.

- [x] Add regression assertions: healthy snapshot with salt days 12 has `notice === null` and a next-check string containing `12`; zero estimate retains a check notice and no future check string; failed/disconnected data clears it.
- [x] Run `node tests/overview_model.mjs`; verify the new healthy-salt regression fails for the existing banner behavior.
- [x] Remove priority-10 future-maintenance banner candidates. Populate and paint the future salt check on the existing card; keep current warnings and dates intact.
- [x] Run `node tests/overview_model.mjs`; all old warnings and revised healthy-state expectations pass.

### Task 2: Separate filter settings tab

**Files:** `frontend/src/water-treatment-panel-core.js` under `custom_components/water_treatment/`; `tests/treatment_split_harness.mjs`, `tests/filter_ui_harness.mjs`.

**Interfaces:** Add `settings` / `mdi:cog-outline` / `Настройки` to default tabs. Add `_settingsMarkup()` and route `_viewMarkup('settings')` to it. Preserve all `WATER_FILTER_SETTING_IDS`, action `settings`, payload and revision behavior. Use a distinct settings status node to avoid a duplicate first-match-only message selector.

- [x] Add tests for five-tab order, settings controls occurring only in settings markup, nearby save/load errors and dirty revision preservation.
- [x] Run the relevant harnesses to establish the new behavior fails before implementation.
- [x] Move configuration sections and their save action to the new persistent view; update status routing and load feedback for that view.
- [x] Run both harnesses; all form validation and concurrency tests pass.

### Task 3: Production bundle, browser acceptance and delivery metadata

**Files:** `tests/overview_browser.mjs`, `tests/test_contract.py`, `custom_components/water_treatment/panel.py`, version manifests/constants/build header, `preview/ha-icon.js`, `README.md`, `CHANGELOG.md`, `docs/PANEL.md`, `docs/RELEASES.md`, compliance notes and generated bundle.

**Interfaces:** Browser checks load the built bundle with the actual tabs extracted from `PANEL_METADATA` in `panel.py` and stub only HA API boundaries, with synthetic settings writes explicitly acknowledged by the fixture. Python contract checks pin the registered tabs to the declared five-tab contract.

- [x] Extend browser scenarios for checked salt/no current banner, future check text, actual settings navigation/save/error feedback and draft preservation.
- [x] Synchronize five-tab metadata and version `0.2.0-beta002`; document changed behavior and prepared, not yet published, release state.
- [x] Run `npm run build`, `npm run check`, and `OVERVIEW_BROWSER_PATH=/workspace/scratch/a3e1ea255a1b/browser-runtime/bin/chromium npm run check:browser`.
- [x] Inspect mobile screenshots and measured tab label bounds at 320/390/430px and the existing full viewport matrix. Resolve only observed layout regressions.
- [x] Obtain a bounded independent code review, resolve substantive findings and rerun affected checks.
- [x] Commit the verified change, publish a branch/PR with the same Git tree, and report exact CI and release status.

## Completion evidence

All local checks and production-bundle browser scenarios passed, including the
regression that reads the actual HA registration tabs. Independent source/test
review found no blocking issues. PR #3 contains the change; both Repository checks
and Integration validation passed on its implementation commit. The final
verification record changes documentation only. Beta002 remains unpublished.
