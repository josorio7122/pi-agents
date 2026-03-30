# Part 1: Project Scaffolding

## Goal
Set up the project as a Pi extension package with TypeScript, Biome, Vitest, and all dependencies.

## Steps

### 1.1 Initialize package.json
- Use `npm pkg set` for all fields
- `type: "module"` (ESM-only)
- `pi.extensions: ["./src/index.ts"]` (Pi package entry point)
- `private: true` (not published to npm yet)

### 1.2 Install dependencies
```
Dependencies:
  @mariozechner/pi-agent-core
  @mariozechner/pi-ai
  @mariozechner/pi-coding-agent
  @mariozechner/pi-tui
  @sinclair/typebox
  zod                              # Frontmatter validation

Dev dependencies:
  typescript
  @types/node
  @biomejs/biome
  vitest
```

### 1.3 Configure tsconfig.json
Copy from pi-flow — strict mode, noUncheckedIndexedAccess, exactOptionalPropertyTypes.

### 1.4 Configure biome.json
Copy from pi-flow — no `any`, kebab-case files, no barrel files, max 2 params.

### 1.5 Add npm scripts
```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit",
  "lint": "biome check src/",
  "lint:fix": "biome check --fix src/",
  "check": "npm run lint && npm run typecheck && npm run test"
}
```

### 1.6 Create stub entry point
`src/index.ts` — minimal extension that does nothing (validates pi package structure loads):

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // pi-agents extension — scaffolding
}
```

### 1.7 Verify
- `npm run check` passes (lint + typecheck + test)
- `pi -e ./src/index.ts` loads without errors

## Tests
- None yet (stub). Vitest config verified by running `npx vitest run` (0 tests, exits cleanly).

## Commit
`chore: project scaffolding — tsconfig, biome, vitest, deps`
