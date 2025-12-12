# Compaction Strategies: Two Proposals

This document presents two approaches to handling WAL compaction across multiple machines using dumb file sync. Both avoid the complexity of full distributed consensus (Raft/Paxos) while providing practical solutions for a single-user, multi-machine setup.

---

## Context

From [architecture-wal-sync.md](./architecture-wal-sync.md):

- Each machine writes to its own WAL file (no conflicts)
- WALs grow unbounded until compacted into `state.jsonl`
- Compaction merges all WALs into a single state snapshot
- Concurrent compaction by multiple machines could cause conflicts

**The challenge:** How do we coordinate compaction across machines that communicate only through file sync, with latency measured in seconds to minutes?

---

# Proposal A: Lazy Compaction with Conflict Recovery

## Philosophy

Don't try to prevent concurrent compaction. Make it harmless.

Any machine can compact at any time. If two machines compact simultaneously and Dropbox creates a conflict file, we simply merge the two snapshots. Since both snapshots are valid merges of the same WALs, the final merged state is correct.

## How It Works

### Compaction (Any Machine)

```
When: App close, manual trigger, or WAL size threshold

1. Read state.jsonl (current snapshot)
2. Read all wal/*.jsonl files
3. Merge ops into state using timestamp-based resolution
4. Write state.jsonl.new
5. Atomic rename: state.jsonl.new → state.jsonl
6. Archive WALs: mv wal/*.jsonl wal/archive/{date}/
7. Done
```

No locks. No coordination. Just do it.

### Conflict Detection (On Startup)

```
1. Scan outline-data/ for conflict files:
   - state (conflicted copy).jsonl
   - state (macbook-pro's conflicted copy).jsonl
   - state.jsonl.sync-conflict-*
   (Dropbox, Nextcloud, Syncthing all use different naming)

2. If conflict files found:
   a. Log: "Detected concurrent compaction, merging..."
   b. Parse all versions (original + conflicts)
   c. Merge into unified state
   d. Write state.jsonl
   e. Delete conflict files
   f. Log: "Merged N conflict files successfully"
```

### Merging Two Snapshots

Both `state.jsonl` files contain records with IDs and timestamps:

```jsonl
// state.jsonl (from machine A)
{"type":"node","id":"uuid-1","content":"Buy oat milk","updated_at":"T2",...}

// state (conflicted copy).jsonl (from machine B)
{"type":"node","id":"uuid-1","content":"Buy milk and eggs","updated_at":"T3",...}
```

Merge algorithm:
```
for each record ID present in any file:
    collect all versions of that record
    keep the one with latest updated_at
    (or apply field-level merge if implementing that)
```

This is the same merge logic used for WAL replay — we already have it.

### WAL Archive Handling

When two machines compact concurrently, both archive the same WALs:

```
Machine A archives to: wal/archive/2025-01-15-100000-macbook-pro/
Machine B archives to: wal/archive/2025-01-15-100005-desktop-tower/
```

Include machine name and timestamp in archive folder to avoid collisions.

Alternatively, use content-addressable archiving:
```
wal/archive/{sha256-of-contents}.jsonl
```
Duplicate archives naturally deduplicate.

## File Layout

```
outline-data/
├── state.jsonl
├── state (conflicted copy).jsonl        ← Dropbox conflict (if any)
├── wal/
│   ├── macbook-pro.jsonl
│   ├── desktop-tower.jsonl
│   └── archive/
│       ├── 2025-01-15-100000-macbook-pro/
│       │   ├── macbook-pro.jsonl
│       │   └── desktop-tower.jsonl
│       └── 2025-01-14-180000-desktop-tower/
│           └── ...
└── .cache/
    └── outline.db
```

## Advantages

1. **No coordination required** — each machine acts independently
2. **Simple implementation** — just add conflict detection to startup
3. **Self-healing** — conflicts resolve automatically
4. **No stale lock problems** — no locks to go stale
5. **Works offline** — compact whenever, merge when reconnected

## Disadvantages

1. **Wasted work** — both machines do full compaction, then merge
2. **Larger sync** — two full state files sync instead of one
3. **Brief inconsistency** — during conflict window, machines have different states
4. **Archive bloat** — duplicate archives if both machines archive same WALs

## When Conflicts Actually Happen

For a single user, concurrent compaction requires:
1. Both machines running the app
2. Both trigger compaction (e.g., both closing the app)
3. Both write before sync completes

This is rare. Maybe a few times per year in normal use. The cost of conflict recovery is low enough to just accept it.

## Conflict Frequency Estimation

| Scenario | Conflict Likelihood |
|----------|---------------------|
| Close laptop, open desktop | Low (sync usually completes) |
| Rapid switching (< 1 min) | Medium (sync may not complete) |
| Both machines open simultaneously | Medium (both may auto-compact) |
| Airplane mode / offline | None (no sync happening anyway) |

## Implementation Checklist

- [ ] Add conflict file detection on startup
- [ ] Implement snapshot merge (same as WAL merge, different input)
- [ ] Add archive naming with machine ID
- [ ] Add logging for conflict detection and resolution
- [ ] Add UI notification: "Merged sync conflict from {machine}"

---

# Proposal B: Soft Primary Claim

## Philosophy

Designate one machine as "primary" with responsibility for compaction. Other machines are "secondary" and only append to their WALs. Primary claim is soft — it expires if not renewed, allowing takeover.

This reduces (but doesn't eliminate) concurrent compaction. Combined with Proposal A's conflict recovery, it provides defense in depth.

## How It Works

### Primary Claim File

```json
// meta/primary.json
{
  "machine": "macbook-pro",
  "claimed_at": "2025-01-15T10:00:00Z",
  "renewed_at": "2025-01-15T18:00:00Z",
  "compact_count": 42
}
```

| Field | Description |
|-------|-------------|
| `machine` | Hostname of current primary |
| `claimed_at` | When this machine first became primary |
| `renewed_at` | Last time primary confirmed it's alive |
| `compact_count` | Number of compactions performed (stats) |

### State Transitions

```
                    ┌─────────────────────────────────┐
                    │                                 │
                    ▼                                 │
┌──────────────────────────────────┐                 │
│  No Primary                      │                 │
│  (primary.json missing/expired)  │                 │
└───────────────┬──────────────────┘                 │
                │                                     │
                │ Any machine can claim               │
                ▼                                     │
┌──────────────────────────────────┐                 │
│  I Am Primary                    │                 │
│  (my machine in primary.json)    │◄────────────────┤
└───────────────┬──────────────────┘   Renew claim   │
                │                      (on activity) │
                │ Close app / claim expires          │
                ▼                                     │
┌──────────────────────────────────┐                 │
│  Other Is Primary                │─────────────────┘
│  (different machine, not expired)│  If claim expires
└──────────────────────────────────┘
```

### On App Startup

```python
def determine_role():
    primary = read_file("meta/primary.json")

    if primary is None:
        # No primary exists, claim it
        claim_primary()
        return "primary"

    if primary.machine == MY_HOSTNAME:
        # I was primary, renew
        renew_claim()
        return "primary"

    if is_expired(primary.renewed_at):
        # Primary is stale, take over
        log(f"Taking over from stale primary {primary.machine}")
        claim_primary()
        return "primary"

    # Someone else is active primary
    return "secondary"

def is_expired(renewed_at):
    return now() - renewed_at > CLAIM_EXPIRY  # e.g., 24 hours
```

### Claim and Renew Operations

```python
def claim_primary():
    write_file("meta/primary.json", {
        "machine": MY_HOSTNAME,
        "claimed_at": now(),
        "renewed_at": now(),
        "compact_count": 0
    })

def renew_claim():
    primary = read_file("meta/primary.json")
    primary["renewed_at"] = now()
    write_file("meta/primary.json", primary)
```

### Primary Behavior

```
On startup:
  - Claim or renew primary
  - Process any pending WALs from secondaries

During operation:
  - Renew claim every RENEW_INTERVAL (e.g., 1 hour)

On app close:
  - Compact WALs into state.jsonl
  - Final renew of claim
  - (Optionally release claim for faster takeover)
```

### Secondary Behavior

```
On startup:
  - Confirm not primary
  - Replay any new ops from state.jsonl and WALs

During operation:
  - Append ops to own WAL only
  - Never compact
  - Periodically check if primary is stale

On app close:
  - Just close (WAL will sync via Dropbox)
```

### Stale Primary Detection (Secondary)

```python
def check_primary_health():
    primary = read_file("meta/primary.json")

    if primary.machine == MY_HOSTNAME:
        return  # I'm primary

    staleness = now() - primary.renewed_at

    if staleness > WARNING_THRESHOLD:  # e.g., 7 days
        show_warning(f"Primary '{primary.machine}' last seen {staleness} ago")

    if staleness > FORCE_TAKEOVER_THRESHOLD:  # e.g., 30 days
        if confirm_with_user("Take over as primary?"):
            claim_primary()
```

### UI for Secondary

```
┌─────────────────────────────────────────────────────────────────┐
│  ℹ️  This machine is secondary                                  │
│                                                                 │
│  Primary: macbook-pro (last seen: 2 hours ago)                 │
│  Local WAL: 847 ops (1.2 MB)                                   │
│                                                                 │
│  Changes will sync when primary compacts.                      │
│                                                                 │
│  [ Become Primary ]                                            │
└─────────────────────────────────────────────────────────────────┘
```

### UI for Stale Primary

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️  Primary machine "macbook-pro" hasn't been seen in 7 days  │
│                                                                 │
│  WAL files are accumulating (currently 15 MB total).           │
│  Consider becoming primary to compact them.                    │
│                                                                 │
│  [ Become Primary ]    [ Remind me in 3 days ]    [ Dismiss ]  │
└─────────────────────────────────────────────────────────────────┘
```

### Manual Override

User can always force become primary:

```
Settings → Sync → [ Become Primary ]

Confirmation:
"This will take over primary role from 'macbook-pro'.
 If that machine is still active, you may see sync conflicts.
 Continue?"
```

## Handling Race Conditions

### Two Machines Claim Simultaneously

Both machines see expired primary, both write primary.json:

```
meta/primary.json                               (from A)
meta/primary (conflicted copy).json             (from B)
```

**Resolution (on next startup of either):**
```python
def resolve_primary_conflict():
    files = find_files("meta/primary*.json")
    if len(files) <= 1:
        return

    # Parse all claims
    claims = [parse(f) for f in files]

    # Oldest claim wins (first to claim)
    # Tiebreaker: alphabetical by machine name
    winner = min(claims, key=lambda c: (c.claimed_at, c.machine))

    # Write winner, delete conflicts
    write_file("meta/primary.json", winner)
    for f in files:
        if f != "meta/primary.json":
            delete(f)

    log(f"Resolved primary conflict: {winner.machine} wins")
```

### Primary Compacts While Secondary Claims

1. Machine A (primary) starts compacting
2. Machine B sees stale claim, claims primary
3. Machine A finishes compacting
4. Now both think they're primary

**Resolution:** Fall back to Proposal A — if state.jsonl conflicts, merge them.

## Configuration

```json
// meta/config.json (optional)
{
  "claim_expiry_hours": 24,
  "renew_interval_hours": 1,
  "stale_warning_days": 7,
  "force_takeover_days": 30,
  "compact_on_close": true,
  "compact_threshold_mb": 10
}
```

Defaults are sensible; config allows tuning for unusual situations.

## File Layout

```
outline-data/
├── state.jsonl
├── wal/
│   ├── macbook-pro.jsonl
│   ├── desktop-tower.jsonl
│   └── archive/
├── meta/
│   ├── primary.json              ← Primary claim
│   ├── config.json               ← Optional settings
│   ├── machines.jsonl            ← Known machines
│   └── merge-history.jsonl       ← Compaction log
└── .cache/
    └── outline.db
```

## Advantages

1. **Predictable compaction** — only one machine compacts normally
2. **Reduced conflicts** — concurrent compaction is rare, not routine
3. **Clear ownership** — user knows which machine is "in charge"
4. **Automatic failover** — stale primary is taken over
5. **Observable** — UI shows current role and primary status

## Disadvantages

1. **More complexity** — claim file, expiry logic, role determination
2. **Still has races** — simultaneous claim is possible (need fallback)
3. **Stale state possible** — if primary dies without syncing
4. **User confusion** — "why can't I compact on this machine?"

## Combining with Proposal A

Use both together:

1. **Soft primary claim** reduces compaction conflicts to rare edge cases
2. **Conflict recovery** handles edge cases automatically
3. **Belt and suspenders** — neither alone is bulletproof, together they're robust

```
Normal case:
  Primary compacts on close → state.jsonl syncs → secondaries read it

Edge case (concurrent compaction):
  Both compact → Dropbox conflict → auto-merge on next startup

Edge case (primary dies):
  Claim expires → secondary takes over → continues normally
```

## Implementation Checklist

- [ ] Add primary.json read/write
- [ ] Implement claim/renew/expire logic
- [ ] Add role determination on startup
- [ ] Add periodic claim renewal (timer)
- [ ] Add stale primary detection
- [ ] Add UI: role indicator, stale warning, manual takeover
- [ ] Add claim conflict resolution
- [ ] Integrate with Proposal A conflict recovery (fallback)

---

# Recommendation

**Implement both proposals together:**

| Layer | Mechanism | Handles |
|-------|-----------|---------|
| Primary | Soft claim (Proposal B) | Normal operation, reduces conflicts |
| Fallback | Conflict recovery (Proposal A) | Edge cases, races, unexpected situations |

This gives you:
- **Predictability** in the common case (primary does compaction)
- **Resilience** in edge cases (conflicts auto-resolve)
- **Simplicity** in mental model (one machine is primary, but it's not critical)

Start with Proposal A alone if you want minimum viable implementation. Add Proposal B when you want cleaner operation and user-facing role visibility.

---

# Comparison

| Aspect | Proposal A (Lazy) | Proposal B (Soft Primary) | Both Together |
|--------|-------------------|---------------------------|---------------|
| Implementation effort | Low | Medium | Medium |
| Conflict frequency | Occasional | Rare | Very rare |
| Conflict handling | Auto-merge | Fall back to A | Auto-merge |
| User visibility | Conflict notifications | Role indicator + warnings | Full visibility |
| Coordination | None | Soft claim file | Soft claim + fallback |
| Failure modes | Wasted work | Claim races | Handled by A |
