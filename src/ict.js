/**
 * ICT Analysis Module
 * Market structure, OTE zones, Order Blocks, FVG, Elliott Wave, Volume analysis
 * 
 * Data sources:
 * - GeckoTerminal (BSC tokens, free, no key) — OHLCV candles
 * - Binance API (listed tokens, free) — OHLCV candles (backup)
 */

const https = require('https');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse: ${data.substring(0, 100)}`)); }
      });
    }).on('error', reject);
  });
}

// Fetch Binance klines
function fetchBinanceKlines(symbol, interval = '1d', limit = 120) {
  return new Promise((resolve, reject) => {
    const pair = symbol.toUpperCase().endsWith('USDT') ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
    const path = `/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`;
    https.get({ hostname: 'api.binance.com', path }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const raw = JSON.parse(data);
          if (raw.code) return reject(new Error(raw.msg));
          resolve(raw.map(k => ({
            time: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]),
            low: parseFloat(k[3]), close: parseFloat(k[4]),
            volume: parseFloat(k[5]), closeTime: k[6]
          })));
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// Fetch OHLCV from GeckoTerminal (BSC tokens, free)
async function fetchGeckoOHLCV(contractAddress, days = 100) {
  const url = `https://api.geckoterminal.com/api/v2/networks/bsc/tokens/${contractAddress}/ohlcv/day?aggregate=1&limit=${days}&currency=usd`;
  const data = await httpGet(url);
  const ohlcv = data?.data?.attributes?.ohlcv_list;
  if (!ohlcv || ohlcv.length === 0) throw new Error('No OHLCV data');
  return ohlcv.map(c => ({
    time: c[0] * 1000, open: c[1], high: c[2],
    low: c[3], close: c[4], volume: c[5],
    closeTime: (c[0] + 86400) * 1000
  })).reverse();
}

// Smart fetch: Binance first, GeckoTerminal fallback
async function fetchCandles(symbolOrContract) {
  if (symbolOrContract.startsWith('0x')) {
    return { source: 'geckoterminal', data: await fetchGeckoOHLCV(symbolOrContract) };
  }
  try {
    return { source: 'binance', data: await fetchBinanceKlines(symbolOrContract, '1d', 120) };
  } catch (e) {
    throw new Error(`${symbolOrContract} not on Binance. Use contract address.`);
  }
}

// RSI 14
function calcRSI(closes, period = 14) {
  const changes = [];
  for (let i = 1; i < closes.length; i++) changes.push(closes[i] - closes[i - 1]);
  const gains = changes.map(c => c > 0 ? c : 0);
  const losses = changes.map(c => c < 0 ? -c : 0);
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }
  const rs = avgLoss > 0 ? avgGain / avgLoss : 100;
  return 100 - (100 / (1 + rs));
}

// Swing points (2-bar confirmation)
function findSwingPoints(data) {
  const swings = { highs: [], lows: [] };
  for (let i = 2; i < data.length - 2; i++) {
    const h = data[i].high, l = data[i].low;
    if (h > data[i-1].high && h > data[i-2].high && h > data[i+1].high && h > data[i+2].high)
      swings.highs.push({ index: i, price: h, time: data[i].time });
    if (l < data[i-1].low && l < data[i-2].low && l < data[i+1].low && l < data[i+2].low)
      swings.lows.push({ index: i, price: l, time: data[i].time });
  }
  return swings;
}

// Market structure
function analyzeStructure(swings) {
  const { highs, lows } = swings;
  let trend = 'neutral', bos = false, choch = false;
  if (highs.length >= 2 && lows.length >= 2) {
    const lh = highs[highs.length - 1], ph = highs[highs.length - 2];
    const ll = lows[lows.length - 1], pl = lows[lows.length - 2];
    if (lh.price > ph.price && ll.price > pl.price) trend = 'bullish';
    else if (lh.price < ph.price && ll.price < pl.price) trend = 'bearish';
    if (lh.price > ph.price) bos = 'bullish';
    if (ll.price < pl.price) bos = 'bearish';
    if (trend === 'bullish' && ll.price < pl.price) choch = 'bearish';
    if (trend === 'bearish' && lh.price > ph.price) choch = 'bullish';
  }
  return { trend, bos, choch };
}

// OTE zones (Fibonacci 62-79%)
function findOTEZone(swings, data) {
  const { highs, lows } = swings;
  const zones = [];
  for (let i = 1; i < lows.length; i++) {
    const nextHigh = highs.find(h => h.index > lows[i].index);
    if (!nextHigh) continue;
    const range = nextHigh.price - lows[i].price;
    zones.push({ type: 'bullish', swingLow: lows[i].price, swingHigh: nextHigh.price,
      ote62: nextHigh.price - range * 0.618, ote79: nextHigh.price - range * 0.786, range });
  }
  for (let i = 1; i < highs.length; i++) {
    const nextLow = lows.find(l => l.index > highs[i].index);
    if (!nextLow) continue;
    const range = highs[i].price - nextLow.price;
    zones.push({ type: 'bearish', swingHigh: highs[i].price, swingLow: nextLow.price,
      ote62: nextLow.price + range * 0.618, ote79: nextLow.price + range * 0.786, range });
  }
  return zones;
}

// Order Blocks
function findOrderBlocks(data) {
  const obs = [];
  for (let i = 1; i < data.length - 1; i++) {
    const curr = data[i], next = data[i + 1];
    const move = Math.abs(next.close - next.open) / (Math.abs(curr.close - curr.open) || 0.0001);
    if (curr.close < curr.open && next.close > next.open && move > 1.0)
      obs.push({ type: 'bullish', high: curr.high, low: curr.low, index: i, strength: move });
    if (curr.close > curr.open && next.close < next.open && move > 1.0)
      obs.push({ type: 'bearish', high: curr.high, low: curr.low, index: i, strength: move });
  }
  return obs;
}

// Fair Value Gaps
function findFVG(data) {
  const fvgs = [];
  for (let i = 2; i < data.length; i++) {
    if (data[i].low > data[i-2].high)
      fvgs.push({ type: 'bullish', top: data[i].low, bottom: data[i-2].high, index: i, filled: false });
    if (data[i].high < data[i-2].low)
      fvgs.push({ type: 'bearish', top: data[i-2].low, bottom: data[i].high, index: i, filled: false });
  }
  for (const fvg of fvgs) {
    for (let i = fvg.index + 1; i < data.length; i++) {
      if (fvg.type === 'bullish' && data[i].low <= fvg.bottom) { fvg.filled = true; break; }
      if (fvg.type === 'bearish' && data[i].high >= fvg.top) { fvg.filled = true; break; }
    }
  }
  return fvgs;
}

// Liquidity sweeps
function findLiquiditySweeps(data, swings) {
  const sweeps = [];
  for (let i = 0; i < data.length; i++) {
    for (const low of swings.lows) {
      if (i > low.index && i < low.index + 5 && data[i].low < low.price && data[i].close > low.price)
        sweeps.push({ type: 'bullish', level: low.price, index: i });
    }
    for (const high of swings.highs) {
      if (i > high.index && i < high.index + 5 && data[i].high > high.price && data[i].close < high.price)
        sweeps.push({ type: 'bearish', level: high.price, index: i });
    }
  }
  return sweeps;
}

// Volume analysis
function analyzeVolume(data) {
  const vols = data.map(d => d.volume);
  const avg3 = vols.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const avg7 = vols.slice(-7).reduce((a, b) => a + b, 0) / 7;
  const avg30 = vols.slice(-30).reduce((a, b) => a + b, 0) / 30;
  const latest = vols[vols.length - 1];
  const ratio = latest / (avg30 || 1);
  const last = data[data.length - 1];
  return { latest, avg3, avg7, avg30, ratio,
    isCapitulation: ratio > 2 && (last.close - last.open) / last.open < -0.03,
    signal: ratio > 2 ? 'high' : ratio > 1.5 ? 'above_avg' : ratio < 0.5 ? 'low' : 'normal' };
}

// Entry scoring
function scoreEntry(price, structure, oteZones, obs, fvgs, sweeps, volume, rsi) {
  let score = 0;
  const reasons = [];
  
  const inOTE = oteZones.find(z =>
    z.type === 'bullish' ? (price >= z.ote79 && price <= z.ote62) : (price <= z.ote79 && price >= z.ote62)
  );
  if (inOTE) { score += 3; reasons.push(`In ${inOTE.type} OTE`); }
  
  const nearOB = obs.find(ob => price >= ob.low && price <= ob.high);
  if (nearOB) { score += 2; reasons.push(`At ${nearOB.type} OB`); }
  
  const activeFVG = fvgs.find(f => !f.filled && price >= f.bottom && price <= f.top);
  if (activeFVG) { score += 2; reasons.push(`${activeFVG.type} FVG fill`); }
  
  if (sweeps.length > 0) { score += 2; reasons.push(`${sweeps[0].type} sweep`); }
  if (volume.ratio > 1.5) { score += 1; reasons.push(`Vol ${volume.ratio.toFixed(1)}x`); }
  if (rsi < 30) { score += 1; reasons.push(`RSI ${rsi.toFixed(0)} oversold`); }
  else if (rsi < 40) { score += 0.5; reasons.push(`RSI ${rsi.toFixed(0)}`); }
  if (structure.trend === 'bullish' && inOTE?.type === 'bullish') { score += 1; reasons.push('Aligned'); }
  
  return { score: Math.min(score, 10), reasons };
}

// Full ICT analysis
async function analyzeICT(symbolOrContract) {
  const { source, data } = await fetchCandles(symbolOrContract);
  if (data.length < 30) throw new Error(`Insufficient data: ${data.length} candles`);
  
  const closes = data.map(d => d.close);
  const price = closes[closes.length - 1];
  const rsi = calcRSI(closes);
  const swings = findSwingPoints(data);
  const structure = analyzeStructure(swings);
  const oteZones = findOTEZone(swings, data);
  const obs = findOrderBlocks(data);
  const fvgs = findFVG(data);
  const sweeps = findLiquiditySweeps(data, swings);
  const volume = analyzeVolume(data);
  const entry = scoreEntry(price, structure, oteZones, obs, fvgs, sweeps, volume, rsi);
  
  const high30 = Math.max(...data.slice(-30).map(d => d.high));
  const low30 = Math.min(...data.slice(-30).map(d => d.low));
  
  return {
    symbol: symbolOrContract, source, currentPrice: price, rsi, structure, entry,
    volume: { latest: volume.latest, ratio: volume.ratio, signal: volume.signal },
    levels: {
      support: swings.lows.slice(-3).map(l => l.price),
      resistance: swings.highs.slice(-3).map(h => h.price),
      high30, low30,
      dropFromHigh: ((price - high30) / high30 * 100).toFixed(1) + '%'
    },
    oteZones: oteZones.slice(-3),
    orderBlocks: obs.slice(-3),
    fvg: fvgs.filter(f => !f.filled).slice(-3),
    sweeps: sweeps.slice(-3)
  };
}

// Batch scan
async function scanTokens(symbols) {
  const results = [];
  for (const sym of symbols) {
    try {
      results.push(await analyzeICT(sym));
      await new Promise(r => setTimeout(r, 300)); // rate limit GeckoTerminal
    } catch (e) { results.push({ symbol: sym, error: e.message }); }
  }
  return results.sort((a, b) => (b.entry?.score || 0) - (a.entry?.score || 0));
}

module.exports = {
  fetchCandles, fetchBinanceKlines, fetchGeckoOHLCV,
  calcRSI, findSwingPoints, analyzeStructure,
  findOTEZone, findOrderBlocks, findFVG, findLiquiditySweeps,
  analyzeVolume, scoreEntry, analyzeICT, scanTokens
};
