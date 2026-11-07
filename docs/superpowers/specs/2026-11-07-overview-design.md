# Water treatment overview — approved design

Approved by the user on 2026-11-07 after reviewing the mobile sketch: “Отлично. Делай.”

## Intent

Make `Обзор` the first tab of the existing NikaS Water Treatment panel. It shows
the three treatment units, their recorded maintenance state and the next useful
action without opening three different pages.

## Composition

- Preserve the existing NikaS shell, menu, full UI version, refresh control,
  return route, native work-area scrolling, safe areas and pinch/reset behavior.
- Four tabs: `Обзор`, `Фильтры`, `Ёлка`, `Жёсткость`.
- Compact heading, an action banner when needed, then three vertical cards.
- Main filter: recognizable blue/white housing, volume since replacement,
  remaining resource and the configured time/volume rule.
- Softener: cabinet illustration, last recorded regeneration, explicitly
  estimated salt stock and a dated GH measurement from the softener outlet.
- BARRIER: three cartridges and an individual replacement deadline for each.
- Card taps open the corresponding existing detail page; filter cards go to
  their section. The action banner goes to the page that can resolve it.
- Respect Home Assistant light/dark themes. The accepted dark sketch guides
  card composition; the canonical shell remains authoritative.

## Data and behavior

- Consume `water_treatment/filters`; reuse backend filter and salt statuses.
- Never put sketch dates, example values or physical-device state into code.
- Keep missing values distinct from zero; a missing salt baseline stays unknown.
- A low/empty manual salt check, an explicitly failed regeneration and a due
  cartridge need attention. Unknown data never means normal operation.
- Show the newest `softener` GH record from the complete journal; records from
  the inlet or BARRIER cannot stand in for it. Same-day records retain append order.
- A completed recorded cycle is not proof of successful softening. Same-day GH
  cannot establish whether the test preceded or followed a cycle.
- No automatic regeneration countdown or new chemical threshold is introduced.
- A failed read clears overview success states and values. Subsequent success
  restores them without replacing cards, navigation or images.
- No changes to persistence, migration, water accounting or physical controls.

## Implementation decisions

Use a small pure overview model plus separate static markup/point-painting code,
both included in the existing deterministic bundle. Ship three transparent
raster illustrations locally with a versioned URL. Version: `0.2.0-beta001`.

## Acceptance

Exercise configured, empty, unknown, expired, zero-resource, failed read and
recovery scenarios. Verify actual production markup at phone widths 320, 390 and
430, dark/light themes, tab/card navigation, fixed shell, preserved scroll/focus,
and the original journal editing tests. A browser harness is not on-device HA
acceptance; installation/restart and physical iPhone checks remain separate.
