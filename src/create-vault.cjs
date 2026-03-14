#!/usr/bin/env node
/**
 * Sentinel Vault — Vault Creation Script
 * Creates a USDC vault on Ranger Earn (mainnet)
 */

const { VoltrClient, LENDING_ADAPTOR_PROGRAM_ID } = require('@voltr/vault-sdk');
const { BN } = require('@coral-xyz/anchor');
const { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } = require('@solana/web3.js');
const fs = require('fs');

// Config
const RPC_URL = 'https://api.mainnet-beta.solana.com';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const KEYPAIR_PATH = '/home/ubuntu/.config/solana/taizi-wallet.json';

async function createVault() {
  console.log('🛡️ Sentinel Vault — Deployment');
  console.log('═'.repeat(50));

  // Load keypair
  const adminKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8')))
  );
  console.log(`Admin: ${adminKp.publicKey.toBase58()}`);

  // Connect
  const connection = new Connection(RPC_URL, 'confirmed');
  const balance = await connection.getBalance(adminKp.publicKey);
  console.log(`Balance: ${balance / 1e9} SOL`);

  if (balance < 0.05 * 1e9) {
    console.error('❌ Insufficient SOL. Need at least 0.05 SOL.');
    return;
  }

  // Initialize client
  const client = new VoltrClient(connection);

  // Vault config
  const vaultConfig = {
    maxCap: new BN('18446744073709551615'),          // Uncapped
    startAtTs: new BN(0),                            // Immediate
    lockedProfitDegradationDuration: new BN(86400),  // 24h
    managerPerformanceFee: 1000,                     // 10%
    adminPerformanceFee: 0,                          // 0%
    managerManagementFee: 50,                        // 0.5%
    adminManagementFee: 0,                           // 0%
    redemptionFee: 10,                               // 0.1%
    issuanceFee: 10,                                 // 0.1%
    withdrawalWaitingPeriod: new BN(0),              // Immediate
  };

  const vaultParams = {
    config: vaultConfig,
    name: 'Sentinel Vault',
    description: 'AI-Driven Adaptive Yield Optimizer',
  };

  // Generate vault keypair
  const vaultKp = Keypair.generate();
  console.log(`\nVault address: ${vaultKp.publicKey.toBase58()}`);

  try {
    // Create vault instruction
    console.log('\n📦 Creating vault...');
    const createVaultIx = await client.createInitializeVaultIx(
      vaultParams,
      {
        vault: vaultKp.publicKey,
        vaultAssetMint: new PublicKey(USDC_MINT),
        admin: adminKp.publicKey,
        manager: adminKp.publicKey,
        payer: adminKp.publicKey,
      }
    );

    // Send transaction
    const tx = new Transaction().add(createVaultIx);
    const txSig = await sendAndConfirmTransaction(
      connection,
      tx,
      [adminKp, vaultKp],
      { commitment: 'confirmed' }
    );

    console.log(`\n✅ Vault created successfully!`);
    console.log(`   Vault: ${vaultKp.publicKey.toBase58()}`);
    console.log(`   TX: ${txSig}`);

    // Save vault info
    const vaultInfo = {
      vault: vaultKp.publicKey.toBase58(),
      admin: adminKp.publicKey.toBase58(),
      manager: adminKp.publicKey.toBase58(),
      asset: USDC_MINT,
      createdAt: new Date().toISOString(),
      txSignature: txSig,
    };

    // Save vault keypair securely
    fs.writeFileSync(
      '/home/ubuntu/.openclaw/workspace-taizi/.secrets/sentinel-vault-kp.json',
      JSON.stringify(Array.from(vaultKp.secretKey))
    );

    // Save vault info (public)
    fs.writeFileSync(
      '/home/ubuntu/.openclaw/workspace-taizi/projects/ranger-hackathon/vault-info.json',
      JSON.stringify(vaultInfo, null, 2)
    );

    console.log('\n📁 Vault keypair saved to .secrets/sentinel-vault-kp.json');
    console.log('📁 Vault info saved to vault-info.json');

    return vaultInfo;
  } catch (e) {
    console.error(`\n❌ Error: ${e.message}`);
    if (e.logs) {
      console.error('Logs:', e.logs.slice(-5).join('\n'));
    }
    throw e;
  }
}

// Check if --dry-run flag
if (process.argv.includes('--dry-run')) {
  console.log('🔍 Dry run mode — checking config only');
  const adminKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8')))
  );
  console.log(`Admin: ${adminKp.publicKey.toBase58()}`);
  console.log('Config OK. Run without --dry-run to deploy.');
} else {
  createVault().catch(e => {
    console.error('Fatal:', e.message);
    process.exit(1);
  });
}
