# XVault

XVault is a private archive for X bookmarks. It copies bookmarks and their media into a personal library, then lets each user search, filter, and organise that library with categories and notes.

The important distinction is that this is an archive, not another X client. Once a bookmark has been saved, it remains in XVault even if the original post disappears from X.

## What it does

- Periodically syncs bookmarks from a connected X account
- Keeps tweet text, author details, links, and media
- Avoids importing the same bookmark twice
- Organises bookmarks into user-created categories
- Supports search, filters, notes, and uncategorised bookmarks
- Can suggest categories with Anthropic, when configured
- Shows sync health and failed-run details in Settings
- Keeps users and their archives isolated from one another
- Uses invite-only registration

## Stack

- **Web:** Nuxt 4, Vue, TypeScript, Tailwind CSS
- **API:** Express 5 and TypeScript
- **Data:** MongoDB with Mongoose
- **Jobs:** BullMQ backed by Redis
- **Browser automation:** Playwright
- **Media:** Cloudflare R2 (S3-compatible storage)
- **Authentication:** JWT access tokens and rotating, httpOnly refresh cookies

## Requirements

- Node.js 20.19 or newer
- npm
- MongoDB
- Redis
- A Chromium installation managed by Playwright
- A Cloudflare R2 bucket if media should be archived

Install the browser used by the scraper after installing dependencies:

```bash
npx playwright install chromium
```

## Getting started

From the `XShare` directory:

```bash
npm install
```

Create `server/.env` with the required values below. The API validates its configuration at startup, so a missing or malformed value is reported immediately.

```dotenv
NODE_ENV=development
WEB_ORIGIN=http://localhost:3000
PORT=4000

MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=xvault
REDIS_URL=redis://127.0.0.1:6379

JWT_ACCESS_SECRET=replace-with-a-long-random-string
JWT_REFRESH_SECRET=replace-with-another-long-random-string
SESSION_ENCRYPTION_KEY=replace-with-a-base64-encoded-32-byte-key
```

The JWT secrets must be at least 32 characters. Generate the session encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Optional configuration

Add these when you need the corresponding feature:

```dotenv
# Archive images and videos
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_ROOT_PREFIX=xvault

# Suggest categories with AI
ANTHROPIC_API_KEY=
AI_MODEL=claude-sonnet-5

# Scraping defaults
SCRAPE_INTERVAL_HOURS=72
SCRAPE_HEADLESS=true
SCRAPE_MAX_BOOKMARKS_PER_RUN=1000
SCRAPE_KNOWN_STREAK_STOP=25
```

R2 is optional while developing the API, but media archival is skipped until all four R2 credentials are present. The remaining settings, including cookie behaviour and token lifetimes, have safe defaults in `server/src/config/env.ts`.

## Running locally

Start each process in a separate terminal:

```bash
# Nuxt app
npm run dev:web

# Express API
npm run dev:api

# Bookmark and media worker
npm run dev:worker
```

The web app runs at [http://localhost:3000](http://localhost:3000). The API runs at [http://localhost:4000](http://localhost:4000), with a simple health check at `/api/health`.

The worker is separate from the API because a sync can take several minutes and needs a real browser. The API queues the work; the worker performs it.

## First-time setup

Registration requires an invite. Create the first invite from the server workspace:

```bash
npm run invite --workspace server -- --label "First user" --days 14
```

Give the printed code to the person registering. Invite codes are single-use, and the raw code is not stored in the database.

After creating the XVault account, connect its X account from the machine that has `server/.env` and the encryption key:

```bash
npm run connect-x --workspace server -- you@example.com
```

A visible Chromium window will open. Sign in to X there and complete any verification it requests. The X session is encrypted before it is stored, and connecting the account schedules recurring syncs for that user.

You can then start the first sync from Settings in the web app. A full rescan is also available there when needed.

## Useful commands

```bash
npm run build
npm run typecheck
npm test

# Check the configured R2 bucket
npm run verify-r2 --workspace server

# Clear a stuck sync lock
npm run reset-sync --workspace server
```

## Project layout

```text
server/
  src/
    modules/       API features: auth, bookmarks, categories, sync, media
    scraper/       Playwright session and bookmark scraping
    jobs/          BullMQ queues and scheduling
    models/        Mongoose models
    scripts/       Invite, X connection, sync, and storage utilities
web/
  app/
    pages/         Library, login, registration, and settings
    components/    Library cards, navigation, categories, and media UI
    composables/   API, auth, category, and sync state
docs/
  AGENT.md         Product and engineering constraints
  DESIGN.md        Interface direction and interaction rules
```

## A note about X sessions

X login is intentionally not exposed as a web form or API endpoint. The connection command opens a real browser so challenges and verification stay in X's own interface. XVault stores the resulting browser session, not the X password, and only exposes connection status back to the app.

This is a small private application for a trusted group of users. It is not intended to bypass X access controls or operate as a public scraping service.
