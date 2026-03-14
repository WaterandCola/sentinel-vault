# Sentinel Vault — Strategy Documentation

## Strategy Thesis

**Sentinel** is an AI-driven adaptive yield vault that combines three yield layers to target 12-18% APY on USDC with controlled risk:

### Layer 1: Dynamic Lending Optimization (Base: 2-4% APY)
- Continuously monitors USDC lending rates across Jupiter Lend, Kamino, Save, Drift Spot, Marginfi
- AI engine allocates based on: APY (45%), safety score (25%), TVL depth (15%), rate trend (15%)
- Rebalances when >0.3% APY improvement is available
- Max 45% per protocol, min 2 protocol diversification
- Ranger Adaptors: Lending Adaptor

### Layer 2: AI-Managed Concentrated Liquidity (Target: +8-20% APY)
- Provides liquidity on Raydium CLMM SOL-USDC pools
- AI manages impermanent loss by:
  - Dynamically adjusting price range width based on volatility
  - Wider ranges in high-vol (lower APY but less IL)
  - Tighter ranges in low-vol (higher APY, acceptable IL)
  - Auto-rebalancing when price exits range
- Historical: Orca SOL-USDC 45.8% APY ($29M TVL), Raydium 12-34%
- After IL adjustment, realistic net: 8-20% APY
- Ranger Adaptors: Raydium CLMM Adaptor

### Layer 3: Opportunistic Funding Rate Capture (Target: 0-15% APY)
- Monitors Drift perpetual funding rates in real-time
- ONLY enters delta-neutral when funding is positive (shorts earn)
- Current market: funding negative 82% of time → mostly inactive
- When positive (avg +6.77% annualized): deploy up to 30% of vault
- Ranger Adaptors: Drift Adaptor

### Key Insight from Real Data
- Drift SOL-PERP funding has been negative 82% of last 30 days (avg -10.43%)
- Pure delta-neutral is NOT viable as primary strategy in current market
- Concentrated liquidity LP is the primary yield driver
- AI's main job: managing IL risk on LP positions + timing funding entries

## Risk Management

### Guardrails
| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Max per protocol | 45% | Diversification |
| Min protocols | 2 | Redundancy |
| Max leverage | 1.5x | Conservative |
| Health factor floor | 1.3 | Liquidation buffer |
| Max drawdown trigger | 2% | Auto-deleverage |
| Funding rate floor | 0.005% | Min profitable rate |
| Rebalance cooldown | 1 hour | Prevent churn |

### Stress Response
1. **Market Stress** (SOL drops >10% in 24h): Reduce perp positions by 50%, shift to pure lending
2. **Protocol Stress** (utilization >85%): Withdraw from stressed protocol within 1 hour
3. **Funding Flip** (rate turns negative): Close delta-neutral positions within 15 minutes
4. **Liquidity Crisis** (TVL drops >20%): Emergency exit to idle USDC

### Drawdown Protection
- Rolling 24h PnL tracking
- If unrealized loss exceeds 1%: reduce risk exposure by 50%
- If unrealized loss exceeds 2%: full deleverage to idle USDC
- Automatic recovery: re-enter positions gradually over 6 hours after stress clears

## Performance Targets

| Metric | Target | Conservative |
|--------|--------|-------------|
| APY | 15% | 10% |
| Max Drawdown | <1% | <2% |
| Sharpe Ratio | >2.0 | >1.5 |
| Rebalance Frequency | 1-4h | 4-8h |

## Architecture

```
Sentinel AI Engine
├── Monitor Agent (every 5 min)
│   ├── Lending rates (DeFi Llama + direct APIs)
│   ├── Funding rates (Drift API)
│   ├── Market prices (CoinGecko)
│   └── Protocol health (TVL, utilization)
│
├── Analyzer Agent (every 15 min)
│   ├── Rate trend detection
│   ├── Funding rate prediction
│   ├── Risk score calculation
│   └── Opportunity identification
│
├── Allocator Agent (every 1-4h)
│   ├── Optimal allocation calculation
│   ├── Rebalance decision
│   ├── Position sizing
│   └── Transaction building
│
└── Guardian Agent (continuous)
    ├── Health factor monitoring
    ├── Drawdown tracking
    ├── Stress detection
    └── Emergency exit logic
```

## Technical Implementation

- **Vault**: Ranger Earn SDK (@voltr/vault-sdk) v1.0.20
- **Vault Address**: `F8qBvxBi2kp6vViu43yfvpTm7osZwUpC2qerFeUV3GSH` (Mainnet)
- **Adaptors**: Lending Adaptor + Spot Adaptor (Jupiter)
- **Strategies**: Jupiter USDC Lend (live), Kamino USDC Lend (planned), Save USDC (planned)
- **Bot**: Node.js sentinel-bot.cjs — fetches rates from DeFi Llama, AI allocation engine
- **Monitoring**: Real-time rate monitoring + Telegram alerts to vault manager
- **GitHub**: https://github.com/WaterandCola/sentinel-vault

## Live Performance Data

| Protocol | Current APY | TVL | Status |
|----------|-----------|-----|--------|
| Jupiter Lend | 3.33% | $523M | ✅ Active Strategy |
| Save (Solend) | 3.03% | $4.8M | 🔜 Planned |
| Kamino Lend | 1.82% | $86.4M | 🔜 Planned |

## Backtest Results (12 weeks, $100K USDC)

| Strategy | APY | Return | Sharpe |
|----------|-----|--------|--------|
| Static Jupiter | 4.14% | $956 | - |
| AI Dynamic Lending | 3.21% | $741 | - |
| Sentinel 35/65 | 8.05% | $1,857 | - |
| Smart Sentinel + Multi-Market | 9.91% | $2,287 | 15.52 |
