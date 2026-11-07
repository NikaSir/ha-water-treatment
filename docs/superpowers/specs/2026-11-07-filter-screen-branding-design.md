# Filter screen and application identity

The installed beta002 screenshot shows a large introductory card above the filter controls. The user asks whether it is necessary and suggests changing both the integration and panel icons.

## Small change

Open Filters directly on the maintenance cards. Move the drinking-meter scope and profile-identification notes into Settings. Use the existing header Refresh action. Successful background reads should leave no permanent success notice on Filters; loading/read failures remain visible, and validation/save results appear beside the affected cartridge.

Use one native `mdi:filter-outline` silhouette for the sidebar and the integration brand. The integration has a blue rounded tile with a white glyph, exported from its committed SVG to the required 256×256 RGBA PNG. The old PNG depicts a water meter and does not match its SVG.

## Approaches

- Keeping or collapsing the introduction still consumes space on the maintenance screen. Moving its useful context to Settings matches the separation already requested by the user.
- A custom composite icon would need an additional HA icon-loading mechanism. A native filter icon is recognizable at small sizes and already supported by this project. This is the implementation choice, not a separately approved user design.

Keep the canonical shell, five tabs, calculation models, data schema, write permissions, conflict detection and draft preservation. No live journal writes or HA installation are part of this change. Prepare beta003 for review; do not represent it as published.
