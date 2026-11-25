# Smart Order Builder - DevsStream Frontend Technical Assessment

A breakfast order builder with a rules engine, shared ingredient stock, an exact
money pricing engine, time-limited stock reservations, checkout with persisted
orders, and a Gemini-powered sales assistant over the orders data.

## Setup
```bash
npm install
cp .env.example .env.local   # then paste your free Gemini API key (Google AI Studio)
npm run dev                  # app + MSW mock API
npm test                     # full Vitest suite (TC-01 to TC-20 mapping in test names)
npm run answers              # prints and verifies ANSWERS.md Q1-Q8 values from the real engines and seed file
```

## Architecture
- `src/data/fixture.ts` - the Appendix A menu (groups, options, rules, ingredients,
  stock, promotions) as data. It is served by the mock API; **no option id, name or
  limit is hardcoded** in components or engine code.
- `src/engine/rules.ts` - Part A. Pure `validate(config, menu)` returning ALL
  violations: group min/max/step/maxDistinct/maxPerOption, `requires`, `excludes`,
  and `overrideLimit` (an active override replaces the group limit, it wins).
- `src/engine/stock.ts` - Part B. Ingredient usage per config, shared across the
  builder and every cart line; cart quantity (1-3) multiplies usage; per-option
  "how many more can be added"; shortage lists with exact amounts
  ("Short: 2 egg, 2 cheese"). When editing, the line's own allocation is excluded
  so it counts as available (net-difference semantics).
- `src/engine/pricing.ts` - Part C. Pure `priceCart` in integer poisha, exact step
  order: unit subtotal -> P2 extras deal (cheapest free per 3 extras) -> P1 combo
  (10% off when eggs >= 4 and protein >= 2 in the config) -> line totals -> cart
  discount (C1 100 BDT off at >= 1,200 BDT vs C2 MORNING15 15% capped at 150 BDT,
  valid strictly before 11:00 Asia/Dhaka server time; larger wins, tie goes to C1)
  -> VAT 5% -> payable rounded half-up to whole BDT. Percentage steps round
  half-up to the poisha. TC-05/06/07 numbers are asserted exactly in tests.
  Price preview goes through the mock `/price` endpoint with 300 ms debounce,
  200-1500 ms latency, 15% random failure, sequence-number + abort protection
  against stale responses, and a Retry button that never loses the configuration.
- `src/mocks/` - MSW handlers plus `serverDb.ts`, the simulated server store
  (localStorage-persisted). The server enforces stock, atomic reservations,
  idempotency keys, reservation expiry and checkout; its clock runs 90 seconds
  ahead and every response carries `serverTime`. The client computes an offset
  and uses server time for all countdowns/expiry, never raw `Date.now()`.
  Part D: Add to Cart is idempotent per key, reservation is all-or-nothing for
  5 minutes, expired lines become read-only (remove only), edit is one atomic
  swap call. Part E: Pay is atomic and idempotent, orders persist as JSON and
  survive refresh, and there is a Download orders.json button. The real
  Appendix B seed file ships in `src/data/orders.seed.json` (an object with an
  `orders` array; each line carries a flat `options` map, which the loader in
  `serverDb.ts` converts into grouped configs). Seed orders carry no prices:
  each one is priced with the engine at its own `createdAt` (Asia/Dhaka) using
  its own `couponCode`, and ANSWERS.md Q5-Q8 are computed from those priced
  orders by the same stats functions the assistant uses.
- `src/engine/stats.ts` + `src/assistant/gemini.ts` - Part F. Pure statistics
  functions over the orders JSON, exposed to Gemini as function-calling tools.
  The model never receives raw orders and never computes a number. Missing key,
  invalid key, 429 quota and network failures each produce a clear UI message.
  Because the assistant reads the live orders state, answers update immediately
  after a checkout without a reload.
- Part G (bonus): the unfinished configuration and the cart are persisted
  client-side, and server reservations survive a refresh within their 5-minute
  life, so a refresh keeps both. Tab version-conflict handling is NOT implemented
  (see below).

## Trade-offs
- The "server" is simulated behind MSW in the browser, as the brief's mock
  architecture allows; all server rules live in one module (`serverDb.ts`) so a
  real backend could replace it without touching the engines or UI.
- Dhaka time is computed as UTC+6 (Bangladesh has no DST), avoiding any
  dependence on the host machine's timezone.
- The UI is deliberately plain: this assessment is scored on logic correctness.

## What is unfinished
- **Part G tab version conflict** between two open tabs is not implemented;
  refresh persistence (config + cart + reservations) is implemented.
- The Gemini assistant needs a real key in `.env.local` to answer live; its
  stats tools and error handling are fully unit-tested with a mocked Gemini call.

## Hours spent
Approximately 1.5 hours of focused build and test time (engines and tests first,
then mock server, UI, assistant and docs).
