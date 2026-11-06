"""Config flow for NikaS Water Treatment."""

from __future__ import annotations

from homeassistant import config_entries

from .const import DOMAIN


class WaterTreatmentConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Create the single local panel entry."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Create a panel-only config entry."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title="Водоподготовка", data={})
        return self.async_show_form(step_id="user")

