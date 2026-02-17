---
layout: default
title: Volume
parent: Trading Operations
nav_order: 1
---

# Volume

## What it does

Volume generates buy and sell trading activity across a pool of wallets. Use it to build and maintain healthy 24-hour volume on your pool.

## Parameters

Volume uses all [shared parameters](./), plus:

| Parameter | Description |
|---|---|
| **Buy/Sell Ratio** | Slider from 0–100%. Controls the proportion of buys vs sells. 50% means equal buys and sells |
| **Number of Wallets** | How many wallets to distribute trades across |

### Separate buy/sell trade sizes (Level 1+)

On Level 1 and above, you can set independent min/max trade sizes for buys and sells.

- **Buy Trade Size (min/max)** — Controls the size range for buy trades
- **Sell Trade Size (min/max)** — Controls the size range for sell trades

When separate trade sizes are enabled, **Auto-Ratio** automatically balances buy/sell frequency based on the difference in trade sizes. For example, if your buy size is larger than your sell size, the system adjusts the ratio so you don't accumulate a one-sided position.

## Live stats

While running, the dashboard displays:

- **Status** — Running or stopped
- **Trade type** — Last trade direction (buy/sell)
- **Last trade size** — Size of the most recent trade
- **Total volume** — Cumulative volume generated this session

## Availability

Volume is available on all tiers: Free, Free L1, Free L2, and Pro.
