/**
 * Strategy Engine — DCA (Dollar Cost Averaging)
 * 
 * Flow: CMC regime → CMC momentum filter → ICT analysis → Risk check → TWAK execute
 * 
 * Modes:
 * - ACCUMULATE: Fear & Greed < 35, buy dips, larger positions
 * - NEUTRAL: 35-65, normal DCA, standard sizing
 * - DEFENSIVE: > 65, no new buys, only sells if profit target hit
 */

const { CMCClient } = require('./cmc');
const { analyzeICT } = require('./ict');
const { RiskEngine } = require('./risk');
const { TWAKClient } = require('./twak');
const { ProofLedger } = require('./ledger');

class StrategyEngine {
  constructor(config = {}) {
    this.cmc = new CMCClient(process.env.CMC_API_KEY);
    this.twak = new TWAKClient();
    this.risk = new RiskEngine(config.portfolioValue || 15);
    this.ledger = new ProofLedger();
    
    // DCA config
    this.dcaIntervalMs = config.dcaIntervalMs || 60 * 60 * 1000; // 1 hour
    this.maxTokensPerRun = config.maxTokensPerRun || 2;
    this.minCombinedScore = config.minCombinedScore || 5;
    
    // State
    this.lastRunTime = 0;
    this.running = false;
  }

  // Load persisted risk state
  loadState() {
    const statePath = require('path').join(__dirname, '../data/risk-state.json');
    this.risk.loadState(statePath);
  }

  // Save risk state
  saveState() {
    const statePath = require('path').join(__dirname, '../data/risk-state.json');
    this.risk.saveState(statePath);
  }

  // Main loop — one full cycle
  async runCycle() {
    if (this.running) {
      console.log('[Strategy] Already running, skipping...');
      return;
    }
    this.running = true;
    const cycleStart = Date.now();

    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`[Strategy] Cycle started at ${new Date().toISOString()}`);
      console.log(`${'='.repeat(60)}\n`);

      // Step 1: CMC Regime
      console.log('[1/5] CMC Regime Detection');
      const regime = await this.cmc.getRegime();
      console.log(`  Fear & Greed: ${regime.fearGreed} (${regime.classification})`);
      console.log(`  Mode: ${regime.mode} | Bias: ${regime.bias}`);
      this.ledger.analysis('MARKET', { regime }, [
        `Fear & Greed: ${regime.fearGreed} → ${regime.mode}`,
        `Bias: ${regime.bias}, Position size: ${(regime.positionSize * 100).toFixed(0)}%`,
      ]);

      if (regime.mode === 'DEFENSIVE') {
        console.log('  DEFENSIVE mode — no new buys, checking sells only.\n');
        this.ledger.signal('MARKET', { action: 'HOLD', score: 0 }, ['Defensive mode, no new buys']);
        // TODO: check existing positions for sell signals
        return { action: 'SKIP', reason: 'Defensive mode' };
      }

      // Step 2: CMC Token Universe + Momentum
      console.log('[2/5] CMC Token Universe');
      const universe = await this.cmc.getTradeableUniverse();
      const scored = universe.map(t => ({
        ...t,
        cmcScore: this.cmc.scoreCMCMomentum(t).score,
      })).sort((a, b) => b.cmcScore - a.cmcScore);

      const topTokens = scored.slice(0, 15);
      console.log(`  ${universe.length} eligible, top 15 by momentum\n`);

      // Step 3: ICT Analysis on top tokens
      console.log('[3/5] ICT Technical Analysis');
      const analyzed = [];
      for (const token of topTokens) {
        try {
          const ict = await analyzeICT(token.symbol);
          if (!ict.error) {
            const combined = (token.cmcScore * 0.4) + ((ict.entry?.score || 0) * 0.6);
            analyzed.push({ ...token, ict, combinedScore: combined });
            this.ledger.analysis(token.symbol, { cmc: token.cmcScore, ict: ict.entry?.score }, [
              `CMC: ${token.cmcScore}, ICT: ${ict.entry?.score || 0}, Combined: ${combined.toFixed(1)}`,
              `RSI: ${ict.rsi?.toFixed(1)}, Structure: ${ict.structure?.trend}`,
            ]);
          }
        } catch (e) {
          this.ledger.error(token.symbol, e.message);
        }
        await new Promise(r => setTimeout(r, 200));
      }

      // Filter and sort
      const candidates = analyzed
        .filter(a => a.combinedScore >= this.minCombinedScore)
        .sort((a, b) => b.combinedScore - a.combinedScore)
        .slice(0, this.maxTokensPerRun);

      if (candidates.length === 0) {
        console.log('  No candidates above threshold.\n');
        return { action: 'SKIP', reason: 'No candidates' };
      }

      console.log(`  ${candidates.length} candidates above threshold\n`);

      // Step 4: Risk Check + Execute
      console.log('[4/5] Risk Check + Execute');
      const results = [];

      for (const candidate of candidates) {
        const token = candidate.symbol;
        const price = candidate.currentPrice || candidate.price;
        
        // Calculate position size based on regime
        const baseSize = this.risk.portfolioValue * 0.05; // 5% base
        const regimeMultiplier = regime.positionSize || 1;
        const amountUsd = baseSize * regimeMultiplier;

        const signal = {
          token,
          action: 'BUY',
          amountUsd,
          price,
          estimatedSlippage: 0.005,
          score: candidate.combinedScore,
        };

        // Risk check
        const riskResult = this.risk.check(signal);
        this.ledger.riskCheck(token, riskResult, [
          `Combined score: ${candidate.combinedScore.toFixed(1)}`,
          `Amount: $${amountUsd.toFixed(2)}, Price: $${price}`,
        ]);

        if (!riskResult.approved) {
          console.log(`  ✗ ${token}: REJECTED — ${riskResult.reason}`);
          results.push({ token, action: 'REJECTED', reason: riskResult.reason });
          continue;
        }

        // Execute via TWAK
        console.log(`  → ${token}: BUY $${amountUsd.toFixed(2)} at $${price}`);
        this.ledger.signal(token, signal, [
          `Regime: ${regime.mode}, Multiplier: ${regimeMultiplier}x`,
          `Score: ${candidate.combinedScore.toFixed(1)} (CMC: ${candidate.cmcScore}, ICT: ${candidate.ict.entry?.score || 0})`,
        ]);

        try {
          // TWAK swap: BNB -> token
          const swapResult = await this.twak.swap(
            (amountUsd / 585).toFixed(6), // convert USD to BNB approx
            'BNB',
            token,
            'bsc'
          );

          console.log(`  ✓ ${token}: TX ${swapResult.hash}`);
          
          // Record in risk engine
          this.risk.recordTrade(token, 'BUY', amountUsd, price, swapResult.hash);
          
          // Record in ledger
          this.ledger.trade(token, 'BUY', amountUsd, price, swapResult.hash, [
            `Regime: ${regime.mode}`,
            `Score: ${candidate.combinedScore.toFixed(1)}`,
            `CMC momentum: ${candidate.cmcScore}`,
            `ICT: ${candidate.ict.entry?.score || 0}`,
          ]);

          results.push({ token, action: 'BUY', txHash: swapResult.hash, amountUsd });
        } catch (e) {
          console.log(`  ✗ ${token}: FAILED — ${e.message}`);
          this.ledger.error(token, `Swap failed: ${e.message}`, { amountUsd, price });
          results.push({ token, action: 'FAILED', error: e.message });
        }

        // Cooldown between trades
        await new Promise(r => setTimeout(r, 3000));
      }

      // Step 5: Status
      console.log('\n[5/5] Cycle Status');
      const status = this.risk.getStatus();
      console.log(`  Portfolio: $${status.portfolioValue.toFixed(2)}`);
      console.log(`  Daily P&L: ${status.dailyPnl}`);
      console.log(`  Drawdown: ${status.totalDrawdown}`);
      console.log(`  Positions: ${status.openPositions}/${status.maxPositions}`);
      console.log(`  Trades: ${status.approvedTrades} approved, ${status.rejectedTrades} rejected`);
      
      this.saveState();

      const cycleMs = Date.now() - cycleStart;
      console.log(`\n[Strategy] Cycle complete in ${(cycleMs / 1000).toFixed(1)}s\n`);

      return { action: 'EXECUTED', results, status };

    } catch (e) {
      console.error('[Strategy] Cycle error:', e.message);
      this.ledger.error('SYSTEM', e.message);
      return { action: 'ERROR', error: e.message };
    } finally {
      this.running = false;
    }
  }

  // Start autonomous loop
  async start() {
    console.log('[Strategy] Starting autonomous DCA loop');
    console.log(`  Interval: ${this.dcaIntervalMs / 1000}s`);
    console.log(`  Min score: ${this.minCombinedScore}`);
    console.log(`  Max tokens/run: ${this.maxTokensPerRun}\n`);

    this.loadState();

    // Run immediately
    await this.runCycle();

    // Then on interval
    setInterval(async () => {
      await this.runCycle();
    }, this.dcaIntervalMs);
  }

  // Get ledger summary
  getSummary() {
    return {
      risk: this.risk.getStatus(),
      ledger: this.ledger.getStats(),
      recentTrades: this.ledger.getTrades(5),
      recentEntries: this.ledger.getRecent(10),
    };
  }
}

module.exports = { StrategyEngine };
