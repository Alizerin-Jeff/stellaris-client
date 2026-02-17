---
layout: default
title: Inject
parent: Trading Operations
nav_order: 2
---

# Inject

## What it does

Inject buys a specified total amount of SOL into the pool, distributed across your wallets over multiple cycles. Use it to add liquidity or push price upward in a controlled way.

## Parameters

Inject uses all [shared parameters](./), plus:

| Parameter | Description |
|---|---|
| **Injection Amount** | Total SOL to inject into the pool |
| **Number of Wallets** | How many wallets to distribute buys across |

## Completion

Inject stops automatically when the full injection amount has been distributed. You don't need to manually stop it.

## Live stats

While running, the dashboard displays:

- **Current injected** — SOL injected so far
- **Remaining** — SOL left to inject
- **Total injected** — Cumulative SOL injected this session

## Alternate wallet support

On Level 2 and above (or Pro), you can run Inject through an [alternate wallet](../alternate-wallets) instead of the main wallet pool.

## Availability

Inject is available on all tiers: Free, Free L1, Free L2, and Pro.
