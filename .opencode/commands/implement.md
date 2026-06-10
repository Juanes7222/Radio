---
description: Implement the requested change safely
agent: build
---

Implement the requested change using the current repository context.

Use the project instructions and the context files first:
- `AGENTS.md`
- `docs/project-context.md`
- `docs/backend-context.md`
- `docs/frontend-context.md`

Rules:
- Prefer the smallest safe change.
- Preserve existing behavior unless explicitly requested otherwise.
- Use TypeScript-first solutions.
- Keep validation, business logic, and persistence clearly separated when applicable.
- Follow the existing backend and frontend conventions.
- If tests exist, add or update them for meaningful logic changes.
- If tests do not exist yet, explain what should be tested.
- Explain any trade-offs or assumptions briefly.
