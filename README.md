# ProSlides (bachelor project)

Monorepo: **`frontend/`** (Vite, React) and **`backend/`** (Rails API).

## Local development

- Backend: `cd backend` → `bundle install` → `bin/rails server`
- Frontend: `cd frontend` → `npm install` → `npm run dev`

Copy **`backend/.env.example`** to **`backend/.env`** (gitignored) for secrets and local config.

## Deployment (Kamal)

- Windows (repo root): `.\scripts\kamal.ps1 deploy`
- Any OS: `cd backend` → `bundle exec kamal deploy`

Docker build context is the **repository root**; the image is defined in **`backend/Dockerfile`** (see **`backend/config/deploy.yml`**).
