# Publication state

Published baseline: [0.2.0-beta002](https://github.com/NikaSir/ha-water-treatment/releases/tag/0.2.0-beta002), published on 2026-11-07. Its tag targets merged `main` commit `cd416fe5548adcc929092d0db68614ec2bfea5d5`.

Prepared version: `0.2.0-beta003`, declared in `custom_components/water_treatment/manifest.json`. This version is not yet published; this change does not create its release or tag.

Beta003 removes the large introductory card and duplicate reload button from Filters. Meter and profile explanations move to Settings. Healthy reads do not add a permanent message above the filter cards; replacement feedback stays beside the relevant cartridge, and read errors remain visible. A blue filter icon replaces the old water-meter image and matches the panel's native `mdi:filter-outline` sidebar symbol.

After merge, publish a release/tag matching the manifest exactly, validate HACS, and verify actual installation separately. The old accounting repository's commit-based delivery observation does not establish delivery for this repository.

## Verification record

Local beta003 checks passed on 2026-11-07: 26 overview-model tests, 35 form tests and 51 Python tests, plus the tab/identity contract, deterministic bundle and NikaS standard check. Chromium acceptance of the production bundle passed the existing seven-viewport/dark-light matrix and additionally checked Filters at 320/390/430px in both themes. Filters starts with the main cartridge; replacement validation, failed save, healthy poll and successful retry keep feedback beside the affected form; a recovered read error clears the compact notice. Editing a saved date clears its previous acknowledgement; an edit during a pending save remains a draft and receives a qualified acknowledgement. The PNG was inspected and verified as a 256×256 RGBA export matching its SVG and the native sidebar glyph.

The beta002 results below describe the published baseline.

Local beta002 checks passed on 2026-11-07: 26 overview-model tests, 31 form tests, 51 Python tests, tab/identity contract, deterministic bundle and the NikaS standard check. The production bundle also passed Chromium browser checks across seven phone/tablet/desktop viewports (320×640 through 1440×900), dark/light themes, navigation, read failure/recovery and draft preservation. The Settings page submits the original payload/revision, keeps drafts after failed writes/conflicts, and displays feedback beside Save. Recording a sufficient salt check removes the banner and displays the next inspection on the softener card.

Browser checks use synthetic API snapshots. Real Home Assistant cold-load, Nabu Casa access, installation/restart, live readings and physical iPhone acceptance remain separate gates; desktop browser emulation does not establish those results.
