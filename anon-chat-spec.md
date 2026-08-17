# Anonymous Stranger Chat — Implementation Spec

**Status:** For-fun side project, not portfolio-critical. Optimize for working v1 over polish.
**Target implementer:** AI coding agent (Antigravity / Claude Sonnet 5)

## 1. Concept

A chat app where strangers connect under rotating anonymous IDs, matched either
by shared interest tags or fully at random, with ephemeral messages and strict
one-sided-exit semantics. Only the ID is ever visible to the other party.

## 2. Core Principles (do not violate these while implementing)

1. No persistent link between a user's rotating IDs is ever stored.
2. Messages are never persisted to durable storage — they live only in
   ephemeral, auto-expiring storage.
3. Starting a chat requires mutual consent; ending a chat never does.
4. Every socket-level action (room join, message send, profile edit) is
   rate-limited server-side. Never trust the client for caps or limits.
5. IP addresses are never stored in plaintext or linked to an ID in any
   persistent table.

## 3. Identity System

- On first visit, generate an anonymous `identity_id` (e.g. `anon_x7k2p`)
  server-side, signed into a short-lived JWT session token.
- **Rotation:** by default, identity regenerates every 24h (server cron or
  lazy check on session refresh). Old ID is invalidated; no old→new mapping
  is stored anywhere, including logs.
- **Fixed ID (opt-in):** user sets a recovery passphrase. The passphrase is
  hashed (Argon2) and used to deterministically re-derive the same
  `identity_id` on future visits — so it survives rotation without Anthropic-
  style "linked accounts" existing anywhere.
- Session token is the only credential. No email, no phone, no password
  login flow.

## 4. Profile & Tags

- On first use, user picks/edits a list of tags (interests/topics) — free
  text or from a curated list, capped at ~10 tags.
- Tags are editable any time; edits don't affect the current ID.
- Tags are stored against `identity_id` only (Postgres), never against any
  raw personal identifier.

## 5. Matching

Two modes, both server-side:

- **Nearest match:** simple tag-overlap scoring (Jaccard similarity) against
  the pool of currently-online users looking to match. No embeddings/vector
  DB for v1 — overkill for this scale and slows down shipping. Revisit as a
  v2 upgrade if wanted later.
- **Random:** uniform random pull from the online-and-available pool.

Matching pool lives in Redis (a set of online `identity_id`s + their tags),
not Postgres — it needs to be fast and is inherently transient state.

## 6. Chat Rooms

- **Starting:** always a request/accept handshake. Requester sends a
  `chat_request` socket event; target gets a prompt; room is created only on
  `chat_accept`. No unsolicited message delivery ever.
- **Group size:** max 3 participants per room, enforced server-side at
  join-time (reject the join, don't just hide the UI option).
- **Ending:** any single participant can leave unilaterally
  (`leave_room` event). Remaining participant(s) get a "they left" system
  message. The room does not wait for all parties to leave before starting
  its expiry countdown.
- **New/random button:** leaving a room and immediately re-queuing for a new
  match is a first-class one-tap action, not a multi-step flow.

## 7. Ephemeral Messages

- Messages live in Redis only, keyed per room, e.g. `room:{id}:messages`.
- `EXPIRE` is set on room creation to the configured TTL (config value, not
  hardcoded — pick a default like 6h).
- No live countdown UI. Just a static, one-line note in the room header:
  "Messages in this chat auto-expire — nothing is stored long-term."
- When TTL fires, Redis deletes the key natively. No cleanup job needed.

## 8. Security & Abuse Prevention (non-negotiable for this category)

Anonymous stranger chat is a high-abuse-risk category (see Omegle's
shutdown). v1 must ship with, at minimum:

- **Rate limiting** (Redis token bucket) per `identity_id` on: chat requests
  sent, messages sent per minute, profile edits per hour.
- **Report button:** visible at all times in an active chat. On report:
  (a) instantly end the room for the reporter, (b) block that target
  `identity_id` from being matched with the reporter again (store a
  reporter→blocked-id pair, not raw content).
- **Input sanitization** on every inbound message before broadcast (strip/
  escape HTML — no raw HTML rendering in the chat UI, ever).
- **Transport security:** WSS (TLS) only, no plaintext WS in any environment
  including local dev if it can be avoided.
- **No true E2E encryption in v1** — server can technically see messages in
  transit but never stores them. Be explicit about this distinction if it
  ever comes up publicly; don't market it as E2E.

## 9. Tech Stack

- **Frontend:** Next.js + Tailwind
- **Realtime:** Socket.io (rooms map directly to the 3-person cap)
- **Ephemeral store:** Redis (matching pool, presence, messages, rate limits)
- **Durable store:** Postgres (identity records, tags, block list) — no
  message content ever touches Postgres
- **Auth:** signed JWT session tokens, no password login

## 10. Data Model (Postgres)

```
identities: id, created_at, is_fixed, passphrase_hash (nullable)
profiles:   identity_id (FK), tags (text[])
blocks:     reporter_id (FK), blocked_id (FK), created_at
```

Redis keys:
```
online:pool                → set of identity_ids currently matchable
online:{id}:tags           → tags snapshot for fast matching
room:{id}:participants     → set, max size 3
room:{id}:messages         → list, TTL = configured expiry
ratelimit:{id}:{action}    → token bucket counters
```

## 11. Socket Event Contract

```
client → server: request_match { mode: "nearest" | "random" }
server → client: match_found { room_id, peer_ids }
client → server: chat_request { target_id }
server → client: chat_request_received { from_id }
client → server: chat_accept { from_id }
server → client: room_ready { room_id }
client → server: send_message { room_id, text }
server → client: message_received { room_id, from_id, text, ts }
client → server: leave_room { room_id }
server → client: peer_left { room_id, peer_id }
client → server: report_user { room_id, target_id }
server → client: report_ack { blocked_id }
```

## 12. UI/UX Direction

Keep it minimal and legible — this category lives or dies on trust and
clarity, not decoration. Reference points worth pulling from:

- **Signal** — the industry benchmark for "privacy-first but not sterile";
  its disappearing-messages affordance is worth studying directly.
- **Telegram's redesigned interaction layer** — clean gesture-driven chat
  actions (swipe to reply/leave) translate well to a "leave/report/new
  match" action set.
- Modern chat-UI pattern guides converge on: clear message-bubble hierarchy,
  visible-but-unobtrusive status/typing indicators, and high-contrast,
  accessible color pairing (WCAG AA minimum) — all straightforward to hit
  with Tailwind + a constrained palette.

**Recommended build path for the UI itself:** since the stack is Next.js,
**v0 by Vercel** (v0.app) is the right AI tool for this — it generates
production React/Tailwind/shadcn components that drop directly into a
Next.js codebase, which fits this project better than a no-code full-stack
builder like Lovable (which assumes it owns the backend too, and you already
have Redis/Postgres/Socket.io chosen). Prompt it screen-by-screen: profile
setup, matching/waiting screen, active chat room, report/block confirmation.

## 13. Build Order

1. Identity + rotation + profile/tags (no chat yet)
2. Socket room join/leave via direct room codes (no matching yet) — prove
   realtime layer works end-to-end
3. Matching (tag-overlap + random)
4. Ephemeral TTL on messages/rooms
5. Report/block + rate limiting
6. UI pass (v0-generated components wired into the above)
