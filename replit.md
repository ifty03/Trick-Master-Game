# TrickMaster

A multiplayer trick-taking card game built as a React Native (Expo) mobile app. Players bid on how many points they'll collect per round, then play cards to win tricks. Cards are multiples of 5. Highest card wins each trick.

## Run & Operate

- `pnpm --filter @workspace/mobile run dev` — run the Expo dev server (via workflow)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000, via workflow)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Mobile: Expo SDK 54, Expo Router, React Native 0.81
- Auth: Clerk (`@clerk/expo`) with email/password + email verification
- DB / Realtime: Supabase (PostgreSQL + Realtime subscriptions)
- UI: Custom dark navy + gold theme, Inter fonts, Ionicons

## Where things live

- `artifacts/mobile/` — the Expo mobile app
  - `app/` — Expo Router file-based routing
    - `index.tsx` — root redirect (signed-in → lobby, signed-out → sign-in)
    - `(auth)/sign-in.tsx` — sign in screen
    - `(auth)/sign-up.tsx` — sign up screen with email verification
    - `(home)/lobby.tsx` — room browser + create room modal
    - `(home)/room/[id].tsx` — waiting room (player list, host starts game)
    - `(home)/game/[id].tsx` — main game screen (bidding + trick-playing)
    - `(home)/leaderboard/[id].tsx` — final results / leaderboard
  - `lib/supabase.ts` — Supabase client (lazy init, token-authenticated)
  - `lib/gameLogic.ts` — pure game logic (deal, shuffle, bid scoring, trick resolution)
  - `context/AuthContext.tsx` — Clerk + Supabase profile setup
  - `types/game.ts` — all shared TypeScript types
  - `constants/colors.ts` — design tokens (dark navy #0D1117, gold #C9A84C)

## Architecture decisions

- **Supabase Realtime** drives all live updates (room player joins, game state changes) via `postgres_changes` subscriptions — no polling.
- **Clerk JWT as Supabase auth token** — `getSupabaseWithToken(clerkToken)` passes Clerk's JWT as a Bearer header so RLS policies can verify the caller.
- **Card values are multiples of 5** — deck is generated as `[5, 10, 15, ..., N*5]` where N = players × cards_per_player.
- **Bid scoring**: collected tricks ≥ bid → earn bid points; else earn 0. No penalty.
- **Dealer rotates** each round; first to bid/play is the player after the dealer.
- **Game state is a single row** in `game_states` per room, updated in-place. All players subscribe to it via Realtime.

## Product

- 3–10 players per room
- 10–15 cards per player (configurable when creating room)
- Configurable number of rounds
- Bidding phase: all players submit a bid secretly; revealed once all bids are in
- Playing phase: players take turns playing one card; highest card wins the trick (and all its points)
- After all tricks: scores updated, next round begins or game ends
- Final leaderboard with rank, gold/silver/bronze badges, animated entry

## Required Secrets / Env Vars

| Key | Description |
|-----|-------------|
| `CLERK_PUBLISHABLE_KEY` | Auto-set by Clerk integration |
| `CLERK_SECRET_KEY` | Auto-set by Clerk integration |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable key |

## Supabase Schema

Run this SQL in the Supabase SQL Editor to set up the database:

```sql
create table profiles (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique not null,
  username text not null,
  created_at timestamptz default now()
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  creator_id text not null,
  status text not null default 'waiting',
  cards_per_player int not null default 10,
  total_rounds int not null default 3,
  current_round int not null default 0,
  created_at timestamptz default now()
);

create table room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  clerk_user_id text not null,
  username text not null,
  seat_order int not null,
  joined_at timestamptz default now(),
  unique(room_id, clerk_user_id)
);

create table game_states (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade unique,
  current_round int not null default 1,
  dealer_seat int not null default 1,
  current_turn_seat int not null default 1,
  phase text not null default 'bidding',
  hands jsonb not null default '{}',
  bids jsonb not null default '{}',
  bids_revealed boolean not null default false,
  tricks_collected jsonb not null default '{}',
  current_trick jsonb not null default '[]',
  scores jsonb not null default '{}',
  updated_at timestamptz default now()
);

alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table room_players;
alter publication supabase_realtime add table game_states;

alter table profiles disable row level security;
alter table rooms disable row level security;
alter table room_players disable row level security;
alter table game_states disable row level security;
```

## User preferences

- Dark navy + gold color theme throughout
- Cards as multiples of 5 (5, 10, 15, ...)
- Haptic feedback on key actions

## Gotchas

- The Expo dev script must forward `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=$CLERK_PUBLISHABLE_KEY` — already set in package.json.
- Supabase client is lazily initialized — it won't throw until a query is actually attempted (safe to import before env vars are loaded).
- The `(home)/_layout.tsx` wraps everything in `<AuthProvider>` which upserts the Clerk user's profile to Supabase on first load.
- Game state updates go directly to Supabase from the client that plays the card — there is no server-side game logic (keep this in mind for cheating prevention if needed later).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `clerk-auth` skill for Clerk Expo integration details
