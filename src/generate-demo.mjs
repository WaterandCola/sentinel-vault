#!/usr/bin/env node
/**
 * Sentinel Vault — Demo Video Generator
 * Generates an animated demo video from HTML slides + live data
 * No screen recording needed — fully programmatic
 */

import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const FRAME_DIR = '/tmp/sentinel-demo-frames';
const OUTPUT = '/home/ubuntu/.openclaw/workspace-taizi/projects/ranger-hackathon/demo.mp4';
const FPS = 2; // 2 frames per second for slides
const WIDTH = 1920;
const HEIGHT = 1080;

// Clean up
if (fs.existsSync(FRAME_DIR)) execSync(`rm -rf ${FRAME_DIR}`);
fs.mkdirSync(FRAME_DIR, { recursive: true });

// Fetch live data for the demo
async function fetchLiveData() {
  const llamaResp = await fetch('https://yields.llama.fi/pools');
  const llamaData = await llamaResp.json();
  const usdcPools = llamaData.data.filter(p =>
    p.chain === 'Solana' &&
    ['jupiter-lend', 'kamino-lend', 'save', 'drift-lend', 'marginfi'].includes(p.project) &&
    p.symbol === 'USDC'
  ).sort((a, b) => b.apy - a.apy);

  const dlobResp = await fetch('https://dlob.drift.trade/l2?marketIndex=0&marketType=perp&depth=1');
  const dlob = await dlobResp.json();
  const solPrice = dlob.oracle / 1e6;

  return { usdcPools, solPrice };
}

function slide(title, content, accent = '#00d4aa') {
  return `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px;
    background: linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 50%, #0a0a1a 100%);
    color: #fff; font-family: 'Segoe UI', system-ui, sans-serif;
    display: flex; flex-direction: column; justify-content: center; align-items: center;
    padding: 80px;
  }
  h1 { font-size: 64px; margin-bottom: 40px; color: ${accent}; text-align: center; }
  h2 { font-size: 42px; margin-bottom: 30px; color: #ccc; text-align: center; }
  .content { font-size: 32px; line-height: 1.8; color: #ddd; max-width: 1400px; text-align: center; }
  .highlight { color: ${accent}; font-weight: bold; }
  .box {
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 16px; padding: 40px; margin: 20px; width: 100%;
  }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; width: 100%; }
  .stat { font-size: 48px; color: ${accent}; font-weight: bold; }
  .label { font-size: 24px; color: #888; margin-top: 8px; }
  .bar { height: 24px; border-radius: 12px; margin: 8px 0; }
  .logo { font-size: 80px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 28px; }
  td, th { padding: 16px 24px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.1); }
  th { color: #888; font-weight: normal; }
  .green { color: #00d4aa; }
  .yellow { color: #ffd700; }
  .red { color: #ff4444; }
</style></head><body>
  <h1>${title}</h1>
  ${content}
</body></html>`;
}

async function generateSlides(data) {
  const slides = [];

  // Slide 1: Title
  slides.push(slide('🛡️ Sentinel Vault', `
    <h2>AI-Driven Adaptive Yield Optimizer for Solana</h2>
    <div class="content" style="margin-top: 40px;">
      <p>Autonomous vault that uses AI to dynamically allocate capital</p>
      <p>across Solana DeFi protocols for maximum risk-adjusted yield</p>
      <p style="margin-top: 40px; color: #888;">Built for Ranger Build-A-Bear Hackathon 🐻</p>
    </div>
  `));

  // Slide 2: Problem
  slides.push(slide('The Problem', `
    <div class="grid">
      <div class="box">
        <div class="stat">😴</div>
        <div class="label">Static Vaults</div>
        <div class="content" style="font-size: 24px; margin-top: 16px;">Most vaults use fixed allocation rules. Rates change, they don't.</div>
      </div>
      <div class="box">
        <div class="stat">📉</div>
        <div class="label">Missed Opportunities</div>
        <div class="content" style="font-size: 24px; margin-top: 16px;">Funding rate spikes, lending rate shifts — all ignored by static strategies.</div>
      </div>
    </div>
  `));

  // Slide 3: Solution Architecture
  slides.push(slide('Architecture', `
    <div class="box" style="font-family: monospace; font-size: 24px; text-align: left; line-height: 2;">
      <span class="green">┌─────────────────────────────────────┐</span><br>
      <span class="green">│</span>        Sentinel AI Engine             <span class="green">│</span><br>
      <span class="green">│</span>  Monitor → Analyze → Allocate       <span class="green">│</span><br>
      <span class="green">└──────────────┬──────────────────────┘</span><br>
      <span class="green">               │</span><br>
      <span class="green">    ┌──────────┼──────────┐</span><br>
      <span class="green">    ▼          ▼          ▼</span><br>
      <span class="highlight"> Jupiter   Drift    Kamino</span><br>
      <span class="highlight">  Lend    Perps     Lend</span><br>
      <span style="color: #888;">  3.3%    -8.2%     1.8%</span>
    </div>
  `));

  // Slide 4: Live Rates
  const rateRows = data.usdcPools.slice(0, 5).map(p => {
    const color = p.apy > 3 ? 'green' : p.apy > 1.5 ? 'yellow' : 'red';
    return `<tr><td>${p.project}</td><td>USDC</td><td class="${color}">${p.apy.toFixed(2)}%</td><td>$${(p.tvlUsd/1e6).toFixed(1)}M</td></tr>`;
  }).join('');

  slides.push(slide('📊 Live Lending Rates', `
    <table>
      <tr><th>Protocol</th><th>Asset</th><th>APY</th><th>TVL</th></tr>
      ${rateRows}
    </table>
    <div style="margin-top: 30px; color: #888; font-size: 24px;">
      Real-time data from DeFi Llama · SOL: $${data.solPrice.toFixed(2)}
    </div>
  `));

  // Slide 5: AI Decision
  slides.push(slide('🤖 AI Decision Engine', `
    <div class="box">
      <div style="font-size: 28px; text-align: left; line-height: 2;">
        <span class="green">✓</span> Multi-signal analysis (APY, TVL, utilization, risk)<br>
        <span class="green">✓</span> Predictive rebalancing — anticipate, don't react<br>
        <span class="green">✓</span> Risk-weighted allocation across protocols<br>
        <span class="green">✓</span> Drift funding rate trend detection (72h lookback)<br>
        <span class="green">✓</span> Auto-exit on market stress signals<br>
        <span class="green">✓</span> Every decision logged with reasoning
      </div>
    </div>
  `));

  // Slide 6: Strategies
  slides.push(slide('Dual Strategy', `
    <div class="grid">
      <div class="box">
        <div class="stat">💰</div>
        <div class="label">Lending Yield</div>
        <div class="content" style="font-size: 22px; margin-top: 16px;">
          Auto-allocate USDC to highest risk-adjusted lending rate.<br>
          Jupiter · Kamino · Save · Drift · Marginfi
        </div>
      </div>
      <div class="box">
        <div class="stat">📈</div>
        <div class="label">Funding Rate Farming</div>
        <div class="content" style="font-size: 22px; margin-top: 16px;">
          Delta-neutral: long spot + short perp on Drift.<br>
          AI enters when funding > 5% for 12+ hours.
        </div>
      </div>
    </div>
  `));

  // Slide 7: Live Vault
  slides.push(slide('🔴 Live on Mainnet', `
    <div class="box">
      <div style="font-size: 24px; text-align: left; line-height: 2.2;">
        <span class="green">Vault:</span> F8qBvxBi...GSH<br>
        <span class="green">Asset:</span> USDC<br>
        <span class="green">Strategy:</span> Jupiter Lend @ 3.34% APY<br>
        <span class="green">Status:</span> Fully allocated, AI monitoring every hour<br>
        <span class="green">Drift:</span> Monitoring SOL-PERP funding (-8.2% ann.) — holding<br>
        <span class="green">Built with:</span> Ranger Earn SDK (Voltr)
      </div>
    </div>
  `));

  // Slide 8: End
  slides.push(slide('🛡️ Sentinel Vault', `
    <h2>AI-Driven. Autonomous. Live on Mainnet.</h2>
    <div class="content" style="margin-top: 40px;">
      <p class="highlight">github.com/WaterandCola/sentinel-vault</p>
      <p style="margin-top: 30px; color: #888;">Ranger Build-A-Bear Hackathon · Main Track + Drift Side Track</p>
    </div>
  `));

  return slides;
}

async function main() {
  console.log('🎬 Generating Sentinel Vault demo video...\n');

  // Fetch live data
  console.log('📊 Fetching live data...');
  const data = await fetchLiveData();
  console.log(`   SOL: $${data.solPrice.toFixed(2)}, ${data.usdcPools.length} lending pools\n`);

  // Generate slides
  const slides = await generateSlides(data);
  console.log(`📝 Generated ${slides.length} slides\n`);

  // Launch browser
  console.log('🌐 Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', `--window-size=${WIDTH},${HEIGHT}`],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT });

  // Render each slide for 3 seconds (6 frames at 2fps)
  const framesPerSlide = 6;
  let frameNum = 0;

  for (let i = 0; i < slides.length; i++) {
    console.log(`   Rendering slide ${i + 1}/${slides.length}...`);
    await page.setContent(slides[i], { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 200));

    for (let f = 0; f < framesPerSlide; f++) {
      const framePath = path.join(FRAME_DIR, `frame_${String(frameNum).padStart(5, '0')}.png`);
      await page.screenshot({ path: framePath, type: 'png' });
      frameNum++;
    }
  }

  await browser.close();
  console.log(`\n📸 ${frameNum} frames captured\n`);

  // Stitch with ffmpeg
  console.log('🎬 Encoding video...');
  execSync(`ffmpeg -y -framerate ${FPS} -i ${FRAME_DIR}/frame_%05d.png -c:v libx264 -pix_fmt yuv420p -preset slow -crf 18 ${OUTPUT} 2>&1`);

  const stats = fs.statSync(OUTPUT);
  console.log(`\n✅ Demo video generated: ${OUTPUT}`);
  console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
  console.log(`   Duration: ${(frameNum / FPS).toFixed(0)}s`);
}

main().catch(console.error);
