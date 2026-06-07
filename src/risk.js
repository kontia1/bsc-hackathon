/**
 * Risk/Policy Engine
 * Hard rules — no trade bypasses. Every signal must pass ALL checks.
 * 
 * Rules:
 * 1. Token allowlist — must be in eligible tokens list
 * 2. Position size — max 10% of portfolio per trade
 * 3. Daily loss limit — stop trading if -5% daily drawdown
 * 4. Max drawdown — emergency stop at -15% total
 * 5. Slippage — max 2% tolerance
 * 6. Cooldown — min 5 min between trades on same token
 * 7. Min trade size — $0.50 minimum
 * 8. Max open positions — 5 max concurrent
 */

const fs = require('fs');
const path = require('path');

// Load eligible tokens
const eligiblePath = path.join(__dirname, '../config/eligible-tokens.js');
let ELIGIBLE_TOKENS = new Set();
try {
  const mod = require(eligiblePath);
  ELIGIBLE_TOKENS = new Set(mod.ELIGIBLE_TOKENS || []);
} catch (e) {
  console.warn('[Risk] Could not load eligible tokens:', e.message);
}

// Risk config
const CONFIG = {
  maxPositionPct: 0.10,      // 10% of portfolio per trade
  dailyLossLimit: -0.05,     // -5% daily drawdown stops trading
  maxDrawdown: -0.15,        // -15% total drawdown emergency stop
  maxSlippage: 0.02,         // 2% max slippage
  cooldownMs: 5 * 60 * 1000, // 5 min cooldown per token
  minTradeUsd: 0.50,         // $0.50 minimum trade
  maxOpenPositions: 5,       // max concurrent positions
};

class RiskEngine {
  constructor(portfolioValue = 15) {
    this.portfolioValue = portfolioValue;
    this.initialValue = portfolioValue;
    this.dailyStartValue = portfolioValue;
    this.positions = new Map();       // token -> { entryPrice, size, timestamp }
    this.tradeLog = [];               // { token, action, amount, price, timestamp, approved, reason }
    this.lastTradeTime = new Map();   // token -> timestamp
    this.dailyResetDate = new Date().toDateString();
  }

  // Reset daily tracking at midnight
  _checkDailyReset() {
    const today = new Date().toDateString();
    if (today !== this.dailyResetDate) {
      this.dailyStartValue = this.portfolioValue;
      this.dailyResetDate = today;
    }
  }

  // Update portfolio value (call after each trade or periodically)
  updatePortfolioValue(newValue) {
    this.portfolioValue = newValue;
  }

  // Main check — returns { approved, reason, checks }
  check(signal) {
    this._checkDailyReset();
    
    const checks = {};
    const reasons = [];

    // 1. Token allowlist
    if (ELIGIBLE_TOKENS.size > 0 && !ELIGIBLE_TOKENS.has(signal.token)) {
      checks.allowlist = false;
      reasons.push(`Token ${signal.token} not in eligible list`);
    } else {
      checks.allowlist = true;
    }

    // 2. Position size
    const maxSize = this.portfolioValue * CONFIG.maxPositionPct;
    if (signal.action === 'BUY' && signal.amountUsd > maxSize) {
      checks.positionSize = false;
      reasons.push(`Position $${signal.amountUsd.toFixed(2)} exceeds max $${maxSize.toFixed(2)} (10%)`);
    } else {
      checks.positionSize = true;
    }

    // 3. Daily loss limit
    const dailyPnl = (this.portfolioValue - this.dailyStartValue) / this.dailyStartValue;
    if (dailyPnl <= CONFIG.dailyLossLimit) {
      checks.dailyLoss = false;
      reasons.push(`Daily loss ${(dailyPnl * 100).toFixed(1)}% exceeds limit ${(CONFIG.dailyLossLimit * 100)}%`);
    } else {
      checks.dailyLoss = true;
    }

    // 4. Max drawdown
    const totalDrawdown = (this.portfolioValue - this.initialValue) / this.initialValue;
    if (totalDrawdown <= CONFIG.maxDrawdown) {
      checks.maxDrawdown = false;
      reasons.push(`Total drawdown ${(totalDrawdown * 100).toFixed(1)}% exceeds limit ${(CONFIG.maxDrawdown * 100)}%`);
    } else {
      checks.maxDrawdown = true;
    }

    // 5. Slippage
    if (signal.estimatedSlippage && signal.estimatedSlippage > CONFIG.maxSlippage) {
      checks.slippage = false;
      reasons.push(`Slippage ${(signal.estimatedSlippage * 100).toFixed(1)}% exceeds max ${(CONFIG.maxSlippage * 100)}%`);
    } else {
      checks.slippage = true;
    }

    // 6. Cooldown
    const lastTrade = this.lastTradeTime.get(signal.token);
    if (lastTrade && (Date.now() - lastTrade) < CONFIG.cooldownMs) {
      const waitSec = Math.ceil((CONFIG.cooldownMs - (Date.now() - lastTrade)) / 1000);
      checks.cooldown = false;
      reasons.push(`Cooldown: ${waitSec}s remaining for ${signal.token}`);
    } else {
      checks.cooldown = true;
    }

    // 7. Min trade size
    if (signal.action === 'BUY' && signal.amountUsd < CONFIG.minTradeUsd) {
      checks.minSize = false;
      reasons.push(`Trade $${signal.amountUsd.toFixed(4)} below minimum $${CONFIG.minTradeUsd}`);
    } else {
      checks.minSize = true;
    }

    // 8. Max open positions
    if (signal.action === 'BUY' && !this.positions.has(signal.token) && this.positions.size >= CONFIG.maxOpenPositions) {
      checks.maxPositions = false;
      reasons.push(`Max ${CONFIG.maxOpenPositions} positions reached`);
    } else {
      checks.maxPositions = true;
    }

    const approved = Object.values(checks).every(v => v === true);

    // Log the check
    const entry = {
      timestamp: new Date().toISOString(),
      token: signal.token,
      action: signal.action,
      amountUsd: signal.amountUsd,
      approved,
      reason: approved ? 'All checks passed' : reasons.join('; '),
      checks,
    };
    this.tradeLog.push(entry);

    return { approved, reason: entry.reason, checks };
  }

  // Record a executed trade
  recordTrade(token, action, amountUsd, price, txHash) {
    this.lastTradeTime.set(token, Date.now());

    if (action === 'BUY') {
      this.positions.set(token, {
        entryPrice: price,
        size: amountUsd,
        timestamp: Date.now(),
        txHash,
      });
    } else if (action === 'SELL') {
      this.positions.delete(token);
    }
  }

  // Get current status
  getStatus() {
    this._checkDailyReset();
    const dailyPnl = (this.portfolioValue - this.dailyStartValue) / this.dailyStartValue;
    const totalDrawdown = (this.portfolioValue - this.initialValue) / this.initialValue;

    return {
      portfolioValue: this.portfolioValue,
      dailyPnl: `${(dailyPnl * 100).toFixed(2)}%`,
      totalDrawdown: `${(totalDrawdown * 100).toFixed(2)}%`,
      openPositions: this.positions.size,
      maxPositions: CONFIG.maxOpenPositions,
      totalTrades: this.tradeLog.length,
      approvedTrades: this.tradeLog.filter(t => t.approved).length,
      rejectedTrades: this.tradeLog.filter(t => !t.approved).length,
      tradingHalted: dailyPnl <= CONFIG.dailyLossLimit || totalDrawdown <= CONFIG.maxDrawdown,
    };
  }

  // Get trade history
  getTradeLog(limit = 20) {
    return this.tradeLog.slice(-limit);
  }

  // Save state to file
  saveState(filepath) {
    const state = {
      portfolioValue: this.portfolioValue,
      initialValue: this.initialValue,
      dailyStartValue: this.dailyStartValue,
      dailyResetDate: this.dailyResetDate,
      positions: Object.fromEntries(this.positions),
      lastTradeTime: Object.fromEntries(this.lastTradeTime),
      tradeLog: this.tradeLog,
    };
    fs.writeFileSync(filepath, JSON.stringify(state, null, 2));
  }

  // Load state from file
  loadState(filepath) {
    if (!fs.existsSync(filepath)) return false;
    const state = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    this.portfolioValue = state.portfolioValue;
    this.initialValue = state.initialValue;
    this.dailyStartValue = state.dailyStartValue;
    this.dailyResetDate = state.dailyResetDate;
    this.positions = new Map(Object.entries(state.positions || {}));
    this.lastTradeTime = new Map(Object.entries(state.lastTradeTime || {}));
    this.tradeLog = state.tradeLog || [];
    return true;
  }
}

module.exports = { RiskEngine, CONFIG };
