# Publication state

Published baseline, checked on 2026-11-08: [0.2.0-beta005](https://github.com/NikaSir/ha-water-treatment/releases/tag/0.2.0-beta005), published at 07:50:39 UTC. Its tag targets merged `main` commit `8dfc9f82113bf48611efb4be4caff81395ee3d32`.

Prepared version: `0.2.0-beta006`, declared in `custom_components/water_treatment/manifest.json`. This branch prepares the changes for review; no release/tag or live HA installation is performed here.

Beta006 separates GH samples and equipment/filter metrics into readable labelled blocks. It explains the saved BARRIER softening interval using a read-only backend calculation basis. The existing manufacturer table remains unchanged: for three people both 0.7132 and 1.4264 °Ж map to two months. Automatic mode no longer requests a manual interval; dates, journals and other cartridge intervals are preserved.

Published beta004 added individual BARRIER resource bars; beta005 added durable journal retry IDs, readable errors and explicit archived cleanup of earlier exact salt-record duplicates.

Merging the version change into `main` triggers `.github/workflows/publish.yml`, which validates and publishes a matching release automatically. Merge/publication therefore requires the user's release instruction. HACS validation and actual installation are separate evidence; this branch alone is not an update delivered to a device.

## Verification record

### Beta006 — 2026-11-08

`npm run check` passes: 61 Python tests, 41 form tests, 30 overview-model tests,
the tab/identity contract, deterministic bundle and NikaS standard check.
The added model/store coverage verifies the two measured low-hardness examples,
exact table boundaries, the existing six-month cap, missing/out-of-range inputs,
manual mode and unchanged cartridge dates/intervals.

Chromium acceptance uses the production bundle with synthetic API snapshots.
The existing seven-size, light/dark overview matrix passes. A focused second
suite covers all four detail pages at 320/390/430px in both themes, separate
same-day GH records, saved metrics and unknown values, intact displayed dates,
date-input width, automatic/manual interval controls, and failure/recovery.
The manual interval draft is hidden in automatic mode and restored on return;
saved hardness retains four-digit precision around table boundaries, and an
unverified inherited salt dose remains explicitly labelled.
Identical polling preserves DOM nodes, focus, nonzero scroll and form drafts.
The GH, equipment, profile, stock and calculation-basis screenshots were
visually inspected. These local results do not establish live HA or physical
iPhone acceptance.

Independent source review found one mode-switch display inconsistency and two
precision/wording issues. All three were reproduced, corrected and covered by
regression assertions; focused follow-up review found no blocking issues.

### Earlier verification records

Local beta004 checks passed on 2026-11-07: 30 overview-model tests, 35 form tests and 51 Python tests, plus the tab/identity contract, deterministic bundle and NikaS standard check. Model checks cover independent calendar intervals, short/leap and fractional months, full/zero/overdue resource, missing dates and unavailable snapshots. Chromium acceptance of the production bundle passed all seven phone/tablet/desktop viewports in both themes; it also verified four independent bars, per-stage colors, known zero versus unknown values, failure/disconnect clearing and recovery without remounting the resource nodes. Existing navigation, draft, save/conflict and local-feedback checks passed. The 430px BARRIER card preview was visually inspected. Independent source review found no blocking issues.

The results below document the published baseline and earlier releases.

Local beta003 checks passed on 2026-11-07: 26 overview-model tests, 35 form tests and 51 Python tests, plus the tab/identity contract, deterministic bundle and NikaS standard check. Chromium acceptance of the production bundle passed the existing seven-viewport/dark-light matrix and additionally checked Filters at 320/390/430px in both themes. Filters starts with the main cartridge; replacement validation, failed save, healthy poll and successful retry keep feedback beside the affected form; a recovered read error clears the compact notice. Editing a saved date clears its previous acknowledgement; an edit during a pending save remains a draft and receives a qualified acknowledgement. The PNG was inspected and verified as a 256×256 RGBA export matching its SVG and the native sidebar glyph.

The beta002 results below are historical checks of an earlier release.

Local beta002 checks passed on 2026-11-07: 26 overview-model tests, 31 form tests, 51 Python tests, tab/identity contract, deterministic bundle and the NikaS standard check. The production bundle also passed Chromium browser checks across seven phone/tablet/desktop viewports (320×640 through 1440×900), dark/light themes, navigation, read failure/recovery and draft preservation. The Settings page submits the original payload/revision, keeps drafts after failed writes/conflicts, and displays feedback beside Save. Recording a sufficient salt check removes the banner and displays the next inspection on the softener card.

Browser checks use synthetic API snapshots. Real Home Assistant cold-load, Nabu Casa access, installation/restart, live readings and physical iPhone acceptance remain separate gates; desktop browser emulation does not establish those results.

## Beta005 verification — 2026-11-08 (historical preparation record)

Added readable structured WebSocket errors, recovery of per-form read-error notices, durable operation IDs for retry safety, and explicit archived cleanup of exact old salt-ledger duplicates. The cleanup leaves current balances and later top-ups unchanged; no live journal was edited.

Full `npm run check` passed locally at preparation time. Regression coverage includes retry after backend restart, concurrent retries, retry after disk failure, panel recreation after a lost response, structured errors, recovery, and archival cleanup without changing balances. Browser acceptance could not launch in that preparation runtime because Chromium was unavailable. No release/tag had been created at that point; subsequent publication is recorded at the top of this file. Live HA/iPhone acceptance remains separate.
