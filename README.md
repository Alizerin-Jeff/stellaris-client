# Stellaris Client

React front-end for the Stellaris market-making platform on Solana.

[User docs can be found here](https://alizerin-jeff.github.io/stellaris-client/)

## Architecture

- **React 19** with TypeScript
- **Solana Wallet Adapter** for Phantom, Solflare, Torus, and Ledger
- **WebSocket** real-time bot status and progress updates
- **Axios** for REST API communication with the backend
- **React Hook Form + Zod** for form validation
- **CRACO** for webpack customization (crypto/buffer polyfills)

## Project Structure

```
src/
  context/
    AuthContext.tsx       # JWT auth, wallet-based login, account claim flow
    WalletContext.tsx     # Solana wallet adapter configuration
    WebSocketContext.tsx  # Real-time bot state management via WebSocket
  pages/
    Login.tsx             # Wallet + legacy password login
    Dashboard.tsx         # Bot management, method controls, live stats
    Accounts.tsx          # Wallet account management, transfers, whitelisting
    AdminDashboard.tsx    # Admin analytics, user/bot management, treasury
  components/
    ClaimAccount.tsx      # Wallet-to-account linking flow
    TransferModal.tsx     # Token transfer with on-chain confirmation polling
  App.tsx                 # Routing with protected + admin route guards
  index.tsx               # Entry point with provider hierarchy
```

## Getting Started

```bash
npm install
npm start
```

The client expects a backend API server. API calls use relative paths (`/api/...`) and are proxied during development.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `REACT_APP_RPC_URL` | Custom Solana RPC endpoint | Solana mainnet-beta public RPC |
| `PORT` | Dev server port | `3000` |

## Build

```bash
npm run build
```

Produces an optimized production build in the `build/` directory.
