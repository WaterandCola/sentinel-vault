#!/usr/bin/env node
/**
 * Sentinel Vault — Initialize Jupiter Lend Strategy
 * Sets up Jupiter Lend USDC as a yield strategy
 */

const { VoltrClient } = require('@voltr/vault-sdk');
const { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } = require('@solana/web3.js');
const { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAccount } = require('@solana/spl-token');
const fs = require('fs');

const RPC_URL = 'https://api.mainnet-beta.solana.com';
const KEYPAIR_PATH = '/home/ubuntu/.config/solana/taizi-wallet.json';
const VAULT_INFO_PATH = '/home/ubuntu/.openclaw/workspace-taizi/projects/ranger-hackathon/vault-info.json';

// Constants from voltrxyz/spot-scripts
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const SPOT_ADAPTOR_PROGRAM_ID = new PublicKey('EW35URAx3LiM13fFK3QxAXfGemHso9HWPixrv7YDY4AM');
const JUPITER_LEND_PROGRAM_ID = new PublicKey('jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9');
const JUPITER_LIQUIDITY_PROGRAM_ID = new PublicKey('jupeiUmn818Jg1ekPURTpr4mFo29p46vygyykFJ3wZC');
const DISCRIMINATOR_INIT = Buffer.from([96, 41, 228, 66, 7, 63, 88, 208]);

async function ensureAta(connection, payer, mint, owner, tokenProgram, ixs) {
  const ata = getAssociatedTokenAddressSync(mint, owner, true, tokenProgram);
  try {
    await getAccount(connection, ata, 'confirmed', tokenProgram);
  } catch {
    ixs.push(createAssociatedTokenAccountInstruction(payer, ata, owner, mint, tokenProgram));
  }
  return ata;
}

async function initJupiterLend() {
  console.log('🪐 Initializing Jupiter Lend Strategy');
  console.log('═'.repeat(50));

  const adminKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8')))
  );
  const vaultInfo = JSON.parse(fs.readFileSync(VAULT_INFO_PATH, 'utf-8'));
  const vault = new PublicKey(vaultInfo.vault);

  const connection = new Connection(RPC_URL, 'confirmed');
  const client = new VoltrClient(connection);

  // Step 1: Add spot adaptor if not already added
  console.log('\n1️⃣ Adding Spot Adaptor...');
  try {
    const addAdaptorIx = await client.createAddAdaptorIx({
      vault,
      admin: adminKp.publicKey,
      payer: adminKp.publicKey,
      adaptorProgram: SPOT_ADAPTOR_PROGRAM_ID,
    });
    const tx1 = new Transaction().add(addAdaptorIx);
    const sig1 = await sendAndConfirmTransaction(connection, tx1, [adminKp], { commitment: 'confirmed' });
    console.log(`   ✅ Spot Adaptor added: ${sig1}`);
  } catch (e) {
    if (e.message.includes('already')) {
      console.log('   ℹ️ Spot Adaptor already added');
    } else {
      console.log(`   ⚠️ ${e.message}`);
    }
  }

  // Step 2: Derive Jupiter Lend PDAs
  console.log('\n2️⃣ Deriving strategy addresses...');
  const [fTokenMint] = PublicKey.findProgramAddressSync(
    [Buffer.from('f_token_mint'), USDC_MINT.toBuffer()],
    JUPITER_LEND_PROGRAM_ID
  );
  console.log(`   fToken Mint: ${fTokenMint.toBase58()}`);

  const [lending] = PublicKey.findProgramAddressSync(
    [Buffer.from('lending'), USDC_MINT.toBuffer(), fTokenMint.toBuffer()],
    JUPITER_LEND_PROGRAM_ID
  );
  console.log(`   Strategy (lending PDA): ${lending.toBase58()}`);

  const { vaultStrategyAuth } = client.findVaultStrategyAddresses(vault, lending);
  console.log(`   Vault Strategy Auth: ${vaultStrategyAuth.toBase58()}`);

  // Step 3: Setup ATAs for vault strategy auth
  console.log('\n3️⃣ Setting up token accounts...');
  const setupIxs = [];
  
  const vaultStrategyAssetAta = await ensureAta(
    connection, adminKp.publicKey, USDC_MINT, vaultStrategyAuth, TOKEN_PROGRAM_ID, setupIxs
  );
  console.log(`   Asset ATA: ${vaultStrategyAssetAta.toBase58()}`);

  const vaultStrategyFTokenAta = await ensureAta(
    connection, adminKp.publicKey, fTokenMint, vaultStrategyAuth, TOKEN_PROGRAM_ID, setupIxs
  );
  console.log(`   fToken ATA: ${vaultStrategyFTokenAta.toBase58()}`);

  // Step 4: Initialize strategy
  console.log('\n4️⃣ Initializing Jupiter Lend strategy...');
  const initStrategyIx = await client.createInitializeStrategyIx(
    { instructionDiscriminator: DISCRIMINATOR_INIT },
    {
      payer: adminKp.publicKey,
      manager: adminKp.publicKey,
      vault,
      strategy: lending,
      adaptorProgram: SPOT_ADAPTOR_PROGRAM_ID,
      remainingAccounts: [],
    }
  );

  const allIxs = [...setupIxs, initStrategyIx];
  const tx = new Transaction().add(...allIxs);
  
  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [adminKp], { commitment: 'confirmed' });
    console.log(`\n✅ Jupiter Lend strategy initialized!`);
    console.log(`   Strategy: ${lending.toBase58()}`);
    console.log(`   TX: ${sig}`);

    // Update vault info
    vaultInfo.strategies = vaultInfo.strategies || [];
    vaultInfo.strategies.push({
      name: 'Jupiter Lend USDC',
      strategy: lending.toBase58(),
      adaptor: SPOT_ADAPTOR_PROGRAM_ID.toBase58(),
      initializedAt: new Date().toISOString(),
      tx: sig,
    });
    fs.writeFileSync(VAULT_INFO_PATH, JSON.stringify(vaultInfo, null, 2));
  } catch (e) {
    console.error(`\n❌ Error: ${e.message}`);
    if (e.logs) console.error('Logs:', e.logs.slice(-10).join('\n'));
  }
}

initJupiterLend().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
