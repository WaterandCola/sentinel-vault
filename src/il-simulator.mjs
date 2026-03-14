#!/usr/bin/env node
/**
 * Sentinel Vault — Impermanent Loss Simulator
 * Models concentrated liquidity returns with IL for SOL-USDC
 */

// Simulate concentrated liquidity position
function simulateCLMM({ entryPrice, exitPrice, rangeLow, rangeHigh, feeAPY, daysHeld }) {
  const sqrtEntry = Math.sqrt(entryPrice);
  const sqrtExit = Math.sqrt(exitPrice);
  const sqrtLow = Math.sqrt(rangeLow);
  const sqrtHigh = Math.sqrt(rangeHigh);

  // Concentration factor vs full range
  const concentration = Math.sqrt(entryPrice) / (sqrtHigh - sqrtLow);

  // IL calculation for concentrated liquidity
  // If price stays in range:
  let ilPct = 0;
  if (exitPrice >= rangeLow && exitPrice <= rangeHigh) {
    // Standard IL formula adjusted for concentration
    const priceRatio = exitPrice / entryPrice;
    const holdValue = 0.5 + 0.5 * priceRatio; // 50/50 USDC/SOL hold value
    const lpValue = (sqrtExit - sqrtLow) / (sqrtEntry - sqrtLow) * 
                    (sqrtEntry * (sqrtHigh - sqrtEntry)) / (sqrtHigh - sqrtLow) +
                    (sqrtHigh - sqrtExit) / (sqrtHigh - sqrtEntry) *
                    (sqrtEntry * (sqrtEntry - sqrtLow)) / (sqrtHigh - sqrtLow);
    // Simplified IL: 2*sqrt(r)/(1+r) - 1, amplified by concentration
    const r = priceRatio;
    const standardIL = 2 * Math.sqrt(r) / (1 + r) - 1;
    ilPct = standardIL * Math.min(concentration, 10); // cap amplification
  } else {
    // Price out of range — position is 100% one asset
    // IL is maximized for the range
    const r = exitPrice / entryPrice;
    ilPct = 2 * Math.sqrt(r) / (1 + r) - 1;
    ilPct *= Math.min(concentration, 10);
  }

  // Fee revenue (proportional to concentration and time)
  const feeRevenue = (feeAPY / 100) * (daysHeld / 365);

  // Net return
  const netReturn = feeRevenue + ilPct; // ilPct is negative

  return {
    entryPrice, exitPrice, rangeLow, rangeHigh,
    priceChange: ((exitPrice / entryPrice) - 1) * 100,
    concentration: concentration.toFixed(1),
    ilPct: (ilPct * 100).toFixed(2),
    feeRevenue: (feeRevenue * 100).toFixed(2),
    netReturn: (netReturn * 100).toFixed(2),
    netAPY: (netReturn / (daysHeld / 365) * 100).toFixed(2),
  };
}

// AI range width selector based on volatility
function selectRange(currentPrice, volatility) {
  // volatility = annualized % (e.g., 80 = 80%)
  // Higher vol → wider range → less IL but less fees
  let rangeWidth;
  if (volatility > 100) {
    rangeWidth = 0.50; // ±50% — very wide, safe
  } else if (volatility > 60) {
    rangeWidth = 0.30; // ±30% — moderate
  } else if (volatility > 30) {
    rangeWidth = 0.15; // ±15% — tight, high fees
  } else {
    rangeWidth = 0.08; // ±8% — very tight, max fees
  }

  return {
    rangeLow: currentPrice * (1 - rangeWidth),
    rangeHigh: currentPrice * (1 + rangeWidth),
    rangeWidth: (rangeWidth * 100).toFixed(0) + '%',
    volatility,
  };
}

function runSimulation() {
  console.log('🧪 Sentinel IL Simulator | Concentrated Liquidity Analysis');
  console.log('═'.repeat(65));

  const currentSOL = 87.28;

  // Scenario matrix: different price moves × different range widths
  const priceChanges = [-20, -10, -5, 0, 5, 10, 20]; // %
  const rangeWidths = [0.08, 0.15, 0.30, 0.50]; // ±%
  const baseFeeAPY = 45; // Orca SOL-USDC current

  console.log('\n📊 Net APY by Price Change × Range Width (30-day hold):');
  console.log(`Base fee APY: ${baseFeeAPY}% | Entry: $${currentSOL}`);
  console.log('─'.repeat(65));

  // Header
  let header = 'Price Δ'.padEnd(10);
  for (const rw of rangeWidths) {
    header += `±${(rw * 100).toFixed(0)}%`.padStart(12);
  }
  console.log(header);
  console.log('─'.repeat(65));

  for (const pc of priceChanges) {
    const exitPrice = currentSOL * (1 + pc / 100);
    let row = `${pc >= 0 ? '+' : ''}${pc}%`.padEnd(10);

    for (const rw of rangeWidths) {
      // Fee APY scales with concentration (tighter = more fees)
      const concentration = 1 / (2 * rw);
      const adjustedFeeAPY = baseFeeAPY * Math.min(concentration / 2, 3);

      const result = simulateCLMM({
        entryPrice: currentSOL,
        exitPrice,
        rangeLow: currentSOL * (1 - rw),
        rangeHigh: currentSOL * (1 + rw),
        feeAPY: adjustedFeeAPY,
        daysHeld: 30,
      });

      const netApy = parseFloat(result.netAPY);
      const icon = netApy > 15 ? '🟢' : netApy > 5 ? '🟡' : netApy > 0 ? '🔵' : '🔴';
      row += `${icon}${netApy.toFixed(0)}%`.padStart(12);
    }
    console.log(row);
  }

  // AI recommendation
  console.log('\n🎯 AI Strategy Recommendation:');
  console.log('─'.repeat(65));

  // Current SOL volatility estimate (30-day)
  const estimatedVol = 65; // ~65% annualized
  const aiRange = selectRange(currentSOL, estimatedVol);

  console.log(`  Current SOL volatility: ~${estimatedVol}% annualized`);
  console.log(`  AI selected range: ±${aiRange.rangeWidth} ($${aiRange.rangeLow.toFixed(2)} - $${aiRange.rangeHigh.toFixed(2)})`);

  const concentration = 1 / (2 * 0.30);
  const adjustedFee = baseFeeAPY * Math.min(concentration / 2, 3);

  // Simulate expected outcome
  const scenarios = [
    { name: 'SOL flat', exit: currentSOL },
    { name: 'SOL +10%', exit: currentSOL * 1.10 },
    { name: 'SOL -10%', exit: currentSOL * 0.90 },
    { name: 'SOL +20%', exit: currentSOL * 1.20 },
    { name: 'SOL -20%', exit: currentSOL * 0.80 },
  ];

  console.log(`\n  Expected outcomes (±30% range, 30-day hold):`);
  for (const s of scenarios) {
    const r = simulateCLMM({
      entryPrice: currentSOL,
      exitPrice: s.exit,
      rangeLow: aiRange.rangeLow,
      rangeHigh: aiRange.rangeHigh,
      feeAPY: adjustedFee,
      daysHeld: 30,
    });
    console.log(`    ${s.name.padEnd(12)} → Net APY: ${r.netAPY}% (fees: +${r.feeRevenue}%, IL: ${r.ilPct}%)`);
  }

  // Combined vault projection
  console.log('\n💰 Combined Vault Projection:');
  console.log('─'.repeat(65));
  const lendingAPY = 3.31; // Jupiter best
  const lpAPY = 18; // conservative estimate after IL
  const fundingAPY = 0; // currently negative, skip

  const allocations = [
    { name: 'Lending (safe)', pct: 40, apy: lendingAPY },
    { name: 'CLMM LP (managed)', pct: 55, apy: lpAPY },
    { name: 'Funding (opportunistic)', pct: 5, apy: fundingAPY },
  ];

  let blended = 0;
  for (const a of allocations) {
    blended += (a.pct / 100) * a.apy;
    console.log(`  ${a.name.padEnd(25)} | ${a.pct}% | ${a.apy.toFixed(1)}% APY`);
  }
  console.log(`  ${'─'.repeat(50)}`);
  console.log(`  ${'Blended Vault APY'.padEnd(25)} |     | ${blended.toFixed(2)}% ✅`);
  console.log(`\n  On $100K: +$${(100000 * blended / 100).toFixed(0)}/year`);
}

runSimulation();
