# Sentinel Vault — Strategy Document

## Executive Summary

Sentinel Vault is an autonomous AI-driven yield optimizer deployed on Solana mainnet. It dynamically allocates USDC across lending protocols and Drift perpetual markets to maximize risk-adjusted returns.

**Live Vault**: `F8qBvxBi2kp6vViu43yfvpTm7osZwUpC2qerFeUV3GSH`

## Why Sentinel?

Traditional yield vaults suffer from three problems:

1. **Static allocation** — Set-and-forget strategies miss rate changes
2. **Single-strategy** — Only lending OR only farming, never both
3. **No risk awareness** — Chase highest APY regardless of protocol risk

Sentinel solves all three with an AI decision engine that monitors, predicts, and acts autonomously.

## Strategy 1: Adaptive Lending

**Status**: Active on mainnet

The bot monitors USDC lending rates across 5 protocols every hour:
- Jupiter Lend
- Kamino Lend
- Save (Solend)
- Drift Lend
- Marginfi

**Decision logic**:
- Allocate to highest APY with TVL > $10M (filters out inflated small pools)
- Rebalance when a competitor beats current strategy by >15% sustained
- Factor in gas costs — only rebalance if net benefit exceeds tx fees

**Current**: Jupiter Lend @ 3.34% APY ($522M TVL)

## Strategy 2: Drift Funding Rate Farming

**Status**: Monitoring, waiting for entry signal

Delta-neutral basis trade: long spot SOL + short SOL-PERP on Drift.

When longs pay shorts (positive funding), this position earns the funding rate with zero directional exposure.

**Entry conditions** (all must be true):
- Annualized funding rate > 5%
- 12+ consecutive hours of positive funding
- Trend not falling (EMA-based)

**Exit conditions** (any triggers exit):
- Funding negative for 6+ consecutive hours
- Funding < 1% annualized AND trend falling
- Market stress indicators trigger

**Position sizing**: Confidence-weighted, max 30% of vault capital
- Higher funding rate → larger position
- Longer positive streak → larger position
- Rising trend → larger position

**Current**: SOL-PERP funding at -7.8% annualized (shorts paying longs). No entry — capital stays in lending.

## AI Decision Engine

Every hour, the bot runs this pipeline:

```
1. FETCH    → Pull rates from DeFi Llama + Drift DLOB API
2. ANALYZE  → Compute trends, volatility, consecutive streaks
3. COMPARE  → Rank all opportunities by risk-adjusted return
4. DECIDE   → Entry/exit/hold/rebalance with confidence score
5. EXECUTE  → On-chain transaction via Voltr SDK (if action needed)
6. LOG      → Record decision + reasoning for transparency
```

Every decision is logged with full reasoning — no black box.

## Risk Management

- **Protocol diversification**: Max 40% per protocol
- **TVL filter**: Ignore pools with < $10M TVL
- **Trend confirmation**: Never chase a spike — wait for sustained signal
- **Automatic de-risk**: Shift to conservative allocation on stress signals
- **Delta-neutral**: Funding rate strategy has zero directional exposure

## Performance Target

| Metric | Target | Current |
|--------|--------|---------|
| APY | 12-18% | 3.34% (lending only, waiting for funding opportunity) |
| Max Drawdown | < 2% | 0% |
| Rebalance Frequency | 1-4 hours | Hourly monitoring |

## Tech Stack

- **Vault**: Ranger Earn SDK (Voltr) — on-chain vault management
- **Data**: DeFi Llama API + Drift DLOB API
- **AI Engine**: Custom Node.js with trend analysis + confidence scoring
- **Execution**: Solana Web3.js + SPL Token
- **Monitoring**: Automated hourly cron

## What Makes This Different

1. **Actually deployed** — Not a prototype. Live on mainnet with real USDC.
2. **Dual strategy** — Combines lending yield with funding rate farming.
3. **AI with reasoning** — Every decision is explainable, not a black box.
4. **Autonomous** — Runs 24/7 without human intervention.
5. **Programmatic demo** — Even the demo video is auto-generated with live data.
