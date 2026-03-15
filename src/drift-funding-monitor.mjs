#!/usr/bin/env node
/**
 * Drift Funding Rate Monitor - Lightweight version
 * Uses DLOB API for live prices + DeFi Llama for yield comparison
 */
import fs from 'fs';

const LOG_PATH = '/home/ubuntu/.openclaw/workspace-taizi/projects/ranger-hackathon/drift-funding-log.json';

const MARKETS = [
  { index: 0, name: 'SOL-PERP' },
  { index: 1, name: 'BTC-PERP' },
  { index: 2, name: 'ETH-PERP' },
  { index: 24, name: 'JUP-PERP' },
  { index: 20, name: 'JTO-PERP' },
  { index: 56, name: 'RAY-PERP' },
];

async function main() {
  console.log('📊 Drift Market Monitor + Yield Comparison');
  console.log('═'.repeat(55));

  // Fetch DLOB data for each market
  const results = [];
  for (const m of MARKETS) {
    try {
      const resp = await fetch(`https://dlob.drift.trade/l2?marketIndex=${m.index}&marketType=perp&depth=1`);
      const data = await resp.json();
      const oracle = data.oracle / 1e6;
      const mark = parseInt(data.markPrice) / 1e6;
      const spread = parseFloat(data.spreadPct) / 1e6;
      const basis = ((mark - oracle) / oracle) * 100;
      results.push({ name: m.name, oracle, mark, spread, basis });
      await new Promise(r => setTimeout(r, 100));
    } catch (e) {
      console.error(`  ${m.name}: ${e.message}`);
    }
  }

  console.log(`\n${'Market'.padEnd(12)} ${'Oracle'.padStart(12)} ${'Mark'.padStart(12)} ${'Basis%'.padStart(8)} ${'Spread%'.padStart(8)}`);
  console.log('─'.repeat(55));
  for (const r of results) {
    console.log(`${r.name.padEnd(12)} ${('$'+r.oracle.toFixed(2)).padStart(12)} ${('$'+r.mark.toFixed(2)).padStart(12)} ${r.basis.toFixed(4).padStart(7)}% ${r.spread.toFixed(4).padStart(7)}%`);
  }

  // Lending rates from DeFi Llama
  console.log('\n📊 Solana Lending Rates (USDC):');
  const llamaResp = await fetch('https://yields.llama.fi/pools');
  const llamaData = await llamaResp.json();
  
  const usdcPools = llamaData.data.filter(p =>
    p.chain === 'Solana' &&
    ['jupiter-lend','kamino-lend','save','drift-lend','marginfi'].includes(p.project) &&
    p.symbol === 'USDC'
  ).sort((a, b) => b.apy - a.apy);

  const solPools = llamaData.data.filter(p =>
    p.chain === 'Solana' &&
    ['jupiter-lend','kamino-lend','save','drift-lend','marginfi'].includes(p.project) &&
    p.symbol === 'SOL'
  ).sort((a, b) => b.apy - a.apy);

  console.log('  USDC:');
  for (const p of usdcPools.slice(0, 5)) {
    console.log(`    ${p.project.padEnd(16)} ${p.apy.toFixed(2)}% APY (TVL: $${(p.tvlUsd/1e6).toFixed(1)}M)`);
  }
  console.log('  SOL:');
  for (const p of solPools.slice(0, 5)) {
    console.log(`    ${p.project.padEnd(16)} ${p.apy.toFixed(2)}% APY (TVL: $${(p.tvlUsd/1e6).toFixed(1)}M)`);
  }

  // Current Sentinel Vault comparison
  const jupiterUsdc = usdcPools.find(p => p.project === 'jupiter-lend');
  const bestUsdc = usdcPools[0];
  if (jupiterUsdc && bestUsdc && bestUsdc.project !== 'jupiter-lend') {
    const diff = bestUsdc.apy - jupiterUsdc.apy;
    if (diff > 0.5) {
      console.log(`\n⚠️  Sentinel Vault Alert: ${bestUsdc.project} (${bestUsdc.apy.toFixed(2)}%) beats Jupiter Lend (${jupiterUsdc.apy.toFixed(2)}%) by ${diff.toFixed(2)}%`);
    } else {
      console.log(`\n✅ Sentinel Vault: Jupiter Lend competitive (${jupiterUsdc.apy.toFixed(2)}% vs best ${bestUsdc.apy.toFixed(2)}%)`);
    }
  }

  // Save log
  const logEntry = {
    timestamp: new Date().toISOString(),
    markets: results,
    usdcRates: usdcPools.slice(0,5).map(p => ({name: p.project, apy: p.apy})),
    solRates: solPools.slice(0,5).map(p => ({name: p.project, apy: p.apy})),
  };
  let log = [];
  try { log = JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8')); } catch {}
  log.push(logEntry);
  if (log.length > 168) log = log.slice(-168);
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));

  console.log('\n✅ Done');
}

main().catch(console.error);
