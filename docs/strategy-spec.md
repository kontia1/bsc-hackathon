# ICT Fear & Greed Rotation — Strategy Spec

**Track 2: Strategy Skills** — BNB Hack: AI Trading Agent Edition

## 1. Strategy Overview

**Name**: ICT Fear & Greed Rotation  
**Type**: Regime-switching momentum + mean-reversion hybrid  
**Universe**: 149 eligible BEP-20 tokens on BSC (CoinMarketCap listed)  
**Timeframe**: 1-hour to daily rebalancing  
**Capital**: $10 starting, scales with returns  

## 2. Regime Detection (CoinMarketCap Data)

### Inputs
| Signal | Source | Frequency |
|--------|--------|-----------|
| Fear & Greed Index | CMC v3/fear-and-greed/latest | Hourly |
| BTC Dominance | CMC v1/global-metrics | Daily |
| Volume Anomaly | CMC v1/listings (volume_change_24h) | Hourly |
| Token Momentum | CMC v1/quotes (percent_change_1h/24h/7d) | Per-trade |

### Regime Rules
```
IF Fear & Greed < 25 (Extreme Fear):
    MODE = ACCUMULATE
    Bias = Long-only, buy dips
    Position size = 40% of capital per trade
    
IF Fear & Greed 25-45 (Fear):
    MODE = SWING_LONG
    Bias = Long with tight stops
    Position size = 30% of capital per trade
    
IF Fear & Greed 45-55 (Neutral):
    MODE = MOMENTUM
    Bias = Follow breakout direction
    Position size = 25% of capital per trade
    
IF Fear & Greed 55-75 (Greed):
    MODE = REDUCE
    Bias = Take profits, reduce exposure
    Position size = 15% of capital per trade
    
IF Fear & Greed > 75 (Extreme Greed):
    MODE = DEFENSIVE
    Bias = Rotate to stablecoins, wait
    Position size = 0% (hold cash)
```

## 3. ICT Technical Entry Criteria

### Must-have (all 3 required)
1. **Market Structure**: Clear swing high/low pattern (HH/HL for long, LH/LL for short)
2. **OTE Zone**: Price in 62%-79% Fibonacci retracement of impulse leg
3. **Volume Confirmation**: Volume > 1.5x 30-day average on entry signal

### Bonus confluence (2+ preferred)
- Order Block (OB) at entry zone
- Fair Value Gap (FVG) being filled
- Liquidity sweep of swing low/high + reversal
- Elliott Wave 2 or 4 retracement in OTE zone
- RSI < 30 (oversold) for longs, RSI > 70 (overbought) for shorts

### Entry Trigger
```
LONG ENTRY:
  Price enters OTE zone (62-79% retrace)
  AND volume > 1.5x avg
  AND (OB present OR FVG fill OR liquidity sweep)
  AND regime != DEFENSIVE
  
  Entry = current price
  SL = below OTE zone (79% retrace level)
  TP1 = 0.5x impulse leg (50% retrace of move)
  TP2 = impulse high (full retrace)
  TP3 = 1.272x extension of impulse
```

## 4. Risk Management

### Position Sizing
- Max 2 concurrent positions (capital constraint)
- Per-trade risk: max 30% of capital
- Regime-adjusted: smaller in greed, larger in fear

### Stop Loss
- Fixed: -8% from entry (hard stop)
- Dynamic: below OTE zone or Order Block
- Whichever is tighter

### Drawdown Protection
- Max portfolio drawdown: 25% (competition cap is 30%, we use 25% for safety)
- Daily loss limit: -10%
- If drawdown > 15%: reduce position size by 50%
- If drawdown > 20%: pause trading for 24h

### Take Profit
- TP1 at 1:1.5 R:R → take 30% of position
- TP2 at 1:2.5 R:R → take 40% of position
- TP3 at 1:4 R:R → take remaining 30%
- Trailing stop after TP1: move SL to breakeven

## 5. Token Selection (Pre-filter)

### Universe Filter
```
FROM 149 eligible tokens:
  1. Remove stablecoins (USDT, USDC, DAI, FDUSD, etc.)
  2. Remove wrapped tokens (BTCB, ETH, etc.)
  3. Keep tokens with 24h volume > $1M
  4. Keep tokens with market cap > $10M
  5. Sort by: volume_change_24h DESC (momentum)
```

### ICT Scan (top 20 from filter)
For each token, run:
1. Fetch 120-day daily candles from Binance
2. Detect swing highs/lows
3. Identify current market structure
4. Calculate OTE zones
5. Check Order Blocks and FVGs
6. Score by confluence (0-10)

### Entry Ranking
```
Score = 0
+3 if price in OTE zone
+2 if OB at entry
+2 if FVG being filled
+2 if liquidity sweep confirmed
+1 if volume > 2x avg
+1 if Elliott Wave 2/4 count
+1 if RSI < 30 (for long)
+1 if Fear & Greed < 25

Min score to trade: 5
```

## 6. Execution Schedule

### Hourly
- Check Fear & Greed Index
- Update regime mode
- Scan for exit signals (SL/TP hit)

### Daily (after 00:00 UTC)
- Full ICT analysis on top 20 tokens
- Rebalance if regime changed
- Update Elliott Wave counts

### Per-Trade
- Validate all 3 entry criteria
- Calculate position size based on regime
- Execute via TWAK (self-custody signing)
- Log trade with rationale

## 7. Backtest Framework

### Data
- Binance daily candles (120 days)
- CMC Fear & Greed historical
- Simulated BSC gas costs ($0.03/tx)

### Metrics
- Total Return %
- Sharpe Ratio
- Max Drawdown %
- Win Rate %
- Average R:R achieved
- Number of trades
- Profit Factor

### Expected Performance
Based on ICT methodology applied to crypto:
- Win rate: 55-65% (OTE zone + volume confirmation)
- Average R:R: 1:2.5 (asymmetric stops)
- Max drawdown: 15-25% (regime-aware sizing)
- Trades per week: 5-10

## 8. Why This Works

### Edge 1: Regime Awareness
Most traders use one strategy in all markets. This rotates between accumulation (fear) and profit-taking (greed), aligning with market psychology.

### Edge 2: ICT Precision
Entry at OTE zones (62-79% retrace) provides statistically better risk/reward than random entries. Volume confirmation filters false signals.

### Edge 3: BSC Advantages
- Fast execution (3s blocks)
- Low gas ($0.01-0.05/tx)
- 149 diverse tokens (L1s, DeFi, memes, AI)
- Less efficient = more alpha for systematic strategies

### Edge 4: Data-Driven
CMC provides institutional-grade data (CEX + DEX volume, derivatives, social sentiment). Combined with ICT technicals, this creates multi-dimensional signal quality.
