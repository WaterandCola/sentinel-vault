#!/usr/bin/env node
/**
 * Sentinel Vault — Withdraw from Strategy + Vault
 * Usage: node withdraw.cjs <amount_usdc|all>
 */

const { VoltrClient } = require('@voltr/vault-sdk');
const { BN } = require('@coral-xyz/anchor');
const { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction, SystemProgram } = require('@solana/web3.js');
const { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');

const RPC_URL = 'https://api.mainnet-beta.solana.com';
const KEYPAIR_PATH = '/home/ubuntu/.config/solana/taizi-wallet.json';
const VAULT_INFO_PATH = '/home/ubuntu/.openclaw/workspace-taizi/projects/ranger-hackathon/vault-info.json';

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const SPOT_ADAPTOR = new PublicKey('EW35URAx3LiM13fFK3QxAXfGemHso9HWPixrv7YDY4AM');
const JUP_LEND = new PublicKey('jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9');
const JUP_LIQUIDITY = new PublicKey('jupeiUmn818Jg1ekPURTpr4mFo29p46vygyykFJ3wZC');
const JUP_REWARDS_RATE = new PublicKey('jup7TthsMgcR9Y3L277b8Eo9uboVSmu1utkuXHNUKar');
const WITHDRAW_DISCRIMINATOR = Buffer.from([232, 204, 244, 40, 201, 192, 7, 194]);

async function withdraw(amountUsdc) {
  const isAll = amountUsdc === 'all';
  console.log(`🏧 Withdrawing ${isAll ? 'ALL' : amountUsdc + ' USDC'} from Sentinel Vault`);
  console.log('═'.repeat(50));

  const userKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8')))
  );
  const vaultInfo = JSON.parse(fs.readFileSync(VAULT_INFO_PATH, 'utf-8'));
  const vault = new PublicKey(vaultInfo.vault);

  const connection = new Connection(RPC_URL, 'confirmed');
  const vc = new VoltrClient(connection);

  // Step 1: Request withdrawal from vault
  console.log('\n1️⃣ Requesting withdrawal from vault...');
  const withdrawArgs = isAll
    ? { amount: new BN(0), isAmountInLp: false, isWithdrawAll: true }
    : { amount: new BN(Math.floor(parseFloat(amountUsdc) * 1e6)), isAmountInLp: false, isWithdrawAll: false };

  const requestIx = await vc.createRequestWithdrawVaultIx(
    withdrawArgs,
    {
      userTransferAuthority: userKp.publicKey,
      vault,
      vaultAssetMint: USDC_MINT,
      assetTokenProgram: TOKEN_PROGRAM_ID,
    }
  );

  const tx1 = new Transaction().add(requestIx);
  const sig1 = await sendAndConfirmTransaction(connection, tx1, [userKp], { commitment: 'confirmed' });
  console.log(`   ✅ Withdrawal requested: ${sig1}`);

  // Step 2: Withdraw from Jupiter strategy (manager)
  console.log('\n2️⃣ Withdrawing from Jupiter Lend strategy...');
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
  const vaultStrategyFTokenAta = getAssociatedTokenAddressSync(fTokenMint, vaultStrategyAuth, true, TOKEN_PROGRAM_ID);
  const jVault = getAssociatedTokenAddressSync(USDC_MINT, liquidity, true, TOKEN_PROGRAM_ID);

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

  const withdrawStratIx = await vc.createWithdrawStrategyIx(
    { instructionDiscriminator: WITHDRAW_DISCRIMINATOR, withdrawAmount: withdrawArgs.amount },
    {
      manager: userKp.publicKey,
      vault,
      vaultAssetMint: USDC_MINT,
      assetTokenProgram: TOKEN_PROGRAM_ID,
      strategy: lending,
      remainingAccounts,
      adaptorProgram: SPOT_ADAPTOR,
    }
  );

  const tx2 = new Transaction().add(withdrawStratIx);
  const sig2 = await sendAndConfirmTransaction(connection, tx2, [userKp], { commitment: 'confirmed' });
  console.log(`   ✅ Strategy withdrawal done: ${sig2}`);

  // Step 3: Complete vault withdrawal
  console.log('\n3️⃣ Completing vault withdrawal...');
  const withdrawVaultIx = await vc.createWithdrawVaultIx(
    {
      userTransferAuthority: userKp.publicKey,
      vault,
      vaultAssetMint: USDC_MINT,
      assetTokenProgram: TOKEN_PROGRAM_ID,
    }
  );

  const tx3 = new Transaction().add(withdrawVaultIx);
  const sig3 = await sendAndConfirmTransaction(connection, tx3, [userKp], { commitment: 'confirmed' });
  console.log(`\n✅ Withdrawal complete!`);
  console.log(`   TX: ${sig3}`);
}

const amount = process.argv[2] || '';
if (!amount) {
  console.log('Usage: node withdraw.cjs <amount_usdc|all>');
  console.log('Example: node withdraw.cjs 10');
  console.log('Example: node withdraw.cjs all');
  process.exit(0);
}

withdraw(amount).catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
