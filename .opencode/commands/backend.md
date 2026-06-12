---
description: Work on backend changes for Express + Prisma
agent: build
---

Implement or review backend changes for this Express + Prisma project.

Use the project context first:
- `AGENTS.md`
- `docs/project-context.md`
- `docs/backend-context.md`

Focus on:
- route handlers
- services
- Prisma access
- input validation
- error handling
- environment variables
- database schema impacts

Rules:
- Keep handlers thin.
- Put business logic in services.
- Keep Prisma access isolated.
- Validate all external input.
- Preserve existing behavior unless a breaking change is requested.
- Mention any schema or migration impact explicitly.
- Do not invent a test framework if the repo does not already have one.
