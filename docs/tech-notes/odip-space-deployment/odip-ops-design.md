# ODIP — Operations and Resilience (OPS) — Design Note

*v0.2 — 22 June 2026 — DRAFT*

---

## 1. Context and constraints

### 1.1 Purpose

This note defines the automated backup solution for ODIP Space. It covers the P0 requirement APP-OPS-01, with the exception of two items explicitly parked for later: the JSON export form and the off-site copy.

### 1.2 Scope

**In scope (this note):**
- Automated periodic backup — trigger mechanism and rotation policy
- `systemd --user` timer design
- `odip-backup` script (rotation logic)
- `odip-admin` backup commands and schedule installation
- ADD ch09 §8.2 update

**Parked — not in scope:**
- JSON export form (APP-OPS-01 second backup form) — deferred; JSON export capability exists via CLI but is not wired into the backup pipeline
- Off-site copy — depends on EC IT infrastructure; to be discussed with EC IT before implementation
- Quarterly restore test — procedural; no application work

---

## 2. Requirements coverage

| Req | Statement | Priority | Coverage |
|---|---|---|---|
| APP-OPS-01 | Daily automatic backup — database form | P0 | §3, §4 |
| APP-OPS-01 | Daily automatic backup — JSON export form | P0 | **Parked** |
| APP-OPS-01 | Off-site copy | P0 | **Parked — EC IT dependency** |
| APP-OPS-01 | Retention policy (daily/monthly cadences) | P0 | §3.2 |
| APP-OPS-01 | Never delete most recent of its kind | P0 | §3.2 — enforced by `odip-backup` |
| APP-OPS-01 | Restore test before internal opening | P0 | Procedural — no app work |
| APP-OPS-01 | Quarterly restore test by integrators | P0 | Procedural — no app work |

---

## 3. Backup design

### 3.1 Trigger mechanism — `systemd --user` timer

The automated backup is driven by a `systemd --user` timer on the host, which runs `odip-backup` on a schedule.

**Why the host, not a container.** The backup sequence stops Neo4j, runs `neo4j-admin dump` in a throwaway container, and restarts Neo4j — all via `podman` (see ch09 §8.1). `podman` runs on the host; no container in the pod has access to it. Any in-pod trigger would therefore be unable to perform the dump. The schedule must run where `podman` lives: on the host.

**Why `systemd --user`, not host cron.** Both run on the host and both reach `podman`. `systemd --user` is preferred because:
- it survives logout when lingering is enabled (`loginctl enable-linger $USER`), which the user can set without root;
- `OnCalendar` schedules in local time with correct DST handling;
- `Persistent=true` re-runs a missed backup at next boot if the machine was off at the scheduled time;
- it keeps service status and logs in the journal (`systemctl --user status`, `journalctl --user`).

No root is required at any point. Lingering is the single host-level prerequisite, and it is user-settable.

**Rejected alternative — in-pod cron container.** An earlier design placed the schedule in a fourth pod container. It was abandoned: the container cannot reach host `podman`, so it cannot perform the dump. Routing the trigger through a server endpoint (`POST /admin/backup` → `execFile(odip-backup)`) failed for the same root reason — the server container also lacks `podman`. The host-level timer is the correct layer.

### 3.2 Rotation policy

Four-slot rotation with fixed filenames. `odip-backup` runs on each timer fire; age-threshold logic decides the action.

Promotions run **before** the fresh dump, so the pre-dump state propagates up the chain cleanly.

| Slot | File | Cadence | Source |
|---|---|---|---|
| daily | `auto/daily/neo4j.dump` | every 24 h | fresh dump via `odip-admin dump` |
| weekly | `auto/weekly/neo4j.dump` | every 7 days | promoted from daily |
| monthly | `auto/monthly/neo4j.dump` | every 28 days | promoted from weekly |
| yearly | `auto/yearly/neo4j.dump` | every 365 days | promoted from monthly |

The "never delete the most recent of its kind" rule is inherent: each slot holds exactly one file; overwrite only happens when the age threshold is met, which means a more recent backup already exists.

The yearly slot uses a 365-day rolling threshold, consistent with the other slots (not a calendar-year promotion).

### 3.3 Backup execution

`odip-backup` derives the admin script path from its own location and calls `odip-admin dump -b auto/daily`, which performs the standby → stop Neo4j → dump → restart → resume sequence already documented in ch09 §8.1/§8.3. The timer adds no new server endpoint; it reuses the existing host dump path unchanged.

---

## 4. Implementation

### 4.1 Repository artefacts

```
$ODIP_REPO/
├── bin/
│   ├── odip-admin                 ← install/manage the timer; backup command
│   └── odip-backup                ← rotation logic (daily/weekly/monthly/yearly)
└── systemd/
    ├── odip-backup.service        ← reference template (live unit generated at install)
    └── odip-backup.timer          ← schedule (OnCalendar); copied verbatim at install
```

### 4.2 Service unit (generated at install)

`systemd --user` does not expand `${VAR}` in the `ExecStart` binary path, and a `--user` service inherits no shell rc. Two consequences drive the design:

- **Absolute ExecStart.** `odip-admin install` generates `~/.config/systemd/user/odip-backup.service` with the absolute `${ODIP_REPO}/bin/odip-backup` path resolved at install time. The repo `.service` is a reference template only.
- **Environment file.** The ODIP environment (`ODIP_REPO`, `ODIP_HOME`, `ODIP_DOCKER_REGISTRY`, npm/gem modes, `PATH`) is captured into `~/.config/odip/backup.env` at install time and pulled in via `EnvironmentFile=`. This is what `odip-backup` → `odip-admin dump` reads at run time.

`Documentation=` must be a bare ASCII URL token (the field is parsed as space-separated URLs).

### 4.3 Timer unit

```ini
[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Local time, DST-correct. The schedule is the single configuration point. To change it: edit `OnCalendar` in `~/.config/systemd/user/odip-backup.timer`, then `systemctl --user daemon-reload`. No rebuild, no image.

### 4.4 Installation and management

`odip-admin install` performs the one-time setup (after the image builds): writes the env file, generates the service unit, copies the timer, runs `daemon-reload`, and `enable --now` on the timer. It warns if lingering is not enabled.

`odip-admin backup` manages the timer at runtime:

| Subcommand | Effect |
|---|---|
| `backup run` | Trigger a backup immediately (`systemctl --user start odip-backup.service`) |
| `backup status` | Show timer schedule and last service result |
| `backup log [N]` | Show last N journal lines for the service |

### 4.5 Runtime files (not in repo)

```
~/.config/systemd/user/odip-backup.service   generated, absolute ExecStart
~/.config/systemd/user/odip-backup.timer      copied from repo (schedule)
~/.config/odip/backup.env                      generated env for the service
```

Dumps land in `$ODIP_HOME/backups/auto/{daily,weekly,monthly,yearly}/neo4j.dump`.

---

## 5. Open points

| # | Point | Owner |
|---|---|---|
| 1 | Off-site copy mechanism — cloud vs EC network share | EC IT discussion |
| 2 | JSON export wiring — CLI export command to be integrated into backup pipeline | Deferred |

---

## 6. Status

Implemented and verified end-to-end on 22 June 2026: timer fires on schedule (local time), `odip-backup` performs the rotation, `odip-admin dump` brackets the dump with standby/resume, and `auto/daily/neo4j.dump` is written with valid content. Lingering enabled on both target environments.