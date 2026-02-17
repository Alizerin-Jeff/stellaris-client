---
layout: default
title: Defend Floor
parent: Trading Operations
nav_order: 4
---

# Defend Floor

## What it does

Defend Floor monitors a token's price or market cap and automatically buys when it drops below your threshold. Use it to maintain a price floor or prevent market cap from falling below a key level. It pairs well with Extraction running on the same account.

## Parameters

Defend Floor uses all [shared parameters](./), plus:

| Parameter | Description |
|---|---|
| **Threshold Type** | Choose between **Price** or **Market Cap** |
| **Threshold Value (USD)** | The USD value below which the bot starts buying |

## Behavior

Defend Floor runs continuously until you stop it.

- When the price or market cap **drops below** your threshold, the bot executes buys to push it back up
- When the metric is **above** your threshold, the bot pauses and waits

## Live stats

While running, the dashboard displays:

- **Current price/MC** — The token's current price or market cap
- **Threshold** — Your configured threshold value
- **Total injected defending** — Cumulative SOL spent on defensive buys

## Alternate wallet support

On Level 2 and above (or Pro), you can run Defend Floor through an [alternate wallet](../alternate-wallets) instead of the main wallet pool.

## Availability

Defend Floor is available on Free L2 and Pro tiers. Requires holding 10,000,000+ Stellaris tokens (Free L2) or a Pro subscription.
