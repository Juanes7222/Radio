# Documentation suite plan (2026-11-01)

Goal: a Diátaxis suite under `docs/` that lets a new developer or an AI agent
work on this repository without rediscovering it on every session.

Approved decisions:

- Full Diátaxis suite: tutorial, how-to, reference and explanation, plus an
  `ai/` block for agent routing.
- Audience priority: new developer and AI agent, in that order.
- Language: English, matching the README and the code comments.
- Format: Markdown with Mermaid diagrams and verified `path:line` citations.
  No screenshots.
- Written directly in one session, verifying each claim against the code.

Constraints taken as non-negotiable:

- `docs/project-context.md`, `docs/backend-context.md` and
  `docs/frontend-context.md` stay untouched: `opencode.jsonc` lists them under
  `instructions` and `AGENTS.md` imports them. The new suite links to them
  instead of duplicating them.
- Every statement in `reference/` is checked against the file it describes. Where
  the existing prose disagrees with the code, the suite documents the code and
  points out the disagreement.

Divergences found while gathering facts (documented, not "fixed"):

- `README.md` says 21 backend modules; `backend/src/modules/` has 27.
- `README.md` says 28 Prisma models; `backend/prisma/schema/` declares 39 across
  19 files.
- `README.md` documents `YOUTUBE_CHANNEL_IDS` as configuration; the column is
  gone and channels live in the `YouTubeChannel` table.

Order of writing (by utility, not by quadrant):

1. `reference/repository-map.md`, `reference/backend-modules.md`,
   `explanation/architecture.md`
2. Remaining `reference/`, `explanation/known-traps.md`, `ai/`
3. `tutorials/getting-started.md`, `how-to/*`
4. `docs/README.md` index
