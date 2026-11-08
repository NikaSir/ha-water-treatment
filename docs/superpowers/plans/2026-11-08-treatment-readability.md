# Water treatment readability implementation plan

> **For agentic workers:** Use superpowers:executing-plans or
> superpowers:subagent-driven-development for scoped implementation and review.

**Goal:** Make the marked GH, softener, filter and hardness areas understandable
on a phone without changing recorded maintenance events.

**Architecture:** Existing Python calculation models feed the same authenticated
snapshot. Native JavaScript renders structured, incrementally updated detail
blocks in the existing shell; no runtime dependencies or hardware commands.

**Tech Stack:** Python, JavaScript/CSS, unittest, Node harnesses, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-08-treatment-readability-design.md`

## Global constraints

- NikaS UI Standard v2.2; fixed Header and Bottom Tab Bar; one scrolling work area.
- Preserve recorded GH, salt and cartridge dates, revision/operation guards,
  user drafts, unknown states and distinction between facts and assumptions.
- Verify manufacturer table against official EXPERT Complex documentation.
- No live Home Assistant writes and no merge/release without release instruction.

## Review focus

- Narrow phones, long Russian labels, light/dark contrast, and date-input width.
- Polling must not recreate unchanged records, reset scroll, or lose form drafts.
- GH boundary values and input units must not promise unverified longer lifetime.
- Missing/invalid hardness and household counts outside the table stay explicit.
- Manual mode and other cartridge intervals remain independent of GH changes.

### Task 1: Structured GH, filter and softener details

**Files:** frontend/src/treatment-ui.js, frontend/src/water-treatment-panel-core.js,
frontend/src/styles.css; targeted browser checks under tests/.

**Interfaces:** Existing `settings`, `status`, `salt_status`, `treatment_status`.
Render labelled values and separate measurements without replacing forms.

- [x] Replace GH concatenation with an ordered list of distinct records.
- [x] Add device identity and labelled salt/filter metrics, with honest units.
- [x] Verify layout and stable DOM updates in the production bundle.

### Task 2: Explain BARRIER hardness calculation

**Files:** filter_model.py, filters.py, tests/test_filters.py,
tests/test_filter_store.py; calculation explanation in frontend/src/.

**Interfaces:** Add a read-only `softening_basis` snapshot for saved calculation
inputs, table band/months, applied months, limits, and reason codes. The Python
model remains the authority; the UI does not duplicate the lifetime formula.

- [x] Verify the official table and document its bounds and chosen policy.
- [x] Test saved 0.7132/1.4264 °Ж for three users, threshold cases, missing
  hardness, unsupported households, manual mode and unchanged other cartridges.
- [x] Add calculation basis and explanatory UI; preserve persisted settings.

### Task 3: Verify and prepare reviewable beta006

**Files:** version metadata, generated bundle, CHANGELOG.md, README.md as needed.

- [x] Synchronize beta006 version identifiers and build production bundle.
- [x] Run `npm run check`, browser acceptance and a focused independent review.
- [ ] Commit/push the feature branch and open PR; inspect CI without merging.
- [ ] Append verified result to the existing project knowledge base with version
  guard and read-back, distinguishing prepared, published and installed states.

Implementation checkpoint before PR creation: 61 Python, 41 form and 30
overview-model tests pass; both production-browser suites pass. Independent
review findings were fixed and rechecked. The final two delivery steps are
recorded in the PR and the project knowledge base after this commit is made.
