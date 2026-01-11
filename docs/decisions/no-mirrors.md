# Decision: No Mirrors/Transclusion Feature

**Date**: 2025-01-10
**Status**: Decided against
**Issue**: otl-z6k

## Context

Mirrors (also called transclusion) is a feature popularized by Workflowy where a single node can appear in multiple places in the outline. Changes to any instance sync to all others. The original proposal included:

- `(((` trigger syntax to create a mirror
- `mirror_source_id` field on nodes
- Content sync between mirror and source
- Mirror lifecycle handling (what happens when you delete a mirror vs its source)

## Decision

We decided not to implement this feature.

## Rationale

1. **Complexity vs. value**: Mirrors add significant complexity to the data model and sync system for a feature that wiki-style `[[links]]` largely address. Links provide discoverability and navigation without the sync complexity.

2. **Sync edge cases**: Multi-machine sync via file-based JSONL becomes much harder with mirrors. Conflict resolution for mirrored content that's edited on two machines simultaneously is a non-trivial problem.

3. **Mental model**: Mirrors can be confusing - users may not realize they're editing content that appears elsewhere. Links make the relationship explicit.

4. **Undo complexity**: The undo system would need significant work to handle mirrored edits correctly across all instances.

## Alternatives

- **Wiki links** (`[[node title]]`): Already implemented. Provides navigation and backlinks panel for discovery.
- **Search**: Quick access to any content without needing transclusion.
- **Copy with link**: Could add a "Copy as link" feature that pastes a link to the source rather than duplicating content.
