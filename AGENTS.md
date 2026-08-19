# Repository Guidelines

## Project Structure & Module Organization

This repository is a Bun/TypeScript service for centralized mutation polling and payment-intent matching.

- `src/main.ts` wires configuration, database, repositories, HTTP server, and worker runtime.
- `src/http/` contains request auth, routing, response helpers, server startup, and payment intent handlers.
- `src/repositories/` owns SQLite persistence for sessions, polling state, intents, provider transactions, and webhook delivery state.
- `src/services/` contains domain services such as GoBiz session handling.
- `src/worker.ts` runs the polling loop.
- Tests should live close to the code they cover using `*.test.ts` naming, for example `src/worker.test.ts`.

## Build, Test, and Development Commands

Use Bun commands only.

- `bun install` installs dependencies.
- `bun run dev` runs `src/main.ts` with watch mode.
- `bun run start` runs the service once via Bun.
- `bun run build` bundles `src/main.ts` into `dist/`.
- `bun test` runs Bun tests.
- `./node_modules/.bin/tsc --noEmit` performs strict TypeScript checking.

## Coding Style & Naming Conventions

- Write TypeScript with ESM imports and strict typing.
- Prefer small modules with explicit dependencies passed through constructors.
- Use `camelCase` for variables/functions, `PascalCase` for classes/types, and `UPPER_SNAKE_CASE` for fixed status values.
- Keep repository methods focused on database access; keep runtime orchestration in workers/services.
- Do not introduce Node-only dependencies when Bun has built-in support.

## Testing Guidelines

- Use `bun:test` with `test` and `expect`.
- Name tests after behavior, not implementation details.
- Cover skip paths, database state transitions, token refresh success/failure, and worker scheduling behavior.
- Run `bun test` and `tsc --noEmit` before handing off changes.

## Commit & Pull Request Guidelines

This branch has no existing commit history to infer from. Use concise Conventional Commit-style messages, for example `feat: add gobiz session refresh` or `fix: skip polling without active session`.

Pull requests should include:

- Summary of the behavior change.
- Tests or checks run.
- Any database/configuration impact.
- Notes for manual GoBiz session bootstrap when relevant.

## Security & Configuration Tips

- Do not store GoBiz tokens in `.env`; `merchant_sessions` is the runtime source of truth.
- Keep OTP/bootstrap flows manual through request files or direct DB updates.
- Never commit secrets, access tokens, refresh tokens, SQLite files, or local runtime artifacts.
