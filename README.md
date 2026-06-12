# OpenCode kit for a TypeScript project

Place these files in the root of your repository.

## Included

- `AGENTS.md` — project instructions
- `opencode.jsonc` — OpenCode configuration
- `.opencode/commands/analyze.md` — analyze-only command
- `.opencode/commands/implement.md` — implementation command
- `.opencode/commands/backend.md` — backend-specific command
- `.opencode/commands/frontend.md` — frontend-specific command
- `.opencode/skills/project-context/SKILL.md` — reusable project context skill
- `docs/project-context.md` — concrete repo facts
- `docs/backend-context.md` — backend conventions
- `docs/frontend-context.md` — frontend conventions

## Suggested flow

1. OpenCode in the project root.
2. Run `/init` once so OpenCode can refine `AGENTS.md`.
3. Fill the docs files with any project-specific details that still need confirmation.
4. Use `/analyze` before large changes.
5. Use `/implement` for the actual code changes.
6. Use `/backend` for Express + Prisma work.
7. Use `/frontend` for React + Tailwind work.
