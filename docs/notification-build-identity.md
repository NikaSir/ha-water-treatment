# Notification build identity

`npm run build` generates `custom_components/water_treatment/notification_build.json`
and `_notification_build.py` after building the frontend. The manifest's `version`
is copied from the integration manifest. It is diagnostic information only.

The `files` object contains lowercase SHA-256 hashes of all regular files below
`custom_components/water_treatment`, using slash-separated relative paths. The two
generated identity files, `__pycache__` directories and `.pyc` files are excluded.
The `fingerprint` is SHA-256 of the UTF-8 encoding of `files` as JSON with sorted
keys and separators `,` and `:` and without whitespace. `npm run check` checks
that the two identity files are synchronized.

The Python module embeds the identity at import time. `verify_package(root)`
checks the installed file set, hashes and manifest against the embedded values;
call it in an executor because it reads files. This function alone does not prove
that an integration is loaded, that the current process imported this build, or
that an update has been applied. Runtime registration and loaded-entry checks
must establish those facts separately.

The notification producer is optional: maintenance is saved locally first, with
its evidence and lifecycle transitions in the same verified journal write. A
missing centre or a failed publication does not undo a committed maintenance
record. The source retains transitions for replay and stops publication with a
visible log error if the 4096-transition limit is reached; it does not silently
discard history. Resolution is based on recorded user actions and conservative
chronology, rather than opening the app or modifying settings. For main-filter
volume evidence the user confirms the baseline and a timestamped meter sample
must be at or after the recorded maintenance instant. Historical day-only salt
checks do not establish order within the same day. No claim of iPhone delivery
or live-system verification is implied.

Each synchronization packet sets `replay: true`. Intermediate packets use
`complete: false` and the final packet uses `complete: true` with the complete
current observations. The centre stages the ordered replay and applies the
stream and final snapshot together in one committed transaction. The cursor
returned by the centre advances through the staged stream and is used for retry
and reconnection.

A legacy main-filter baseline can still raise a volume warning or due condition
without a new maintenance record. The meter value must be valid and not below
the baseline, and the companion timestamp must be valid and not in the future.
Where the old maintenance record has only a calendar date, its ordering with a
same-day sample is unknown, so a later calendar day's sample is required to
establish the volume condition. When a new recording has an exact recorded
instant, the sample must be at or after that instant. This is an ordering rule,
not a freshness time limit. Resolution remains stricter: it also requires an
explicitly confirmed replacement baseline and valid post-record sample.
