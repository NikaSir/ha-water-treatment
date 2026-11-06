#!/usr/bin/env python3
"""Fail CI when a repository drifts from the mandatory NikaS UI contract."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / ".nikas-ui-standard.json"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def read_relative(path: str) -> str:
    target = ROOT / path
    require(target.is_file(), f"missing required file: {path}")
    return target.read_text(encoding="utf-8")


def main() -> None:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    require(config.get("version") == "2.2", "NikaS UI standard version must be 2.2")
    require(
        config.get("navigation_contract_version") == "1.3",
        "NikaS navigation contract version must be 1.3",
    )

    standard_path = config.get("standard_path", "docs/NIKAS_SPECIALIZED_PANEL_UI_STANDARD.md")
    standard = read_relative(standard_path)
    knowledge_base_path = config.get("knowledge_base_path")
    if knowledge_base_path:
        knowledge_base = read_relative(knowledge_base_path)
        baseline = f"Normative baseline:** NikaS Specialized Panel UI Standard v{config['version']}"
        require(baseline in knowledge_base, "engineering knowledge base baseline does not match the canonical standard")
        require("### 2.10 Peer status and selection are different facts" in knowledge_base, "knowledge base is missing the v2.2 peer-status lesson")
        require("### 2.13 Connection plaque and blue corner must use locked tokens" in knowledge_base, "knowledge base is missing the locked connection/decoration lesson")
    digest = hashlib.sha256(standard.encode("utf-8")).hexdigest()
    require(digest == config.get("standard_sha256"), "local NikaS UI standard is not the canonical v2.2 copy")
    # Registry integrity only: production layout needs the companion's browser evidence.
    geometry = config.get("connection_decoration_contract", {})
    require(geometry.get("version") == "1.1", "connection/decoration contract must be v1.1")
    require(geometry.get("status") == "required_when_present", "connection/decoration applicability drift")
    require(geometry.get("production_browser_acceptance_required") is True, "production geometry evidence is required")
    require(geometry.get("state_layout_delta_px") == 0, "state changes must not move connection/decoration")
    require(geometry.get("measurement_noise_px") == 0.1, "state geometry measurement noise drift")
    require(geometry.get("geometry_tolerance_px") == 1, "card geometry tolerance must be 1px")
    geometry_doc = read_relative(geometry.get("path", "docs/NIKAS_CONNECTION_DECORATION_CONTRACT.md"))
    require(hashlib.sha256(geometry_doc.encode("utf-8")).hexdigest() == geometry.get("sha256"), "connection/decoration contract hash drift")
    require("NIKAS_CONNECTION_DECORATION_CONTRACT.md" in standard, "UI standard must bind the locked geometry contract")
    plaque = config.get("connection_plaque_reference", {})
    expected_plaque = {
        "contract_version": "1.1", "width_px": 168, "height_px": 58,
        "box_sizing": "border-box", "top_px": 13, "right_px": 13,
        "coordinate_origin": "card_inner_border_edge", "padding_px": "11 12",
        "radius_px": 18, "lamp_px": 10, "column_gap_px": 9, "text_gap_px": 3,
        "font_family": '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif',
        "main_font": "16px/700", "freshness_font": "13px/600",
        "main_line_height_px": 17, "freshness_line_height_px": 14,
        "geometry_overrides_allowed": False,
        "shadow": "0 4px 14px rgba(0,0,0,.055)",
    }
    for key, value in expected_plaque.items():
        require(plaque.get(key) == value, f"connection plaque token drift: {key}")
    require("min_height_px" not in plaque, "retire the minimum-only connection height")
    expected_corner = {
        "width_px": 205, "height_px": 205, "top_px": -92, "right_px": -70,
        "base_color": "#03A9D9", "background": "rgba(3,169,217,0.07)",
        "opacity": 1, "radius": "50%", "coordinate_origin": "card_inner_border_edge",
        "clip": "persistent_card_decoration_layer", "theme_primary_dependent": False,
        "geometry_overrides_allowed": False, "pointer_events": "none", "aria_hidden": True,
    }
    require(config.get("blue_corner_reference") == expected_corner, "blue corner token drift")
    navigation_contract = read_relative(config["navigation_contract_path"])
    navigation_digest = hashlib.sha256(navigation_contract.encode("utf-8")).hexdigest()
    require(
        navigation_digest == config.get("navigation_contract_sha256"),
        "local NikaS navigation contract is not the canonical copy",
    )
    frontend_delivery_path = config.get("frontend_delivery_path")
    if frontend_delivery_path:
        frontend_delivery = read_relative(frontend_delivery_path)
        require(
            "Bottom Tab Bar MDI icons/labels at 26px and 12px/700" in frontend_delivery,
            "frontend delivery standard must require 26px Bottom Tab Bar icons",
        )
        require(
            "Bottom Tab Bar MDI icons/labels at 28px" not in frontend_delivery,
            "frontend delivery standard retains the superseded 28px icon rule",
        )
    for clause in (
        "Center title plaque — open the immediate parent",
        "history.pushState()",
        "history.back()",
        "exact form `UI vX.Y.Z`",
        "focus state and pressed response",
        "Data truth and command safety",
        "Production bundle and version coherence",
        "Home Assistant host boundary",
        "Canonical shell rows",
        "Canonical work-content frame",
        "Mandatory viewport acceptance",
        "capture-phase, non-passive `touchmove` boundary guard",
        "never displays the Home Assistant refresh spinner",
        "Five destinations, as used by Keenetic, conform to this limit.",
        "Build-time shell source",
        "Peer-device status lamps — Stark SolarPower reference",
        "red overrides orange, orange overrides green",
        "Unchanged lamp state produces no DOM write.",
        "icon no larger than `26px`",
        "canonical glyph size is `26px`",
        "Panel lifecycle and availability",
        "NIKAS_PANEL_LIFECYCLE_CONTRACT.md",
    ):
        require(clause in standard, f"canonical Header-return clause missing: {clause}")

    shell = config.get("shell_contract", {})
    require(shell.get("version") == "2.1", "NikaS shell contract version must be 2.1")
    require(shell.get("host_boundary") == "ha-panel", "shell must bind to the Home Assistant panel host")
    require(shell.get("header_body_px") == 60, "canonical Header body must be 60px")
    require(shell.get("peer_selector_px") == 52, "canonical peer selector must be 52px")
    require(shell.get("bottom_nav_body_px") == 64, "canonical Bottom Tab Bar body must be 64px")
    require(shell.get("content_max_width_px") == 1280, "canonical work-content max width must be 1280px")
    require(shell.get("coordinate_tolerance_px") == 2, "shell coordinate tolerance must be 2px")
    require(
        shell.get("scroll_boundary_guard") == "capture-non-passive-touchmove",
        "shell must block Home Assistant edge scrolling with the iOS boundary guard",
    )
    require(shell.get("specialized_tab_range") == [3, 5], "specialized Bottom Tab Bar must contain 3–5 tabs")
    expected_matrix = {
        "phone_portrait": "430x932",
        "phone_landscape": "932x430",
        "tablet_portrait": "768x1024",
        "tablet_landscape": "1024x768",
        "desktop": "1440x900",
    }
    require(shell.get("viewport_matrix") == expected_matrix, "canonical viewport matrix drift")
    for clause in (
        "/dashboard-house-v13/home",
        "/dashboard-rooms-v11/rooms",
        "/dashboard-actions/home",
        "/dashboard-infrastructure/overview",
        "/starline",
        "A missing, orphaned or mismatched public route is a blocking defect.",
    ):
        require(clause in navigation_contract, f"canonical navigation clause missing: {clause}")

    lamp = config.get("peer_device_status_lamp_reference", {})
    require(lamp.get("implementation") == "Stark SolarPower", "status-lamp reference must be Stark SolarPower")
    require(lamp.get("diameter_px") == 9, "peer-device status lamp must be 9px")
    require(lamp.get("halo_px") == 3, "peer-device status lamp halo must be 3px")
    require(
        lamp.get("states") == {
            "good": "green",
            "warning": "orange",
            "fault": "red",
            "unknown": "gray",
        },
        "peer-device status-lamp palette drift",
    )
    require(
        lamp.get("state_priority") == ["fault", "warning", "good", "unknown"],
        "peer-device status lamps must retain fail-closed priority",
    )
    require(lamp.get("selection_is_independent") is True, "selection and device health must remain independent")
    require(lamp.get("update_mode") == "point-patch", "status lamps must use point-only DOM updates")
    require(lamp.get("accessible_status_required") is True, "status lamps require accessible text")

    lifecycle = config.get("panel_lifecycle", {})
    require(lifecycle.get("version") == "1.0", "NikaS panel lifecycle contract version must be 1.0")
    require(lifecycle.get("status") == "required", "panel lifecycle contract must be required")
    require(lifecycle.get("registration_before_device_io") is True, "panel route must precede fallible device I/O")
    require(lifecycle.get("initial_failure") == "panel_remains_registered", "initial failure must preserve the panel route")
    require(lifecycle.get("unavailable_rendering") == "fail_closed", "offline panel content must fail closed")
    require(lifecycle.get("recovery") == "coordinator_or_config_entry_retry", "panel recovery must use the backend retry lifecycle")
    lifecycle_contract = read_relative(lifecycle["path"])
    lifecycle_digest = hashlib.sha256(lifecycle_contract.encode("utf-8")).hexdigest()
    require(lifecycle_digest == lifecycle.get("sha256"), "local NikaS panel lifecycle contract hash drift")
    required_lifecycle_cases = [
        "registration_before_refresh",
        "initial_failure_preserves_route",
        "offline_bootstrap",
        "retry_recovery",
        "route_collision",
        "unload_ownership",
        "generated_manifest_ownership",
    ]
    require(lifecycle.get("required_cases") == required_lifecycle_cases, "panel lifecycle regression cases drift")
    for clause in (
        "LIFECYCLE-01",
        "LIFECYCLE-02",
        "LIFECYCLE-03",
        "LIFECYCLE-04",
        "LIFECYCLE-05",
        "LIFECYCLE-06",
        "LIFECYCLE-07",
        "LIFECYCLE-08",
        "async_config_entry_first_refresh()",
        "Hardware evidence is required only",
    ):
        require(clause in lifecycle_contract, f"canonical panel lifecycle clause missing: {clause}")
    require(
        "NIKAS_PANEL_LIFECYCLE_CONTRACT.md" in standard
        and "configured panel route is application infrastructure" in standard,
        "UI standard must require the panel lifecycle companion",
    )

    role = config.get("role")
    require(role in {"registry", "base", "specialized", "readiness"}, f"unsupported NikaS UI role: {role}")
    runtime_files = config.get("runtime_files", [])
    require(isinstance(runtime_files, list), "runtime_files must be a list")
    require(len(runtime_files) == len(set(runtime_files)), "runtime_files must not contain duplicates")
    sources = "\n".join(read_relative(path) for path in runtime_files)

    production_entrypoint = config.get("production_entrypoint")
    if production_entrypoint:
        require(
            production_entrypoint in runtime_files,
            "production_entrypoint must be one of the checked runtime_files",
        )

    if role == "readiness":
        require(not runtime_files, "readiness-only repository must not claim a panel runtime")
        compliance = read_relative(config["compliance_path"])
        require("GAP" in compliance, "readiness-only repository must record the absent runtime as GAP")
        require("data truth" in compliance.lower(), "readiness record must cover the data-truth GAP")
        require("autonomous" in compliance.lower(), "readiness record must cover the autonomous-bundle GAP")
        return

    if role == "registry":
        require(not runtime_files, "registry repository must not claim a panel runtime")
        require(not production_entrypoint, "registry repository must not claim a production panel entrypoint")
        source_kit = config.get("source_kit", {})
        require(source_kit.get("delivery") == "vendored-build-time", "shell kit must be vendored at build time")
        require(source_kit.get("runtime_dependency") is False, "shell kit must not be a runtime dependency")
        source_kit_text = read_relative(source_kit["path"])
        source_kit_digest = hashlib.sha256(source_kit_text.encode("utf-8")).hexdigest()
        require(source_kit_digest == source_kit.get("sha256"), "canonical shell source-kit hash drift")
        for token in (
            'const NIKAS_SHELL_V2_VERSION = "2.1"',
            "block-size:100%",
            "calc(60px + env(safe-area-inset-top,0px))",
            "calc(64px + env(safe-area-inset-bottom,0px))",
            "max-inline-size:1280px",
            "container:nikas-panel / inline-size",
            "@container nikas-panel (min-width:600px)",
            "@container nikas-panel (min-width:1024px)",
            "--nikas-shell-tab-count",
            "padding:2px 3px 6px",
            "--mdc-icon-size:26px",
            "line-height:14px",
            "overscroll-behavior-y:none",
            "shouldBlockNikasShellBoundaryMove",
            "createNikasShellScrollBoundaryGuard",
            "NIKAS_SHELL_BOUNDARY_THRESHOLD_PX = 4",
            'host.addEventListener("touchmove", moveTouch, { passive: false, capture: true })',
            "captureNikasShellReturnRoute",
            "window.history.pushState",
            'new Event("location-changed")',
            "/dashboard-house-v13/home",
            "/dashboard-rooms-v11/rooms",
        ):
            require(token in source_kit_text, f"canonical shell source-kit token missing: {token}")
        for forbidden in ("100vw", "100vh", "100dvh", "position:fixed", "position: fixed"):
            require(forbidden not in source_kit_text, f"host-bound shell contains forbidden marker: {forbidden}")
        route_registry = config.get("route_registry", {})
        route_registry_text = read_relative(route_registry["path"])
        route_registry_digest = hashlib.sha256(route_registry_text.encode("utf-8")).hexdigest()
        require(route_registry_digest == route_registry.get("sha256"), "canonical route-registry hash drift")
        for route in (
            "/dashboard-house-v13/home",
            "/dashboard-rooms-v11/rooms",
            "/dashboard-actions/home",
            "/dashboard-infrastructure/overview",
            "/dashboard-access-v1/home",
            "/dashboard-water",
        ):
            require(route in route_registry_text, f"canonical route missing from registry: {route}")
        return

    require(runtime_files, f"{role} repository must declare checked runtime_files")

    require("/home/overview" in sources, "native overview title destination missing")
    require('"/dashboard-house"' not in sources, "legacy /dashboard-house route is forbidden in runtime")
    require("'/dashboard-house'" not in sources, "legacy /dashboard-house route is forbidden in runtime")
    require("/dashboard-starline" not in sources, "invalid /dashboard-starline route is forbidden in runtime")

    if role == "base":
        return

    header_return_runtime_path = config.get("header_return_runtime_path", production_entrypoint)
    header_return_runtime = (
        read_relative(header_return_runtime_path) if header_return_runtime_path else sources
    )

    for token in ("history.pushState", "location-changed", "UI v", "/home/overview"):
        require(token in sources, f"hierarchical Header navigation missing token: {token}")
    require("history.back(" not in sources, "history.back() is forbidden by the NikaS routing contract")
    require(
        re.search(r"/dashboard-starline(?:[/'\"?#]|$)", sources) is None,
        "retired /dashboard-starline route is forbidden",
    )
    require(
        re.search(r"/dashboard-house(?:[/'\"?#]|$)", sources) is None,
        "legacy /dashboard-house route is forbidden as a specialized-panel return",
    )
    require(
        "<button" in header_return_runtime or 'createElement("button")' in header_return_runtime,
        "center title must be a semantic button",
    )

    markers = config.get("header_return", {})
    require(isinstance(markers, dict) and markers, "specialized panel must declare header_return markers")
    for name in (
        "button_marker",
        "version_marker",
        "focus_marker",
        "pressed_marker",
    ):
        marker = markers.get(name)
        require(isinstance(marker, str) and marker, f"header_return.{name} must be configured")
        require(marker in header_return_runtime, f"specialized Header-return marker missing: {marker}")

    version_marker = markers["version_marker"]
    require("UI v" in version_marker, "header_return.version_marker must identify the exact UI version line")
    require("·" not in version_marker, "header_return.version_marker must be version-only")

    for marker in config.get("forbidden_runtime_markers", []):
        require(marker not in sources, f"forbidden specialized-panel runtime marker present: {marker}")

    artifact_kind = config.get("artifact_kind", "production")
    require(artifact_kind in {"production", "reference"}, "unsupported specialized artifact_kind")
    if artifact_kind == "reference":
        return

    require(production_entrypoint, "production specialized panel must declare production_entrypoint")
    require(
        runtime_files == [production_entrypoint],
        "runtime_files must contain only the shipped production_entrypoint",
    )
    bundle_contract = config.get("bundle_contract", {})
    require(bundle_contract.get("autonomous") is True, "production bundle must be autonomous")
    require(bundle_contract.get("runtime_imports") is False, "production bundle must forbid runtime imports")
    require(bundle_contract.get("deterministic") is True, "production bundle must be deterministic")
    require(
        bundle_contract.get("cache_busting") == "ui_version",
        "production bundle cache busting must follow ui_version",
    )

    entrypoint_source = read_relative(production_entrypoint)
    executable_lines = "\n".join(
        line for line in entrypoint_source.splitlines() if not line.lstrip().startswith("//")
    )
    require(
        re.search(r"^\s*(?:import|export)\b", executable_lines, re.MULTILINE) is None,
        "production entrypoint contains an ES module import/export",
    )
    require(
        re.search(r"\bimport\s*\(", executable_lines) is None,
        "production entrypoint contains a dynamic runtime import",
    )

    build_source_files = config.get("build_source_files", [])
    require(isinstance(build_source_files, list), "build_source_files must be a list")
    require(
        len(build_source_files) == len(set(build_source_files)),
        "build_source_files must not contain duplicates",
    )
    for path in build_source_files:
        read_relative(path)
    bundled_inputs = set(
        re.findall(r"^// BEGIN ([^\n]+)$", entrypoint_source, re.MULTILINE)
    )
    undeclared_inputs = bundled_inputs.difference(build_source_files)
    require(
        not undeclared_inputs,
        "production bundle contains undeclared build inputs: "
        + ", ".join(sorted(undeclared_inputs)),
    )

    ui_version = config.get("ui_version")
    require(
        isinstance(ui_version, str) and re.fullmatch(r"\d+\.\d+\.\d+(?:-beta\d{3})?", ui_version),
        "production specialized panel must declare a semantic ui_version",
    )
    require(ui_version in entrypoint_source, "production entrypoint does not contain configured ui_version")
    require(
        isinstance(config.get("web_component"), str) and config["web_component"],
        "production specialized panel must declare web_component",
    )
    require(
        config["web_component"] in entrypoint_source,
        "production entrypoint does not register the configured web_component",
    )

    data_truth = config.get("data_truth", {})
    require(
        data_truth.get("entity_source") == "integration_or_ha_registry",
        "data truth entity_source must be integration_or_ha_registry",
    )
    require(data_truth.get("unknown_unavailable") == "explicit", "unknown/unavailable policy must be explicit")
    require(data_truth.get("invented_entity_ids") is False, "invented entity IDs are forbidden")
    require(
        data_truth.get("fixed_entity_ids") in {"none", "tested_public_contract_only"},
        "fixed entity IDs must be absent or an explicit tested public contract",
    )
    command_policy = data_truth.get("command_policy")
    require(
        command_policy in {"read_only", "refresh_only", "integration_services", "entity_services"},
        "unsupported command policy",
    )
    lowered_source = entrypoint_source.lower()
    require("unknown" in lowered_source, "production runtime must render unknown data explicitly")
    require("unavailable" in lowered_source, "production runtime must render unavailable data explicitly")

    if command_policy == "read_only":
        forbidden_commands = data_truth.get("forbidden_command_markers", [])
        require(forbidden_commands, "read-only panel must declare forbidden command markers")
        for marker in forbidden_commands:
            require(marker not in entrypoint_source, f"read-only panel contains command marker: {marker}")
    else:
        command_markers = data_truth.get("command_markers", [])
        require(command_markers, "command-capable panel must declare runtime command markers")
        for marker in command_markers:
            require(marker in entrypoint_source, f"declared command marker missing: {marker}")


if __name__ == "__main__":
    main()
