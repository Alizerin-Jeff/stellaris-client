---
layout: default
title: FAQ
nav_order: 8
---

# FAQ

## What is a Pool ID and where do I find it?

A Pool ID is the on-chain address of a liquidity pool. You can find it on the pool's page on [Raydium](https://raydium.io), [Meteora](https://meteora.ag), or [Pump.fun](https://pump.fun). It's the address shown in the URL or in the pool details section.

## What wallets are supported for login?

Stellaris supports Phantom, Solflare, Torus, and Ledger for wallet-based login.

## What's the difference between my login wallet and my account wallets?

Your **login wallet** (Phantom, Solflare, etc.) is used only for authentication. It proves your identity when you log in.

Your **account wallets** are HD wallets generated inside Stellaris. These are the wallets your bots use to execute trades. They are separate from your login wallet and have their own addresses and private keys.

## Why can't I delete my account?

You cannot delete an account that is currently used by active bots. Stop and delete all bots using that account first, then try again.

## What does concurrency do?

Concurrency controls how many trades happen in parallel during each cycle. A concurrency of 1 means one trade at a time. A concurrency of 3 means up to three trades execute simultaneously in each cycle.

Higher concurrency generates more activity but uses more SOL for gas.

## My operation stopped unexpectedly — what happened?

The most common cause is **insufficient funds**. If your funding wallet balance drops too low to cover trade sizes plus gas fees, the operation pauses and displays a low balance warning. Send more SOL or tokens to your funding wallet to resume.

## What is wSOL?

wSOL (Wrapped SOL) is an SPL token representation of SOL. Some pools use wSOL as the quote token instead of native SOL. Stellaris handles wSOL wrapping and unwrapping automatically — you just need to fund your bot with regular SOL.

## How do I know when Inject is done?

Inject stops automatically when the full injection amount has been distributed. The live stats panel shows your current progress (injected vs remaining). You can also check the bot's session history to see completed Inject runs.

## Is my private key stored on Stellaris servers?

Your private keys are derived from your seed phrase and encrypted with your wallet password. Stellaris does not store your unencrypted private keys. You are responsible for saving your seed phrase at account creation — it cannot be recovered later.

## What pools does Stellaris support?

Stellaris supports:

- **Pump.fun** pools
- **Raydium** — AMM, CPMM, and CLMM pools
- **Meteora** — DLMM, DAMM v1, and DAMM v2 pools

## How are trading fees charged?

Trading fees are deducted as a percentage of each trade's value. The fee rate depends on your [tier](tiers):

- **Free** — 0.25%
- **Free L1** — 0.10%
- **Free L2** — 0.05%
- **Pro** — 0%
