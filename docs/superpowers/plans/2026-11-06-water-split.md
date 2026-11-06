# Water split implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate water metering and water treatment without losing persisted maintenance records.

**Architecture:** Independent HA domains, routes, bundles and APIs. One-time guarded import of the existing maintenance store; direct read-only access to the drinking-water meter.

**Tech Stack:** Existing Python HA adapters and dependency-free JavaScript/Shell v2.2.

**Spec:** `docs/superpowers/specs/2026-11-06-water-split-design.md`.

## Global Constraints

- Preserve all existing measured/configured/assumed distinctions and calculations.
- Keep source `water_accounting.filters` untouched; persist target before exposing it.
- No live HA changes, merges or releases during preparation.
- Accounting `0.3.0-beta001`, treatment `0.1.0-beta001`.

## Review Focus

- Both installation/startup orders, old active writer and reimport after restart.
- Broken source/target envelope or disk failure must not create a blank journal.
- Lazy tab mounting and background reads must preserve new input drafts.
- Missing water meter means unknown volume remaining, not zero use.
- Cross-device setting conflicts and non-admin writes remain rejected.

### Task 1: Independent treatment persistence

- [x] Add migration tests first, including repeated startup, corruption, write failure and writer handoff.
- [x] Run the tests and confirm failure before implementing the loader.
- [x] Extract unchanged calculation modules and persistence adapter into `custom_components/water_treatment/`; add guarded import.
- [x] Run the migration tests and the existing calculation/persistence suite.

### Task 2: Split frontend and accounting runtime

- [x] Add tests proving treatment works from all three tabs and accounting no longer exposes treatment API/code.
- [x] Run and observe failures.
- [x] Extract shell + maintenance methods into a separate treatment bundle, remove them from accounting, retain original metering/Recorder logic.
- [x] Keep separate manifests, domains, local-storage namespaces, navigation and deterministic builds; mark accounting handoff ready on setup.
- [x] Run both package checks and inspect preview layout where browser tooling permits.

### Task 3: Review and publication preparation

- [ ] Document exact migration order, backup, current archive and rollback limits.
- [ ] Obtain fresh whole-change review, address material findings and run relevant checks.
- [ ] Create public `NikaSir/ha-water-treatment`, publish a review branch/PR and open the accounting PR. Verify CI on the current commits.
- [ ] Record confirmed state and pending installation separately in the existing NikaS knowledge base.
