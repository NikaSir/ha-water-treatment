# NikaS Specialized Panel Frontend Delivery Standard v1.8

**Status:** required for every integration-owned Home Assistant specialized panel
**UI authority:** [`NIKAS_SPECIALIZED_PANEL_UI_STANDARD.md`](NIKAS_SPECIALIZED_PANEL_UI_STANDARD.md) v2.2
**HACS publication companion:** [`NIKAS_HACS_PUBLICATION_CONTRACT.md`](NIKAS_HACS_PUBLICATION_CONTRACT.md) v1.0

## Production artifact

One registered panel module equals one autonomous, integration-owned JavaScript bundle. The `module_url` target contains all project code needed to register and run the current panel. Runtime imports of previous panel versions or another NikaS repository are prohibited.

Modular development is allowed, but the build must produce one deterministic artifact with cache busting tied to the declared UI version. History belongs in reviewed Git commits and merged pull requests, not in browser import chains.

## Fixed shell acceptance

The production bundle must implement the NikaS UI v2.2 application shell:

- fixed Home Assistant menu Header, optional fixed peer-device selector, exactly one work viewport/canvas and fixed safe-area-aware Bottom Tab Bar;
- permanent left `mdi:menu` action dispatching bubbling/composed `hass-toggle-menu`; no permanent Header Back;
- centered two-line semantic title button with panel name plus version-only `UI vX.Y.Z`, visible focus/pressed states and validated return to the originating NikaS base panel;
- native vertical scrolling with `x = y = 0` at 100%, focal pinch at 75–200%, bounded one-finger pan only above 100%, 97–103% snap and stationary two-finger reset;
- shell mounted once, telemetry point-patched, visited views lazily cached and no full-screen flash;
- meaningful text at 12–25px and Bottom Tab Bar MDI icons/labels at 26px and 12px/700;
- optional connection/freshness indicator only when explicitly requested, using the canonical NikaS UI v2.2 vocabulary and status-tinted plaque;
- packaged repository/integration identity including `custom_components/<domain>/brand/icon.png`, minimum 256×256 RGBA.

## Required verification

Before merge, verify:

1. local-network and Home Assistant Cloud/Nabu Casa cold loads;
2. full Home Assistant restart followed by repeated panel opens;
3. no `Unable to load custom panel` or `Configuration error`;
4. no historical/runtime bundle chain;
5. Header menu, Refresh plaque, safe areas and fixed bottom navigation;
6. long native scrolling at 100% without horizontal or transform drift;
7. focal pinch, axis-bounded pan, snap/reset and native long-press/more-info behavior;
8. live telemetry, indicator transitions, tab/device changes and scroll without white frames or remount flicker;
9. JavaScript syntax, deterministic build, version/cache-busting consistency and repository CI;
10. real iPhone portrait acceptance.

## Publication workflow

Changes receive an explicit UI/integration version where applicable, a changelog entry and automated checks. NikaS work is reviewed and accepted through commits, branches, pull requests and the authoritative `main` state.

`main` is the code authority, but **it is not automatically the HACS delivery boundary**. For every integration distributed through HACS, the repository declares and tests its actual delivery mechanism.

For a release-driven HACS integration:

1. merge only after required PR checks pass;
2. read the integration version only from `custom_components/<domain>/manifest.json`;
3. after merge, create an exact matching GitHub Release/tag if one does not already exist;
4. the release targets the merged `main` commit containing that manifest version;
5. publication is idempotent and uses no custom release assets unless the repository explicitly requires them;
6. verify HACS validation and confirm that repository refresh exposes the same version as installable;
7. after installation/restart, verify the Home Assistant integration version and matching visible panel UI version.

A merged version without its required HACS-visible Release is **accepted code but not delivered software**. Do not report it to the user as available for update.

If HACS rejects a branch/commit installation path such as `version: main`, that path is considered unsupported for that repository until separately verified; repair the supported publication mechanism instead of asking the user to repeat the failed action.

The exact required behavior, failure modes, permissions and regression cases are defined by [NikaS HACS Publication Contract v1.0](NIKAS_HACS_PUBLICATION_CONTRACT.md), which supersedes the older blanket rule that GitHub Releases are never used for HACS-delivered integrations.
