#!/usr/bin/env node
/**
 * Sentinel Vault — Drift Funding Rate Monitor
 * Monitors perpetual funding rates for delta-neutral yield capture
 */

const DRIFT_STATS_API = 'https://mainnet-beta.api.drift.trade';

// Perp markets we care about
const PERP_MARKETS = [
  { index: 0, symbol: 'SOL-PERP' },
  { index: 1, symbol: 'BTC-PERP' },
  { index: 2, symbol: 'ETH-PERP' },
];

const CONFIG = {
  minFundingRate: 0.005,    // 0.005% per hour = ~44% annualized (very profitable)
  targetFundingRate: 0.002, // 0.002% per hour = ~17.5% annualized (good)
  minProfitableRate: 0.001, // 0.001% per hour = ~8.8% annualized (break-even after costs)
};

async function fetchFundingRates() {
  try {
    const res = await fetch(`${DRIFT_STATS_API}/fundingRates`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data;
  } catch (e) {
    // Fallback: try alternative endpoint
    try {
      const res = await fetch(`${DRIFT_STATS_API}/perpMarkets`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e2) {
      console.log(`⚠️ Drift API unavailable: ${e2.message}`);
      return null;
    }
  }
}

// Fetch from DeFi Llama as backup
async function fetchFundingFromLlama() {
  try {
    const res = await fetch('https://yields.llama.fi/pools');
    const data = await res.json();
    const pools = data.data || [];
    
    // Find Drift perp pools on Solana
    const driftPerps = pools.filter(p => 
      p.chain === 'Solana' && 
      p.project === 'drift-protocol'
    );
    return driftPerps;
  } catch (e) {
    return [];
  }
}

// Calculate annualized rate from hourly funding
function annualize(hourlyRate) {
  return hourlyRate * 24 * 365;
}

// Assess if delta-neutral position is profitable
function assessOpportunity(fundingRate, symbol) {
  const annualizedPct = annualize(fundingRate) * 100;
  const tradingCosts = 0.1; // ~0.1% round trip (open + close)
  const annualizedCostsPct = tradingCosts * 12; // assume monthly rebalance = 1.2%
  const netApy = annualizedPct - annualizedCostsPct;
  
  let signal = 'SKIP';
  let reason = '';
  
  if (fundingRate >= CONFIG.minFundingRate) {
    signal = 'STRONG_ENTRY';
    reason = `Funding ${(fundingRate*100).toFixed(4)}%/h = ${annualizedPct.toFixed(1)}% APY. Very profitable.`;
  } else if (fundingRate >= CONFIG.targetFundingRate) {
    signal = 'ENTRY';
    reason = `Funding ${(fundingRate*100).toFixed(4)}%/h = ${annualizedPct.toFixed(1)}% APY. Good opportunity.`;
  } else if (fundingRate >= CONFIG.minProfitableRate) {
    signal = 'HOLD';
    reason = `Funding ${(fundingRate*100).toFixed(4)}%/h = ${annualizedPct.toFixed(1)}% APY. Marginal after costs.`;
  } else if (fundingRate > 0) {
    signal = 'EXIT';
    reason = `Funding too low (${(fundingRate*100).toFixed(4)}%/h). Not profitable after costs.`;
  } else {
    signal = 'NO_ENTRY';
    reason = `Negative funding (${(fundingRate*100).toFixed(4)}%/h). Shorts pay longs.`;
  }
  
  return { symbol, fundingRate, annualizedPct, netApy, signal, reason };
}

// Simulate delta-neutral PnL
function simulateDeltaNeutral(capital, fundingRate, hours) {
  // Position: long spot + short perp (equal size)
  // Revenue: funding payments every hour
  // Cost: trading fees on entry/exit
  const positionSize = capital * 0.8; // 80% deployed, 20% margin buffer
  const entryFee = positionSize * 0.001; // 0.1% entry
  const exitFee = positionSize * 0.001;  // 0.1% exit
  const fundingRevenue = positionSize * fundingRate * hours;
  const netPnl = fundingRevenue - entryFee - exitFee;
  const apy = (netPnl / capital) * (8760 / hours) * 100; // annualized
  
  return { positionSize, fundingRevenue, totalCosts: entryFee + exitFee, netPnl, apy };
}

async function monitor() {
  console.log(`\n⚡ Sentinel Funding Rate Monitor | ${new Date().toISOString()}`);
  console.log('═'.repeat(60));
  
  // Try Drift API first
  const driftData = await fetchFundingRates();
  
  if (driftData && Array.isArray(driftData)) {
    console.log('\n📊 Drift Perpetual Funding Rates:');
    console.log('─'.repeat(60));
    
    for (const market of PERP_MARKETS) {
      const marketData = driftData.find(d => 
        d.marketIndex === market.index || d.symbol === market.symbol
      );
      if (marketData) {
        const rate = parseFloat(marketData.fundingRate || marketData.lastFundingRate || 0);
        const opp = assessOpportunity(rate, market.symbol);
        const icon = opp.signal === 'STRONG_ENTRY' ? '🟢' : 
                     opp.signal === 'ENTRY' ? '🟡' : 
                     opp.signal === 'HOLD' ? '🔵' : '🔴';
        console.log(`  ${icon} ${market.symbol.padEnd(10)} | Rate: ${(rate*100).toFixed(4)}%/h | APY: ${opp.annualizedPct.toFixed(1)}% | ${opp.signal}`);
        console.log(`     ${opp.reason}`);
      }
    }
  } else {
    console.log('\n⚠️ Drift API not available. Using simulated rates for strategy modeling.');
    console.log('─'.repeat(60));
    
    // Use historical average rates for modeling
    const simRates = [
      { symbol: 'SOL-PERP', rate: 0.0015 },  // ~13% annualized (conservative estimate)
      { symbol: 'BTC-PERP', rate: 0.0012 },   // ~10.5% annualized
      { symbol: 'ETH-PERP', rate: 0.0010 },   // ~8.8% annualized
    ];
    
    console.log('\n📊 Modeled Funding Rates (historical averages):');
    for (const s of simRates) {
      const opp = assessOpportunity(s.rate / 100, s.symbol);
      const icon = opp.signal === 'STRONG_ENTRY' ? '🟢' : 
                   opp.signal === 'ENTRY' ? '🟡' : 
                   opp.signal === 'HOLD' ? '🔵' : '🔴';
      console.log(`  ${icon} ${s.symbol.padEnd(10)} | Rate: ${s.rate.toFixed(4)}%/h | APY: ${opp.annualizedPct.toFixed(1)}% | ${opp.signal}`);
    }
    
    // Simulate combined strategy
    console.log('\n💰 Delta-Neutral Simulation ($100K USDC, 30 days):');
    console.log('─'.repeat(60));
    for (const s of simRates) {
      const sim = simulateDeltaNeutral(100_000, s.rate / 100, 30 * 24);
      console.log(`  ${s.symbol}: Revenue $${sim.fundingRevenue.toFixed(2)} - Costs $${sim.totalCosts.toFixed(2)} = Net $${sim.netPnl.toFixed(2)} (${sim.apy.toFixed(1)}% APY)`);
    }
  }
  
  // Combined strategy projection
  console.log('\n🎯 Combined Strategy Projection:');
  console.log('─'.repeat(60));
  const lendingApy = 2.81;  // from monitor.mjs
  const fundingApy = 10.0;  // conservative estimate
  const lendingAlloc = 0.50; // 50% to lending
  const fundingAlloc = 0.50; // 50% to delta-neutral
  const combinedApy = (lendingApy * lendingAlloc) + (fundingApy * fundingAlloc);
  console.log(`  Lending (${(lendingAlloc*100)}%):        ${lendingApy.toFixed(2)}% APY`);
  console.log(`  Delta-Neutral (${(fundingAlloc*100)}%):   ${fundingApy.toFixed(2)}% APY`);
  console.log(`  ─────────────────────────────`);
  console.log(`  Combined:              ${combinedApy.toFixed(2)}% APY ✅`);
  console.log(`  On $100K: +$${(100_000 * combinedApy / 100).toFixed(0)}/year`);
}

monitor().catch(e => console.error('Error:', e.message));
