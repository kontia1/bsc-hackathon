/**
 * Proof Ledger
 * Logs every agent decision with full reasoning chain.
 * 
 * Entry format:
 * {
 *   id: auto-increment,
 *   timestamp: ISO string,
 *   type: 'ANALYSIS' | 'SIGNAL' | 'RISK_CHECK' | 'TRADE' | 'ERROR',
 *   token: symbol,
 *   data: { ...context },
 *   decision: string,
 *   reasoning: string[],
 *   txHash: string | null,
 *   approved: boolean | null,
 * }
 */

const fs = require('fs');
const path = require('path');

const LEDGER_PATH = path.join(__dirname, '../data/proof-ledger.json');

class ProofLedger {
  constructor(filepath = LEDGER_PATH) {
    this.filepath = filepath;
    this.entries = [];
    this._nextId = 1;
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filepath)) {
        const data = JSON.parse(fs.readFileSync(this.filepath, 'utf-8'));
        this.entries = data.entries || [];
        this._nextId = (data.nextId || this.entries.length + 1);
      }
    } catch (e) {
      console.warn('[Ledger] Could not load:', e.message);
    }
  }

  _save() {
    const dir = path.dirname(this.filepath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filepath, JSON.stringify({
      nextId: this._nextId,
      entries: this.entries,
      lastUpdated: new Date().toISOString(),
    }, null, 2));
  }

  // Log an analysis event
  analysis(token, data, reasoning = []) {
    return this._add({
      type: 'ANALYSIS',
      token,
      data,
      decision: 'Analyzed',
      reasoning,
      txHash: null,
      approved: null,
    });
  }

  // Log a signal generation
  signal(token, signal, reasoning = []) {
    return this._add({
      type: 'SIGNAL',
      token,
      data: signal,
      decision: `${signal.action} signal (score: ${signal.score})`,
      reasoning,
      txHash: null,
      approved: null,
    });
  }

  // Log a risk check
  riskCheck(token, result, reasoning = []) {
    return this._add({
      type: 'RISK_CHECK',
      token,
      data: result.checks || {},
      decision: result.approved ? 'APPROVED' : 'REJECTED',
      reasoning: [result.reason, ...reasoning],
      txHash: null,
      approved: result.approved,
    });
  }

  // Log a trade execution
  trade(token, action, amount, price, txHash, reasoning = []) {
    return this._add({
      type: 'TRADE',
      token,
      data: { action, amount, price },
      decision: `${action} $${amount.toFixed(2)} at $${price}`,
      reasoning,
      txHash,
      approved: true,
    });
  }

  // Log an error
  error(token, errorMsg, context = {}) {
    return this._add({
      type: 'ERROR',
      token,
      data: context,
      decision: 'ERROR',
      reasoning: [errorMsg],
      txHash: null,
      approved: null,
    });
  }

  _add(entry) {
    const fullEntry = {
      id: this._nextId++,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this.entries.push(fullEntry);
    this._save();
    return fullEntry;
  }

  // Query entries
  getRecent(limit = 20) {
    return this.entries.slice(-limit);
  }

  getByToken(token, limit = 10) {
    return this.entries.filter(e => e.token === token).slice(-limit);
  }

  getByType(type, limit = 20) {
    return this.entries.filter(e => e.type === type).slice(-limit);
  }

  getTrades(limit = 20) {
    return this.getByType('TRADE', limit);
  }

  getErrors(limit = 10) {
    return this.getByType('ERROR', limit);
  }

  // Stats
  getStats() {
    const trades = this.getByType('TRADE', 999);
    const approved = this.getByType('RISK_CHECK', 999).filter(e => e.approved);
    const rejected = this.getByType('RISK_CHECK', 999).filter(e => !e.approved);

    return {
      totalEntries: this.entries.length,
      totalTrades: trades.length,
      riskApproved: approved.length,
      riskRejected: rejected.length,
      buyTrades: trades.filter(t => t.data?.action === 'BUY').length,
      sellTrades: trades.filter(t => t.data?.action === 'SELL').length,
      errors: this.getByType('ERROR', 999).length,
    };
  }

  // Generate human-readable summary
  summary(limit = 10) {
    const recent = this.getRecent(limit);
    const lines = recent.map(e => {
      const ts = e.timestamp.replace('T', ' ').slice(0, 19);
      const tag = `[${e.type}]`.padEnd(12);
      const token = (e.token || '-').padEnd(8);
      const status = e.approved === true ? '✓' : e.approved === false ? '✗' : '·';
      return `${ts} ${tag} ${token} ${status} ${e.decision}`;
    });
    return lines.join('\n');
  }
}

module.exports = { ProofLedger };
