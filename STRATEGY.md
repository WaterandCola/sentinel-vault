# Sentinel Vault — Strategy Documentation

## Overview

Sentinel Vault is an AI-driven adaptive yield optimizer deployed on Solana mainnet via Ranger Earn (Voltr). It combines passive lending yield with active funding rate farming on Drift, using AI to dynamically allocate capital based on real-time market conditions.

## Live Deployment

- **Vault**: `F8qBvxBi2kp6vViu43yfvpTm7osZwUpC2qerFeUV3GSH` (Mainnet)
- **Base Asset**: USDC
- **Manager**: `Doxsox3w8reVHY3iv838YfWdsAk5UhPHdMyip6B84L65`
- **Created**: 2026-03-14
- **Bot**: Running hourly via cron

## Strategy Components

### Strategy 1: Lending Yield Optimization (Active)

**Mechanism**: Allocate USDC to the highest-yielding lending protocol on Solana.

**Protocols Monitored**:
| Protocol | Current APY | TVL |
|----------|-----------|-----|
| Jupiter Lend | 3.34% | $522M |
| Save (Solend) | 3.03% | $4.8M |
| Kamino Lend | 1.82% | $87M |
| Drift Lend | Monitoring | — |
| Marginfi | Monitoring | — |

**Rebalance Logic**:
- Hourly rate comparison via DeFi Llama API
- Rebalance when alternative protocol offers >15% better APY
- Risk-weighted: TVL, audit status, protocol maturity factored in
- Currently 100% allocated to Jupiter Lend (highest risk-adjusted yield)

### Strategy 2: Drift Funding Rate Farming (Monitoring, Ready to Deploy)

**Mechanism**: Delta-neutral position — long spot SOL + short SOL-PERP on Drift. Collect funding payments when longs pay shorts (positive funding rate).

**Why This Works**:
- Perpetual futures funding rates oscillate based on market sentiment
- During bullish periods, longs pay shorts → we earn funding
- Delta-neutral means zero directional exposure (market-neutral)
- Combined with lending yield on collateral = stacked returns

**AI Entry Conditions** (all must be met):
1. 72h average annualized funding rate > 5%
2. 12+ consecutive hours of positive funding
3. Funding trend not falling (rising or stable)

**AI Exit Conditions** (any triggers exit):
1. Funding negative for 6+ consecutive hours → full exit
2. Average funding < 1% AND trend falling → 50% reduction

**Position Sizing**:
- Confidence-weighted: higher confidence = larger position
- Max 30% of vault capital in funding rate strategy
- Confidence = f(rate magnitude, consecutive hours, trend direction)

**Risk Controls**:
- Hard stop: exit if funding negative for 6h
- Max position cap: 30% of vault
- Trend detection prevents entering during declining rates
- Volatility monitoring for regime changes

### Strategy 3: Cross-Strategy Capital Allocation

**How capital flows between strategies**:

```
Idle USDC in Vault
    │
    ├─ [Default] → Jupiter Lend (safe yield, ~3.3%)
    │
    └─ [When funding favorable] → Drift Delta-Neutral
         │                         (funding + collateral yield)
         │
         └─ [When funding flips] → Back to Jupiter Lend
```

The AI engine continuously monitors both opportunities and moves capital to maximize risk-adjusted returns.

## Performance Projections

| Scenario | Lending APY | Funding APY | Combined |
|----------|-----------|------------|----------|
| Bear (current) | 3.3% | 0% (no position) | 3.3% |
| Neutral | 3.5% | 5-8% on 30% | 5.0-5.9% |
| Bull | 4.0% | 15-25% on 30% | 8.5-11.5% |

## Technical Implementation

### Stack
- **Vault**: Voltr Vault SDK on Ranger Earn
- **Lending**: Jupiter Lend via Voltr lending adaptor
- **Funding Analysis**: Custom Drift API integration
- **AI Engine**: Node.js with trend detection, confidence scoring
- **Monitoring**: Hourly cron, DeFi Llama + Drift data APIs

### Key Files
- `src/sentinel-bot.cjs` — Main AI monitor (lending + Drift combined)
- `src/drift-strategy.cjs` — Drift funding rate analysis module
- `src/create-vault.cjs` — Vault deployment script
- `src/deposit-to-jupiter.cjs` — Jupiter Lend allocation
- `src/swap-and-deposit.cjs` — SOL→USDC swap + vault deposit

### Decision Logging
Every decision is logged with full reasoning to `sentinel-log.json`:
```json
{
  "timestamp": "2026-03-15T05:23:09.433Z",
  "rates": [...],
  "vaultState": { "idle": 0 },
  "action": "hold",
  "reasoning": "Jupiter Lend at 3.34% APY. Best available.",
  "drift": {
    "action": "hold",
    "reasoning": "Funding rate -7.8% below threshold. Keeping capital in Jupiter Lend."
  }
}
```

## What Makes Sentinel Different

1. **AI-Driven, Not Rule-Based** — Uses trend analysis, confidence scoring, and multi-signal evaluation instead of simple if/else rules
2. **Multi-Strategy** — Combines passive lending with active funding rate farming
3. **Autonomous** — Runs 24/7 without human intervention, makes and logs decisions independently
4. **Risk-First** — Conservative entry conditions, aggressive exit conditions. Prefers missing opportunities over taking bad ones
5. **Transparent** — Every decision logged with full reasoning chain

## Built By

An autonomous AI agent (太子/Taizi) running on OpenClaw, exploring the frontier of AI-driven DeFi on Solana.

## Links

- **GitHub**: https://github.com/WaterandCola/sentinel-vault
- **Vault on Solscan**: https://solscan.io/account/F8qBvxBi2kp6vViu43yfvpTm7osZwUpC2qerFeUV3GSH
