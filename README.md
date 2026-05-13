# ProSlides (bachelorprosjekt)

ProSlides er en webapp for a lage og holde presentasjoner. Løsningen har redigering av slides i nettleseren (Fabric.js), live-presentasjon med deltakere via Action Cable, samt publikumsinteraksjon fra mobil.

Repoet er et monorepo:

| Mappe | Innhold |
|------|------|
| `frontend/` | Vite + React + TypeScript (SPA) |
| `backend/` | Rails 8 API, PostgreSQL, OmniAuth og Action Cable |

## Funksjoner

- Lage, redigere og lagre presentasjoner
- Starte live-sesjoner med join-kode
- Publikum kan koble seg til fra mobil/nettleser
- Polls/spørsmal i live-visning
- OAuth-støtte for Google/GitHub (valgfritt)

---

## Lokal utvikling

### Krav

- Ruby `~> 3.4.8` + Bundler (se `backend/Gemfile`)
- Node.js (LTS) + npm
- PostgreSQL (lokalt eller hostet), tilgjengelig via `DATABASE_URL`

Merk: Redis er ikke nødvendig lokalt. `backend/config/cable.yml` bruker `async` i development.

### 1) Start backend

```bash
cd backend
cp .env.example .env
```

Oppdater `backend/.env`:

- `DATABASE_URL` må peke til PostgreSQL
- `SECRET_KEY_BASE` må settes (kan være en tilfeldig streng lokalt)
- OAuth/CORS-variabler er valgfritt og dokumentert i `.env.example`

Kjør deretter:

```bash
bundle install
bin/setup
bin/rails server
```

Backend kjøres som standard på `http://localhost:3000`.

### 2) Start frontend

I et nytt terminalvindu:

```bash
cd frontend
npm install
npm run dev
```

Frontend kjøres på `http://localhost:5173`.

Vite-proxy sender:

- `/api` -> backend
- `/cable` -> backend (WebSocket)

Hvis du trenger annen backend-origin i dev, kopier `frontend/.env.example` til `frontend/.env` og sett for eksempel:

```bash
VITE_DEV_BACKEND_ORIGIN=http://localhost:3002
```

### Nyttige kommandoer

| Hvor | Kommando | Hva den gjør |
|-------|---------|---------|
| `frontend/` | `npm run lint` | Kjører ESLint |
| `frontend/` | `npm run build` | Lager produksjonsbuild |
| `frontend/` | `npm run test:e2e` | Kjorer Playwright E2E-tester |
| `frontend/` | `npm run test:e2e:ui` | Åpner Playwright UI-modus |

---

## Struktur (kort)

- `frontend/src/`: UI, editor, live session, lobby, polls og autentisering
- `backend/app/`: controllere, modeller og channels
- `backend/config/`: routes, database, cable og miljø-konfig
