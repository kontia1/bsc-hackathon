#!/usr/bin/env python3
"""
ICT Fear & Greed Rotation — Backtest Framework
Track 2: Strategy Skills — BNB Hack: AI Trading Agent Edition

Backtests the regime-switching + ICT technical strategy using GeckoTerminal OHLCV data.
"""

import json
import math
import time
import requests
from datetime import datetime

# --- Config ---
STARTING_CAPITAL = 10.0
MAX_DRAWDOWN = 0.30
DAILY_LOSS_LIMIT = 0.10
POSITION_SIZES = {
    'ACCUMULATE': 0.40,
    'SWING_LONG': 0.30,
    'MOMENTUM': 0.25,
    'REDUCE': 0.15,
    'DEFENSIVE': 0.00,
}
STOP_LOSS_PCT = 0.08
TAKE_PROFIT_PCTS = [0.15, 0.25, 0.40]

# Fear & Greed thresholds (simulated from price action)
def estimate_fear_greed(closes, window=14):
    """Estimate F&G from price momentum (proxy for real F&G index)."""
    if len(closes) < window:
        return 50
    
    # 14-day return
    ret = (closes[-1] - closes[-window]) / closes[-window]
    
    # Volatility
    changes = [(closes[i] - closes[i-1]) / closes[i-1] for i in range(max(1, len(closes)-window), len(closes))]
    vol = math.sqrt(sum(c**2 for c in changes) / len(changes)) if changes else 0
    
    # Map to 0-100
    # Strong negative return + high vol = fear
    # Strong positive return + low vol = greed
    score = 50 + (ret * 200) - (vol * 500)
    return max(0, min(100, score))

def get_regime(fg_value):
    if fg_value < 25: return 'ACCUMULATE'
    if fg_value < 45: return 'SWING_LONG'
    if fg_value < 55: return 'MOMENTUM'
    if fg_value < 75: return 'REDUCE'
    return 'DEFENSIVE'

# --- ICT Analysis ---
def find_swing_points(data, lookback=2):
    highs, lows = [], []
    for i in range(lookback, len(data) - lookback):
        h = data[i]['high']
        l = data[i]['low']
        if all(h > data[i-j]['high'] and h > data[i+j]['high'] for j in range(1, lookback+1)):
            highs.append({'index': i, 'price': h})
        if all(l < data[i-j]['low'] and l < data[i+j]['low'] for j in range(1, lookback+1)):
            lows.append({'index': i, 'price': l})
    return highs, lows

def calc_rsi(closes, period=14):
    if len(closes) < period + 1:
        return 50
    changes = [closes[i] - closes[i-1] for i in range(1, len(closes))]
    gains = [c if c > 0 else 0 for c in changes[-period:]]
    losses = [-c if c < 0 else 0 for c in changes[-period:]]
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        return 100
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))

def check_entry(closes, highs, lows, rsi, volume_data, current_idx):
    """Check if current bar meets ICT entry criteria."""
    price = closes[current_idx]
    signals = []
    score = 0
    
    # Check OTE zone from recent swing
    if len(lows) >= 1 and len(highs) >= 1:
        last_low = lows[-1]
        next_high = None
        for h in highs:
            if h['index'] > last_low['index']:
                next_high = h
                break
        
        if next_high and next_high['index'] <= current_idx:
            swing_range = next_high['price'] - last_low['price']
            if swing_range > 0:
                ote62 = next_high['price'] - swing_range * 0.618
                ote79 = next_high['price'] - swing_range * 0.786
                if ote79 <= price <= ote62:
                    score += 3
                    signals.append('OTE zone')
    
    # Volume check
    if current_idx >= 30:
        avg_vol = sum(d['volume'] for d in volume_data[max(0,current_idx-30):current_idx]) / 30
        if avg_vol > 0 and volume_data[current_idx]['volume'] > avg_vol * 1.5:
            score += 1
            signals.append('Volume spike')
    
    # RSI
    if rsi < 30:
        score += 1
        signals.append('RSI oversold')
    elif rsi < 40:
        score += 0.5
        signals.append('RSI weak')
    
    return score, signals

# --- Backtest Engine ---
def backtest(token_data, symbol='TOKEN'):
    closes = [d['close'] for d in token_data]
    capital = STARTING_CAPITAL
    peak = capital
    position = None
    trades = []
    daily_pnl = {}
    equity_curve = []
    
    for i in range(30, len(token_data)):
        price = closes[i]
        date = datetime.fromtimestamp(token_data[i]['time'] / 1000).strftime('%Y-%m-%d')
        
        # Check existing position
        if position:
            entry_price = position['entry_price']
            pnl_pct = (price - entry_price) / entry_price
            
            # Stop loss
            if pnl_pct <= -STOP_LOSS_PCT:
                loss = position['size'] * pnl_pct
                capital += position['size'] + loss
                trades.append({
                    'type': 'SELL', 'reason': 'stop_loss', 'price': price,
                    'pnl': loss, 'pnl_pct': pnl_pct * 100, 'date': date
                })
                position = None
            
            # Take profit levels
            elif pnl_pct >= TAKE_PROFIT_PCTS[0]:
                # Take 30% at TP1
                tp_size = position['size'] * 0.30
                tp_pnl = tp_size * pnl_pct
                capital += tp_size + tp_pnl
                position['size'] -= tp_size
                position['tp1_hit'] = True
                trades.append({
                    'type': 'SELL', 'reason': 'tp1', 'price': price,
                    'pnl': tp_pnl, 'pnl_pct': pnl_pct * 100, 'date': date
                })
            
            elif pnl_pct >= TAKE_PROFIT_PCTS[1] and position.get('tp1_hit'):
                tp_size = position['size'] * 0.50
                tp_pnl = tp_size * pnl_pct
                capital += tp_size + tp_pnl
                position['size'] -= tp_size
                trades.append({
                    'type': 'SELL', 'reason': 'tp2', 'price': price,
                    'pnl': tp_pnl, 'pnl_pct': pnl_pct * 100, 'date': date
                })
        
        # Check entry signal
        if not position:
            fg = estimate_fear_greed(closes[:i+1])
            regime = get_regime(fg)
            pos_size_pct = POSITION_SIZES[regime]
            
            if pos_size_pct > 0:
                sw_h, sw_l = find_swing_points(token_data[:i+1])
                rsi = calc_rsi(closes[:i+1])
                score, signals = check_entry(closes, sw_h, sw_l, rsi, token_data[:i+1], i)
                
                if score >= 4:  # Min score to enter
                    trade_size = capital * pos_size_pct
                    if trade_size > 0.5:  # Min trade size
                        position = {
                            'entry_price': price,
                            'size': trade_size,
                            'entry_date': date,
                            'signals': signals,
                            'regime': regime,
                            'tp1_hit': False
                        }
                        capital -= trade_size
                        trades.append({
                            'type': 'BUY', 'price': price, 'size': trade_size,
                            'signals': signals, 'regime': regime, 'date': date
                        })
        
        # Track equity
        total_value = capital + (position['size'] * (price / position['entry_price']) if position else 0)
        equity_curve.append({'date': date, 'value': total_value})
        peak = max(peak, total_value)
        
        # Drawdown check
        dd = (peak - total_value) / peak
        if dd >= MAX_DRAWDOWN:
            if position:
                loss = position['size'] * ((price - position['entry_price']) / position['entry_price'])
                capital += position['size'] + loss
                trades.append({
                    'type': 'SELL', 'reason': 'max_drawdown', 'price': price,
                    'pnl': loss, 'date': date
                })
                position = None
    
    # Close final position
    if position:
        final_price = closes[-1]
        pnl_pct = (final_price - position['entry_price']) / position['entry_price']
        pnl = position['size'] * pnl_pct
        capital += position['size'] + pnl
        trades.append({
            'type': 'SELL', 'reason': 'end', 'price': final_price,
            'pnl': pnl, 'pnl_pct': pnl_pct * 100
        })
    
    # Calculate metrics
    total_return = (capital - STARTING_CAPITAL) / STARTING_CAPITAL * 100
    wins = [t for t in trades if t['type'] == 'SELL' and t.get('pnl', 0) > 0]
    losses = [t for t in trades if t['type'] == 'SELL' and t.get('pnl', 0) <= 0]
    win_rate = len(wins) / max(1, len(wins) + len(losses)) * 100
    
    max_dd = 0
    peak_eq = 0
    for eq in equity_curve:
        peak_eq = max(peak_eq, eq['value'])
        dd = (peak_eq - eq['value']) / peak_eq * 100
        max_dd = max(max_dd, dd)
    
    # Sharpe ratio (daily returns)
    if len(equity_curve) > 1:
        daily_returns = [(equity_curve[i]['value'] - equity_curve[i-1]['value']) / equity_curve[i-1]['value'] 
                        for i in range(1, len(equity_curve)) if equity_curve[i-1]['value'] > 0]
        if daily_returns:
            avg_ret = sum(daily_returns) / len(daily_returns)
            std_ret = math.sqrt(sum((r - avg_ret)**2 for r in daily_returns) / len(daily_returns))
            sharpe = (avg_ret / std_ret * math.sqrt(365)) if std_ret > 0 else 0
        else:
            sharpe = 0
    else:
        sharpe = 0
    
    return {
        'symbol': symbol,
        'starting_capital': STARTING_CAPITAL,
        'final_capital': round(capital, 4),
        'total_return_pct': round(total_return, 2),
        'total_trades': len([t for t in trades if t['type'] == 'BUY']),
        'wins': len(wins),
        'losses': len(losses),
        'win_rate_pct': round(win_rate, 1),
        'max_drawdown_pct': round(max_dd, 2),
        'sharpe_ratio': round(sharpe, 2),
        'trades': trades,
        'equity_curve': equity_curve[-10:],  # Last 10 points
    }

# --- Data Source (Binance API, free) ---
def fetch_binance_klines(symbol, interval='1d', limit=100):
    pair = f'{symbol.upper()}USDT'
    url = f'https://api.binance.com/api/v3/klines?symbol={pair}&interval={interval}&limit={limit}'
    resp = requests.get(url, timeout=15)
    data = resp.json()
    if isinstance(data, dict) and 'code' in data:
        raise ValueError(f'Binance error: {data.get("msg", data)}')
    return [{
        'time': k[0],
        'open': float(k[1]), 'high': float(k[2]),
        'low': float(k[3]), 'close': float(k[4]),
        'volume': float(k[5])
    } for k in data]

if __name__ == '__main__':
    # Tokens on Binance that are also hackathon-eligible
    tokens = ['CAKE', 'FET', 'LINK', 'ADA', 'AVAX', 'DOT', 'UNI', 'AAVE', 'DOGE', 'SHIB']
    
    results = []
    for symbol in tokens:
        print(f'Fetching {symbol}...')
        try:
            data = fetch_binance_klines(symbol, '1d', 100)
            print(f'  Got {len(data)} candles')
            result = backtest(data, symbol)
            results.append(result)
            print(f'  Return: {result["total_return_pct"]}% | Trades: {result["total_trades"]} | Win: {result["win_rate_pct"]}% | MaxDD: {result["max_drawdown_pct"]}% | Sharpe: {result["sharpe_ratio"]}')
        except Exception as e:
            print(f'  Error: {e}')
        time.sleep(0.5)
    
    # Save results
    with open('/root/projects/bsc-hackathon/data/backtest-results.json', 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f'\nSaved {len(results)} results to data/backtest-results.json')
