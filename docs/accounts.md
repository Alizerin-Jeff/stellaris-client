---
layout: default
title: Accounts
nav_order: 3
---

# Accounts

## What is an account

An account is a named group of HD (hierarchical deterministic) wallets, protected by a password. Bots use accounts to access wallets for trading. You can create multiple accounts to organize your operations.

## Creating an account

1. Click **Create Account** from the dashboard
2. Enter a **name** for your account
3. Set a **wallet password** (minimum 6 characters)
4. Choose to **generate a new seed phrase** or **import an existing one**
5. Configure **whitelist** settings

## Seed phrase

After creating an account, your seed phrase is displayed once. This is the only time you can view it.

{: .warning }
Save your seed phrase immediately. It cannot be retrieved later. Without it, you cannot recover your wallets if you lose access.

## Whitelist

The whitelist restricts which addresses your account can transfer funds to. When enabled, transfers to non-whitelisted addresses are blocked.

- **Adding an entry** — Enter the address and confirm with your wallet password
- **Removing an entry** — Select the address to remove and confirm with your wallet password
- **Security benefit** — Prevents unauthorized transfers even if someone accesses your dashboard

## Transfers

You can transfer SOL and tokens from your account wallets. There are three transfer types with different security requirements:

| Transfer type | Description | Password required |
|---|---|---|
| **Internal** | Between wallets within the same account | No |
| **Whitelisted** | To an address on your whitelist | No |
| **External** | To any address not on your whitelist | Yes |

After submitting a transfer, Stellaris polls the chain for confirmation. Once confirmed, a Solscan link is displayed so you can verify the transaction on-chain.

## Private key export

You can export the private key for any wallet in your account.

1. Click the **export** button next to the wallet
2. Enter your **wallet password**
3. The private key is displayed and **auto-hides after 30 seconds**

{: .important }
Treat your private key like a password. Anyone with your private key has full control of that wallet. Never share it.

## Deleting an account

Deleting an account is permanent and cannot be undone.

- You must enter your **wallet password** to confirm
- You **cannot delete** an account that is currently used by active bots — remove or delete those bots first

{: .warning }
Account deletion is irreversible. Make sure you have transferred all funds and saved your seed phrase before deleting.
