# Copyright (c) 2026 Krzysztof Rudnicki
"""Daily backup of the kuhy-syncs Firebase RTDB into the dufs cloud, and restore.

Every app syncs through one database (``kuhy-syncs``), so a root export *is*
"all Firebase data from all apps". Snapshots land in
``~/data/cloud/firebase_backups/`` and are kept forever.

Entry points::

    python3 -m firebase_backup.backup            # what the systemd timer runs
    python3 -m firebase_backup.restore latest    # dry run: what would change
"""
