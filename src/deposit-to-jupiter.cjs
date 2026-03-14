#!/usr/bin/env node
/**
 * Sentinel Vault — Deposit USDC into Jupiter Lend Strategy
 * Allocates vault funds to Jupiter Lend for yield
 * Usage: node deposit-to-jupiter.cjs [amount_usdc]
 */

const { VoltrClient } = require('@voltr/vault-sdk');
const { BN } = require('@coral-xyz/anchor');
const { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction, SystemProgram } = require('@solana/web3.js');
const { getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');

const RPC_URL = 'https://api.mainnet-beta.solana.com';
const KEYPAIR_PATH = '/home/ubuntu/.config/solana/taizi-wallet.json';
const VAULT_INFO_PATH = '/home/ubuntu/.openclaw/workspace-taizi/projects/ranger-hackathon/vault-info.json';

// Constants
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_DECIMALS = 6;
const SPOT_ADAPTOR = new PublicKey('EW35URAx3LiM13fFK3QxAXfGemHso9HWPixrv7YDY4AM');
const JUP_LEND = new PublicKey('jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9');
const JUP_LIQUIDITY = new PublicKey('jupeiUmn818Jg1ekPURTpr4mFo29p46vygyykFJ3wZC');
const JUP_REWARDS_RATE = new PublicKey('jup7TthsMgcR9Y3L277b8Eo9uboVSmu1utkuXHNUKar');
const DEPOSIT_DISCRIMINATOR = Buffer.from([56, 2, 200, 235, 238, 139, 231, 190]);

async function depositToJupiter(amountUsdc) {
  console.log(`💰 Depositing ${amountUsdc} USDC to Jupiter Lend`);
  console.log('═'.repeat(50));

  const managerKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8')))
  );
  const vaultInfo = JSON.parse(fs.readFileSync(VAULT_INFO_PATH, 'utf-8'));
  const vault = new PublicKey(vaultInfo.vault);

  const connection = new Connection(RPC_URL, 'confirmed');
  const vc = new VoltrClient(connection);

  const depositAmount = new BN(amountUsdc * 10 ** USDC_DECIMALS);

  // Derive all PDAs
  const [fTokenMint] = PublicKey.findProgramAddressSync(
    [Buffer.from('f_token_mint'), USDC_MINT.toBuffer()], JUP_LEND
  );
  const [lending] = PublicKey.findProgramAddressSync(
    [Buffer.from('lending'), USDC_MINT.toBuffer(), fTokenMint.toBuffer()], JUP_LEND
  );
  const [lendingAdmin] = PublicKey.findProgramAddressSync(
    [Buffer.from('lending_admin')], JUP_LEND
  );
  const [supplyTokenReservesLiquidity] = PublicKey.findProgramAddressSync(
    [Buffer.from('reserve'), USDC_MINT.toBuffer()], JUP_LIQUIDITY
  );
  const [rateModel] = PublicKey.findProgramAddressSync(
    [Buffer.from('rate_model'), USDC_MINT.toBuffer()], JUP_LIQUIDITY
  );
  const [liquidity] = PublicKey.findProgramAddressSync(
    [Buffer.from('liquidity')], JUP_LIQUIDITY
  );
  const [rewardsRateModel] = PublicKey.findProgramAddressSync(
    [Buffer.from('lending_rewards_rate_model'), USDC_MINT.toBuffer()], JUP_REWARDS_RATE
  );
  const [lendingSupplyPositionOnLiquidity] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_supply_position'), USDC_MINT.toBuffer(), lending.toBuffer()], JUP_LIQUIDITY
  );

  const { vaultStrategyAuth } = vc.findVaultStrategyAddresses(vault, lending);

  const vaultStrategyFTokenAta = getAssociatedTokenAddressSync(
    fTokenMint, vaultStrategyAuth, true, TOKEN_PROGRAM_ID
  );
  const jVault = getAssociatedTokenAddressSync(
    USDC_MINT, liquidity, true, TOKEN_PROGRAM_ID
  );

  console.log(`Strategy: ${lending.toBase58()}`);
  console.log(`Amount: ${depositAmount.toString()} (${amountUsdc} USDC)`);

  const remainingAccounts = [
    { pubkey: vaultStrategyFTokenAta, isSigner: false, isWritable: true },
    { pubkey: lendingAdmin, isSigner: false, isWritable: false },
    { pubkey: fTokenMint, isSigner: false, isWritable: true },
    { pubkey: supplyTokenReservesLiquidity, isSigner: false, isWritable: true },
    { pubkey: lendingSupplyPositionOnLiquidity, isSigner: false, isWritable: true },
    { pubkey: rateModel, isSigner: false, isWritable: false },
    { pubkey: jVault, isSigner: false, isWritable: true },
    { pubkey: liquidity, isSigner: false, isWritable: true },
    { pubkey: JUP_LIQUIDITY, isSigner: false, isWritable: true },
    { pubkey: rewardsRateModel, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: true },
    { pubkey: JUP_LEND, isSigner: false, isWritable: true },
  ];

  try {
    const depositIx = await vc.createDepositStrategyIx(
      {
        instructionDiscriminator: DEPOSIT_DISCRIMINATOR,
        depositAmount,
      },
      {
        manager: managerKp.publicKey,
        vault,
        vaultAssetMint: USDC_MINT,
        assetTokenProgram: TOKEN_PROGRAM_ID,
        strategy: lending,
        remainingAccounts,
        adaptorProgram: SPOT_ADAPTOR,
      }
    );

    const tx = new Transaction().add(depositIx);
    const sig = await sendAndConfirmTransaction(connection, tx, [managerKp], { commitment: 'confirmed' });

    console.log(`\n✅ Deposited ${amountUsdc} USDC to Jupiter Lend!`);
    console.log(`   TX: ${sig}`);
    return sig;
  } catch (e) {
    console.error(`\n❌ Error: ${e.message}`);
    if (e.logs) console.error('Logs:', e.logs.slice(-10).join('\n'));
    throw e;
  }
}

const amount = parseFloat(process.argv[2] || '0');
if (amount <= 0) {
  console.log('Usage: node deposit-to-jupiter.cjs <amount_usdc>');
  console.log('Example: node deposit-to-jupiter.cjs 10');
  process.exit(0);
}

depositToJupiter(amount).catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
