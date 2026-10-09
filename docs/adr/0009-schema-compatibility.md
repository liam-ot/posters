# ADR-0009: Schema compatibility: optional fields + `normalizeDoc`

**Status:** Accepted

## Context

Posters are single JSON files under `data/posters/` and `PosterDoc.schemaVersion` is `1`. Existing posters must keep
opening unchanged.

## Decision

Keep `schemaVersion: 1`. Every new field (`animations`, `timeline.bpm`, `timeline.beatsPerBar`, new layer types) is
**optional or additive**. A `normalizeDoc(doc)` fills defaults and is called wherever a doc is loaded (`loadDoc`). A
layer without `animations` takes the exact same render path as before.

## Alternatives considered

| Option | Why not |
|---|---|
| Bump to `schemaVersion: 2` with a migration | Needless churn when nothing is removed or renamed; makes downgrading harder. |
| No normalisation, check at every use site | Scatters `?? default` everywhere. |

## Consequences

- (+) No migration step; old posters render identically.
- (-) A future breaking change will need to introduce versioned migration then.
