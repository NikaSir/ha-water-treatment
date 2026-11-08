"""Pure conservative maintenance observations and durable transition stream."""
from copy import deepcopy
from datetime import date, datetime, timezone
from math import isfinite
from uuid import uuid4

KEYS = ('main', 'ferrostop', 'softening', 'postcarbon', 'softener')
NAMES = {'main': 'Магистральный фильтр', 'ferrostop': 'Ферростоп',
         'softening': 'Смягчение', 'postcarbon': 'Посткарбон', 'softener': 'Запас соли'}


def _instant(value):
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.astimezone(timezone.utc) if parsed.tzinfo is not None else None
    except (TypeError, ValueError, AttributeError, OverflowError):
        return None


def volume_verified(evidence, meter, sampled_at, now=None):
    if not evidence or evidence.get('baseline_confirmed') is not True:
        return False
    sample, recorded = _instant(sampled_at), _instant(evidence.get('recorded_at'))
    try:
        if isinstance(meter, bool) or isinstance(evidence.get('baseline'), bool):
            return False
        current, baseline = float(meter), float(evidence['baseline'])
        return (isfinite(current) and isfinite(baseline) and 0 <= baseline <= current
                and sample is not None and recorded is not None and sample >= recorded
                and (now is None or sample <= now.astimezone(timezone.utc)))
    except (TypeError, ValueError, KeyError):
        return False



def meter_supports_assessment(config, evidence, meter, sampled_at, now):
    """Require a timestamped sample after the saved installation, without a TTL.

    Legacy dates have no time of day, so a same-day timestamp cannot establish
    order. Newly recorded evidence supplies an exact recording instant; baseline
    confirmation is required separately for resolution, not for raising an alert.
    """
    sample = _instant(sampled_at)
    try:
        baseline = config.get('baseline')
        if isinstance(meter, bool) or isinstance(baseline, bool):
            return False
        current, base = float(meter), float(baseline)
        installed = date.fromisoformat(config['date'])
        if (not isfinite(current) or not isfinite(base) or not 0 <= base <= current
                or sample is None or sample > now.astimezone(timezone.utc)):
            return False
        if evidence is None:
            return sample.astimezone(now.tzinfo).date() > installed
        recorded = _instant(evidence.get('recorded_at'))
        return (evidence.get('date') == config['date']
                and not isinstance(evidence.get('baseline'), bool)
                and float(evidence['baseline']) == base
                and recorded is not None and sample >= recorded)
    except (TypeError, ValueError, KeyError, OverflowError, AttributeError):
        return False

def salt_check_after(enough, prior):
    if not enough or enough.get('level') != 'enough':
        return False
    if prior is None:
        return True
    try:
        a, b = date.fromisoformat(enough['date']), date.fromisoformat(prior['date'])
    except (ValueError, TypeError, KeyError):
        return False
    if a != b:
        return a > b
    a_time, b_time = _instant(enough.get('performed_at')), _instant(prior.get('performed_at'))
    return a_time is not None and b_time is not None and a_time > b_time


def initial_state():
    return {'schema': 1, 'lifecycle_seq': 0, 'transitions': [], 'observations': {},
            'evidence': {}, 'salt_checks': []}


def assess(current, key, status, evidence, revision, now):
    """Record changed assessments; an inactive transition needs evidence after active."""
    result = deepcopy(current)
    old = result['observations'].get(key)
    active = status in ('warning', 'due', 'check', 'low', 'empty')
    if active:
        state, quality = 'active', 'verified'
    elif status == 'ok' and evidence:
        state, quality = 'inactive', 'verified'
    elif status == 'ok' and not old:
        state, quality = 'inactive', 'verified'
    else:
        state, quality = 'unknown', 'unavailable'
    old_state = old.get('state') if old else None
    old_evidence = (old or {}).get('resolution', {}).get('evidence_id')
    new_evidence = evidence.get('evidence_id') if evidence and state == 'inactive' else None
    severity = 'urgent' if status in ('due', 'empty') else 'warning'
    if (old and old_state == state and old.get('severity') == severity and old_evidence == new_evidence
            and old.get('facts', {}).get('status') == status):
        return result
    seq = result['lifecycle_seq'] + 1
    if seq > 4096:
        result['overflow'] = True
        return result
    observed = now.astimezone(timezone.utc).isoformat()
    observation = {'object_key': key, 'condition_key': 'salt_attention' if key == 'softener' else 'filter_maintenance',
                   'state': state, 'quality': quality, 'category': 'maintenance', 'severity': severity,
                   'title': NAMES[key], 'message': 'Требуется внимание' if active else 'Состояние обслуживания',
                   'facts': {'status': status}, 'observed_at': observed, 'valid_until': None,
                   'condition_revision': seq, 'url': '/dashboard-water-treatment'}
    if new_evidence:
        observation['resolution'] = deepcopy(evidence)
    result['lifecycle_seq'] = seq
    result['observations'][key] = observation
    result['transitions'].append({'transition_id': uuid4().hex, 'lifecycle_seq': seq, 'observation': observation})
    return result


def evaluate(journal, data, today, meter, sample_at, revision, now, status_fn, salt_status_fn):
    """Evaluate observations using only persisted action evidence."""
    result = deepcopy(journal)
    for key in KEYS:
        if key == 'softener':
            value = salt_status_fn(data['salt'], today, data['treatment']['profile'])['state']
        else:
            config = data['main'] if key == 'main' else data['cartridges'][key]
            reliable_meter = meter
            if key == 'main' and config.get('mode') != 'time':
                proof_for_meter = result['evidence'].get(key)
                if not meter_supports_assessment(config, proof_for_meter, meter, sample_at, now):
                    reliable_meter = None
            value = status_fn(config, today, reliable_meter if key == 'main' else None)['state']
            if key == 'main' and config.get('mode') == 'both' and value == 'unknown':
                time_status = status_fn({**config, 'mode': 'time'}, today)['state']
                if time_status in ('warning', 'due'):
                    value = time_status
        proof = result['evidence'].get(key)
        last_active = result.setdefault('last_active_seq', {}).get(key, 0)
        valid = proof is not None and proof.get('after_seq', -1) >= last_active
        active_at = result.setdefault('last_active_at', {}).get(key)
        salt_order_proved = (key == 'softener' and result.get('last_active_status', {}).get(key) in ('low', 'empty')
                             and proof is not None and proof.get('prior_low') is not None
                             and salt_check_after(proof, proof['prior_low']))
        if valid and active_at and not proof.get('chronology_proved') and not salt_order_proved:
            active_instant = _instant(active_at)
            recorded = _instant(proof.get('recorded_at') or proof.get('performed_at'))
            if proof.get('performed_now') is True:
                valid = active_instant is not None and recorded is not None and recorded >= active_instant
            else:
                try:
                    valid = date.fromisoformat(proof['date']) > date.fromisoformat(result.get('last_active_date', {}).get(key))
                except (ValueError, TypeError, KeyError, AttributeError):
                    valid = False
        if valid and key == 'main' and data['main'].get('mode') != 'time':
            valid = volume_verified(proof, meter, sample_at, now)
        if valid and key == 'softener':
            valid = salt_check_after(proof, proof.get('prior_low'))
        resolution = None
        if valid and value == 'ok':
            resolution = {'kind': 'salt_checked' if key == 'softener' else 'filter_replaced',
                          'evidence_id': proof['evidence_id'], 'source_revision': proof['source_revision'],
                          'evaluated_at': now.astimezone(timezone.utc).isoformat(),
                          'subject_id': key, 'details': deepcopy(proof.get('chronology_details', {'date': proof['date'],
                              'prior_low_date': (proof.get('prior_low') or {}).get('date')}))}
        before = result['lifecycle_seq']
        result = assess(result, key, value, resolution, revision, now)
        if result['lifecycle_seq'] != before and result['observations'][key]['state'] == 'active':
            result['last_active_seq'][key] = result['lifecycle_seq']
            result['last_active_at'][key] = now.astimezone(timezone.utc).isoformat()
            result.setdefault('last_active_status', {})[key] = value
            result.setdefault('last_active_date', {})[key] = now.date().isoformat()
    return result


def capture(journal, action, payload, data, revision, operation_id, now, today):
    result = deepcopy(journal)
    if action in ('replace', 'record'):
        key = payload['filter']
        item = data['main'] if key == 'main' else data['cartridges'][key]
        result['evidence'][key] = {'evidence_id': operation_id or uuid4().hex,
            'source_revision': revision, 'date': item['date'], 'recorded_at': now.astimezone(timezone.utc).isoformat(),
            'after_seq': result['lifecycle_seq'], 'performed_now': action == 'replace' and item['date'] == today.isoformat(), 'baseline': item.get('baseline'),
            'baseline_confirmed': key == 'main' and payload.get('baseline_confirmed') is True}
    elif action == 'salt_check':
        history = data['salt']['history'][:-1]
        checks = [event for event in history if event.get('action') == 'check' and event.get('level') in ('low', 'empty')]
        # Include both retained history and archive; cleanup must not erase evidence.
        for archived in data['salt'].get('history_archive', []):
            checks += [event for event in archived.get('history', []) if event.get('action') == 'check' and event.get('level') in ('low', 'empty')]
        # An untimed same-day low may be later than any timed check.
        prior = max(checks, key=lambda event: (event.get('date', ''),
                    event.get('performed_at') is None, event.get('performed_at') or ''), default=None)
        event = data['salt']['history'][-1]
        instant = now.astimezone(timezone.utc).isoformat() if payload.get('performed_now') is True and event['date'] == today.isoformat() else None
        evidence = {'evidence_id': operation_id or uuid4().hex, 'source_revision': revision,
                    'date': event['date'], 'performed_at': instant, 'performed_now': instant is not None, 'level': event['level'],
                    'after_seq': result['lifecycle_seq'], 'prior_low': deepcopy(prior)}
        result['salt_checks'].append(deepcopy(evidence))
        if event['level'] == 'enough':
            result['evidence']['softener'] = evidence
    return result


def late_replacement(journal, old_data, new_data, action, payload, revision, now, status_fn):
    """Prove a past healthy time-based cycle before the currently due cycle."""
    if action != 'record':
        return journal
    key = payload.get('filter')
    if key not in KEYS or key == 'softener':
        return journal
    old = old_data['main'] if key == 'main' else old_data['cartridges'][key]
    new = new_data['main'] if key == 'main' else new_data['cartridges'][key]
    if key == 'main' and new.get('mode') != 'time':
        return journal  # A cached reading cannot reconstruct a historical volume cycle.
    try:
        replacement = date.fromisoformat(new['date'])
        previous = date.fromisoformat(old['date'])
    except (ValueError, TypeError, KeyError):
        return journal
    if previous >= replacement or replacement >= now.date():
        return journal
    prior = status_fn(old, replacement)
    healthy = status_fn(new, replacement)
    current = status_fn(new, now.date())
    old_observation = journal['observations'].get(key, {})
    if (prior['state'] not in ('warning', 'due') or healthy['state'] != 'ok'
            or current['state'] not in ('ok', 'warning', 'due') or old_observation.get('state') != 'active'):
        return journal
    proof = journal['evidence'][key]
    journal = deepcopy(journal)
    proof = journal['evidence'][key]
    proof['chronology_proved'] = True
    proof['chronology_details'] = {'date': new['date'], 'previous_date': old['date'],
        'prior_deadline': prior.get('deadline'), 'prior_state': prior['state'],
        'replacement_state': healthy['state'], 'reason': 'chronological_time_recalculation'}
    resolution = {'kind': 'filter_replaced', 'evidence_id': proof['evidence_id'],
                  'source_revision': revision, 'evaluated_at': now.astimezone(timezone.utc).isoformat(),
                  'subject_id': key, 'details': deepcopy(proof['chronology_details'])}
    return assess(journal, key, 'ok', resolution, revision, now)
