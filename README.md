# Corridor — Nigeria ↔ Bolivia in minutes

**Naira in Lagos. Bolivianos in La Paz. Minutes, not days.**

Corridor is the African leg of an Africa ↔ Latin America corridor on Stellar,
built for the Pollar hackathon. It connects any Nigerian bank account to
Pollar's Bolivia (BOB) ramp — non-custodially — so that money can go
**Nigeria → Bolivia**, **Bolivia → Nigeria**, and in and out of a Stellar
wallet from a Nigerian bank, in one sentence:

> I want to send money to **a bank in Nigeria**, paying with **my balance**, and the amount is **$25**.

- **Pollar** owns identity, the Stellar wallet (Google / email sign-in,
  sponsored fees) and the Bolivian ramp (`@pollar/react`, `@pollar/core`).
- **Weave** owns the Nigerian leg: bank rails, account-name verification,
  routing, and the Stellar → Base hop via LI.FI / Circle CCTP. Weave is also a
  **SEP-10 / SEP-24 Stellar anchor for NGN**, so any Stellar wallet — not just
  Pollar's — can deposit and withdraw naira through it.
- **Nobody in the middle holds the money.** The payer signs; Circle's CCTP
  carries it in flight; the payout provider holds it for seconds.

The Nigerian leg is **already live on mainnet**: 2 USDC from a personal Stellar
wallet became ₦2,698.94 in a PalmPay account in 1 min 23 s
([Stellar tx](https://stellar.expert/explorer/public/tx/3b04306949879f24384c0b2ccc50c1209a121cb531a5b238e372818f0c8a5b48) ·
[Base tx](https://basescan.org/tx/0x2eed4f577d75c19f028f86d770ff1d15e634453b8cd4359ee706245cb89dc701)).
The app's `/mainnet` page re-checks that hash against Horizon every time it loads.

## What you can do in the app

| Send to | Paying with | What happens |
| --- | --- | --- |
| a bank in Nigeria | my balance | USDC leaves the Pollar wallet → naira in any Nigerian bank (~3 min) |
| a bank in Nigeria | a Bolivian bank QR | Pollar on-ramp (BOB → USDC) → naira payout |
| a bank in Bolivia | my balance | Pollar off-ramp (USDC → BOB, ACH) |
| a bank in Bolivia | a naira bank transfer | Weave deposit (NGN → USDC) → Pollar off-ramp |
| a friend on Corridor | my balance | Sponsored Stellar payment to an @handle or G-address |
| a friend on Corridor | a naira bank transfer | Weave deposit straight into their wallet |
| a friend on Corridor | a Bolivian bank QR | Pollar on-ramp straight into their wallet |

Plus **Add money** (naira → your wallet), **Get paid at @handle** (a request
link a Nigerian payer opens without signing in), **Withdraw to my bank**, and a
first-run tour that walks a brand-new user through their first top-up.

## Testnet vs. mainnet — network follows credentials

There is no "mainnet mode" flag. Like Weave's own sandbox / live environments,
the switch in the header picks a **credential pair** — Pollar's publishable key
and Weave's secret key for that environment — and everything else follows:
USDC issuer, explorer, the real bridge vs. a simulator, the real BOB ramp vs. a
mock.

The hosted demo runs on **testnet**, as the Pollar team asked for hackathon
builds, with these clearly-labelled stand-ins:

| Leg | Testnet | Mainnet |
| --- | --- | --- |
| Wallet, sign-in, sponsored fees | Pollar (real, testnet) | Pollar |
| Naira payout to a bank | Weave sandbox (Paycrest sandbox, payout simulated as received) | Weave → Paycrest, **live** |
| Stellar → Base hop | A labelled testnet simulator (a funded testnet account that plays the bridge) | LI.FI / Circle CCTP, **live** (min 2 USDC) |
| Naira → wallet (Add money) | Weave sandbox + simulator | Weave → NEAR Intents (Stellar pairs currently paused by NEAR) |
| Bolivianos in / out | Mocked (`MockBolivia`), same SDK calls, QR marked *MOCK QR · TESTNET* | Pollar's Stereum ramp, enabled per app by Pollar |
| SEP-24 anchor | Weave testnet anchor (needs an HTTPS home domain to be listed) | Weave mainnet anchor |

## Architecture

```
Browser (this repo, Next.js 15 on @pollar/react)
 ├─ Pollar SDK ──────── identity · wallet · signAndSubmitTx / runTx · ramps quote/create/poll
 ├─ /api/weave/*  ───── server-side proxy → Weave API with the secret key for the current network
 ├─ /api/directory ──── @handle → Stellar address (Upstash KV, or in-memory in dev)
 └─ /api/requests ───── naira request links (/r/[id]) a payer opens without an account

Weave API (Weave's monorepo, hosted)
 ├─ POST /orders · GET /orders/:id · GET /quotes · GET /institutions · POST /institutions/verify
 ├─ POST /orders/:id/steps/:seq/{approve-tx,bridge-tx,submitted}   ← LI.FI / CCTP signing (mainnet)
 ├─ /.well-known/stellar.toml · /api/v1/sep10/auth · /sep24/*        ← SEP-10 / SEP-24 anchor
 └─ /sandbox/stellar-faucet · /sandbox/stellar-simulator              ← sandbox keys only
```

The browser never sees a Weave secret: `app/api/weave/[...path]/route.ts`
forwards only an allow-listed set of paths and attaches the key for the
network the client says it is on (`x-corridor-network`). Sandbox-only paths
are refused on mainnet.

Key files:

- `app/app/page.tsx` — the conversational dashboard (recipient → details → source → amount → send) and the in-page progress panel.
- `lib/flows.ts` — `runFlow()` turns (recipient, source, amount) into the concrete sequence of Weave orders and Pollar calls for all seven pairs, emitting progress events.
- `lib/nigeria-send.ts`, `lib/stellar-bridge.ts` — the Nigerian payout, including the two-signature LI.FI / CCTP path on mainnet (with an optional standing allowance so repeat sends are one signature).
- `lib/pollar-ramps.ts` — Pollar ramp quotes / on-ramp / off-ramp, with the testnet mock.
- `lib/network.ts` — the network store (network follows credentials).
- `components/Tour.tsx` — the interactive first-run tour.
- `app/mainnet/page.tsx`, `lib/proofs.ts` — live mainnet proof and the hop-by-hop walkthrough.
- `app/pollar-theme.css` — Corridor's skin for Pollar's modals.

## Running it

```bash
pnpm install
cp .env.example .env.local   # fill in the keys below
pnpm dev                     # http://localhost:3006
```

| Variable | What |
| --- | --- |
| `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY` | Pollar **testnet** app key (dashboard.pollar.xyz). Add your origin under *Domains* and `<origin>/auth/callback` to the redirect URIs. |
| `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY_MAINNET` | Pollar **mainnet** app key (optional until mainnet is switched on). |
| `NEXT_PUBLIC_POLLAR_NETWORK` | Which side a fresh browser starts on: `testnet` (default) or `mainnet`. |
| `WEAVE_API_BASE` | Weave API base, e.g. `https://api.paywithweave.com/api/v1`. |
| `WEAVE_SECRET_KEY` / `WEAVE_SECRET_KEY_LIVE` | Weave sandbox (`sk_test_`) and live (`sk_live_`) secret keys. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Optional; @handles and request links fall back to process memory. |

The Weave API lives in Weave's (private) monorepo; the hosted sandbox is what
the demo talks to. If you want to run against it yourself, ask us for a sandbox
key.

## Demo script (3 minutes, testnet)

1. **Sign in** with Google → a Stellar wallet appears; the tour starts.
2. **Add money** ₦10,000 → bank details → (simulated) transfer lands as ~7 USDC.
3. **Send to a bank in Nigeria** from balance, $3 → watch the hops tick → naira delivered, Stellar tx link.
4. **Bolivian QR → Nigerian bank**, Bs 20 → mock QR → USDC lands → naira paid: the full Bolivia → Nigeria corridor.
5. Flip the switch to **Mainnet** → *Coming soon* → **See what is live on mainnet** → the Horizon-verified proof and the walkthrough.

## Custody

Everything in this repo is non-custodial. A treasury / inventory rail was
prototyped and deliberately removed: Weave never holds funds in transit and
never runs a float. The mainnet path is payer-signed (Soroban allowance +
LI.FI bridge call), CCTP burn → mint directly to the payout provider, and a
payout that settles in seconds.

## Credits

Design: the Corridor handoff (Instrument Serif · IBM Plex · the arch and coin
motif). Wallets, ramps and sponsorship: [Pollar](https://pollar.xyz). Nigerian
rails and the Stellar anchor: [Weave](https://paywithweave.com).
