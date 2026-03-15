# 🛡️ Sentinel Vault

**AI-Driven Adaptive Yield Optimizer for Solana**

> An autonomous vault manager that uses AI to dynamically allocate USDC across Solana lending protocols, maximizing yield while managing risk.

## Strategy Thesis

Most yield vaults use static allocation rules or simple APY-chasing. Sentinel takes a different approach:

1. **Multi-Signal Analysis** — Monitors APY, TVL trends, utilization rates, protocol risk scores, and market volatility simultaneously
2. **Predictive Rebalancing** — Uses trend detection to anticipate rate changes rather than react to them
3. **Risk-Weighted Allocation** — Assigns dynamic risk scores based on protocol maturity, audit status, TVL stability, and historical exploit data
4. **Drawdown Protection** — Automatically shifts to conservative allocation when market stress indicators trigger

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                Sentinel AI Engine                    │
│  ┌─────────┐ ┌──────────┐ ┌──────────────┐          │
│  │ Monitor │ │ Analyzer │ │  Allocator   │          │
│  │  Agent  │ │  Agent   │ │    Agent     │          │
│  └────┬────┘ └────┬─────┘ └──────┬───────┘          │
│       │           │              │                   │
│  ┌────▼───────────▼──────────────▼────────────────┐  │
│  │            Decision Engine                     │  │
│  │  - Lending rate prediction                     │  │
│  │  - Drift funding rate trend analysis           │  │
│  │  - Risk scoring & position sizing              │  │
│  │  - Optimal allocation calculation              │  │
│  └────────────────┬───────────────────────────────┘  │
└───────────────────┼──────────────────────────────────┘
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
┌────────┐   ┌──────────┐   ┌──────────┐
│Jupiter │   │  Drift   │   │ Kamino   │
│ Lend   │   │  Perps   │   │  Lend    │
└────────┘   └──────────┘   └──────────┘
```

## Strategies

### 1. Lending Yield (Active)
- Monitors Jupiter Lend, Kamino, Save (Solend), Drift, Marginfi
- Auto-allocates to highest risk-adjusted yield
- Currently: Jupiter Lend USDC at ~3.3% APY

### 2. Drift Funding Rate Farming (Monitoring)
- Delta-neutral: long spot SOL + short SOL-PERP on Drift
- Collects funding payments when longs pay shorts
- AI monitors 72h funding rate trends, enters only when:
  - Annualized rate > 5%
  - 12+ consecutive positive hours
  - Trend not falling
- Auto-exits when funding flips negative for 6+ hours
- Target: 5-20% additional APY during favorable conditions

## Key Features

- **Autonomous Operation** — Runs as a cron job, no human intervention needed
- **Multi-Protocol** — Kamino, Drift, Marginfi, Save, Jupiter Lend
- **Risk Guardrails** — Max 40% per protocol, min 3 protocol diversification
- **Stress Detection** — Monitors on-chain signals for market stress
- **Performance Tracking** — Logs every decision with reasoning for transparency

## Target Performance

- APY: 12-18% (vs 8-10% static lending)
- Max Drawdown: <2%
- Rebalance Frequency: Every 1-4 hours based on conditions
- Base Asset: USDC

## Tech Stack

- Solana / Anchor
- Ranger Earn SDK (@voltr/vault-sdk)
- TypeScript / Node.js
- AI Decision Engine (custom)

## Built for

🐻 Ranger Build-A-Bear Hackathon — Main Track + Drift Side Track

## Live Deployment (Mainnet)

- **Vault**: [`F8qBvxBi2kp6vViu43yfvpTm7osZwUpC2qerFeUV3GSH`](https://solscan.io/account/F8qBvxBi2kp6vViu43yfvpTm7osZwUpC2qerFeUV3GSH)
- **Asset**: USDC
- **Strategies**:
  - Jupiter Lend USDC (`2vVYHYM8VYnvZqQWpTJSj8o8DBf1wM8pVs3bsTgYZiqJ`)
- **Adaptors**: Lending + Spot (Jupiter)

## Scripts

```bash
# Deploy vault
node src/create-vault.cjs

# Add adaptors
node src/add-adaptor.cjs

# Initialize Jupiter Lend strategy
node src/init-jupiter-strategy.cjs

# Swap SOL→USDC and deposit into vault
node src/swap-and-deposit.cjs 0.2

# Allocate vault funds to Jupiter Lend
node src/deposit-to-jupiter.cjs 10

# Withdraw from vault
node src/withdraw.cjs all

# Run AI monitor (lending + Drift funding analysis)
node src/sentinel-bot.cjs

# Run Drift funding rate strategy analysis standalone
node src/drift-strategy.cjs
```
