# Water treatment detail readability

## Request and scope

The user marked three areas in UI 0.2.0-beta005: GH measurements run together;
the relationship between BARRIER inlet hardness and cartridge lifetime is not
clear; the softener model and important filter/salt parameters need emphasis.
This is a focused refinement of the existing five-tab panel.

## Design decisions

- Render each GH measurement as a separate list item: date, sample point,
  prominent drops/°dGH, and the approximate °Ж conversion. Preserve order and
  the original recorded values. Do not infer sample conditions or service work.
- Present WSC-0,5-Rx-(SC) and Runxin F69A3 as a distinct identity block.
  Show salt-check date, next check, and last top-up as labelled values. Keep
  measured/recorded stock separate from estimates based on assumed doses.
- Replace filter prose summaries with labelled date/time and volume metrics.
  Unknown values remain unknown. Resource bars remain estimates.
- Explain the saved BARRIER calculation beside its settings and softening
  cartridge. Verify the official EXPERT Complex table first. Lower GH changes
  only the softening estimate, not Ferrostop/Postcarbon lifetime. Do not infer
  inverse-hardness lifetime or regenerate past cartridge capacity from one
  post-regeneration sample. Keep manual mode available.
- Retain the existing native JavaScript, generated autonomous bundle, Python
  models, and NikaS v2.2 shell. Text/value updates must retain mounted forms,
  focus, drafts, scroll position, and unchanged history nodes.

## Approaches considered

CSS-only wrapping cannot separate records semantically. A full redesign is
unnecessary. The selected implementation is structured list/definition-list
markup with local styling and incremental updates inside existing cards.
These are implementation choices within the user's requested corrections.

## Verification and delivery

Use existing model and panel checks, a targeted browser check on narrow phone
widths in both themes, and an independent review. Prepare beta006 in a feature
branch/PR. Merging main triggers automatic release publication, so keep that
step pending the user's release instruction. Do not mutate live HA settings.
