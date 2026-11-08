"""Guarded one-time import. Never write to or delete the legacy store."""
from copy import deepcopy

from homeassistant.util import dt as dt_util

from .journal_storage import JournalStore as Store

LEGACY_DOMAIN = 'water_accounting'
LEGACY_KEY = 'water_accounting.filters'
HANDOFF_MESSAGE = ('Сначала обновите «Учёт воды» до 0.3.0-beta001 или новее '
                   'и перезапустите Home Assistant. Старая версия ещё владеет журналом.')


def assert_no_legacy_writer(hass):
    if hass.data.get(LEGACY_DOMAIN, {}).get('filters') is not None:
        raise ValueError(HANDOFF_MESSAGE)


def validate_envelope(saved):
    """Reject malformed saved data rather than silently replacing a journal."""
    if not isinstance(saved, dict) or not isinstance(saved.get('settings'), dict):
        raise ValueError('Повреждён формат журнала водоподготовки')
    revision = saved.get('revision', 0)
    if isinstance(revision, bool) or not isinstance(revision, int) or revision < 0:
        raise ValueError('Повреждена ревизия журнала водоподготовки')
    cfg = saved['settings']
    for key in ('people', 'hardness', 'softening_auto', 'main', 'cartridges'):
        if key not in cfg:
            raise ValueError(f'В журнале отсутствует обязательное поле {key}')
    if not isinstance(cfg['main'], dict) or not isinstance(cfg['cartridges'], dict):
        raise ValueError('Повреждены настройки фильтров')
    for key in ('profile', 'volume', 'months', 'mode', 'date', 'baseline'):
        if key not in cfg['main']:
            raise ValueError(f'В журнале отсутствует настройка main.{key}')
    for key in ('ferrostop', 'softening', 'postcarbon'):
        item = cfg['cartridges'].get(key)
        if not isinstance(item, dict) or not {'months', 'date'} <= item.keys():
            raise ValueError(f'Повреждены данные картриджа {key}')
    for key, history in (('salt', 'history'), ('treatment', 'gh_history')):
        if key not in cfg:
            continue  # Older valid formats predate these sections.
        item = cfg[key]
        if not isinstance(item, dict) or not isinstance(item.get(history), list):
            raise ValueError(f'Повреждён журнал {key}')
        if not all(isinstance(event, dict) for event in item[history]):
            raise ValueError(f'Повреждены записи {key}')
    if 'treatment' in cfg and not isinstance(cfg['treatment'].get('profile'), dict):
        raise ValueError('Повреждён профиль водоподготовки')
    journal = saved.get('notifications')
    if journal is not None:
        if (not isinstance(journal, dict) or journal.get('schema') != 1
                or type(journal.get('lifecycle_seq')) is not int
                or not isinstance(journal.get('transitions'), list)
                or not isinstance(journal.get('observations'), dict)
                or not isinstance(journal.get('evidence'), dict)
                or not isinstance(journal.get('salt_checks'), list)):
            raise ValueError('Повреждён журнал уведомлений водоподготовки')
        transitions = journal['transitions']
        if (len(transitions) > 4096 or journal['lifecycle_seq'] != len(transitions)
                or any(not isinstance(item, dict) or item.get('lifecycle_seq') != index
                       or not isinstance(item.get('transition_id'), str)
                       or not isinstance(item.get('observation'), dict)
                       for index, item in enumerate(transitions, 1))
                or len({item['transition_id'] for item in transitions}) != len(transitions)):
            raise ValueError('Повреждена последовательность уведомлений водоподготовки')
    return deepcopy(saved)


async def load_envelope(hass, target):
    """Return (envelope, needs_save), preferring an existing target forever."""
    assert_no_legacy_writer(hass)
    saved = await target.async_load()
    if saved is not None:
        return validate_envelope(saved), False
    legacy = await Store(hass, 1, LEGACY_KEY).async_load()
    if legacy is None:
        return None, True
    entries = getattr(hass, 'config_entries', None)
    configured = entries.async_entries(LEGACY_DOMAIN) if entries is not None else []
    if configured and not hass.data.get(LEGACY_DOMAIN, {}).get('treatment_split_ready'):
        raise ValueError(HANDOFF_MESSAGE)
    result = validate_envelope(legacy)
    result['migration'] = {
        'source': LEGACY_KEY,
        'source_revision': result.get('revision', 0),
        'imported_at': dt_util.now().isoformat(),
        'source_snapshot': deepcopy(legacy),
    }
    return result, True
