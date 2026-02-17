---
layout: default
title: Extract
parent: Trading Operations
nav_order: 3
---

# Extract

## What it does

Extract sells tokens progressively to bring the pool's quote reserve down to a target level. Use it to take profits or reduce your position in a controlled way.

## Parameters

Extract uses all [shared parameters](./), plus:

| Parameter | Description |
|---|---|
| **Extract Ratio (%)** | Percentage of tokens to sell per cycle |
| **Reserve Target (SOL)** | The SOL reserve level to target. Extraction stops when this level is reached |
| **Number of Wallets** | How many wallets to distribute sells across |

## Completion

Extract stops automatically when the pool's reserve reaches your target level.

## Live stats

While running, the dashboard displays:

- **Current reserve** — The pool's current SOL reserve
- **Target reserve** — Your configured target
- **Target met** — Whether the target has been reached
- **Total extracted** — Cumulative tokens sold this session

## Alternate wallet support

On Level 2 and above (or Pro), you can run Extract through an [alternate wallet](../alternate-wallets) instead of the main wallet pool.

## Availability

Extract is available on Free L1, Free L2, and Pro tiers. Requires holding 1,000,000+ Stellaris tokens (Free L1) or a Pro subscription.
