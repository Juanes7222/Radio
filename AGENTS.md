# Project Instructions

Always respond in Spanish.
Do not use emojis in any response.

This project is TypeScript-first. Prefer TypeScript over JavaScript in all new code, examples, refactors, and explanations unless there is a strong reason not to. Write code as if it will be maintained long-term in a real production codebase.

## Project stack

- Package manager: pnpm
- Backend: Express + Prisma
- Frontend: React + Tailwind CSS
- Tests: not defined yet

## Clean Code

Follow Clean Code principles strictly:
- Prefer clear, self-explanatory names over comments.
- Keep functions small, focused, and easy to test.
- Prefer simple solutions over clever ones.
- Avoid unnecessary abstractions, indirection, and overengineering.
- Do not introduce patterns, layers, or helpers unless they solve a real problem.
- Comments should be used only when the code cannot reasonably explain itself.
- Code comments must always be written in English.
- Docstrings, JSDoc, and function descriptions must always be written in English and kept concise.

## TypeScript conventions

- Prefer strong typing and type safety in every layer.
- Use explicit types for public APIs, function parameters, and return values whenever they improve clarity.
- Avoid any. If any is unavoidable, explain briefly why and keep it isolated.
- Prefer union types, discriminated unions, interfaces, and type aliases where appropriate.
- Prefer narrow types over broad ones.
- Model real runtime data accurately.
- Handle null, undefined, empty values, and error states explicitly.
- Use async/await for asynchronous code.
- Keep control flow easy to follow.
- Prefer immutable data and pure functions when practical.
- Use const by default.
- Avoid hidden side effects.
- Do not assume values are present unless that is guaranteed by the code.
- Do not ignore TypeScript compiler warnings or lint issues.
- Prefer code that works well with strict TypeScript settings.
- If a helper is introduced, it must have a clear purpose and a single responsibility.

## Backend conventions

- Validate all external input before using it.
- Never trust request bodies, query strings, route params, headers, or environment variables without validation.
- Keep route handlers and controllers thin.
- Put business logic in services.
- Keep database access isolated in Prisma-facing modules or repositories.
- Use predictable API responses and stable contracts.
- Avoid leaking internal errors to clients.
- Keep environment variables documented and validated.

## Frontend conventions

- Keep React components small and focused.
- Prefer reusable components only when reuse is real.
- Keep state local when possible.
- Avoid unnecessary re-renders, prop drilling, and duplicated state.
- Use Tailwind utility classes consistently.
- Keep component props minimal and well named.
- Make UI types reflect loading, empty, error, and success states explicitly.
- Do not add complexity unless the UI actually needs it.
- Prefer accessibility and clarity over clever abstractions.

## Change strategy

- Read the existing codebase first.
- Make incremental changes.
- Preserve project conventions.
- Avoid unrelated refactors.
- If a change affects multiple files, explain the dependency chain clearly.
- If there are multiple valid solutions, recommend the simplest one that is safe, maintainable, and idiomatic.

## Tests

- This project does not have a test suite yet.
- Do not invent a test framework or test structure unless the user asks for it or the repository already defines one.
- When tests are added later, prefer behavior-focused tests over implementation details.
- If a change would benefit from tests, explain which tests should exist and why.

## Output style

- Prefer prose over bullet points and lists unless structure genuinely helps.
- Be direct, precise, and practical.
- Explain the reasoning behind recommendations, not just the result.
- If there are trade-offs, describe them clearly.
- Avoid vague generalities.
- State assumptions explicitly when the context is incomplete.
- If the request is ambiguous, make the most reasonable assumption and continue, but mention that assumption briefly.

## Code generation

- Provide complete, usable code whenever possible.
- Ensure imports, exports, types, and file paths are coherent.
- Keep code formatted cleanly and consistent.
- Do not omit critical parts needed for the code to work.
- Do not invent nonexistent libraries, APIs, or project structure.
- If a dependency is required, mention it explicitly.
- If there is uncertainty about the project structure, say so briefly and give the safest implementation option.

## Review mindset

- Identify real problems first: correctness, maintainability, readability, type safety, testability, performance, and security.
- Prioritize fixes by impact.
- Do not suggest cosmetic changes before functional issues.
- Preserve intentional behavior.
- Call out risks and edge cases clearly.
- If something is already good, say so instead of forcing changes.

Default behavior:
- Assume the user wants a professional, production-oriented answer.
- Assume the user values correctness, maintainability, and clarity over cleverness.
- If the user does not specify otherwise, prefer idiomatic TypeScript.
- If a request can be solved in a simpler way, choose the simpler way.
