/**
 * Performance Metrics Tracker
 * Tracks: Sharpe ratio, win rate, max drawdown, total return, trade count
 * 
 * Reads from proof ledger and risk state to compute live metrics.
 */

const fs = require('fs');
const path = require('path');

const METRICS_PATH = path.join(__dirname, '../data/metrics.json');

class PerformanceTracker {
  constructor() {
    this.trades = [];
    this.portfolioSnapshots = []; // { timestamp, value }
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(METRICS_PATH)) {
        const data = JSON.parse(fs.readFileSync(METRICS_PATH, 'utf-8'));
        this.trades = data.trades || [];
        this.portfolioSnapshots = data.snapshots || [];
      }
    } catch (e) {
      console.warn('[Metrics] Could not load:', e.message);
    }
  }

  _save() {
    const dir = path.dirname(METRICS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(METRICS_PATH, JSON.stringify({
      trades: this.trades,
      snapshots: this.portfolioSnapshots,
      lastUpdated: new Date().toISOString(),
    }, null, 2));
  }

  // Record a completed trade (buy + sell pair)
  recordTrade(token, buyPrice, sellPrice, buyAmount, sellAmount, buyTx, sellTx) {
    const pnl = sellAmount - buyAmount;
    const pnlPct = (pnl / buyAmount) * 100;
    const holdTimeMs = new Date(sellTx?.timestamp || Date.now()) - new Date(buyTx?.timestamp || Date.now());

    this.trades.push({
      token,
      buyPrice,
      sellPrice,
      buyAmount,
      sellAmount,
      pnl: parseFloat(pnl.toFixed(4)),
      pnlPct: parseFloat(pnlPct.toFixed(2)),
      holdTimeMs,
      buyTx: buyTx?.hash,
      sellTx: sellTx?.hash,
      timestamp: new Date().toISOString(),
    });
    this._save();
  }

  // Snapshot portfolio value
  snapshot(value) {
    this.portfolioSnapshots.push({
      timestamp: new Date().toISOString(),
      value,
    });
    this._save();
  }

  // Calculate all metrics
  getMetrics() {
    const trades = this.trades;
    const snapshots = this.portfolioSnapshots;

    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winRate: '0%',
        avgPnl: '$0.00',
        avgPnlPct: '0%',
        sharpeRatio: '0.00',
        maxDrawdown: '0%',
        totalReturn: '$0.00',
        totalReturnPct: '0%',
        avgHoldTime: '0h',
        bestTrade: null,
        worstTrade: null,
        profitFactor: '0.00',
      };
    }

    // Win/Loss
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);
    const winRate = (wins.length / trades.length * 100).toFixed(1);

    // P&L
    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    const avgPnl = totalPnl / trades.length;
    const avgPnlPct = trades.reduce((sum, t) => sum + t.pnlPct, 0) / trades.length;

    // Profit factor
    const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? '∞' : '0.00';

    // Sharpe ratio (simplified — daily returns)
    const returns = trades.map(t => t.pnlPct / 100);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
    const sharpe = stdDev > 0 ? (avgReturn / stdDev * Math.sqrt(365)).toFixed(2) : '0.00';

    // Max drawdown from portfolio snapshots
    let maxDD = 0;
    let peak = 0;
    for (const snap of snapshots) {
      if (snap.value > peak) peak = snap.value;
      const dd = (peak - snap.value) / peak;
      if (dd > maxDD) maxDD = dd;
    }

    // Hold time
    const avgHoldMs = trades.reduce((sum, t) => sum + (t.holdTimeMs || 0), 0) / trades.length;
    const avgHoldHours = (avgHoldMs / 3600000).toFixed(1);

    // Best/Worst
    const bestTrade = trades.reduce((best, t) => t.pnlPct > (best?.pnlPct || -Infinity) ? t : best, null);
    const worstTrade = trades.reduce((worst, t) => t.pnlPct < (worst?.pnlPct || Infinity) ? t : worst, null);

    // Total return from snapshots
    const initialValue = snapshots.length > 0 ? snapshots[0].value : 0;
    const currentValue = snapshots.length > 0 ? snapshots[snapshots.length - 1].value : 0;
    const totalReturn = currentValue - initialValue;
    const totalReturnPct = initialValue > 0 ? (totalReturn / initialValue * 100).toFixed(2) : '0.00';

    return {
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: `${winRate}%`,
      avgPnl: `$${avgPnl.toFixed(2)}`,
      avgPnlPct: `${avgPnlPct.toFixed(2)}%`,
      sharpeRatio: sharpe,
      maxDrawdown: `${(maxDD * 100).toFixed(2)}%`,
      totalReturn: `$${totalReturn.toFixed(2)}`,
      totalReturnPct: `${totalReturnPct}%`,
      profitFactor,
      avgHoldTime: `${avgHoldHours}h`,
      bestTrade: bestTrade ? { token: bestTrade.token, pnlPct: `${bestTrade.pnlPct}%` } : null,
      worstTrade: worstTrade ? { token: worstTrade.token, pnlPct: `${worstTrade.pnlPct}%` } : null,
      grossProfit: `$${grossProfit.toFixed(2)}`,
      grossLoss: `$${grossLoss.toFixed(2)}`,
    };
  }

  // Pretty print metrics
  printMetrics() {
    const m = this.getMetrics();
    console.log('\n=== Performance Metrics ===');
    console.log(`  Total trades:   ${m.totalTrades} (${m.wins || 0}W / ${m.losses || 0}L)`);
    console.log(`  Win rate:       ${m.winRate}`);
    console.log(`  Avg P&L:        ${m.avgPnl} (${m.avgPnlPct})`);
    console.log(`  Profit factor:  ${m.profitFactor}`);
    console.log(`  Sharpe ratio:   ${m.sharpeRatio}`);
    console.log(`  Max drawdown:   ${m.maxDrawdown}`);
    console.log(`  Total return:   ${m.totalReturn} (${m.totalReturnPct})`);
    console.log(`  Avg hold time:  ${m.avgHoldTime}`);
    if (m.bestTrade) console.log(`  Best trade:     ${m.bestTrade.token} (${m.bestTrade.pnlPct})`);
    if (m.worstTrade) console.log(`  Worst trade:    ${m.worstTrade.token} (${m.worstTrade.pnlPct})`);
    console.log(`  Gross profit:   ${m.grossProfit}`);
    console.log(`  Gross loss:     ${m.grossLoss}`);
    console.log('===========================\n');
    return m;
  }
}

module.exports = { PerformanceTracker };
