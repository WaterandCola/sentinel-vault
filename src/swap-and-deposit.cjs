#!/usr/bin/env node
/**
 * Sentinel Vault — Swap SOL→USDC and Deposit into Vault
 * Usage: node swap-and-deposit.cjs <sol_amount>
 */

const { VoltrClient } = require('@voltr/vault-sdk');
const { BN } = require('@coral-xyz/anchor');
const { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction, VersionedTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAccount } = require('@solana/spl-token');
const fs = require('fs');

const RPC_URL = 'https://api.mainnet-beta.solana.com';
const KEYPAIR_PATH = '/home/ubuntu/.config/solana/taizi-wallet.json';
const VAULT_INFO_PATH = '/home/ubuntu/.openclaw/workspace-taizi/projects/ranger-hackathon/vault-info.json';

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

async function swapAndDeposit(solAmount) {
  console.log(`🔄 Swap ${solAmount} SOL → USDC → Vault`);
  console.log('═'.repeat(50));

  const userKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8')))
  );
  const vaultInfo = JSON.parse(fs.readFileSync(VAULT_INFO_PATH, 'utf-8'));
  const vault = new PublicKey(vaultInfo.vault);

  const connection = new Connection(RPC_URL, 'confirmed');
  const vc = new VoltrClient(connection);

  const lamports = Math.floor(solAmount * 1e9);

  // Step 1: Get Raydium swap quote
  console.log('\n1️⃣ Getting Raydium swap quote...');
  const quoteUrl = `https://transaction-v1.raydium.io/compute/swap-base-in?inputMint=${SOL_MINT}&outputMint=${USDC_MINT}&amount=${lamports}&slippageBps=50&txVersion=V0`;
  const quoteResp = await fetch(quoteUrl);
  const quoteData = await quoteResp.json();
  if (!quoteData.success) throw new Error('Quote failed: ' + JSON.stringify(quoteData));
  const outAmount = parseInt(quoteData.data.outputAmount);
  console.log(`   ${solAmount} SOL → ${(outAmount / 1e6).toFixed(2)} USDC`);

  // Step 2: Get swap transaction from Raydium
  console.log('\n2️⃣ Building swap transaction...');
  const swapResp = await fetch('https://transaction-v1.raydium.io/transaction/swap-base-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      computeUnitPriceMicroLamports: '100000',
      swapResponse: quoteData,
      txVersion: 'V0',
      wallet: userKp.publicKey.toBase58(),
      wrapSol: true,
      unwrapSol: false,
    }),
  });
  const swapData = await swapResp.json();
  if (!swapData.success) throw new Error('Swap tx failed: ' + JSON.stringify(swapData));
  
  // Deserialize and sign
  const txData = swapData.data[0]; // Raydium returns array of transactions
  const swapTxBuf = Buffer.from(txData.transaction, 'base64');
  const swapTx = VersionedTransaction.deserialize(swapTxBuf);
  swapTx.sign([userKp]);

  const swapSig = await connection.sendTransaction(swapTx, { skipPreflight: false });
  await connection.confirmTransaction(swapSig, 'confirmed');
  console.log(`   ✅ Swap done: ${swapSig}`);

  // Step 3: Check USDC balance
  const usdcAta = getAssociatedTokenAddressSync(USDC_MINT, userKp.publicKey, false, TOKEN_PROGRAM_ID);
  const usdcAccount = await getAccount(connection, usdcAta, 'confirmed', TOKEN_PROGRAM_ID);
  const usdcBalance = Number(usdcAccount.amount) / 1e6;
  console.log(`   USDC balance: ${usdcBalance}`);

  // Step 4: Deposit into vault
  console.log('\n3️⃣ Depositing USDC into Sentinel Vault...');
  const depositAmount = new BN(usdcAccount.amount.toString());

  const depositIx = await vc.createDepositVaultIx(
    { amount: depositAmount },
    {
      userTransferAuthority: userKp.publicKey,
      vault,
      vaultAssetMint: USDC_MINT,
      assetTokenProgram: TOKEN_PROGRAM_ID,
    }
  );

  const depositTx = new Transaction().add(depositIx);
  const depositSig = await sendAndConfirmTransaction(connection, depositTx, [userKp], { commitment: 'confirmed' });

  console.log(`\n✅ Deposited ${usdcBalance} USDC into Sentinel Vault!`);
  console.log(`   Swap TX: ${swapSig}`);
  console.log(`   Deposit TX: ${depositSig}`);

  return { swapSig, depositSig, usdcAmount: usdcBalance };
}

const amount = parseFloat(process.argv[2] || '0');
if (amount <= 0) {
  console.log('Usage: node swap-and-deposit.cjs <sol_amount>');
  console.log('Example: node swap-and-deposit.cjs 0.2');
  process.exit(0);
}

swapAndDeposit(amount).catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
