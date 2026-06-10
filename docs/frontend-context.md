# Frontend Context

## Stack

- React
- Tailwind CSS
- TypeScript-first

## Frontend conventions

- Keep components small and focused.
- Prefer composition over large monolithic components.
- Use Tailwind for styling instead of custom CSS unless there is a real reason.
- Keep props minimal and descriptive.
- Prefer local state when practical.
- Avoid duplicated state and unnecessary re-renders.
- Model loading, empty, error, and success states explicitly.
- Keep accessibility in mind.
- Preserve the project's existing UI patterns and spacing conventions.

## Suggested expectations for the agent

- Identify the exact components, hooks, and styles involved.
- Describe state flow clearly.
- If a UI change affects behavior, mention edge cases and empty states.
- If a component is becoming too large, suggest a clean split.
