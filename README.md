# Pay Portal

One Next.js app: the UI and the backend API live in the same project.

```
src/
  app/
    (backend)/api/...      Route handlers — the backend (auth, users, health)
    (frontend)/login       Login page
    (frontend)/change-password   Forced password change (temporary password)
    (frontend)/(dashboard)/      Sidebar layout: home, managers, account/password
  server/                  Server-only code: env config, database (Turso) client, schema/seed, session, helpers
  store/                   Redux store + RTK Query API (src/store/api.ts)
  i18n/                    Translations (en, si, ta) and the useT() hook
  utils/menu.ts            Side navigation items (names, icons, roles)
  proxy.ts                 Page-level auth redirects (Next 16 "proxy", formerly middleware)
```

## Setup

```bash
cp .env.example .env.local   # then fill in TURSO_DATABASE_URL, TURSO_AUTH_TOKEN and JWT_SECRET
npm install
npm run dev
```

The database is [Turso](https://turso.tech) (libSQL / SQLite). On first start the app creates
the tables (`src/server/db/schema.ts`) and, if there are no accounts, a super admin `admin` /
`admin` (in production: `DEFAULT_ADMIN_PASSWORD`, 12+ characters). That account must set a new
password on first login. For local work without Turso, `TURSO_DATABASE_URL=file:local.db`.

Moving from the old Postgres database: set `OLD_DATABASE_URL` and run
`node_modules/.bin/jiti scripts/copy-postgres-to-turso.mts` (`--replace` to copy again).

## Roles

- **super_admin** — the seeded admin. Can create, disable, delete managers and reset their passwords.
- **manager** — can sign in and change their own password. Cannot create managers.

New managers and reset passwords are temporary: the user is forced to change them on next login.
Logout, password change, reset and disable all revoke existing sessions (token version in the DB).

## API docs (Swagger)

- Swagger UI: http://localhost:3000/api/docs
- OpenAPI JSON: http://localhost:3000/api/docs/openapi.json

The spec lives in `src/server/openapi.ts`; request bodies are generated from the same zod
schemas the routes validate with (`src/server/schemas.ts`), so they can't drift. Run
`POST /auth/login` with "Try it out" first — the session cookie is then sent with the other calls.
Docs are on in development and off in production unless `API_DOCS=true`.
