"""Configured valve parameters and dated GH measurements; no physical commands."""
from copy import deepcopy
from datetime import date
from math import isfinite

DGH_TO_ZH = 0.3566
STAGES = ('backwash_min', 'brine_min', 'refill_min', 'fast_rinse_min')


def treatment_defaults():
    return {'profile': {'resin_l': 8.0, 'resin_basis': 'assumed',
                       'cycle_m3': 1.2, 'cycle_basis': 'temporary_setting',
                       'max_days': 6, 'mode': 'A-01', 'time': '03:00',
                       'volume_unit': 'HU-01', 'backwash_mode': 'F-00', 'signal': 'b-01',
                       'backwash_min': 10, 'brine_min': 75, 'refill_min': 1, 'fast_rinse_min': 6,
                       'daily_service_m3': None},
            'resin_since_year': None, 'resin_replaced': None, 'gh_history': []}


def _number(value, minimum, maximum, integer=False):
    if isinstance(value, bool):
        raise ValueError('Неверное число')
    try:
        result = float(value)
    except (TypeError, ValueError) as err:
        raise ValueError('Введите число') from err
    if not isfinite(result) or not minimum <= result <= maximum or (integer and result != int(result)):
        raise ValueError('Значение вне допустимого диапазона')
    return int(result) if integer else result


def _date(value, today):
    try:
        result = date.fromisoformat(value or today.isoformat())
    except (TypeError, ValueError) as err:
        raise ValueError('Неверная дата') from err
    if result > today:
        raise ValueError('Дата не может быть в будущем')
    return result.isoformat()


def gh_measurement(payload, today):
    if isinstance(payload.get('sample_ml', 5), bool) or payload.get('sample_ml', 5) != 5:
        raise ValueError('Для этого профиля НИЛПА нужна проба 5 мл')
    point = payload.get('point')
    if point not in ('mains', 'softener', 'barrier'):
        raise ValueError('Укажите точку отбора')
    drops = _number(payload.get('drops'), 1, 100, integer=True)
    return {'date': _date(payload.get('date'), today), 'point': point,
            'sample_ml': 5, 'drops': drops, 'dgh': drops, 'zh': round(drops * DGH_TO_ZH, 4)}


def treatment_action(current, action, payload, today):
    cfg = deepcopy(current)
    if action == 'gh':
        cfg['gh_history'].append(gh_measurement(payload, today))
    elif action == 'old_profile':
        cfg['profile'] = treatment_defaults()['profile']
    elif action == 'settings':
        for key, minimum, maximum in [('resin_l', 0.1, 100), ('cycle_m3', 0.001, 100),
                                      ('max_days', 1, 90), *[(key, 0, 300) for key in STAGES]]:
            if key in payload:
                cfg['profile'][key] = _number(payload[key], minimum, maximum, integer=key == 'max_days')
        for key, choices in [('resin_basis', ('assumed', 'measured')),
                             ('cycle_basis', ('temporary_setting', 'configured'))]:
            if key in payload:
                if payload[key] not in choices:
                    raise ValueError('Неверное основание параметра')
                cfg['profile'][key] = payload[key]
        if 'daily_service_m3' in payload:
            value = payload['daily_service_m3']
            cfg['profile']['daily_service_m3'] = None if value is None else _number(value, 0.001, 100)
        if 'resin_since_year' in payload:
            value = payload['resin_since_year']
            cfg['resin_since_year'] = None if value is None else _number(value, 1900, today.year, integer=True)
        if 'resin_replaced' in payload:
            value = payload['resin_replaced']
            cfg['resin_replaced'] = None if value is None else _date(value, today)
    else:
        raise ValueError('Неизвестное действие водоподготовки')
    return cfg


def treatment_status(cfg):
    ordered = sorted(enumerate(cfg['gh_history']), key=lambda pair: (pair[1]['date'], pair[0]), reverse=True)
    return {'stage_minutes': round(sum(cfg['profile'][key] for key in STAGES), 6),
            'latest_gh': [item for _, item in ordered[:10]]}
