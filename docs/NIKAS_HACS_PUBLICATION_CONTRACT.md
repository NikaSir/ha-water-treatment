# NikaS HACS Publication Contract v1.0

**Status:** REQUIRED companion to NikaS Specialized Panel UI Standard v2.2  
**Canonical source:** `NikaSir/ha-contract-generated-ui`  
**Applies to:** every NikaS custom integration distributed to the user through HACS  
**Supersedes:** the sentence in NikaS UI Standard v2.2 section 15 that GitHub Releases are not used, but only for repositories whose HACS delivery depends on release versions  
**Approved:** 2026-09-07  
**Machine contract:** `.nikas-ui-standard.json` → `hacs_publication`

## Why this rule exists

HO-SC-8W reached `main` at integration `1.0.0-b006.31` / UI `0.7.10`, while HACS still offered only `1.0.0-b006.29`. The release automation had been removed, so the latest GitHub Release remained `.29`. Installing `main` through `update.install` was then rejected by HACS for that integration. After restoring a minimal release workflow, HACS exposed `.31` correctly.

Therefore, for a release-driven HACS repository, merge to `main` is code publication but is **not** user delivery. A version is considered delivered only when the HACS-visible release exists.

## Mandatory publication model

### HACS-01 — One source of version truth

The integration version is read from `custom_components/<domain>/manifest.json`. Release automation must not invent, transform or independently increment the version.

### HACS-02 — Release is the delivery boundary

If HACS exposes installable versions from GitHub Releases, every version intended for users must have a GitHub Release/tag with the exact same version string as `manifest.json`. `main` alone is not an installable release and must not be described as already delivered.

A repository may use a different HACS-supported delivery mechanism only when that mechanism has been verified on the target installation and is recorded explicitly in the repository contract.

### HACS-03 — Publication runs after merge

The normal sequence is:

1. PR CI passes;
2. PR is merged to `main`;
3. publication workflow reads the merged `manifest.json`;
4. if the matching release/tag does not exist, it creates exactly one release;
5. if it already exists, the workflow exits successfully without a duplicate.

The release must target the merged `main` commit that contains the declared version.

### HACS-04 — Minimal release surface

For NikaS custom integrations, a HACS delivery Release is a transport marker, not a second development process. By default it contains no uploaded assets and does not modify integration code. GitHub-generated source archives are sufficient unless a repository documents another requirement.

### HACS-05 — No skipped user versions

A merged version may be intentionally skipped only before it is presented as delivered. If `.30` and `.31` are both merged before publication and `.31` supersedes `.30`, publishing only `.31` is allowed when `.31` contains all `.30` changes. The changelog/release notes must make that traceable.

### HACS-06 — Verification after publication

After release creation, verify all of the following:

- GitHub latest Release/tag equals the version in `manifest.json`;
- the Release targets a commit containing that same manifest version;
- HACS validation passes;
- after HACS repository data refresh, the same version appears as installable;
- after install/restart, Home Assistant reports the integration version and the panel displays its matching UI version.

Until these checks pass, publication status is `GAP` / `not delivered`, not success.

### HACS-07 — Idempotence and permissions

The release workflow is idempotent. Re-running it for an already published version must not create a second tag or release. `contents: write` is granted only to the publication job/workflow that needs it; normal CI remains read-only.

### HACS-08 — HACS failure modes are explicit

If HACS rejects a branch name such as `main` as a version, do not instruct the user to retry the same path. Record the observed failure, restore/repair the supported publication mechanism, and retest delivery end to end.

## Required repository checks

For a release-driven HACS integration, repository automation must verify:

| Case | Required assertion |
|---|---|
| `manifest_version` | `manifest.json` contains a non-empty version string. |
| `release_exact_match` | Intended HACS release/tag equals the manifest version exactly. |
| `release_target` | Release/tag points to a commit containing that manifest version. |
| `idempotent_publish` | Existing release causes success/no-op, not duplicate creation. |
| `hacs_validation` | HACS repository validation succeeds. |
| `no_release_assets_by_default` | No custom assets are required unless repository policy explicitly says so. |
| `delivery_acceptance` | HACS refresh exposes the release and installed Home Assistant reports it after restart. |

The first six can be automated in repository/GitHub CI. `delivery_acceptance` is a real HACS/Home Assistant acceptance step and cannot be replaced by a GitHub-only test.

## Relationship to `main`

`main` remains the authoritative code branch and merge target. Releases do not replace PR review, CI or version history. They only expose an already accepted `main` state to HACS when HACS requires release versions.

Thus:

- **merged to `main`** = code accepted;
- **matching Release exists** = version published to HACS channel;
- **HACS exposes and installs it** = version delivered;
- **device/phone acceptance passes** = version accepted in operation.

These states must not be conflated.
