---
layout: default
title: Getting Started
nav_order: 2
---

# Getting Started

This guide walks you through logging in, creating your first account, setting up a bot, and running your first trading operation.

## Prerequisites

- A Solana wallet: Phantom, Solflare, Torus, or Ledger
- SOL in your wallet for gas fees

## Logging in

**Wallet login (recommended)** — Connect your Solana wallet and you're in. Stellaris auto-logs you in on future visits as long as your wallet is connected.

**Legacy password login** — If you previously created a Stellaris account with a username and password, you can still log in that way.

**Linking your wallet** — If you have a legacy account and want to switch to wallet login, connect your wallet after logging in with your password. Your wallet will be linked to your existing account.

## Creating your first account

1. Click **Create Account** from the dashboard
2. Enter a **name** for your account
3. Set a **wallet password** (minimum 6 characters) — you'll need this for transfers, key exports, and account deletion
4. Choose whether to **generate a new seed phrase** or **import an existing one**
5. Toggle **whitelist** on or off (you can change this later)

After creation, your seed phrase is displayed **once**. Copy it and store it somewhere safe immediately.

{: .warning }
Your seed phrase is only shown once at creation time. If you lose it, you cannot recover your account wallets. Save it before closing the dialog.

## Creating your first bot

1. Click **Create Bot** from the dashboard
2. Enter an **Instance ID** — this is your label for the bot (e.g., "SOL-USDC Volume")
3. Paste the **Pool ID** — the on-chain address of the liquidity pool you want to target. You can find this on the pool's page on Raydium, Meteora, or Pump.fun
4. Select the **account** you want the bot to use
5. Stellaris auto-detects the **pool type** (Pump.fun, Raydium AMM/CPMM/CLMM, Meteora DLMM/DAMM)

{: .note }
Bot creation may take a few seconds for Raydium and Meteora pools while Stellaris fetches pool data.

## Funding your bot

1. Open your bot from the dashboard
2. Copy the **funding wallet address** displayed at the top of the bot panel
3. Send **SOL** (for gas and trading) and **tokens** (if needed) to that address
4. The balance display auto-refreshes every 20 seconds

## Running your first operation

1. In your bot panel, select the **Volume** operation
2. Set your trade size range, slippage, and interval
3. Click **Start**

For detailed parameter explanations, see the [Trading Operations](operations/) docs.
