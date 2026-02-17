---
layout: default
title: Bots
nav_order: 4
---

# Bots

## What is a bot

A bot connects an on-chain liquidity pool to your account's wallets. It's the container where you run trading operations like Volume, Inject, Extract, and Defend Floor.

## Supported pools

Stellaris supports the following pool types:

- **Pump.fun**
- **Raydium** — AMM, CPMM, CLMM
- **Meteora** — DLMM, DAMM v1, DAMM v2

The pool type is auto-detected when you enter a Pool ID.

## Creating a bot

1. Click **Create Bot** from the dashboard
2. Enter an **Instance ID** — your label for the bot (e.g., "SOL-USDC Volume Bot")
3. Paste the **Pool ID** — the on-chain address of the liquidity pool
4. Select the **account** you want the bot to use

{: .note }
Creation may take a few seconds on Raydium and Meteora pools while Stellaris fetches pool metadata.

## Funding wallet

Each bot is assigned a funding wallet address automatically. This is where you send SOL and tokens to fund operations.

- The **balance display** shows your SOL and token balances
- Click the **copy** button to copy the funding wallet address
- Balances **auto-refresh every 20 seconds**

## Running operations

You can start, stop, and update trading operations directly from the bot panel.

- Click **Start** to begin an operation
- Click **Stop** to halt it
- Click **Update Params** to change settings without restarting
- Multiple operations can run simultaneously on the same bot

See [Trading Operations](operations/) for full details on each operation type.

## Session history

Each bot keeps a paginated log of completed operation runs. Each entry shows:

- **Operation type** (Volume, Inject, Extract, Defend Floor)
- **Total** (volume generated, SOL injected, tokens extracted, etc.)
- **Timestamp** of completion

## Deleting a bot

To delete a bot, click the **delete** button and confirm. This is permanent and cannot be undone.
