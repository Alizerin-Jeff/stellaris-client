---
layout: default
title: Trading Operations
nav_order: 5
has_children: true
---

# Trading Operations

## What are trading operations

Trading operations are discrete actions you run against a liquidity pool through your bot. Each operation type serves a different purpose: generating volume, injecting liquidity, extracting value, or defending a price floor.

You can run multiple operations simultaneously on the same bot, and control them in real-time from the dashboard.

## Shared parameters

Every operation uses these common parameters:

| Parameter | Description |
|---|---|
| **Trade Size (min/max)** | Random trade size per swap, denominated in the pool's quote token. Each trade picks a random value between your min and max |
| **Slippage (%)** | Maximum acceptable price impact per trade. Trades exceeding this threshold are rejected |
| **Concurrency (1–3)** | Number of parallel trades per cycle. Higher concurrency means more trades happen at once |
| **Time Interval (min/max seconds)** | Random delay between cycles. Each cycle waits a random duration between your min and max |
| **Number of Wallets** | How many wallets from your account to distribute trades across. There is no upper bound on this. |

## Starting, stopping, and updating

- **Start/Stop** — Toggle the operation on or off with the Start/Stop button
- **Update Params** — Push new parameter values to a running operation without stopping and restarting it

## Availability by tier

| Operation | Free | Free L1 | Free L2 | Pro |
|---|---|---|---|---|
| Volume | Yes | Yes | Yes | Yes |
| Inject | Yes | Yes | Yes | Yes |
| Extract | — | Yes | Yes | Yes |
| Defend Floor | — | — | Yes | Yes |

See [Tiers](../tiers) for full tier details and requirements.

## Low balance warnings

If your funding wallet balance drops too low to execute trades, the operation pauses and displays a warning. Fund your bot to resume.
