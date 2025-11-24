# Repository Guidelines

## Project Structure & Module Organization
- `src/extension.ts` is the VS Code activation entry point that wires Git access, prompt generation, and the tree/webview providers.
- `src/providers/` contains UI-facing pieces (`treeViewProvider`, `projectTreeProvider`, `configViewProvider`, `gitContentProvider`) that render changed/context files and serve diffs.
- `src/services/` holds logic (`gitService`, `promptGenerator`) and `src/utils/` hosts helpers like glob filtering; shared contracts live in `src/types.ts`.
- Tests currently live in `src/services/gitService.test.ts`. Build output is emitted to `out/` via `tsconfig.json` and should remain generated artifacts.

## Build, Test, and Development Commands
- `npm install` — installs TypeScript, Mocha, and VS Code typings.
- `npx tsc -p tsconfig.json` — compiles `src` to `out/`; `main` points to `out/extension.js`, so this is required before packaging/running in production.
- `npx mocha -r ts-node/register src/**/*.test.ts` — runs the TypeScript unit suite against a temporary Git repo (Git CLI must be available).
- For manual checks, open the repo in VS Code and start the “Extension Development Host” (Run → Start Debugging) to exercise the `AI Review` views.

## Coding Style & Naming Conventions
- TypeScript with `strict` mode; avoid `any`, favor explicit return types, and keep async/await for Git I/O.
- Indentation uses four spaces; keep existing brace style and named imports.
- File names follow camelCase with role suffixes (e.g., `gitService.ts`, `projectTreeProvider.ts`); use PascalCase for classes and types, camelCase for functions/variables.
- Prefer small, testable functions in `services/`; UI components in `providers/` should stay thin and delegate logic.

## Testing Guidelines
- Tests use Mocha with Node’s `assert` and spin up throwaway Git repos under `.test-tmp-*`; ensure cleanup if you add new fixtures.
- Name specs `*.test.ts` beside the code they cover and keep them isolated (no reliance on global Git state).
- Extend coverage for new Git edge cases (rename detection, ignored patterns) and for prompt assembly paths when modifying `promptGenerator`.

## Commit & Pull Request Guidelines
- Match the existing history: short, imperative messages in lower case (e.g., `add config view`, `fix git diff`).
- In PRs, include a concise summary, the manual/automated checks run (build, tests, debug host), and screenshots or GIFs for UI or tree changes.
- Link issues if present and call out any impacts to VS Code settings (e.g., `aiReview.ignorePatterns`, `aiReview.diffIgnorePatterns` defaults) or to Git requirements.
