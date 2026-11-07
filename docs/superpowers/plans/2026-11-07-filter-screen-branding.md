# Filter screen and branding implementation

1. In an isolated branch from beta002, remove the Filters introduction and move relevant explanatory copy to Settings.
2. Keep compact read feedback and route replacement validation/save results to their own cartridge cards. Verify that polling clears recovered read errors without hiding a failed save.
3. Replace the mismatched water-meter brand assets with one SVG-derived native filter mark and use the matching sidebar icon. Record upstream attribution and inspect the PNG on light/dark backgrounds.
4. Synchronize beta003 metadata and document beta002 as the published baseline.
5. Rebuild the production bundle; run repository checks and browser acceptance against the real bundle with a synthetic HA API. Inspect narrow-screen Filters and relevant form/error behavior, then review the patch and prepare a PR.

The user-visible result is a maintenance screen starting with the main filter, useful context in Settings, and a consistent application identity. Publication and installed-HA acceptance are reported only when separately performed.
