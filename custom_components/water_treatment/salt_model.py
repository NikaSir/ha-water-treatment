"""Manual salt ledger: recorded mass, assumptions and effective regeneration differ."""
from copy import deepcopy
from datetime import date, timedelta
from math import floor, isfinite


def salt_defaults():
    return {'schema': 2, 'model': 'Ёлка WSC-0,5-Rx-(SC)', 'dose': 1.0,
            'dose_basis': 'assumed', 'check_days': 6, 'level': 'unknown',
            'last_checked': None, 'last_added': None, 'last_added_kg': None,
            'known_kg': None, 'estimated_kg': None, 'last_ledger_date': None,
            'last_tank_service': None, 'regenerations': 0, 'history': []}


def migrate_salt(current):
    cfg = salt_defaults()
    cfg.update(deepcopy(current))
    if 'schema' not in current and 'dose' in current:
        cfg['dose_basis'] = 'legacy_unverified'
    cfg['schema'] = 2
    return cfg


def number(value, maximum, minimum=0, allow_zero=False):
    if isinstance(value, bool):
        raise ValueError('Неверное число')
    try:
        result = float(value)
    except (ValueError, TypeError) as err:
        raise ValueError('Введите число') from err
    if not isfinite(result) or result > maximum or result < minimum or (not allow_zero and result == 0):
        raise ValueError('Значение вне допустимого диапазона')
    return result


def event_date(payload, today):
    value = payload.get('date') or today.isoformat()
    try:
        parsed = date.fromisoformat(value)
    except (ValueError, TypeError) as err:
        raise ValueError('Неверная дата') from err
    if parsed > today:
        raise ValueError('Дата не может быть в будущем')
    return parsed.isoformat()


def _subtract(cfg, mass, measured):
    if measured:
        if cfg['known_kg'] is not None:
            if mass > cfg['known_kg']:
                raise ValueError('Расход больше учтённого остатка; сначала уточните запас')
            cfg['known_kg'] = round(cfg['known_kg'] - mass, 6)
    else:
        cfg['known_kg'] = None
    if cfg['estimated_kg'] is not None:
        cfg['estimated_kg'] = None if mass is None else round(max(0, cfg['estimated_kg'] - mass), 6)


def salt_action(current, action, payload, today):
    cfg = migrate_salt(current)
    stamp = event_date(payload, today)
    event = {'action': action, 'date': stamp}
    if action in ('topup', 'service', 'remove', 'regeneration'):
        if cfg['last_ledger_date'] and stamp < cfg['last_ledger_date']:
            raise ValueError('Событие раньше последней записи запаса; уточните текущий остаток')
    if action == 'settings':
        cfg['dose'] = number(payload.get('dose', cfg['dose']), 20)
        basis = payload.get('dose_basis', cfg['dose_basis'])
        if basis not in ('assumed', 'measured', 'legacy_unverified'):
            raise ValueError('Неверное основание дозы соли')
        cfg['dose_basis'] = basis
        days = number(payload.get('check_days', cfg['check_days']), 90)
        if days != int(days):
            raise ValueError('Интервал должен быть целым числом дней')
        cfg['check_days'] = int(days)
        return cfg
    if action == 'old_profile':
        cfg.update(dose=1.0, dose_basis='assumed')
        return cfg
    if action == 'topup':
        kg = number(payload.get('kg'), 100)
        cfg.update(last_added=stamp, last_added_kg=kg)
        for key in ('known_kg', 'estimated_kg'):
            if cfg[key] is not None:
                cfg[key] = round(cfg[key] + kg, 6)
        event['kg'] = kg
    elif action == 'service':
        remaining = number(payload.get('remaining_kg'), 100, allow_zero=True)
        added = number(payload.get('added_kg'), 100, allow_zero=True)
        stock = round(remaining + added, 6)
        if stock > 100:
            raise ValueError('Запас больше 100 кг')
        event.update(remaining_kg=remaining, added_kg=added)
        if payload.get('removed_kg') is not None:
            event['removed_kg'] = number(payload['removed_kg'], 100, allow_zero=True)
        if payload.get('refill_l') is not None:
            event['refill_l'] = number(payload['refill_l'], 100, allow_zero=True)
        cfg.update(known_kg=stock, estimated_kg=stock, last_tank_service=stamp,
                   level='unknown', last_checked=None)
        if added:
            cfg.update(last_added=stamp, last_added_kg=added)
    elif action == 'remove':
        kg = number(payload.get('kg'), 100)
        _subtract(cfg, kg, measured=True)
        event['kg'] = kg
    elif action == 'regeneration':
        if payload.get('completed') is not True:
            raise ValueError('Подтвердите, что полный цикл завершён')
        result = payload.get('result', 'unverified')
        if result not in ('unverified', 'confirmed', 'failed'):
            raise ValueError('Неверный результат регенерации')
        actual = payload.get('salt_kg')
        measured = actual is not None
        mass = number(actual, 20, allow_zero=True) if measured else (
            cfg['dose'] if cfg['dose_basis'] != 'legacy_unverified' else None)
        _subtract(cfg, mass, measured)
        cfg['regenerations'] += 1
        event.update(result=result, salt_kg=mass if measured else None,
                     estimated_salt_kg=None if measured else mass)
        for key, maximum in (('water_m3', 10), ('refill_l', 100)):
            if payload.get(key) is not None:
                event[key] = number(payload[key], maximum, allow_zero=True)
    elif action == 'check':
        level = payload.get('level')
        if level not in ('enough', 'low', 'empty'):
            raise ValueError('Выберите состояние запаса соли')
        cfg.update(last_checked=stamp, level=level)
        event['level'] = level
    else:
        raise ValueError('Неизвестное действие')
    if action in ('topup', 'service', 'remove', 'regeneration'):
        cfg['last_ledger_date'] = stamp
    cfg['history'].append(event)
    return cfg


def salt_status(current, today, profile=None):
    cfg = migrate_salt(current)
    checked = cfg['last_checked']
    days = None if not checked else (date.fromisoformat(checked) + timedelta(days=cfg['check_days']) - today).days
    state = 'unknown'
    if cfg['level'] in ('low', 'empty'):
        state = cfg['level']
    elif days is not None:
        state = 'check' if days <= 0 else 'ok'
    cycles = None
    if cfg['estimated_kg'] is not None and cfg['dose_basis'] != 'legacy_unverified':
        cycles = floor(round(cfg['estimated_kg'] / cfg['dose'], 9))
    volume = scenario = None
    if cycles is not None and profile:
        volume = round(cycles * profile['cycle_m3'], 6)
        if profile.get('daily_service_m3'):
            interval = min(profile['cycle_m3'] / profile['daily_service_m3'], profile['max_days'])
            scenario = round(cycles * interval, 6)
    return {'state': state, 'days': days, 'known_remaining_kg': cfg['known_kg'],
            'estimated_remaining_kg': cfg['estimated_kg'], 'full_cycles': cycles,
            'nominal_m3': volume, 'scenario_days': scenario}
