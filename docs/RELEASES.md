# Publication state

Published baseline: [0.2.0-beta003](https://github.com/NikaSir/ha-water-treatment/releases/tag/0.2.0-beta003), published on 2026-11-07. Its tag targets merged `main` commit `e94868fe1e07727597b2bfd3fa6da94e2373927c`.

Prepared version: `0.2.0-beta004`, declared in `custom_components/water_treatment/manifest.json`. This version is not yet published; this change does not create its release or tag.

Beta004 adds an individual remaining-calendar-resource bar to each BARRIER stage in Overview, using the main-filter bar style. Each percentage uses its saved replacement date and backend deadline/days; each color follows that stage's state. Missing data remains unknown, due/overdue resource is zero, and failed reads or disconnection clear stale percentages. The existing regeneration-entry form and journal behavior are unchanged.

Published beta003 removed the large introductory card and duplicate reload button from Filters, moved explanations to Settings, placed replacement feedback beside the relevant cartridge, and unified the integration/sidebar filter icon.

After merge, publish a release/tag matching the manifest exactly, validate HACS, and verify actual installation separately. The old accounting repository's commit-based delivery observation does not establish delivery for this repository.

## Verification record

Local beta004 checks passed on 2026-11-07: 30 overview-model tests, 35 form tests and 51 Python tests, plus the tab/identity contract, deterministic bundle and NikaS standard check. Model checks cover independent calendar intervals, short/leap and fractional months, full/zero/overdue resource, missing dates and unavailable snapshots. Chromium acceptance of the production bundle passed all seven phone/tablet/desktop viewports in both themes; it also verified four independent bars, per-stage colors, known zero versus unknown values, failure/disconnect clearing and recovery without remounting the resource nodes. Existing navigation, draft, save/conflict and local-feedback checks passed. The 430px BARRIER card preview was visually inspected. Independent source review found no blocking issues.

The results below document the published baseline and earlier releases.

Local beta003 checks passed on 2026-11-07: 26 overview-model tests, 35 form tests and 51 Python tests, plus the tab/identity contract, deterministic bundle and NikaS standard check. Chromium acceptance of the production bundle passed the existing seven-viewport/dark-light matrix and additionally checked Filters at 320/390/430px in both themes. Filters starts with the main cartridge; replacement validation, failed save, healthy poll and successful retry keep feedback beside the affected form; a recovered read error clears the compact notice. Editing a saved date clears its previous acknowledgement; an edit during a pending save remains a draft and receives a qualified acknowledgement. The PNG was inspected and verified as a 256×256 RGBA export matching its SVG and the native sidebar glyph.

The beta002 results below are historical checks of an earlier release.

Local beta002 checks passed on 2026-11-07: 26 overview-model tests, 31 form tests, 51 Python tests, tab/identity contract, deterministic bundle and the NikaS standard check. The production bundle also passed Chromium browser checks across seven phone/tablet/desktop viewports (320×640 through 1440×900), dark/light themes, navigation, read failure/recovery and draft preservation. The Settings page submits the original payload/revision, keeps drafts after failed writes/conflicts, and displays feedback beside Save. Recording a sufficient salt check removes the banner and displays the next inspection on the softener card.

Browser checks use synthetic API snapshots. Real Home Assistant cold-load, Nabu Casa access, installation/restart, live readings and physical iPhone acceptance remain separate gates; desktop browser emulation does not establish those results.
