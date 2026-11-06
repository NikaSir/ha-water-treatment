"""Independent NikaS water-treatment records and panel."""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady, HomeAssistantError

from .const import DOMAIN
from .filters import async_setup_filters
from .panel import async_register_panel, async_unregister_panel


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Keep the route available while persistence waits for handoff or recovery."""
    await async_register_panel(hass)
    try:
        await async_setup_filters(hass)
    except (OSError, ValueError, TypeError, KeyError, HomeAssistantError) as err:
        raise ConfigEntryNotReady(str(err)) from err
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.get(DOMAIN, {}).pop('filters', None)
    async_unregister_panel(hass)
    return True
