# Epipheo Music Resource

A curated internal music library for Epipheo — browse, preview, playlist, and download licensed tracks for use in video projects.

---

## Overview

Epipheo Music Resource is a full-stack web application that gives Epipheo team members a single place to:

- **Browse** a curated library of music tracks with genre, mood, and attribute filters
- **Preview** tracks with a persistent waveform player
- **Build playlists** inside named projects and share them with teammates via a link
- **Download** clean WAV files (and optional stems) through a cart-and-checkout flow
- **Administer** the library — upload tracks, manage users, view download analytics, and configure watermarking

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Tailwind CSS 4, shadcn/ui |
| Backend | Node.js, Express 4, tRPC 11 |
| Database | MySQL / TiDB (via Drizzle ORM) |
| Auth | Manus OAuth (session cookies + JWT) |
| File Storage | S3-compatible object storage |
| Build Tool | Vite |
| Testing | Vitest |

---

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm
- A MySQL-compatible database (connection string in `DATABASE_URL`)

### Installation

```bash
# Clone the repository
git clone https://github.com/epipheomanus/stock-music-app.git
cd stock-music-app

# Install dependencies
pnpm install

# Apply database migrations
pnpm drizzle-kit generate
# Then apply the generated SQL via your database client

# Start the development server
pnpm dev
```

The app will be available at `http://localhost:3000`.

---

## Environment Variables

The following environment variables are required. Copy `.env.example` to `.env` and fill in the values.

| Variable | Description |
|---|---|
| `DATABASE_URL` | MySQL/TiDB connection string |
| `JWT_SECRET` | Secret used to sign session cookies |
| `VITE_APP_ID` | Manus OAuth application ID |
| `OAUTH_SERVER_URL` | Manus OAuth backend base URL |
| `VITE_OAUTH_PORTAL_URL` | Manus login portal URL (frontend) |
| `BUILT_IN_FORGE_API_URL` | Manus built-in API base URL |
| `BUILT_IN_FORGE_API_KEY` | Bearer token for server-side Manus API calls |
| `VITE_FRONTEND_FORGE_API_KEY` | Bearer token for client-side Manus API calls |
| `VITE_FRONTEND_FORGE_API_URL` | Manus built-in API URL for the frontend |

---

## Project Structure

```
client/          # React frontend (Vite)
  src/
    pages/       # Page-level components
    components/  # Reusable UI components
    contexts/    # React contexts (Auth, Cart, Player, Theme)
    hooks/       # Custom React hooks
    lib/         # tRPC client binding
drizzle/         # Database schema and migrations
server/          # Express + tRPC backend
  routers.ts     # tRPC procedure definitions
  db.ts          # Database query helpers
  storage.ts     # S3 file storage helpers
shared/          # Shared constants and types
```

---

## Running Tests

```bash
pnpm test
```

---

## License

Copyright © 2025 Epipheo. All rights reserved. See [LICENSE](LICENSE) for details.
