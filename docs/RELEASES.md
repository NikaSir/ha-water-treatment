# Publication state

Prepared version: `0.2.0-beta001`, declared in `custom_components/water_treatment/manifest.json`.

This version adds the Overview tab. Its PR includes local model, integration-contract and browser verification. No release or target HACS install is claimed by that PR. After merge, publish a release/tag matching the manifest exactly, validate HACS, and verify actual installation separately. The old accounting repository's commit-based delivery observation does not establish delivery for this repository.

Browser checks exercise the generated bundle with synthetic API snapshots in Chromium across seven phone/tablet/desktop viewports (320×640 through 1440×900), dark/light themes, navigation, failure/recovery and form-draft preservation. Real Home Assistant installation/restart, live readings and physical iPhone acceptance remain separate gates; desktop browser emulation does not establish those results.
