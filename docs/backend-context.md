# Backend Context

## Stack

- Express
- Prisma
- pnpm
- TypeScript-first

## Backend conventions

- Keep route handlers thin.
- Put business logic in services.
- Keep Prisma access isolated from HTTP handlers.
- Validate external input before it reaches business logic.
- Validate environment variables before using them.
- Prefer explicit error handling and predictable response shapes.
- Do not leak internal stack traces or raw database errors to clients.
- Keep request parsing, validation, business logic, and persistence separate when that improves clarity.
- Use small, focused modules.
- Prefer incremental changes over broad refactors.

## Suggested expectations for the agent

- Identify the exact route, service, and Prisma files involved.
- Mention edge cases, error paths, and payload validation.
- If a change touches the database schema, call that out clearly.
- If tests do not exist yet, describe the test cases that should eventually exist.
