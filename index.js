/**
 * ICT Fear & Greed Rotation Agent
 * BNB Hack: AI Trading Agent Edition
 * 
 * Flow: CMC regime → CMC momentum filter → ICT technical → entry decision
 */

require('dotenv').config();
const { CMCClient } = require('./src/cmc');
const { analyzeICT } = require('./src/ict');

const cmc = new CMCClient(process.env.CMC_API_KEY);

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || '--demo';

  console.log('=== ICT Fear & Greed Rotation Agent ===');
  console.log('BNB Hack: AI Trading Agent Edition\n');

  // 1. CMC Regime Detection
  console.log('[1] CMC Regime Detection');
  const regime = await cmc.getRegime();
  console.log(`  Fear & Greed: ${regime.fearGreed} (${regime.classification})`);
  console.log(`  BTC Dominance: ${regime.btcDominance.toFixed(1)}%${regime.dominanceNote ? ' — ' + regime.dominanceNote : ''}`);
  console.log(`  Total MC: $${(regime.totalMarketCap / 1e9).toFixed(0)}B`);
  console.log(`  Mode: ${regime.mode} | Position: ${(regime.positionSize * 100).toFixed(0)}% | Bias: ${regime.bias}\n`);

  if (regime.mode === 'DEFENSIVE' && mode !== '--force') {
    console.log('  DEFENSIVE — holding cash, no trades.\n');
    return;
  }

  // 2. CMC Token Universe + Momentum Scoring
  console.log('[2] CMC Token Universe + Momentum');
  const universe = await cmc.getTradeableUniverse();
  console.log(`  ${universe.length} eligible tokens\n`);

  // Score all with CMC momentum
  const scored = universe.map(t => {
    const momentum = cmc.scoreCMCMomentum(t);
    return { ...t, cmcScore: momentum.score, cmcReasons: momentum.reasons };
  }).sort((a, b) => b.cmcScore - a.cmcScore);

  console.log('  Top 15 by CMC momentum:');
  console.log('  #  Symbol     Price          Score  24h      7d       VolΔ24h    DEX/CEX');
  console.log('  ── ────────── ────────────── ────── ──────── ──────── ────────── ────────');
  scored.slice(0, 15).forEach((t, i) => {
    const p = t.price < 0.01 ? t.price.toFixed(6) : t.price < 1 ? t.price.toFixed(4) : t.price.toFixed(2);
    const dexRatio = t.dexVolume24h && t.cexVolume24h ? 
      `${(t.dexVolume24h / (t.dexVolume24h + t.cexVolume24h) * 100).toFixed(0)}%` : '-';
    console.log(`  ${String(i+1).padStart(2)}. ${t.symbol.padEnd(10)} $${p.padStart(12)}  ${String(t.cmcScore).padStart(5)}  ${(t.percentChange24h > 0 ? '+' : '') + t.percentChange24h.toFixed(1).padStart(6)}%  ${(t.percentChange7d > 0 ? '+' : '') + t.percentChange7d.toFixed(1).padStart(6)}%  +${t.volumeChange24h.toFixed(0).padStart(7)}%  ${dexRatio.padStart(5)}`);
  });

  // 3. ICT Technical Analysis on CMC top picks
  const topCMC = scored.slice(0, 8);
  console.log(`\n[3] ICT Technical Analysis (${topCMC.length} candidates)`);

  const results = [];
  for (const token of topCMC) {
    try {
      // Try Binance first (faster), then GeckoTerminal
      let analysis;
      try {
        analysis = await analyzeICT(token.symbol);
      } catch (e) {
        // Binance failed — need contract address for GeckoTerminal
        // For now, skip tokens not on Binance
        results.push({ symbol: token.symbol, cmcScore: token.cmcScore, error: 'Not on Binance (need contract addr)' });
        continue;
      }
      results.push({ ...analysis, cmcScore: token.cmcScore, cmcReasons: token.cmcReasons });
    } catch (e) {
      results.push({ symbol: token.symbol, error: e.message });
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // Combined score: CMC momentum (40%) + ICT technical (60%)
  const combined = results
    .filter(r => r.entry)
    .map(r => ({
      ...r,
      combinedScore: (r.cmcScore * 0.4) + (r.entry.score * 0.6),
      allReasons: [...(r.cmcReasons || []), ...(r.entry.reasons || [])]
    }))
    .sort((a, b) => b.combinedScore - a.combinedScore);

  console.log('\n  Combined rankings (CMC 40% + ICT 60%):');
  console.log('  #  Symbol     CMC  ICT  Combined  RSI    Structure  30d Drop');
  console.log('  ── ────────── ──── ──── ───────── ────── ────────── ────────');
  combined.forEach((r, i) => {
    console.log(`  ${String(i+1).padStart(2)}. ${r.symbol.padEnd(10)} ${String(r.cmcScore).padStart(4)}  ${String(r.entry.score).padStart(4)}  ${r.combinedScore.toFixed(1).padStart(8)}  ${r.rsi.toFixed(0).padStart(5)}  ${r.structure.trend.padEnd(10)} ${r.levels.dropFromHigh.padStart(7)}`);
  });

  // 4. Entry candidates
  const candidates = combined.filter(r => r.combinedScore >= 5);
  if (candidates.length > 0) {
    console.log(`\n  ★ ${candidates.length} ENTRY CANDIDATES:\n`);
    candidates.forEach(c => {
      console.log(`  ${c.symbol} — Combined: ${c.combinedScore.toFixed(1)}/10 (CMC: ${c.cmcScore}, ICT: ${c.entry.score})`);
      console.log(`    Price: $${c.currentPrice} | RSI: ${c.rsi.toFixed(1)} | Structure: ${c.structure.trend}`);
      console.log(`    30d: ${c.levels.dropFromHigh} from high`);
      console.log(`    Volume: ${c.volume.ratio.toFixed(1)}x avg (${c.volume.signal})`);
      console.log(`    Signals:`);
      c.allReasons.forEach(r => console.log(`      ✓ ${r}`));
      if (c.oteZones.length > 0) {
        const ote = c.oteZones[c.oteZones.length - 1];
        console.log(`    OTE: $${ote.ote79.toFixed(6)} - $${ote.ote62.toFixed(6)}`);
      }
      console.log('');
    });
  } else {
    console.log('\n  No entries with combined score ≥ 5.');
  }

  // Errors
  const errors = results.filter(r => r.error);
  if (errors.length > 0) {
    console.log(`  ⚠ ${errors.length} tokens skipped: ${errors.map(e => e.symbol).join(', ')}`);
  }

  // 5. Risk
  console.log('[4] Risk Status');
  console.log('  Drawdown: 0% | Positions: 0 | Daily P&L: $0.00');
  console.log('  Max DD: 25% | Daily limit: -10%\n');

  console.log('=== Done ===');
}

main().catch(console.error);
