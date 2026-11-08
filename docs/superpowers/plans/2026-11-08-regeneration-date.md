# Regeneration date — beta007

## Request and design

The user needs to record completed regenerations that happened after cleaning the
softener. The existing shared event date is several screens above the regeneration
form; the salt ledger also rejects an older cycle after a newer stock event.

Add a dedicated, required **Дата регенерации** control at the start of **Полный
цикл завершён**. Default to the HA snapshot date, allow past dates after the last
recorded tank service, and reject future dates. Keep service/removal dates
independent. Polls, navigation and save acknowledgements preserve the date draft;
a local acknowledgement identifies the date actually saved. Measured consumption
and result stay optional and reset after a successful save as before.

For a retrospective cycle, reconstruct the stock from the last recorded service
in event-date order. Use the consumption saved in each existing event, never the
current dose for older entries. Preserve the latest ledger, service, top-up and
manual-check dates. Do not cross the latest service reset or invent an opening
stock. Keep the append-only audit history and operation-id/revision protections.

## Scope and checks

- [x] Regression tests first for the independent date, drafts and validation.
- [x] Regression tests for out-of-order cycles, intervening top-ups/removals,
  zero-clamped estimates, measured underflow, same-day ordering and saved doses.
- [x] Implement UI and retrospective ledger handling; verify persistence/retry.
- [x] Update instructions/version metadata and rebuild the production bundle.
- [x] Run repository checks and production-browser acceptance, including narrow
  screens, focus/drafts and independent review.
- [ ] Prepare commit/PR and record the verified result in the existing knowledge
  base, checking the current revision before saving and reading it back.

No events are entered into the user's live Home Assistant. This feature does not
operate the valve or change its settings. Publication is a separate release step.

Verification checkpoint: 76 Python, 43 form and 31 overview-model tests pass;
all three production-browser suites pass. Independent frontend/backend review
found no blocking issues. Commit/PR delivery and the knowledge-base update are
recorded after this checkpoint rather than asserted in advance.
