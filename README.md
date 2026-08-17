# vanish — conversations without a trace

> An anonymous, ephemeral stranger chat platform built around consent, curiosity, and a clean exit.

![Vanish Banner](https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200&auto=format&fit=crop)

---

## ⚡ Key Highlights & Principles

1. **Zero Message Persistence:** Messages live **only in Redis** with auto-expiring TTL (default 6h). Zero message content ever touches PostgreSQL or disk.
2. **Rotating Anonymous Identities:** Users receive temporary anonymous IDs (`anon_xxxxxx`) on arrival with 24-hour rotation. Old IDs are pruned with zero linkage.
3. **Fixed ID Option:** Deterministic derivation using SHA-256 + Argon2id password hashing so you can recover a persistent identity across devices without creating linked accounts.
4. **Mutual Consent Handshake:** Starting a chat requires a prompt and mutual acceptance; leaving a chat is always unilateral.
5. **Anti-Abuse & Rate Limiting:** Enforced via Redis token bucket (30 msg/min, 10 match requests/hr, 10 tag edits/hr) + 1-tap Report/Block.
6. **XSS Neutralized:** All inbound messages are HTML-escaped before broadcast.

---

## 🛠️ Tech Stack

- **Frontend:** Next.js 14 (App Router), Tailwind CSS, Lucide Icons, Google Fonts (`Manrope` + `Geist`)
- **Realtime:** Socket.io (custom Node.js server mounting Next.js + Socket.io)
- **Ephemeral Store:** Redis (matching pool, presence, ephemeral messages, rate limits)
- **Durable Store:** PostgreSQL via Prisma (identities, tags, block list only)
- **Security & Auth:** Signed JWT session tokens, Argon2id hashing, security headers

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Docker & Docker Compose](https://www.docker.com/)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/noviciusss/vanish.git
cd vanish
npm install
```

### 2. Configure Environment
Create a `.env` file from the example:
```bash
cp .env.example .env
```

### 3. Start Database & Redis with Docker
```bash
docker compose up -d
```

### 4. Push Prisma Schema
```bash
npx prisma db push
```

### 5. Start Development Server
```bash
npm run dev
```

Visit **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🧪 Testing

### Unit Tests
```bash
npm test
```

### Full E2E Integration Suite
```bash
node src/__tests__/e2e-verify.mjs
```

---

## 📁 Project Structure

```
.
├── docker-compose.yml       # PostgreSQL and Redis services
├── prisma/
│   └── schema.prisma        # Identity, Profile, and Block models
├── src/
│   ├── app/
│   │   ├── layout.tsx       # Root layout with fonts and metadata
│   │   ├── page.tsx         # Vanish landing page + live chat workspace
│   │   ├── onboarding/      # Dedicated Identity Space setup
│   │   ├── setup/           # Interest topic tags picker
│   │   ├── room/[id]/       # Full-page ephemeral chat room
│   │   └── api/             # Auth, Profile, Report endpoints
│   ├── components/
│   │   ├── ChatRoom.tsx     # Afterglow / Midnight-Orbit chat interface
│   │   ├── MatchController.tsx # Nearest/Random matching radar
│   │   ├── TagPicker.tsx    # Topic chips with search filtering
│   │   └── FixedIdModal.tsx # Argon2 passphrase modal
│   ├── lib/
│   │   ├── identity.ts      # ID generation, rotation & Argon2 derivation
│   │   ├── jwt.ts           # JWT session token signing & verification
│   │   ├── matching.ts      # Jaccard similarity & Redis match pool
│   │   ├── prisma.ts        # Prisma client singleton
│   │   ├── ratelimit.ts     # Redis token-bucket rate limiter
│   │   ├── redis.ts         # Redis client singleton
│   │   └── socket-server.ts # Socket.io realtime server engine
│   └── server.ts            # Custom Node server mounting Next.js + Socket.io
└── tailwind.config.ts       # Vanish design tokens & typography
```

---

## 🔒 Security

- Messages auto-expire via Redis native `EXPIRE`.
- Unilateral exit starts instant room cleanup.
- Blocked users are stored strictly by `reporter_id` and `blocked_id` pairs (no raw content recorded).

---

## 📄 License

MIT License.
