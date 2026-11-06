from __future__ import annotations

import hashlib
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "water_treatment"
FRONTEND = COMPONENT / "frontend"


class PanelUiStandardV22Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.profile = json.loads((ROOT / ".nikas-ui-standard.json").read_text(encoding="utf-8"))
        cls.core = (FRONTEND / "src" / "water-treatment-panel-core.js").read_text(encoding="utf-8")
        cls.styles = (FRONTEND / "src" / "styles.css").read_text(encoding="utf-8")
        cls.bundle = (FRONTEND / "water-treatment-panel.js").read_text(encoding="utf-8")
        cls.registration = (COMPONENT / "panel.py").read_text(encoding="utf-8")

    def test_canonical_documents_and_shell_are_pinned(self) -> None:
        self.assertEqual(self.profile["version"], "2.2")
        self.assertEqual(self.profile["navigation_contract_version"], "1.3")
        for path_key, hash_key in (
            ("standard_path", "standard_sha256"),
            ("navigation_contract_path", "navigation_contract_sha256"),
        ):
            content = (ROOT / self.profile[path_key]).read_bytes()
            self.assertEqual(hashlib.sha256(content).hexdigest(), self.profile[hash_key])
        shell = self.profile["shell_source"]
        self.assertEqual(shell["delivery"], "vendored-build-time")
        self.assertFalse(shell["runtime_dependency"])
        self.assertEqual(
            hashlib.sha256((ROOT / shell["path"]).read_bytes()).hexdigest(),
            shell["sha256"],
        )
        self.assertIn(f"// BEGIN {shell['path']}", self.bundle)

    def test_production_uses_host_bound_shell_geometry(self) -> None:
        contract = self.profile["shell_contract"]
        self.assertEqual(contract["host_boundary"], "ha-panel")
        self.assertEqual(contract["header_body_px"], 60)
        self.assertEqual(contract["bottom_nav_body_px"], 64)
        self.assertEqual(contract["content_max_width_px"], 1280)
        for marker in (
            'class="app-shell nikas-shell"',
            'class="app-header nikas-shell__header"',
            'class="canvas-viewport nikas-shell__viewport"',
            'class="work-content nikas-shell__content"',
            'class="tabbar nikas-shell__tabs"',
            'button.className = "nikas-shell__tab"',
            'createNikasShellScrollBoundaryGuard({',
        ):
            self.assertIn(marker, self.core)
        host_block = self.styles[self.styles.index(":host {") : self.styles.index("\n}", self.styles.index(":host {") )]
        self.assertNotIn("position: fixed", host_block)
        self.assertNotIn("100dvh", self.bundle)

    def test_navigation_contract_includes_all_base_routes(self) -> None:
        import subprocess
        subprocess.run(["node", "tests/header_parent_navigation.mjs"], cwd=ROOT, check=True)
        for route in (
            "/dashboard-house-v13/home",
            "/dashboard-rooms-v11/rooms",
            "/dashboard-actions/home",
            "/dashboard-infrastructure/overview",
        ):
            self.assertIn(route, self.bundle)
        self.assertIn("if (this._returnRoute == null)", self.bundle)
        self.assertNotIn("history.back(", self.bundle)

    def test_refresh_feedback_contract_is_implemented(self) -> None:
        for marker in (
            'state === "busy"',
            '"mdi:check"',
            '"#43a047"',
            '"mdi:alert-circle-outline"',
            '"#e53935"',
            "elapsed < 900",
            "}, 1400)",
            "this._refreshResultTimer",
            "this._refreshDelayTimer",
            "token !== this._refreshToken",
        ):
            self.assertIn(marker, self.core)
        self.assertIn("@media (prefers-reduced-motion: reduce)", self.styles)
        self.assertIn(".header-action.busy ha-icon", self.styles)

    def test_route_collision_and_unload_respect_ownership(self) -> None:
        self.assertIn('PANEL_OWNED = "panel_owned"', self.registration)
        collision = self.registration.index("if frontend.async_panel_exists")
        register = self.registration.index("await panel_custom.async_register_panel")
        own = self.registration.index("domain_data[PANEL_OWNED] = True")
        self.assertLess(collision, register)
        self.assertLess(register, own)
        self.assertIn("if not domain_data.get(PANEL_OWNED)", self.registration)
        self.assertIn("domain_data[PANEL_OWNED] = False", self.registration)


if __name__ == "__main__":
    unittest.main()
