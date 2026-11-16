# Token Radar

[![make.fun](https://make.fun/badge/bounty/token-radar-01)](https://make.fun/bounty/token-radar-01)
[![make.fun](https://make.fun/badge/owner/2162638406-prog)](https://make.fun)
[![make.fun](https://make.fun/badge/prize/token-radar-01)](https://make.fun/bounty/token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot, ranks every
pre-token protocol by the implied value its own record supports, and shows a
filterable board, a detail view for each protocol with the model's own inputs
and a six-step farm plan, and the live-token market the multiples are
calibrated from.

## The model

Implied value = TVL × multiple × growth × maturity × breadth.

- **multiple** — the median market-cap / TVL of the live-token protocols in
  the same category (at least 4 live peers), else the median over all
  live-token protocols; clamped to [0.05, 1.50].
- **growth** — 1 + clamp(7-day change, −50%, +100%) / 100 × 0.5.
- **maturity** — 0.70 + 0.30 × min(age without a token, 1,095 days) / 1,095.
- **breadth** — 1 + 0.05 × min(chains − 1, 4).

No protocol name is ever special-cased. A protocol is shown as pre-token
when its record carries no token — the record is not proof it has none.

## Run

```sh
node main.ts --input /input/snapshot.json
```

Outside the grader's container, `MAKEFUN_OUTPUT_DIR` stands in for `/output`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

The program reads `/input/snapshot.json`, writes `/output/board.json`
(ranked rows) and `/output/data.js` (the dashboard's data), copies
`dashboard/` and `screenshots/` to `/output`, and writes
`/output/dossier.json`. It is deterministic: it reads no clock, no network
and no random source.
