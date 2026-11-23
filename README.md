# Samouna

Bread and pastry delivery for bakeries in Duhok and Sharya. There are two installable PWAs and one API behind them.

| Part | Path | Production URL |
|---|---|---|
| Customer PWA ("Samouna") | `apps/customer` | https://samouna.iq |
| Bakery PWA ("Samouna Bakery") | `apps/bakery` | https://bakery.samouna.iq |
| REST API + WebSockets | `server` | https://api.samouna.iq |
| Shared code (phone rules, order rules, i18n, UI) | `packages/shared` | — |

## Run locally

Requires Node 20+ and PostgreSQL.

```bash
cp .env.example .env          # leave META_* blank: OTP codes print to the API console
npm install
npm run db:seed               # creates the schema plus 3 sample bakeries (owner phones 0750 000 0001..3)
npm run dev:api               # :4000
npm run dev:customer          # :5173
npm run dev:bakery            # :5174
```

In dev mode the OTP modal also shows the code. This only happens when Meta credentials are missing and `NODE_ENV` is not `production`.

## Tests

```bash
npm test                      # API integration tests against real Postgres (TEST_DATABASE_URL)
node tools/e2e-smoke.cjs out/ # browser test across both PWAs (needs the 3 dev servers + seeded DB)
```

## How the rules are enforced

- **Phone normalization:** `packages/shared/src/phone.js` accepts `0750…`, `750…`, `+964…` and `00964…`, with spaces, dashes or Arabic-Indic digits, and outputs `9647XXXXXXXXX`.
- **OTP:** codes are stored as HMAC hashes. Each number can request 3 codes per rolling hour, guarded by an advisory lock so parallel requests can't bypass it. Codes expire after 5 minutes and lock after 5 wrong attempts. Each IP is also limited to 20 requests per hour.
- **5-minute cancel:** a single atomic `UPDATE … WHERE status='pending' AND created_at > now() - 5 min`. Whichever of "cancel" and "accept" commits first wins, and the other gets a 409.
- **Single-tap pipeline:** the client sends the status it saw (`from`). Double taps or two devices tapping together advance the order exactly one step.
- **Store isolation:** `store_id` comes from the signed token, never from the request. Tokens carry an audience (`customer` or `bakery`), so a customer token can't call bakery endpoints.
- **Transactions:** a Postgres trigger logs every order that reaches `completed`, whichever code path completed it.
- **Prices:** always read from the DB. Client-sent prices are ignored. Orders carry a `clientRequestId`, so a retried submit on bad 3G creates only one order.
- **Realtime:** WebSocket channels are `public` (stock and open/closed), `store:<id>` and `customer:<id>`. Clients refetch after every reconnect, so updates missed while offline are recovered.

## Deploy

1. **Database + API** (Railway, Render, DigitalOcean): set `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET` (32+ chars), `CORS_ORIGINS=https://samouna.iq,https://bakery.samouna.iq`, `TRUST_PROXY=1`, `META_PHONE_NUMBER_ID`, `META_ACCESS_TOKEN`. Start command: `npm -w server start`. The schema migrates automatically on boot. The API refuses to start in production if any of these are missing.
2. **WhatsApp template:** in Meta Business Manager, create an **Authentication** template named `samouna_otp` in Arabic and English, with a copy-code button. Meta has no Kurdish option for auth templates, so Badini users receive the Arabic one.
3. **Frontends** (Vercel): create two projects, root `apps/customer` and root `apps/bakery`, each with `VITE_API_URL=https://api.samouna.iq`. Attach `samouna.iq` and `bakery.samouna.iq` respectively. Routing is hash-based, so no rewrites are needed.
4. **Onboard bakeries:** copy `server/scripts/sample-bakeries.json`, fill in real owners, products and prices, then run `npm -w server run onboard -- bakeries.json`. Re-running it is safe.

## Known limits / next steps

- The realtime bus is in-process. If you run more than one API instance, switch `server/src/events.js` to Postgres LISTEN/NOTIFY or Redis.
- Bakery staff share the owner's WhatsApp number to log in, as specified. A `store_staff` table would allow per-cashier logins.
- **Have a native Duhok speaker proof-read the Badini strings** in `packages/shared/src/i18n.js` before launch.
