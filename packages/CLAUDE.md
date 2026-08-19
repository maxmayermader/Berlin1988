# packages/

Framework-free libraries. Nothing in here imports React, Next.js, or PartyKit — these packages must stay runnable in a bare Node process so the simulation harness and CI can use them without a browser.

| Package | Role |
| :--- | :--- |
| `shared/` | Types and wire-protocol schemas. Zero runtime dependencies except Zod |
| `engine/` | The rules. Pure functions over `GameState` |
| `ai/` | Bot opponents. `PlayerView` in, `Order` out |

## Dependency direction

```
shared ◀── engine ◀── ai
```

Strictly one-way, enforced by lint. `engine` may not import `ai`. Neither may import from `apps/`. A package needing something from an app is a sign the thing belongs in `shared`.

## Why the split

The engine and the AI are the two places where bugs are expensive and testing is cheap. Keeping them out of the app means they can be exercised tens of thousands of times per CI run, and it means the fog-of-war boundary is a package boundary rather than a convention someone might forget.

## Conventions

- Every package exports through a single `src/index.ts`. Deep imports across package boundaries are not allowed.
- No side effects at module load — these files get imported by a simulation loop.
- Tests in `<package>/tests/`.
