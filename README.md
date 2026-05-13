# ProSlides (bachelorprosjekt)

ProSlides er en webapp for a lage og holde presentasjoner. Losningen har redigering av slides i nettleseren (Fabric.js), live-presentasjon med deltakere via Action Cable, samt publikumsinteraksjon fra mobil.

Repoet er et monorepo:

| Mappe | Innhold |
|------|------|
| `frontend/` | Vite + React + TypeScript (SPA) |
| `backend/` | Rails 8 API, PostgreSQL, OmniAuth og Action Cable |

## Funksjoner

- Lage, redigere og lagre presentasjoner
- Starte live-sesjoner med join-kode
- Publikum kan koble seg til fra mobil/nettleser
- Polls/sporsmal i live-visning
- OAuth-stotte for Google/GitHub (valgfritt)

---

## Lokal utvikling

### Krav

- Ruby `~> 3.4.8` + Bundler (se `backend/Gemfile`)
- Node.js (LTS) + npm
- PostgreSQL (lokalt eller hostet), tilgjengelig via `DATABASE_URL`

Merk: Redis er ikke nodvendig lokalt. `backend/config/cable.yml` bruker `async` i development.

### 1) Start backend

```bash
cd backend
cp .env.example .env
```

Oppdater `backend/.env`:

- `DATABASE_URL` ma peke til PostgreSQL
- `SECRET_KEY_BASE` ma settes (kan vaere en tilfeldig streng lokalt)
- OAuth/CORS-variabler er valgfritt og dokumentert i `.env.example`

Kjor deretter:

```bash
bundle install
bin/setup
bin/rails server
```

Backend kjores som standard pa `http://localhost:3000`.

### 2) Start frontend

I et nytt terminalvindu:

```bash
cd frontend
npm install
npm run dev
```

Frontend kjores pa `http://localhost:5173`.

Vite-proxy sender:

- `/api` -> backend
- `/cable` -> backend (WebSocket)

Hvis du trenger annen backend-origin i dev, kopier `frontend/.env.example` til `frontend/.env` og sett for eksempel:

```bash
VITE_DEV_BACKEND_ORIGIN=http://localhost:3002
```

### Nyttige kommandoer

| Hvor | Kommando | Hva den gjor |
|-------|---------|---------|
| `frontend/` | `npm run lint` | Kjorer ESLint |
| `frontend/` | `npm run build` | Lager produksjonsbuild |
| `frontend/` | `npm run test:e2e` | Kjorer Playwright E2E-tester |
| `frontend/` | `npm run test:e2e:ui` | Apner Playwright UI-modus |

---

## Struktur (kort)

- `frontend/src/`: UI, editor, live session, lobby, polls og autentisering
- `backend/app/`: controllere, modeller og channels
- `backend/config/`: routes, database, cable og miljo-konfig
