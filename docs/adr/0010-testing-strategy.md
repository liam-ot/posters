# ADR-0010: Testing strategy: unit-test pure modules with Vitest

**Status:** Accepted

## Context

The project has no tests. The new work contains a lot of pure logic where bugs are subtle (easing, timing, loop
seamlessness, composition, shape geometry, matrix decomposition, colour normalisation), and a lot of DOM/canvas code
where unit tests are costly and low-value.

## Decision

Add **Vitest** (it shares Vite's config and toolchain) with a `pnpm test` script. Tests sit next to the module as
`*.test.ts`. **Only pure logic gets unit tests.** DOM-heavy code (SVG parsing, Konva rendering, the Inspector) is
verified in the running app against fixtures (`test/fixtures/svg/`) at each phase checkpoint.

Property-style checks worth keeping: rest state is identity for every preset; loop frames at `t=0` and `t=duration`
match when the period divides the duration; out mirrors in; stagger first path starts at 0 and last ends at 1.

## Alternatives considered

| Option | Why not |
|---|---|
| No automated tests | Loop seamlessness and composition rules regress silently. |
| Playwright visual regression | Heavy setup for a single-user local tool; revisit if the renderer grows. |
| Jest | Extra config; Vitest reuses Vite's. |

## Consequences

- (+) Fast feedback on the riskiest logic.
- (-) Rendering regressions are still caught manually; mitigated by the checkpoints.
