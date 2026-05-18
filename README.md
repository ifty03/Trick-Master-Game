# TrickMaster

A multiplayer trick-taking card game built as a React Native (Expo) mobile app with a Node.js + MongoDB backend.

## Architecture

| Layer | Stack |
|-------|--------|
| Mobile | Expo SDK 54, Expo Router, Clerk auth, Socket.io client |
| Backend | **D:\CardGameServer** — Express, Mongoose, MongoDB, Socket.io |

Supabase is **no longer used**. All data and realtime sync go through the CardGame server.

## Run locally

### 1. Backend (`D:\CardGameServer`)

```bash
cd D:\CardGameServer
npm install
# Edit .env — set MONGODB_URI and CLERK_SECRET_KEY
npm run dev
```

Server: `http://localhost:5000`

### 2. Mobile (`d:\CardGame`)

```bash
cd d:\CardGame
npm install
```

Create `d:\CardGame\.env`:

```
EXPO_PUBLIC_API_URL=http://YOUR_PC_LAN_IP:5000
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
```

Use your PC's LAN IP (not `localhost`) when testing on a physical device.

```bash
npm run dev
```

## Required secrets

| App | Variable | Description |
|-----|----------|-------------|
| Server | `MONGODB_URI` | MongoDB connection string |
| Server | `CLERK_SECRET_KEY` | Clerk secret for JWT verification |
| Mobile | `EXPO_PUBLIC_API_URL` | CardGame server URL |
| Mobile | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |

## Game flow

- 3–10 players per room
- Seats randomized when host starts
- **Dealing** → review hand → **Bidding** (clockwise) → **Playing** (tricks)
- Leaderboard at game end

## Project layout

- `d:\CardGame/` — Expo mobile application
- `D:\CardGameServer/` — Node.js API + Socket.io (separate repo folder)

See `D:\CardGameServer\README.md` for API and socket event documentation.
