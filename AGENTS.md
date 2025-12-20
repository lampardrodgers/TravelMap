# Repository Guidelines

## Project Structure & Module Organization
- `src/`: React + TypeScript frontend. Entry at `src/main.tsx`, main UI in `src/App.tsx`, shared API calls in `src/api.ts`, components in `src/components/`.
- `server/`: Express API proxy for AMap WebService requests (`server/index.js`, `server/amap.js`).
- `public/`: static assets served by Vite; `src/assets/` for UI assets bundled with the app.
- `dist/`: production build output from Vite.

## Setup & Configuration
- Copy `.env.example` to `.env` and fill in AMap keys:
  - `VITE_AMAP_KEY`, `AMAP_WEB_KEY`
  - Optional: `VITE_AMAP_SECURITY_CODE`
  - `PORT` (backend, default 5174)
- Keep secrets out of commits. If new env vars are added, update `.env.example` accordingly.

## Build, Test, and Development Commands
- `npm run dev`: run Vite + API server together (frontend at 5173, backend at 5174).
- `npm run dev:client`: run Vite only.
- `npm run dev:server`: run the Express server with file watching.
- `npm run build`: type-check and build the frontend into `dist/`.
- `npm run preview`: preview the built frontend.
- `npm run start`: start the backend server (production).
- `npm run lint`: run ESLint across the repo.

## Coding Style & Naming Conventions
- Use 2-space indentation and ES modules.
- Components in PascalCase (e.g., `MapView.tsx`); functions/hooks in camelCase.
- ESLint (flat config) is the source of truth; no Prettier is configured.

## Testing Guidelines
- No automated test framework is configured yet. Validate changes with `npm run lint` and a manual smoke test via `npm run dev` plus `GET /api/health`.
- If you add tests, document the framework, folder layout, and commands here and in `package.json`.

## Commit & Pull Request Guidelines
- Recent commits are short and often versioned (e.g., `V0.1.4 - …`, `Update to V0.1.3`). Follow this pattern for release bumps; otherwise keep subjects concise and descriptive.
- PRs should include a summary, manual test steps, and screenshots for UI changes. Link related issues when applicable.
