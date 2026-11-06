"""Filter maintenance calculations, independent of Home Assistant."""
from calendar import monthrange
from copy import deepcopy
from datetime import date, timedelta
from math import isfinite

PROFILES = {
    'mechanical': {'volume': 100, 'months': 6},
    'wound': {'volume': 200, 'months': 6},
}
CARTRIDGES = ('ferrostop', 'softening', 'postcarbon')


def defaults():
    return {'people': 3, 'hardness': None, 'softening_auto': True,
            'main': {'profile': 'mechanical', 'volume': 100, 'months': 6,
                     'mode': 'both', 'date': None, 'baseline': None},
            'cartridges': {key: {'months': 6, 'date': None} for key in CARTRIDGES}}


def positive(value, maximum):
    if isinstance(value, bool):
        raise ValueError('Введите положительное число')
    try:
        number = float(value)
    except (TypeError, ValueError) as err:
        raise ValueError('Введите положительное число') from err
    if not isfinite(number) or not 0 < number <= maximum:
        raise ValueError(f'Значение должно быть больше 0 и не больше {maximum}')
    return number


def softening_months(people, hardness):
    if hardness is None or people not in (1, 2, 3) or not 0 < hardness <= 5:
        return None
    column = 0 if hardness <= 3 else 1 if hardness <= 4 else 2
    return min(6, {1: (7, 5, 3), 2: (3.5, 2.5, 1.5), 3: (2, 1.5, 1)}[people][column])


def deadline(installed, months):
    start = date.fromisoformat(installed)
    whole = int(months)
    index = start.year * 12 + start.month - 1 + whole
    year, month = divmod(index, 12)
    month += 1
    end = date(year, month, min(start.day, monthrange(year, month)[1]))
    return end + timedelta(days=round((months - whole) * 30))


def update_settings(current, settings):
    result = deepcopy(current)
    main = settings.get('main', {})
    if main.get('profile', result['main']['profile']) not in PROFILES:
        raise ValueError('Неизвестный профиль')
    if main.get('mode', result['main']['mode']) not in ('volume', 'time', 'both'):
        raise ValueError('Неизвестный режим контроля')
    for key in ('profile', 'mode'):
        if key in main:
            result['main'][key] = main[key]
    for key, limit in (('volume', 10000), ('months', 12)):
        if key in main:
            result['main'][key] = positive(main[key], limit)
    if 'people' in settings:
        people = positive(settings['people'], 20)
        if people != int(people):
            raise ValueError('Количество пользователей должно быть целым')
        result['people'] = int(people)
    if 'hardness' in settings:
        value = settings['hardness']
        result['hardness'] = None if value is None else positive(value, 100)
    if 'softening_auto' in settings:
        if not isinstance(settings['softening_auto'], bool):
            raise ValueError('Неверный режим смягчения')
        result['softening_auto'] = settings['softening_auto']
    for key, value in settings.get('months', {}).items():
        if key not in CARTRIDGES:
            raise ValueError('Неизвестный картридж')
        result['cartridges'][key]['months'] = positive(value, 12)
    if result['softening_auto']:
        result['cartridges']['softening']['months'] = softening_months(result['people'], result['hardness'])
    return result


def status(config, today, meter=None):
    output = {'state': 'unconfigured', 'days': None, 'used': None, 'remaining': None, 'percent': None}
    if not config.get('date'):
        return output
    mode = config.get('mode', 'time')
    if config.get('months'):
        end = deadline(config['date'], config['months'])
        output.update(days=(end - today).days, deadline=end.isoformat())
    baseline = config.get('baseline')
    if meter is not None and baseline is not None and meter >= baseline:
        output['used'] = round(meter - baseline, 6)
        output['remaining'] = round(config['volume'] - output['used'], 6)
        output['percent'] = max(0, min(100, 100 * output['remaining'] / config['volume']))
    time_due = output['days'] is not None and output['days'] <= 0
    volume_due = output['remaining'] is not None and output['remaining'] <= 0
    if (mode != 'volume' and time_due) or (mode != 'time' and volume_due):
        output['state'] = 'due'
    elif (mode != 'volume' and output['days'] is None) or (mode != 'time' and output['used'] is None):
        output['state'] = 'unknown'
    elif (mode != 'volume' and output['days'] <= 14) or (mode != 'time' and output['percent'] <= 10):
        output['state'] = 'warning'
    else:
        output['state'] = 'ok'
    return output
