# ProSlides (bachelor project)

ProSlides is a web app for creating and presenting slide decks, with a canvas-based editor (Fabric.js), live presentation sessions over Action Cable, audience interaction from phones, and optional polls. This repository is a **monorepo**:

| Path | Role |
|------|------|
| **`frontend/`** | Vite + React + TypeScript SPA (Tailwind, shadcn-style UI) |
| **`backend/`** | Rails 8 JSON API, PostgreSQL, OmniAuth (Google/GitHub), Action Cable |

The dev server proxies **`/api`** and **`/cable`** to the Rails app so the browser can talk to one origin (`http://localhost:5173`).

---

## Local development

### Prerequisites

- **Ruby** `~> 3.4.8` and Bundler (see `backend/Gemfile`)
- **Node.js** (current LTS is fine) and npm
- **PostgreSQL** reachable via a connection URL (local Postgres or a hosted URL such as Neon)

Redis is **not** required for local Action Cable: `backend/config/cable.yml` uses the `async` adapter in development.

### 1. Backend

```bash
cd backend
cp .env.example .env
```

Edit **`.env`**: set at least **`DATABASE_URL`** (PostgreSQL) and **`SECRET_KEY_BASE`** (any long random string is enough for local use). Optional variables (OAuth, CORS, `FRONTEND_URL`, etc.) are documented in `.env.example`.

Then:

```bash
bundle install
bin/setup    # installs gems, runs db:prepare, clears logs/tmp
bin/rails server
```

Rails listens on **`http://localhost:3000`** by default.

### 2. Frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **`http://localhost:5173`**. The Vite dev server proxies API and WebSocket traffic to the backend (default **`http://localhost:3000`**).

Optional: copy **`frontend/.env.example`** to **`frontend/.env`** if you need to point the proxy at another backend (e.g. `VITE_DEV_BACKEND_ORIGIN=http://localhost:3002`) or override `VITE_API_BASE_URL` / `VITE_WS_URL`.

### 3. Useful commands

| Where | Command | Purpose |
|-------|---------|---------|
| `frontend/` | `npm run build` | Production build |
| `frontend/` | `npm run lint` | ESLint |
| `frontend/` | `npm run test:e2e` | Playwright end-to-end tests |

---

## Project layout (high level)

- **`frontend/src/`** — routes/UI: editor, live session, lobby, polls, login
- **`backend/app/`** — controllers, models, channels, jobs
- **`backend/config/`** — database, cable, routes, environment config
