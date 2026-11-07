# Overview attention and separate filter settings

User requests on 2026-11-07:

- A checked salt stock must not still ask the user to check it now.
- Move filter configuration to a fifth tab, `Настройки`.

## Overview behavior

The top banner contains an action that currently needs attention: missing data,
an approaching or missed replacement deadline, a due/manual low salt inspection,
an exhausted salt estimate, a failed regeneration, or a GH follow-up. Healthy
future maintenance dates are informational and belong on equipment cards.

For a current `ok` salt inspection with positive days remaining, show the next
inspection on the softener card together with the last inspection date. Do not
show this reassuring future message when estimated stock is zero. A missing
estimate remains unknown and does not become zero. Keep all existing warning
priorities and never infer regeneration effectiveness from recording a cycle.

## Navigation and settings

Tab order: `Обзор`, `Фильтры`, `Ёлка`, `Жёсткость`, `Настройки`.
The fifth tab uses `settings` and `mdi:cog-outline`.

Move the existing main-filter and BARRIER configuration sections, including
their shared save action, to `Настройки`. Preserve their control IDs, persisted
schema, validation and optimistic revision checks. Show load/save/error feedback
on the page where the user changes settings. `Фильтры` keeps status, replacement
dates, main-filter meter baseline and replacement actions. Salt and treatment
forms remain in their existing locations.

All views remain mounted. Switching tabs, polling and saving an unrelated form
must preserve an unsaved settings draft and its revision. A conflict or failed
write must be visible and must not discard the draft.

## Delivery constraints

- Version `0.2.0-beta002` throughout integration, UI, manifests and bundle.
- Preserve the canonical NikaS shell, fixed header/footer, scroll and zoom.
- Keep five labels readable at supported phone widths, with text at least 12px.
- Preserve full accessible tab names and canonical ellipsis when narrow widths
  or the host font cannot fit a label; do not shrink text or alter footer geometry.
- Use the existing API and local assets; no persistence/backend data migration.
- Regression checks use synthetic snapshots, never changes to live HA records.
- Browser verification is separate from on-device installation acceptance.
