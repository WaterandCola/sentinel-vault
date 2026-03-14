#!/usr/bin/env node
/**
 * Sentinel Vault — Add Lending Adaptor
 * Adds the lending adaptor to enable lending strategies
 */

const { VoltrClient } = require('@voltr/vault-sdk');
const { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } = require('@solana/web3.js');
const fs = require('fs');

const RPC_URL = 'https://api.mainnet-beta.solana.com';
const KEYPAIR_PATH = '/home/ubuntu/.config/solana/taizi-wallet.json';
const VAULT_INFO_PATH = '/home/ubuntu/.openclaw/workspace-taizi/projects/ranger-hackathon/vault-info.json';

// From docs: https://docs.ranger.finance/vault-owners/strategies/setup-guide
const LENDING_ADAPTOR_PROGRAM_ID = new PublicKey('aVoLTRCRt3NnnchvLYH6rMYehJHwM5m45RmLBZq7PGz');

async function addAdaptor() {
  console.log('🔌 Adding Lending Adaptor to Sentinel Vault');
  console.log('═'.repeat(50));

  // Load keys and vault info
  const adminKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8')))
  );
  const vaultInfo = JSON.parse(fs.readFileSync(VAULT_INFO_PATH, 'utf-8'));
  const vault = new PublicKey(vaultInfo.vault);

  console.log(`Vault: ${vault.toBase58()}`);
  console.log(`Adaptor: ${LENDING_ADAPTOR_PROGRAM_ID.toBase58()}`);

  const connection = new Connection(RPC_URL, 'confirmed');
  const client = new VoltrClient(connection);

  try {
    const addAdaptorIx = await client.createAddAdaptorIx({
      vault,
      admin: adminKp.publicKey,
      payer: adminKp.publicKey,
      adaptorProgram: LENDING_ADAPTOR_PROGRAM_ID,
    });

    const tx = new Transaction().add(addAdaptorIx);
    const txSig = await sendAndConfirmTransaction(
      connection,
      tx,
      [adminKp],
      { commitment: 'confirmed' }
    );

    console.log(`\n✅ Lending Adaptor added!`);
    console.log(`   TX: ${txSig}`);

    // Update vault info
    vaultInfo.lendingAdaptor = LENDING_ADAPTOR_PROGRAM_ID.toBase58();
    vaultInfo.adaptorAddedAt = new Date().toISOString();
    fs.writeFileSync(VAULT_INFO_PATH, JSON.stringify(vaultInfo, null, 2));

    return txSig;
  } catch (e) {
    console.error(`\n❌ Error: ${e.message}`);
    if (e.logs) console.error('Logs:', e.logs.slice(-5).join('\n'));
    throw e;
  }
}

addAdaptor().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
