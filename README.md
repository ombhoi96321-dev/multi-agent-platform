# MultiAgent — Research / Coding / Interview / PDF / Image, with accounts

A Next.js (App Router) app with five AI agents, backed by a real
Postgres database and email/password authentication. Conversations and
messages are stored per-user in Postgres — nothing lives in the
browser's localStorage anymore.

## 1. Get a Postgres database

Any Postgres works — a local install, or a free managed one (Neon,
Supabase, Railway, Render all have free tiers). You just need a
connection string that looks like:

```
postgres://user:password@host:5432/dbname
```

Then create the tables:

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

(If you don't have `psql` locally, most managed providers give you a
web SQL editor — paste the contents of `db/schema.sql` there instead.)

## 2. Install

```bash
cd multi-agent-platform
npm install
```

## 3. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in `.env.local` at the **project root** (next to `package.json`):

```
GROQ_API_KEY=...        # https://console.groq.com/keys
HUGGINGFACE_API_KEY=... # https://huggingface.co/settings/tokens (Read token)
DATABASE_URL=...        # your Postgres connection string
DATABASE_SSL=true       # "false" only for local Postgres with no SSL
JWT_SECRET=...          # any long random string, e.g. `openssl rand -base64 32`
```

Every one of these is read only on the server — none of them are ever
sent to the browser.

## 4. Run

```bash
npm run dev
```

Open http://localhost:3000 — you'll land on `/login` since there's no
session yet. Click **Create one** to register, which logs you in
automatically and takes you to the chat.

## How authentication works

- Passwords are hashed with bcrypt before they ever touch the database
  (`lib/auth.js`) — the plaintext password is never stored.
- On login/register, the server signs a JWT containing `{id, name,
  email}` and sets it as an **httpOnly** cookie (`session_token`) —
  JavaScript in the browser can't read it, which is what stops it
  being stolen via XSS.
- Every API route that touches user data (`/api/chat`, `/api/image`,
  `/api/conversations/*`) calls `getCurrentUser()` first and returns
  `401` if there's no valid session — this is the real security
  boundary, not just a client-side redirect.
- `app/page.js` also checks `/api/auth/me` on load and redirects to
  `/login` if there's no session, so you never see a flash of someone
  else's chat.
- Logging out (`POST /api/auth/logout`) just clears the cookie.

## Project layout

```
app/
├── api/
│   ├── auth/
│   │   ├── register/route.js   ← create account, hash password, set session
│   │   ├── login/route.js      ← verify password, set session
│   │   ├── logout/route.js     ← clear session
│   │   └── me/route.js         ← who's currently logged in (or null)
│   ├── conversations/
│   │   ├── route.js            ← list / create conversations for the user
│   │   └── [id]/route.js       ← read+messages / rename+switch-agent / delete
│   ├── chat/route.js           ← research/coding/interview/pdf agents, persists to DB
│   └── image/route.js          ← image generation, persists to DB
├── login/page.js
├── register/page.js
├── globals.css
├── layout.js
└── page.js                     ← main chat UI, backend-driven (no localStorage)
lib/
├── ai/
│   ├── groq.js
│   └── huggingface.js
├── ui/
│   └── Markdown.js
├── auth.js                     ← password hashing + JWT session cookie
└── db.js                       ← Postgres pool + query helper
db/
└── schema.sql                  ← run this once against your database
```

## Data model

```
users          (id, name, email, password_hash, created_at)
conversations  (id, user_id → users, agent_id, title, created_at, updated_at)
messages       (id, conversation_id → conversations, role, content, file_name, image_data, created_at)
```

Deleting a user cascades to their conversations and messages
(`ON DELETE CASCADE`), so there's no orphaned data.

## If something still breaks

1. Stop the dev server (`Ctrl+C`).
2. `rm -rf .next` (or PowerShell: `Remove-Item -Recurse -Force .next`).
3. `npm run dev` again.
4. Reproduce the error, then check the **server terminal**, not just
   the browser — every route logs the real cause (`CHAT API ERROR:`,
   `IMAGE API ERROR:`, `REGISTER ERROR:`, `LOGIN ERROR:`).
5. A `DATABASE_URL is missing` or `JWT_SECRET is missing` error means
   `.env.local` isn't being picked up — confirm it's at the project
   root and that you restarted `npm run dev` after editing it (Next.js
   only reads env vars at server start).

## Security notes

- Never put `GROQ_API_KEY`, `HUGGINGFACE_API_KEY`, `DATABASE_URL`, or
  `JWT_SECRET` in any client component (`page.js`, `login/page.js`,
  etc.) — they belong only in `.env.local` and are read exclusively by
  server-side files (`lib/*.js`, `app/api/**/route.js`).
- If you ever paste a real API key into a chat, a screenshot, or a
  committed file, treat it as compromised and rotate it immediately at
  the provider's dashboard.
- `.env.local` should never be committed to git — add it to
  `.gitignore` if it isn't already.
