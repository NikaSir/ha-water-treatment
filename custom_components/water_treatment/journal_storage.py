"""Durable HA-compatible journals: fail closed on corruption and failed writes.

HA Store normally recovers corrupt JSON as a missing file and logs WriteError
without raising it. Maintenance journals must not silently reset or acknowledge
an unwritten record. Use the public Store path and atomic writer, with disk
reads in the executor, bypassing its recovery and preload-cache semantics.
"""
from __future__ import annotations

import json
from pathlib import Path

from homeassistant.helpers.storage import Store


def _read_journal(filename, key, version):
    path = Path(filename)
    try:
        text = path.read_text(encoding='utf-8')
    except FileNotFoundError:
        if any(path.parent.glob(path.name+'.corrupt.*')):
            raise ValueError(f'Найден повреждённый архив {key}; требуется восстановление журнала') from None
        return None
    try:
        wrapper = json.loads(text)
    except (ValueError, UnicodeError) as err:
        raise ValueError(f'Повреждён JSON журнала {key}; исходный файл сохранён') from err
    if not isinstance(wrapper, dict):
        raise ValueError(f'Повреждён формат хранилища {key}')
    stored_version = wrapper.get('version')
    minor_version = wrapper.get('minor_version', 1)
    if (type(stored_version) is not int or stored_version != version
            or type(minor_version) is not int or not 1 <= minor_version <= 1
            or wrapper.get('key', key) != key or not isinstance(wrapper.get('data'), dict)):
        raise ValueError(f'Неподдерживаемый формат хранилища {key}; данные не изменены')
    return wrapper['data']


class JournalStore(Store):
    """Keep HA metadata/atomic writes but verify actual persistent contents."""
    def __init__(self, hass, version, key):
        super().__init__(hass, version, key, atomic_writes=True)
        self._journal_key = key
        self._journal_version = version

    async def async_load(self):
        return await self.hass.async_add_executor_job(
            _read_journal, self.path, self._journal_key, self._journal_version)

    async def async_save(self, value):
        await super().async_save(value)
        if await self.async_load() != value:
            raise OSError('Запись журнала не подтверждена на диске. Повторите после проверки хранилища.')
