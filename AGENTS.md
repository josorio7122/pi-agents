# Agent Instructions

## Package Manager
Use **npm**: `npm install`, `npm test`, `npm run check`

## File-Scoped Commands
| Task | Command |
|------|---------|
| Typecheck | `npx tsc --noEmit` |
| Lint | `npx biome check path/to/file.ts` |
| Lint fix | `npx biome check --fix path/to/file.ts` |
| Test file | `npx vitest run path/to/file.test.ts` |
| Test watch | `npx vitest path/to/file.test.ts` |
| All checks | `npm run check` |

## Commit Attribution
Never add `Co-Authored-By` trailers or any AI attribution to commit messages.

## TypeScript Rules
- **No classes** — factory functions with closures for stateful behavior
- **Pure core, impure shell** — push I/O to edges, pass side effects as arguments
- **Readonly by default** — `Readonly<T>`, `ReadonlyArray<T>` in all exported types
- **Prefer type inference** — no return type annotations unless justified (type predicates, public API contracts)
- **Zod at boundaries** — validate external data at runtime, never `as SomeType` on unvalidated data
- **Discriminated unions** over optional fields + boolean flags
- **200 lines max per file** — split by cohesion when exceeded
- **ESM-only** — `.js` extensions in imports, `type: "module"`

See `biome.json` for lint rules (`noExplicitAny`, `useMaxParams`, `noBarrelFile`).
See `tsconfig.json` for strict config (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).

## TDD Process
1. Write failing test — run it, confirm red
2. Write minimum code — run it, confirm green
3. Commit test + implementation together

- Test behavior, not implementation details
- Prefer `vi.spyOn` over `vi.mock` — `vi.mock` is last resort
- Prefer fakes and real objects over mocks
- Never mock what you own — >2 mocks means refactor first

## Conventions
- Colocate tests: `foo.ts` → `foo.test.ts` in same directory
- Feature folders: `src/discovery/`, `src/invocation/`, `src/tool/`, `src/domain/`
- Export only what other modules consume
- After refactors — grep for orphaned types/interfaces/consts
