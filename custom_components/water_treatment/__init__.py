"""Independent NikaS water-treatment records and panel."""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.event import async_track_state_change_event, async_track_time_change, async_track_time_interval
from homeassistant.util import dt as dt_util
from uuid import uuid4
from datetime import timedelta
from pathlib import Path
import logging
from homeassistant.exceptions import ConfigEntryNotReady, HomeAssistantError

from .const import DOMAIN, ENTITY_MAP, INTEGRATION_VERSION
from ._notification_build import FINGERPRINT as IMPORTED_FINGERPRINT, verify_package
from .notifications import NotificationPublisher
from .filters import async_setup_filters
from .panel import async_register_panel, async_unregister_panel


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Keep the route available while persistence waits for handoff or recovery."""
    await async_register_panel(hass)
    try:
        await async_setup_filters(hass)
    except (OSError, ValueError, TypeError, KeyError, HomeAssistantError) as err:
        raise ConfigEntryNotReady(str(err)) from err
    manager = hass.data[DOMAIN]['filters']
    session = uuid4().hex
    process = hass.data.setdefault('nikas_notifications_process_session', uuid4().hex)
    try:
        verified = await hass.async_add_executor_job(verify_package, Path(__file__).parent)
    except Exception:
        logging.getLogger(__name__).exception('Build verification failed')
        verified = False
    runtime = {'domain': DOMAIN, 'instance_id': entry.entry_id, 'process_session': process,
               'load_generation': session, 'version': INTEGRATION_VERSION,
               'fingerprint': IMPORTED_FINGERPRINT, 'verified': verified,
               'loaded_at': dt_util.utcnow().isoformat()}
    publisher = NotificationPublisher(hass, manager, entry.entry_id, session, runtime)
    manager.publisher = publisher
    hass.data[DOMAIN]['notification_publisher'] = publisher
    def changed(event):
        source = event.data.get('source') if hasattr(event, 'data') else None
        if source is None or source == publisher.source:
            publisher.schedule(reconnect=True)
    publisher.unsubscribers.extend([
        async_track_state_change_event(hass, [ENTITY_MAP['drinking_total'],
            'sensor.schetchik_vody_svd_20_0020989_obnovleno'], publisher.schedule),
        async_track_time_change(hass, publisher.schedule, hour=0, minute=0, second=0),
        async_track_time_interval(hass, publisher.schedule, timedelta(minutes=1)),
        hass.bus.async_listen('nikas_notifications_ready', changed),
        hass.bus.async_listen('nikas_notifications_reconcile', changed),
    ])
    publisher.schedule()
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    publisher = hass.data.get(DOMAIN, {}).pop('notification_publisher', None)
    if publisher is not None:
        await publisher.stop()
    hass.data.get(DOMAIN, {}).pop('filters', None)
    async_unregister_panel(hass)
    return True
