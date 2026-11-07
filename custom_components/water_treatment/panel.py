"""Register the integration-owned NikaS water panel."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import (
    DOMAIN,
    ENTITY_MAP,
    UI_STANDARD_VERSION,
    UI_VERSION,
)

PANEL_ID = "water-treatment"
PANEL_TITLE = "Водоподготовка"
PANEL_URL_PATH = "dashboard-water-treatment"
PANEL_PARENT_ROUTE = "/home/overview"
PANEL_ICON = "mdi:filter-outline"
PANEL_WEB_COMPONENT = "nikas-water-treatment-panel"
PANEL_STATIC_URL = "/water_treatment_panel"
PANEL_STATIC_REGISTERED = "panel_static_registered"
PANEL_OWNED = "panel_owned"
PANEL_DIRECTORY = Path(__file__).parent / "frontend"
PANEL_BUNDLE = "water-treatment-panel.js"

PANEL_METADATA = {
    "id": PANEL_ID,
    "title": PANEL_TITLE,
    "path": f"/{PANEL_URL_PATH}",
    "entry_route": f"/{PANEL_URL_PATH}",
    "parent_route": PANEL_PARENT_ROUTE,
    "safe_return_route": PANEL_PARENT_ROUTE,
    "icon": PANEL_ICON,
    "owner": DOMAIN,
    "preferred_view": "overview",
    "ui_version": UI_VERSION,
    "template_version": UI_STANDARD_VERSION,
    "frontend_bundle": PANEL_BUNDLE,
    "read_only": False,
    "entities": ENTITY_MAP,
    "tabs": [
        ["overview", "mdi:view-dashboard-outline", "Обзор"],
        ["filters", "mdi:filter-outline", "Фильтры"],
        ["softener", "mdi:water-sync", "Ёлка"],
        ["quality", "mdi:flask-outline", "Жёсткость"],
        ["settings", "mdi:cog-outline", "Настройки"],
    ],
}


async def async_register_panel(hass: HomeAssistant) -> None:
    """Register static frontend files and the custom panel."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    if not domain_data.get(PANEL_STATIC_REGISTERED):
        await hass.http.async_register_static_paths(
            [StaticPathConfig(PANEL_STATIC_URL, str(PANEL_DIRECTORY), cache_headers=False)]
        )
        domain_data[PANEL_STATIC_REGISTERED] = True

    if frontend.async_panel_exists(hass, PANEL_URL_PATH):
        domain_data.setdefault(PANEL_OWNED, False)
        return

    await panel_custom.async_register_panel(
        hass=hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_WEB_COMPONENT,
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        module_url=f"{PANEL_STATIC_URL}/{PANEL_BUNDLE}?v={UI_VERSION}",
        embed_iframe=False,
        require_admin=False,
        handle_safe_area=True,
        config=PANEL_METADATA,
    )
    domain_data[PANEL_OWNED] = True


def async_unregister_panel(hass: HomeAssistant) -> None:
    """Unregister the custom panel."""
    domain_data = hass.data.get(DOMAIN, {})
    if not domain_data.get(PANEL_OWNED):
        return
    frontend.async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)
    domain_data[PANEL_OWNED] = False
