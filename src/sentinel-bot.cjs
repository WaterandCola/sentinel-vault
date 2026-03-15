#!/usr/bin/env node
/**
 * Sentinel Vault — AI Rebalancing Bot
 * Monitors lending rates and manages vault allocation
 * Run: node sentinel-bot.cjs [--once]
 */

const { VoltrClient } = require('@voltr/vault-sdk');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { getAccount, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');

const RPC_URL = 'https://api.mainnet-beta.solana.com';
const KEYPAIR_PATH = '/home/ubuntu/.config/solana/taizi-wallet.json';
const VAULT_INFO_PATH = '/home/ubuntu/.openclaw/workspace-taizi/projects/ranger-hackathon/vault-info.json';
const LOG_PATH = '/home/ubuntu/.openclaw/workspace-taizi/projects/ranger-hackathon/sentinel-log.json';

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// Fetch current lending rates from DeFi Llama
async function fetchRates() {
  const resp = await fetch('https://yields.llama.fi/pools');
  const { data } = await resp.json();

  const targets = [
    { name: 'Jupiter Lend', match: p => p.project === 'jupiter-lend' && p.symbol === 'USDC' },
    { name: 'Kamino Lend', match: p => p.project === 'kamino-lend' && p.symbol === 'USDC' },
    { name: 'Save (Solend)', match: p => p.project === 'save' && p.symbol === 'USDC' },
    { name: 'Drift Lend', match: p => p.project === 'drift-lend' && p.symbol === 'USDC' },
    { name: 'Marginfi', match: p => p.project === 'marginfi' && p.symbol === 'USDC' },
  ];

  const rates = [];
  for (const t of targets) {
    const pool = data.find(t.match);
    if (pool) {
      rates.push({
        name: t.name,
        apy: pool.apy,
        tvl: pool.tvlUsd,
        apyBase: pool.apyBase,
        apyReward: pool.apyReward || 0,
      });
    }
  }
  return rates.sort((a, b) => b.apy - a.apy);
}

// Get vault state
async function getVaultState() {
  const vaultInfo = JSON.parse(fs.readFileSync(VAULT_INFO_PATH, 'utf-8'));
  const vault = new PublicKey(vaultInfo.vault);
  const connection = new Connection(RPC_URL, 'confirmed');
  const vc = new VoltrClient(connection);

  // Get vault account data
  const vaultAccount = await connection.getAccountInfo(vault);
  
  // Get vault idle USDC balance
  const vaultAssetIdleAuth = vc.findVaultAssetIdleAuth(vault);
  let idleBalance = 0;
  try {
    const idleAta = getAssociatedTokenAddressSync(USDC_MINT, vaultAssetIdleAuth, true, TOKEN_PROGRAM_ID);
    const account = await getAccount(connection, idleAta, 'confirmed', TOKEN_PROGRAM_ID);
    idleBalance = Number(account.amount) / 1e6;
  } catch { }

  return {
    vault: vault.toBase58(),
    idleUsdc: idleBalance,
    strategies: vaultInfo.strategies || [],
  };
}

// AI allocation decision
function aiDecision(rates, vaultState) {
  const decision = {
    timestamp: new Date().toISOString(),
    rates,
    vaultState: { idle: vaultState.idleUsdc },
    action: 'hold',
    reasoning: '',
  };

  if (rates.length === 0) {
    decision.reasoning = 'No rate data available';
    return decision;
  }

  const bestRate = rates[0];
  const jupiterRate = rates.find(r => r.name === 'Jupiter Lend');

  // If idle USDC > $1, allocate to best strategy
  if (vaultState.idleUsdc > 1) {
    decision.action = 'allocate';
    decision.target = 'Jupiter Lend'; // Only strategy we have initialized
    decision.amount = vaultState.idleUsdc;
    decision.reasoning = `${vaultState.idleUsdc.toFixed(2)} USDC idle in vault. Allocating to Jupiter Lend at ${jupiterRate?.apy?.toFixed(2) || '?'}% APY.`;
    return decision;
  }

  // Rate comparison for future multi-strategy rebalancing
  if (bestRate.name !== 'Jupiter Lend' && bestRate.apy > (jupiterRate?.apy || 0) * 1.15) {
    decision.action = 'rebalance_needed';
    decision.reasoning = `${bestRate.name} (${bestRate.apy.toFixed(2)}%) is >15% better than Jupiter Lend (${jupiterRate?.apy?.toFixed(2) || '?'}%). Rebalance recommended when strategy is available.`;
    return decision;
  }

  decision.reasoning = `Jupiter Lend at ${jupiterRate?.apy?.toFixed(2) || '?'}% APY. Best available: ${bestRate.name} at ${bestRate.apy.toFixed(2)}%. No action needed.`;
  return decision;
}

// Drift funding rate analysis
const { fetchFundingRates, analyzeTrend, makeDecision: makeDriftDecision } = require('./drift-strategy.cjs');

async function getDriftAnalysis() {
  try {
    const rates = await fetchFundingRates('SOL-PERP');
    const analysis = analyzeTrend(rates, 72);
    if (!analysis) return null;
    const decision = makeDriftDecision(analysis);
    return { analysis, decision };
  } catch (e) {
    console.log(`   ⚠️ Drift analysis failed: ${e.message}`);
    return null;
  }
}

// Log decision
function logDecision(decision) {
  let logs = [];
  try { logs = JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8')); } catch { }
  logs.push(decision);
  // Keep last 100 entries
  if (logs.length > 100) logs = logs.slice(-100);
  fs.writeFileSync(LOG_PATH, JSON.stringify(logs, null, 2));
}

async function run() {
  console.log('🛡️ Sentinel Vault — AI Monitor');
  console.log('═'.repeat(50));
  console.log(`Time: ${new Date().toISOString()}\n`);

  // Fetch rates
  console.log('📊 Fetching lending rates...');
  const rates = await fetchRates();
  for (const r of rates) {
    console.log(`   ${r.name}: ${r.apy.toFixed(2)}% APY (TVL: $${(r.tvl/1e6).toFixed(1)}M)`);
  }

  // Get vault state
  console.log('\n🏦 Vault state...');
  const vaultState = await getVaultState();
  console.log(`   Idle USDC: $${vaultState.idleUsdc.toFixed(2)}`);
  console.log(`   Strategies: ${vaultState.strategies.length}`);

  // AI decision (lending)
  console.log('\n🤖 AI Decision (Lending)...');
  const decision = aiDecision(rates, vaultState);
  console.log(`   Action: ${decision.action}`);
  console.log(`   Reasoning: ${decision.reasoning}`);

  // Drift funding rate analysis
  console.log('\n📈 Drift Funding Rate Analysis...');
  const drift = await getDriftAnalysis();
  if (drift) {
    console.log(`   SOL-PERP funding: ${drift.analysis.avgAnnualPct.toFixed(2)}% annualized`);
    console.log(`   Trend: ${drift.analysis.trend} | +${drift.analysis.consecutivePositive}h / -${drift.analysis.consecutiveNegative}h`);
    console.log(`   Drift action: ${drift.decision.action}`);
    console.log(`   Reasoning: ${drift.decision.reasoning}`);
    decision.drift = drift.decision;
  }

  // Log
  logDecision(decision);
  console.log('\n📝 Decision logged to sentinel-log.json');

  return decision;
}

run().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
