#!/usr/bin/env node
/**
 * Sentinel Vault — AI-Driven Rate Monitor & Allocation Engine
 * Uses DeFi Llama as primary data source for Solana USDC lending rates
 */

const DEFILLAMA_API = 'https://yields.llama.fi/pools';

// Protocol configs with risk parameters
const PROTOCOLS = {
  'jupiter-lend': { name: 'Jupiter Lend', riskScore: 0.12, weight: 1.0 },
  'kamino-lend':  { name: 'Kamino Lend',  riskScore: 0.15, weight: 1.0 },
  'save':         { name: 'Save (Solend)', riskScore: 0.22, weight: 0.9 },
};

const RISK_CONFIG = {
  maxPerProtocol: 0.45,
  minProtocols: 2,
  stressUtilization: 85,
  rebalanceThreshold: 0.3, // rebalance if >0.3% APY improvement
};

// Price history for trend detection
let rateHistory = [];
const MAX_HISTORY = 48; // 48 data points

async function fetchRates() {
  const res = await fetch(DEFILLAMA_API);
  const data = await res.json();
  const pools = data.data || [];

  const results = [];
  for (const [projectId, config] of Object.entries(PROTOCOLS)) {
    const pool = pools.find(p =>
      p.chain === 'Solana' &&
      p.project === projectId &&
      p.symbol === 'USDC' &&
      p.tvlUsd > 500_000
    );
    if (pool) {
      results.push({
        protocol: projectId,
        name: config.name,
        apy: pool.apy || 0,
        apyBase: pool.apyBase || 0,
        apyReward: pool.apyReward || 0,
        tvl: pool.tvlUsd || 0,
        pool: pool.pool,
        riskScore: config.riskScore,
      });
    }
  }
  return results;
}

// Trend detection: is rate rising or falling?
function detectTrend(protocol) {
  const history = rateHistory
    .filter(h => h.protocol === protocol)
    .slice(-6)
    .map(h => h.apy);
  if (history.length < 3) return 'neutral';
  const recent = history.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const older = history.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  if (recent > older * 1.05) return 'rising';
  if (recent < older * 0.95) return 'falling';
  return 'stable';
}

// AI Decision Engine
function calculateAllocation(rates) {
  if (rates.length === 0) return [];

  const scored = rates.map(r => {
    const maxApy = Math.max(...rates.map(x => x.apy));
    const apyScore = maxApy > 0 ? r.apy / maxApy : 0;
    const safetyScore = 1 - r.riskScore;
    const tvlConfidence = Math.min(r.tvl / 200_000_000, 1);
    const trend = detectTrend(r.protocol);
    const trendBonus = trend === 'rising' ? 0.1 : trend === 'falling' ? -0.05 : 0;

    // Composite: 45% APY + 25% safety + 15% TVL + 15% trend
    const score = Math.max(0,
      (apyScore * 0.45) + (safetyScore * 0.25) +
      (tvlConfidence * 0.15) + ((0.5 + trendBonus) * 0.15)
    );

    return { ...r, score, trend };
  });

  // Allocate proportionally with cap
  const totalScore = scored.reduce((s, x) => s + x.score, 0);
  let allocs = scored.map(s => ({
    ...s,
    allocation: totalScore > 0 ? s.score / totalScore : 1 / scored.length,
  }));

  // Cap at max per protocol
  allocs = allocs.map(a => ({
    ...a,
    allocation: Math.min(a.allocation, RISK_CONFIG.maxPerProtocol),
  }));

  // Normalize
  const total = allocs.reduce((s, a) => s + a.allocation, 0);
  allocs = allocs.map(a => ({ ...a, allocation: a.allocation / total }));

  return allocs;
}

function blendedApy(allocs) {
  return allocs.reduce((s, a) => s + a.apy * a.allocation, 0);
}

// Simulate vault performance over time
function simulatePerformance(capital, apy, days) {
  const dailyRate = apy / 100 / 365;
  return capital * Math.pow(1 + dailyRate, days);
}

async function monitor() {
  const now = new Date();
  console.log(`\n🛡️ Sentinel Vault Monitor | ${now.toISOString()}`);
  console.log('═'.repeat(60));

  const rates = await fetchRates();

  // Store history
  for (const r of rates) {
    rateHistory.push({ ...r, timestamp: now });
  }
  if (rateHistory.length > MAX_HISTORY * rates.length) {
    rateHistory = rateHistory.slice(-MAX_HISTORY * rates.length);
  }

  console.log('\n📊 Solana USDC Lending Rates:');
  console.log('─'.repeat(60));
  for (const r of rates.sort((a, b) => b.apy - a.apy)) {
    const trend = detectTrend(r.protocol);
    const trendIcon = trend === 'rising' ? '📈' : trend === 'falling' ? '📉' : '➡️';
    console.log(`  ${trendIcon} ${r.name.padEnd(16)} | APY: ${r.apy.toFixed(2).padStart(6)}% | TVL: $${(r.tvl / 1e6).toFixed(1).padStart(6)}M | Risk: ${(r.riskScore * 100).toFixed(0)}%`);
  }

  const allocs = calculateAllocation(rates);
  const expectedApy = blendedApy(allocs);

  console.log('\n🎯 AI Optimal Allocation:');
  console.log('─'.repeat(60));
  for (const a of allocs.sort((x, y) => y.allocation - x.allocation)) {
    const bar = '█'.repeat(Math.round(a.allocation * 30));
    console.log(`  ${a.name.padEnd(16)} | ${(a.allocation * 100).toFixed(1).padStart(5)}% ${bar}`);
  }

  console.log(`\n📈 Expected Blended APY: ${expectedApy.toFixed(2)}%`);

  // Projection
  const capital = 100_000;
  const proj90 = simulatePerformance(capital, expectedApy, 90);
  const proj365 = simulatePerformance(capital, expectedApy, 365);
  console.log(`\n💰 Projection ($${(capital / 1000).toFixed(0)}K USDC):`);
  console.log(`   90 days:  $${proj90.toFixed(2)} (+$${(proj90 - capital).toFixed(2)})`);
  console.log(`   365 days: $${proj365.toFixed(2)} (+$${(proj365 - capital).toFixed(2)})`);

  // Decision log
  console.log('\n📋 Decision Reasoning:');
  for (const a of allocs) {
    const reasons = [];
    if (a.apy === Math.max(...rates.map(r => r.apy))) reasons.push('highest APY');
    if (a.riskScore <= 0.15) reasons.push('low risk');
    if (a.tvl > 50_000_000) reasons.push('deep liquidity');
    if (a.trend === 'rising') reasons.push('rate trending up');
    console.log(`  ${a.name}: ${reasons.join(', ') || 'balanced allocation'}`);
  }

  return { rates, allocs, expectedApy };
}

monitor().catch(e => console.error('Error:', e.message));
