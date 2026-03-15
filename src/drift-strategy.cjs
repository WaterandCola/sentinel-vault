#!/usr/bin/env node
/**
 * Sentinel Vault — Drift Funding Rate Strategy Module
 * 
 * Strategy: Delta-Neutral Funding Rate Farming
 * - Hold spot SOL (or SOL LST) as collateral on Drift
 * - Short SOL-PERP to collect funding when rates are positive (longs pay shorts)
 * - When funding flips negative, unwind or switch to lending-only mode
 * - AI monitors funding rate trends and adjusts position sizing
 * 
 * Combined with Jupiter Lend USDC strategy for idle capital
 */

const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const fs = require('fs');

const RPC_URL = 'https://api.mainnet-beta.solana.com';
const KEYPAIR_PATH = '/home/ubuntu/.config/solana/taizi-wallet.json';
const DRIFT_API = 'https://data.api.drift.trade';

// Exponential Moving Average
function computeEMA(values, period) {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

// Market indices on Drift
const MARKETS = {
  'SOL-PERP': 0,
  'BTC-PERP': 1,
  'ETH-PERP': 2,
};

// Strategy parameters
const CONFIG = {
  // Minimum annualized funding rate to enter position (%)
  minFundingRateAnnual: 5.0,
  // Maximum position size as % of vault capital
  maxPositionPct: 30,
  // Funding rate lookback hours for trend analysis
  lookbackHours: 72,
  // Minimum consecutive positive hours to enter
  minPositiveHours: 12,
  // Stop-loss: exit if funding goes negative for N hours
  negativeExitHours: 6,
  // Markets to monitor
  markets: ['SOL-PERP'],
};

/**
 * Fetch funding rate history from Drift API
 */
async function fetchFundingRates(marketName = 'SOL-PERP') {
  const resp = await fetch(`${DRIFT_API}/fundingRates?marketName=${marketName}`);
  const data = await resp.json();
  const rates = data.fundingRates || data;
  
  return rates.map(r => {
    const fr = parseInt(r.fundingRate) / 1e9;
    const oracle = parseInt(r.oraclePriceTwap) / 1e6;
    const hourlyPct = (fr / oracle) * 100;
    return {
      ts: parseInt(r.ts),
      hourlyPct,
      annualizedPct: hourlyPct * 24 * 365,
      oraclePrice: oracle,
      direction: fr > 0 ? 'longs_pay_shorts' : 'shorts_pay_longs',
    };
  });
}

/**
 * Analyze funding rate trends
 */
function analyzeTrend(rates, lookbackHours = 72) {
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - (lookbackHours * 3600);
  const recent = rates.filter(r => r.ts >= cutoff);
  
  if (recent.length === 0) return null;

  const avgHourly = recent.reduce((s, r) => s + r.hourlyPct, 0) / recent.length;
  const avgAnnual = avgHourly * 24 * 365;
  
  // Count consecutive positive/negative from most recent
  let consecutivePositive = 0;
  let consecutiveNegative = 0;
  const sorted = [...recent].sort((a, b) => b.ts - a.ts);
  
  for (const r of sorted) {
    if (r.hourlyPct > 0) {
      if (consecutiveNegative === 0) consecutivePositive++;
      else break;
    } else {
      if (consecutivePositive === 0) consecutiveNegative++;
      else break;
    }
  }

  // EMA-based trend detection (more responsive than simple halves)
  const sortedAsc = [...recent].sort((a, b) => a.ts - b.ts);
  const emaShort = computeEMA(sortedAsc.map(r => r.hourlyPct), 6);  // 6h EMA
  const emaLong = computeEMA(sortedAsc.map(r => r.hourlyPct), 24);  // 24h EMA
  
  // Momentum: short EMA vs long EMA
  const momentum = emaShort - emaLong;
  
  // Trend from EMA crossover
  let trend = 'stable';
  if (momentum > 0.0001) trend = 'rising';
  else if (momentum < -0.0001) trend = 'falling';

  // Volatility (std dev)
  const variance = recent.reduce((s, r) => s + Math.pow(r.hourlyPct - avgHourly, 2), 0) / recent.length;
  const volatility = Math.sqrt(variance);

  return {
    avgHourlyPct: avgHourly,
    avgAnnualPct: avgAnnual,
    consecutivePositive,
    consecutiveNegative,
    trend,
    momentum,
    emaShort,
    emaLong,
    volatility,
    dataPoints: recent.length,
    latestRate: sorted[0],
  };
}

/**
 * AI Decision Engine for funding rate strategy
 */
function makeDecision(analysis, currentPosition = null) {
  const decision = {
    timestamp: new Date().toISOString(),
    analysis: {
      avgAnnual: analysis.avgAnnualPct.toFixed(2) + '%',
      trend: analysis.trend,
      consecutivePositive: analysis.consecutivePositive,
      consecutiveNegative: analysis.consecutiveNegative,
      volatility: analysis.volatility.toFixed(4),
    },
    action: 'hold',
    reasoning: '',
    confidence: 0,
  };

  const hasPosition = currentPosition && currentPosition.size > 0;

  if (!hasPosition) {
    // Entry conditions
    if (analysis.avgAnnualPct > CONFIG.minFundingRateAnnual &&
        analysis.consecutivePositive >= CONFIG.minPositiveHours &&
        analysis.trend !== 'falling') {
      
      decision.action = 'enter_short_perp';
      decision.confidence = Math.min(0.9, 
        (analysis.avgAnnualPct / 20) * 0.4 +
        (analysis.consecutivePositive / 48) * 0.3 +
        (analysis.trend === 'rising' ? 0.3 : 0.15)
      );
      decision.sizing = Math.min(CONFIG.maxPositionPct, 
        CONFIG.maxPositionPct * decision.confidence
      );
      decision.reasoning = `Funding rate ${analysis.avgAnnualPct.toFixed(1)}% annualized, ` +
        `${analysis.consecutivePositive}h consecutive positive, trend ${analysis.trend}. ` +
        `Enter delta-neutral: long spot + short perp at ${decision.sizing.toFixed(0)}% of capital.`;
    } else {
      decision.reasoning = buildNoEntryReason(analysis);
    }
  } else {
    // Exit conditions
    if (analysis.consecutiveNegative >= CONFIG.negativeExitHours) {
      decision.action = 'exit_position';
      decision.reasoning = `Funding negative for ${analysis.consecutiveNegative}h. ` +
        `Unwinding delta-neutral position to avoid paying funding.`;
    } else if (analysis.avgAnnualPct < 1.0 && analysis.trend === 'falling') {
      decision.action = 'reduce_position';
      decision.sizing = 50; // reduce by 50%
      decision.reasoning = `Funding declining (${analysis.avgAnnualPct.toFixed(1)}% annual, trend falling). ` +
        `Reducing position by 50% as precaution.`;
    } else {
      decision.action = 'hold';
      decision.reasoning = `Position earning ${analysis.avgAnnualPct.toFixed(1)}% annualized funding. ` +
        `Trend: ${analysis.trend}. Maintaining position.`;
    }
  }

  return decision;
}

function buildNoEntryReason(analysis) {
  const reasons = [];
  if (analysis.avgAnnualPct <= CONFIG.minFundingRateAnnual) {
    reasons.push(`funding rate ${analysis.avgAnnualPct.toFixed(1)}% below ${CONFIG.minFundingRateAnnual}% threshold`);
  }
  if (analysis.consecutivePositive < CONFIG.minPositiveHours) {
    reasons.push(`only ${analysis.consecutivePositive}h consecutive positive (need ${CONFIG.minPositiveHours}h)`);
  }
  if (analysis.trend === 'falling') {
    reasons.push('funding trend is falling');
  }
  return `No entry: ${reasons.join(', ')}. Keeping capital in Jupiter Lend.`;
}

/**
 * Run strategy analysis
 */
async function run() {
  console.log('🛡️ Sentinel — Drift Funding Rate Strategy');
  console.log('═'.repeat(50));
  console.log(`Time: ${new Date().toISOString()}\n`);

  for (const market of CONFIG.markets) {
    console.log(`📊 ${market}`);
    console.log('─'.repeat(40));

    const rates = await fetchFundingRates(market);
    console.log(`  Data points: ${rates.length}`);

    const analysis = analyzeTrend(rates, CONFIG.lookbackHours);
    if (!analysis) {
      console.log('  ❌ Insufficient data');
      continue;
    }

    console.log(`  Avg funding (${CONFIG.lookbackHours}h): ${analysis.avgAnnualPct.toFixed(2)}% annualized`);
    console.log(`  Trend: ${analysis.trend}`);
    console.log(`  Consecutive +: ${analysis.consecutivePositive}h | -: ${analysis.consecutiveNegative}h`);
    console.log(`  Volatility: ${analysis.volatility.toFixed(4)}`);
    console.log(`  Latest: ${analysis.latestRate.annualizedPct.toFixed(1)}% (${analysis.latestRate.direction})`);

    const decision = makeDecision(analysis);
    console.log(`\n  🤖 Decision: ${decision.action.toUpperCase()}`);
    console.log(`  📝 ${decision.reasoning}`);
    if (decision.confidence) {
      console.log(`  🎯 Confidence: ${(decision.confidence * 100).toFixed(0)}%`);
    }
    console.log();
  }

  // Also show combined strategy view
  console.log('═'.repeat(50));
  console.log('📋 Combined Sentinel Strategy:');
  console.log('  1. Jupiter Lend USDC: ~3.3% APY (active, idle=0)');
  console.log('  2. Drift Funding Rate: monitoring, waiting for entry signal');
  console.log('  3. Kamino Lend: standby (1.8% APY, lower than Jupiter)');
}

// Export for use in sentinel-bot
module.exports = { fetchFundingRates, analyzeTrend, makeDecision, CONFIG };

// Run if called directly
if (require.main === module) {
  run().catch(console.error);
}
