# Corridor — Nigeria ↔ Bolivia in minutes

**Naira in Lagos. Bolivianos in La Paz. Minutes, not days.**

| | |
| --- | --- |
| **Live demo** | https://corridor.paywithweave.com (testnet, sign in with Google or email) |
| **Mainnet proof** | https://corridor.paywithweave.com/mainnet |
| **Nigerian rails & Stellar anchor** | [Weave](https://paywithweave.com) — API at `https://api.paywithweave.com` |
| **Wallets, identity & Bolivian ramp** | [Pollar](https://pollar.xyz) — `@pollar/react` / `@pollar/core` |
| **Network** | Stellar (testnet in the demo; the Nigerian leg is live on mainnet) |

Corridor is the African leg of an Africa ↔ Latin America corridor on Stellar,
built for the Pollar hackathon. It connects African bank accounts — Nigeria
today; Kenya, Uganda and Tanzania on the same rail, a switch away — to
Pollar's Bolivia (BOB) ramp, non-custodially, so money moves
**Africa → Bolivia**, **Bolivia → Africa**, and in and out of a Stellar
wallet from a local bank — in one sentence:

> I want to send money to **a bank in Nigeria**, paying with **my balance**, and the amount is **$25**.

## Contents

1. [What it does](#what-it-does)
2. [Beyond Nigeria: Kenya, Uganda, Tanzania](#beyond-nigeria-kenya-uganda-tanzania)
3. [Who does what](#who-does-what)
4. [Testnet vs. mainnet](#testnet-vs-mainnet--network-follows-credentials)
5. [Architecture](#architecture)
6. [The Weave API endpoints Corridor uses](#the-weave-api-endpoints-corridor-uses)
7. [Project layout](#project-layout)
8. [Running it locally](#running-it-locally)
9. [Deploying](#deploying)
10. [Demo script](#demo-script-3-minutes-testnet)
11. [Custody and security](#custody-and-security)
12. [Troubleshooting](#troubleshooting)
13. [Credits](#credits)

## What it does

Every transfer is a (recipient, source, amount) triple. Seven pairs are valid;
the same-country pair is greyed out because it would just be a local transfer.

| Send to | Paying with | What happens under the hood |
| --- | --- | --- |
| a bank in Nigeria | my balance | USDC leaves the Pollar wallet → Weave routes it → naira in any Nigerian bank (~3 min) |
| a bank in Nigeria | a Bolivian bank QR | Pollar on-ramp (BOB → USDC in your wallet) → the payout above |
| a bank in Bolivia | my balance | Pollar off-ramp (USDC → BOB by ACH) |
| a bank in Bolivia | a naira bank transfer | Weave deposit (NGN → USDC in your wallet) → Pollar off-ramp |
| a friend on Corridor | my balance | A sponsored Stellar payment to an @handle or G-address, no fee |
| a friend on Corridor | a naira bank transfer | Weave deposit straight into *their* wallet |
| a friend on Corridor | a Bolivian bank QR | Pollar on-ramp straight into *their* wallet |

Around that:

- **Add money** — naira → your wallet by bank transfer (Weave issues the account details).
- **Get paid at @handle** — claim a handle; friends pay it, and a request link
  (`/r/[id]`) lets a Nigerian payer send naira without an account.
- **Withdraw to my bank** — your balance → your own Nigerian account.
- **Account-name verification** before any naira leaves — you see the
  recipient's registered name, not just an account number.
- **Live quotes with fees included** while you type (Weave for the naira legs,
  Pollar for the BOB legs).
- **A first-run tour** that walks a brand-new user through their first top-up.
- **A test-mode switch** in the header (see below).
- **Kenya, Uganda, Tanzania** shown as coming-soon recipients — same Weave rail as naira, not switched on yet.
- **`/mainnet`** — the real mainnet transactions, re-checked against Horizon on
  every load, plus a hop-by-hop walkthrough of the mainnet path.

## Beyond Nigeria: Kenya, Uganda, Tanzania

The African side is not Nigeria-specific. Weave's payout rail (Paycrest)
already carries **KES, UGX and TZS** as well as NGN; Nigeria is the corridor
that is switched on today, and the others are enabled on Weave's side without
any new integration. Corridor is built country-agnostic to match:

- `lib/countries.ts` is the single list of African countries — code, currency,
  symbol, pill colour and a `live` flag. The recipient pills, the landing and
  `/mainnet` all read from it.
- Countries that are not live yet show as **"a bank in Kenya · SOON"** in the
  send flow, with the reason on hover, so the scope is honest about what runs
  today and what is one switch away.
- Turning a country on is: Weave enables the currency → set `live: true` →
  the pill becomes selectable. The order shape is the same
  (`dest: { kind: 'bank_account', assetKey: 'fiat:KES', … }`).

## Who does what

**[Weave](https://paywithweave.com)** (`paywithweave.com`) is the payments
infrastructure that owns the Nigerian leg:

- Nigerian bank rails — payouts to any Nigerian bank and naira collection by
  bank transfer, with account-name verification (`/institutions/verify`).
- Routing — an order says *from this asset to that asset*; Weave plans the hops
  (bridge → payout) and drives them.
- The Stellar → Base hop on mainnet via LI.FI / Circle CCTP, signed by the
  payer, never by Weave.
- A **SEP-10 / SEP-24 Stellar anchor for NGN** at `api.paywithweave.com`
  (`/.well-known/stellar.toml`), so any Stellar wallet — not only Pollar's —
  can deposit and withdraw naira through it.
- Sandbox and live environments selected by which key pair you use.

**[Pollar](https://pollar.xyz)** owns identity and the LatAm side:

- Sign-in (Google / email / passkey), an embedded Stellar wallet with sponsored
  fees, `signAndSubmitTx` / `runTx`, KYC, transaction history.
- The Bolivian ramp: quotes, on-ramp (QR), off-ramp (ACH).

**Corridor** (this repo) is the product on top: the conversational UI, the
seven flows, handles and request links, and a thin server-side proxy that
holds the Weave secret key.

## Testnet vs. mainnet — network follows credentials

There is no "mainnet mode" flag. Exactly like Weave's own sandbox / live
environments for merchants, the switch in the header picks a **credential
pair** — Pollar's publishable key and Weave's secret key for that environment —
and everything else derives from it: the USDC issuer, the explorer, the real
bridge instead of a simulator, the real BOB ramp instead of a mock.

The hosted demo runs on **testnet**, as the Pollar team asked for hackathon
builds, with clearly-labelled stand-ins. Mainnet is not switched on in the app
yet (the switch shows *Coming soon* and links to the proof page), but the
Nigerian leg has already run on mainnet: 2 USDC from a personal Stellar wallet
became ₦2,698.94 in a PalmPay account in 1 min 23 s
([Stellar tx](https://stellar.expert/explorer/public/tx/3b04306949879f24384c0b2ccc50c1209a121cb531a5b238e372818f0c8a5b48) ·
[Base tx](https://basescan.org/tx/0x2eed4f577d75c19f028f86d770ff1d15e634453b8cd4359ee706245cb89dc701)).

| Leg | Testnet (the demo) | Mainnet |
| --- | --- | --- |
| Sign-in, wallet, sponsored fees | Pollar testnet app | Pollar mainnet app |
| Naira payout to a bank | Weave sandbox (`sk_test_`): Paycrest sandbox, payout marked as received | Weave live (`sk_live_`) → Paycrest, **live** |
| Stellar → Base hop | Weave's **testnet simulator**: a funded testnet account that plays the bridge counterparty (labelled `stellar_simulator`) | LI.FI / Circle CCTP, **live**, payer-signed, 2 USDC minimum |
| Naira → wallet (Add money) | Weave sandbox + simulator | Weave → NEAR Intents (NEAR's Stellar pairs are currently paused upstream) |
| Bolivianos in / out | **Mocked** (`MockBolivia`) — same SDK calls, QR image marked *MOCK QR · TESTNET* | Pollar's Stereum ramp, enabled per app by Pollar |
| SEP-24 anchor | `api.paywithweave.com` (mainnet passphrase); testnet listing needs Pollar to enable the home domain | `api.paywithweave.com` |

## Architecture

```
Browser — corridor.paywithweave.com (this repo: Next.js 15, React 19, @pollar/react)
 │
 ├─ Pollar SDK (client-side) ─────── login · wallet · balances · signAndSubmitTx / runTx
 │                                   ramps: getRampsQuote · createOnRamp · createOffRamp · pollRampTransaction
 │
 ├─ /api/weave/[...path] ──────────► api.paywithweave.com/api/v1/*   (Weave secret key attached server-side;
 │                                   allow-listed paths only; key chosen by the x-corridor-network header)
 ├─ /api/directory ────────────────► @handle ↔ Stellar address (Upstash Redis, or process memory in dev)
 └─ /api/requests, /r/[id] ────────► naira request links a payer opens without signing in

Weave — api.paywithweave.com (private monorepo, hosted)
 ├─ quotes · orders · institutions · institutions/verify
 ├─ orders/:id/steps/:seq/{approve-tx,bridge-tx,submitted}   ← LI.FI / CCTP signing round-trip (mainnet)
 ├─ /.well-known/stellar.toml · /api/v1/sep10/auth · /api/v1/sep24/*   ← SEP-1 / SEP-10 / SEP-24 anchor
 └─ sandbox/stellar-faucet · sandbox/stellar-simulator                  ← sandbox keys only
```

The browser never sees a Weave secret. `app/api/weave/[...path]/route.ts` only
forwards the paths listed below, attaches `x-secret-key` for the network the
client says it is on, and refuses `sandbox/*` on mainnet.

## The Weave API endpoints Corridor uses

Base: `https://api.paywithweave.com/api/v1`. Auth: `x-secret-key: sk_test_…`
(sandbox) or `sk_live_…` (live). Every response is `{ success, data?, error? }`.

| Method & path | Used for |
| --- | --- |
| `GET /quotes?from=&to=&amount=&amountIn=source` | Live estimates — `crypto:STELLAR:USDC ↔ fiat:NGN` |
| `GET /institutions?currency=NGN` | The Nigerian bank list for the typeahead |
| `POST /institutions/verify` `{ institution, accountIdentifier, currency }` | Account-name lookup before sending |
| `POST /orders` | Create a transfer: `source` / `dest` as inline instruments (`bank_account` or `crypto_wallet`), `amount`, `amountIn` |
| `GET /orders/:id` | Poll status; on sandbox the simulator advances it |
| `POST /orders/:id/steps/:seq/approve-tx` `{ standing }` | Mainnet: unsigned Soroban allowance XDR (optionally a standing allowance) |
| `POST /orders/:id/steps/:seq/bridge-tx` | Mainnet: unsigned LI.FI bridge XDR (`409 ALLOWANCE_PENDING` until the approval lands) |
| `POST /orders/:id/steps/:seq/submitted` `{ txHash }` | Mainnet: tell Weave the payer submitted the bridge tx |
| `POST /sandbox/stellar-faucet` `{ to, amount ≤ 50 }` | Sandbox only: drop testnet USDC into a wallet (used to settle the mocked BOB on-ramp) |
| `GET /sandbox/stellar-simulator` | Sandbox only: the simulator's address / balance |

Asset keys are `fiat:<CCY>` or `crypto:<CHAIN>:<TOKEN>`, e.g. `fiat:NGN`,
`crypto:STELLAR:USDC`.

How the flows map onto those calls (`lib/flows.ts`):

- **Send to a Nigerian bank from balance** — `POST /orders` (source: your
  Stellar wallet, dest: the bank account) → Weave returns a `nextAction`:
  on sandbox a `collect_crypto` memo payment that the Pollar wallet makes with
  one `runTx('payment')`; on mainnet `sign_stellar_tx` (approve + bridge XDRs
  signed with `signAndSubmitTx`) → poll `GET /orders/:id` until `completed`.
- **Add money / naira → wallet** — `POST /orders` (source: the payer's bank,
  dest: the Stellar wallet) → `nextAction.bankDetails` to transfer to → poll.
- **BOB → anything** — Pollar `createOnRamp` (mocked on testnet, settled via
  the sandbox faucet) → wait for USDC → the Nigerian payout above, or a payment.
- **Anything → BOB** — Pollar `createOffRamp` with the bank fields from the quote
  (mocked receipt on testnet).

## Project layout

```
app/
  page.tsx                landing / sign-in (Pollar OAuth popup lands on /auth/callback)
  app/page.tsx            the dashboard: balance, three shortcuts, the send sentence, progress panel
  app/request-naira/      "Get paid": create a naira request link for a Bolivian payout
  r/[id]/                 public payer page for a request link (no sign-in)
  mainnet/page.tsx        live proof (Horizon-verified) + hop-by-hop mainnet walkthrough
  api/weave/[...path]/    server-side proxy to api.paywithweave.com (holds the secret key)
  api/directory/          @handle directory      api/requests/   request links
  pollar-theme.css        Corridor's skin for Pollar's modals (history, receive, login, KYC, ramp)
components/
  Chrome.tsx              authenticated frame: header, test-mode switch, notice, auth gate
  Tour.tsx                the interactive first-run tour
  Brand.tsx               logo, coins, arches (the design motif)
lib/
  flows.ts                runFlow(): (recipient, source, amount) → Weave orders + Pollar calls, with progress events
  nigeria-send.ts         the Nigerian payout, incl. the two-signature LI.FI / CCTP path
  stellar-bridge.ts       approve → bridge → submitted round-trip for mainnet
  pollar-ramps.ts         Pollar ramp quotes / on-ramp / off-ramp + the testnet mock
  network.ts              network follows credentials (store, key selection, issuer, explorer)
  weave.ts                proxy client, formatting helpers
  proofs.ts               the mainnet proofs shown on /mainnet
```

## Running it locally

Requirements: Node ≥ 20, pnpm 10.

```bash
pnpm install
cp .env.example .env.local     # then fill in the values below
pnpm dev                       # http://localhost:3006
```

| Variable | What |
| --- | --- |
| `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY` | Pollar **testnet** app key from [dashboard.pollar.xyz](https://dashboard.pollar.xyz). On that app add your origin under **Domains** and `<origin>/auth/callback` to the **redirect URIs**, or sign-in fails with `ORIGIN_NOT_ALLOWED` / `APPLICATION_HAS_NO_REDIRECT_URIS`. |
| `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY_MAINNET` | Pollar **mainnet** app key. Optional until mainnet is switched on. |
| `NEXT_PUBLIC_POLLAR_NETWORK` | Which side a fresh browser starts on: `testnet` (default) or `mainnet`. |
| `NEXT_PUBLIC_POLLAR_REDIRECT_URI` | Where the OAuth popup lands, e.g. `http://localhost:3006/auth/callback`. |
| `WEAVE_API_BASE` | `https://api.paywithweave.com/api/v1` |
| `WEAVE_SECRET_KEY` | A Weave **sandbox** secret key (`sk_test_…`). Sign up at [paywithweave.com](https://paywithweave.com); keys are under Settings → API keys. |
| `WEAVE_SECRET_KEY_LIVE` | A Weave **live** secret key (`sk_live_…`). Optional until mainnet is switched on. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Optional. @handles and request links fall back to process memory without them. |

A `/dev/sizes` page renders any route in six viewports side by side for
responsive checks.

## Deploying

The live site is a Vercel project pointed at this repository. Set the same
variables as above (with the production origin on the Pollar app), and the
Weave key of the environment you want the app to start on. Nothing else is
needed: the Weave API and the Stellar anchor are hosted by Weave at
`api.paywithweave.com`.

## Demo script (3 minutes, testnet)

1. **Sign in** with Google → a Stellar wallet appears; the tour starts and walks through the first top-up.
2. **Add money** ₦5,000 → bank details → the (simulated) transfer lands as ~3.5 USDC.
3. **Withdraw to my bank** $3 → PalmPay → watch the hops tick → *Naira delivered*, with the Stellar transaction link.
4. **A bank in Nigeria · a Bolivian bank QR · Bs 20** → mock QR → *I've paid* → USDC lands → naira paid: the whole Bolivia → Nigeria corridor in ~20 s.
5. Flip the header switch to **Mainnet** → *Coming soon* → **See what is live on mainnet** → the Horizon-verified proof and the walkthrough.

## Custody and security

- **Non-custodial end to end.** A treasury / inventory rail was prototyped and
  deliberately removed; Weave never holds funds in transit and runs no float.
  On mainnet the payer signs a Soroban allowance and the LI.FI bridge call;
  Circle CCTP burns on Stellar and mints on Base directly to the payout
  provider, which pays out within seconds.
- **Secrets stay server-side.** The Weave secret key lives only in the proxy
  route's environment; the browser calls `/api/weave/*`, which forwards an
  allow-list of paths and nothing else.
- **Sandbox can't touch live.** The simulator refuses anything that isn't a
  sandbox order on testnet; `sandbox/*` paths are refused when the client is
  on mainnet.
- **Names before money.** Nigerian account names are resolved and shown before
  a payout is created.
- Pollar sponsors network fees, so the wallet holds no XLM by design.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Sign-in: `ORIGIN_NOT_ALLOWED` | Add the origin under **Domains** on the Pollar app. |
| Sign-in: `APPLICATION_HAS_NO_REDIRECT_URIS` | Add `<origin>/auth/callback` to the app's redirect URIs and set `NEXT_PUBLIC_POLLAR_REDIRECT_URI`. |
| Pollar's modals (History, Receive) render invisibly | `@pollar/react/styles.css` must be imported before `globals.css` (it is, in `app/layout.tsx`). |
| Proxy returns `401` | `WEAVE_SECRET_KEY` is missing or not a valid Weave key for that environment. |
| Proxy returns `503 Mainnet is not configured` | The switch is on mainnet but `WEAVE_SECRET_KEY_LIVE` is unset. |
| "The bridge minimum is $2" | LI.FI's CCTP route floor on mainnet; the sender also needs ≥ 2 XLM. |
| Add money never completes on mainnet | NEAR Intents' Stellar pairs are paused upstream; the deposit direction is sandbox-only until they resume. |

## Credits

Design: the Corridor handoff — Instrument Serif · IBM Plex Sans / Mono · the
arch-and-coin motif. Wallets, ramps and fee sponsorship:
[Pollar](https://pollar.xyz). Nigerian rails, routing and the Stellar anchor:
[Weave](https://paywithweave.com).
