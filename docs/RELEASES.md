# Publication state

Published baseline: `0.2.0-beta001`.

Prepared version: `0.2.0-beta002`, declared in `custom_components/water_treatment/manifest.json`. This version is not yet published; this change does not create its release or tag.

Beta002 limits the Overview banner to conditions needing attention now, places the next routine salt inspection on the softener card, and moves main-filter/BARRIER configuration to the fifth Settings tab. Settings feedback stays beside the forms, and unsaved drafts and their revisions survive navigation, polling, unrelated saves, conflicts and failed writes.

After merge, publish a release/tag matching the manifest exactly, validate HACS, and verify actual installation separately. The old accounting repository's commit-based delivery observation does not establish delivery for this repository.

Local beta002 checks passed on 2026-11-07: 26 overview-model tests, 31 form tests, 51 Python tests, tab/identity contract, deterministic bundle and the NikaS standard check. The production bundle also passed Chromium browser checks across seven phone/tablet/desktop viewports (320×640 through 1440×900), dark/light themes, navigation, read failure/recovery and draft preservation. The new Settings page submits the original payload/revision, keeps drafts after failed writes/conflicts, and displays feedback beside Save. Recording a sufficient salt check removes the banner and displays the next inspection on the softener card.

Browser checks use synthetic API snapshots. Real Home Assistant cold-load, Nabu Casa access, installation/restart, live readings and physical iPhone acceptance remain separate gates; desktop browser emulation does not establish those results.
