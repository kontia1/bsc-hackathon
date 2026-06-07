/**
 * CMC Data Module — CoinMarketCap API integration
 * Primary data source for regime detection, token universe, and market context
 * 
 * Free tier endpoints:
 * - v3/fear-and-greed/latest → regime detection
 * - v1/cryptocurrency/listings/latest → token universe
 * - v2/cryptocurrency/quotes/latest → specific token data
 * - v1/global-metrics/quotes/latest → BTC dominance, total MC
 * - v1/cryptocurrency/map → token IDs and metadata
 * - v2/cryptocurrency/info → token details (logo, urls, tags)
 */

const https = require('https');

class CMCClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'pro-api.coinmarketcap.com';
  }

  _request(path) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.baseUrl,
        path: path,
        method: 'GET',
        headers: {
          'X-CMC_PRO_API_KEY': this.apiKey,
          'Accept': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.status && String(json.status.error_code) !== '0') {
              reject(new Error(json.status.error_message));
            } else {
              resolve(json.data || json);
            }
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  // Fear & Greed Index (0-100)
  async getFearGreed() {
    const data = await this._request('/v3/fear-and-greed/latest');
    return {
      value: data.value,
      classification: data.value_classification,
      timestamp: data.update_time
    };
  }

  // Global Market Metrics
  async getGlobalMetrics() {
    const data = await this._request('/v1/global-metrics/quotes/latest');
    const usd = data.quote.USD;
    return {
      totalMarketCap: usd.total_market_cap,
      totalVolume24h: usd.total_volume_24h,
      btcDominance: data.btc_dominance,
      ethDominance: data.eth_dominance,
      totalCryptos: data.total_cryptocurrencies,
      defiVolume24h: usd.total_volume_24h_defi,
      stablecoinMarketCap: usd.total_market_cap_stablecoin,
      totalVolume24hReported: usd.total_volume_24h_reported,
      totalMarketCapAlt: usd.altcoin_market_cap,
      totalVolumeAlt: usd.altcoin_volume_24h
    };
  }

  // Top N tokens by market cap
  async getTopTokens(limit = 50) {
    const data = await this._request(`/v1/cryptocurrency/listings/latest?limit=${limit}&convert=USD`);
    return data.map(t => ({
      id: t.id,
      symbol: t.symbol,
      name: t.name,
      slug: t.slug,
      price: t.quote.USD.price,
      marketCap: t.quote.USD.market_cap,
      volume24h: t.quote.USD.volume_24h,
      cexVolume24h: t.quote.USD.cex_volume_24h,
      dexVolume24h: t.quote.USD.dex_volume_24h,
      volumeChange24h: t.quote.USD.volume_change_24h,
      percentChange1h: t.quote.USD.percent_change_1h,
      percentChange24h: t.quote.USD.percent_change_24h,
      percentChange7d: t.quote.USD.percent_change_7d,
      percentChange30d: t.quote.USD.percent_change_30d,
      percentChange60d: t.quote.USD.percent_change_60d,
      percentChange90d: t.quote.USD.percent_change_90d,
      marketCapDominance: t.quote.USD.market_cap_dominance,
      fullyDilutedMarketCap: t.quote.USD.fully_diluted_market_cap,
      cmcRank: t.cmc_rank,
      tags: t.tags,
      platform: t.platform,
      numMarketPairs: t.num_market_pairs,
      circulatingSupply: t.circulating_supply,
      totalSupply: t.total_supply,
      maxSupply: t.max_supply
    }));
  }

  // Get specific token quotes by symbol
  async getQuotes(symbols) {
    const slug = symbols.join(',');
    const data = await this._request(`/v2/cryptocurrency/quotes/latest?symbol=${slug}&convert=USD`);
    const result = {};
    for (const [id, tokens] of Object.entries(data)) {
      for (const t of tokens) {
        result[t.symbol] = {
          id: t.id,
          symbol: t.symbol,
          name: t.name,
          price: t.quote.USD.price,
          marketCap: t.quote.USD.market_cap,
          volume24h: t.quote.USD.volume_24h,
          percentChange1h: t.quote.USD.percent_change_1h,
          percentChange24h: t.quote.USD.percent_change_24h,
          percentChange7d: t.quote.USD.percent_change_7d,
          percentChange30d: t.quote.USD.percent_change_30d
        };
      }
    }
    return result;
  }

  // Token metadata (urls, description, tags, logo)
  async getTokenInfo(symbols) {
    const slug = symbols.join(',');
    const data = await this._request(`/v2/cryptocurrency/info?symbol=${slug}`);
    const result = {};
    for (const [id, tokens] of Object.entries(data)) {
      for (const t of tokens) {
        result[t.symbol] = {
          id: t.id,
          name: t.name,
          description: t.description,
          logo: t.logo,
          urls: t.urls,
          tags: t.tags,
          category: t.category
        };
      }
    }
    return result;
  }

  // Regime detection based on Fear & Greed + global metrics
  async getRegime() {
    const [fg, global] = await Promise.all([
      this.getFearGreed(),
      this.getGlobalMetrics()
    ]);
    
    const value = fg.value;
    let mode, bias, positionSize;
    
    if (value < 25) {
      mode = 'ACCUMULATE';
      bias = 'long-only, buy dips';
      positionSize = 0.40;
    } else if (value < 45) {
      mode = 'SWING_LONG';
      bias = 'long with tight stops';
      positionSize = 0.30;
    } else if (value < 55) {
      mode = 'MOMENTUM';
      bias = 'follow breakout direction';
      positionSize = 0.25;
    } else if (value < 75) {
      mode = 'REDUCE';
      bias = 'take profits, reduce exposure';
      positionSize = 0.15;
    } else {
      mode = 'DEFENSIVE';
      bias = 'rotate to stablecoins';
      positionSize = 0;
    }

    // BTC dominance adjustment
    let dominanceNote = '';
    if (global.btcDominance > 60) {
      dominanceNote = 'High BTC dominance — favor BTC over alts';
    } else if (global.btcDominance < 45) {
      dominanceNote = 'Low BTC dominance — alt season potential';
    }

    return {
      fearGreed: value,
      classification: fg.classification,
      mode,
      bias,
      positionSize,
      btcDominance: global.btcDominance,
      dominanceNote,
      totalMarketCap: global.totalMarketCap,
      timestamp: fg.timestamp
    };
  }

  // Filter eligible tokens for trading
  async getTradeableUniverse(minVolume = 1e6, minMarketCap = 1e7) {
    const tokens = await this.getTopTokens(200);
    
    // Stablecoins to exclude
    const stablecoins = new Set([
      'USDT', 'USDC', 'DAI', 'FDUSD', 'TUSD', 'USDD', 'FRAX', 'LUSD', 
      'GUSD', 'BUSD', 'USD1', 'USDe', 'USDf', 'USDF', 'XUSD', 'DUSD',
      'FRXUSD', 'lisUSD'
    ]);
    
    // Wrapped tokens to exclude
    const wrapped = new Set(['BTCB', 'HBTC', 'WBTC', 'WETH', 'STETH', 'WBNB']);
    
    return tokens
      .filter(t => !stablecoins.has(t.symbol) && !wrapped.has(t.symbol))
      .filter(t => t.volume24h > minVolume)
      .filter(t => t.marketCap > minMarketCap)
      .sort((a, b) => b.volumeChange24h - a.volumeChange24h);
  }

  // CMC-based momentum score (replaces Binance candle dependency for initial filter)
  scoreCMCMomentum(token) {
    let score = 0;
    const reasons = [];
    
    // Volume acceleration (biggest signal)
    if (token.volumeChange24h > 100) {
      score += 3;
      reasons.push(`Volume spike +${token.volumeChange24h.toFixed(0)}%`);
    } else if (token.volumeChange24h > 50) {
      score += 2;
      reasons.push(`Volume surge +${token.volumeChange24h.toFixed(0)}%`);
    } else if (token.volumeChange24h > 20) {
      score += 1;
      reasons.push(`Volume elevated +${token.volumeChange24h.toFixed(0)}%`);
    }
    
    // Price momentum reversal (buy the dip signal)
    if (token.percentChange7d < -20 && token.percentChange24h > 0) {
      score += 3;
      reasons.push(`7d dip ${token.percentChange7d.toFixed(1)}% + 24h reversal +${token.percentChange24h.toFixed(1)}%`);
    } else if (token.percentChange30d < -30 && token.percentChange7d > -5) {
      score += 2;
      reasons.push(`30d deep dip ${token.percentChange30d.toFixed(1)}%, stabilizing`);
    }
    
    // DEX vs CEX volume divergence (smart money signal)
    if (token.dexVolume24h && token.cexVolume24h) {
      const dexRatio = token.dexVolume24h / (token.dexVolume24h + token.cexVolume24h);
      if (dexRatio > 0.3) {
        score += 1;
        reasons.push(`High DEX ratio ${(dexRatio * 100).toFixed(0)}% (smart money)`);
      }
    }
    
    // Market cap to volume ratio (activity signal)
    const mcVolRatio = token.marketCap / (token.volume24h || 1);
    if (mcVolRatio < 5) {
      score += 1;
      reasons.push(`High activity (MC/Vol: ${mcVolRatio.toFixed(1)})`);
    }
    
    // 1h momentum (entry timing)
    if (token.percentChange1h > 3) {
      score += 0.5;
      reasons.push(`1h momentum +${token.percentChange1h.toFixed(1)}%`);
    }
    
    return { score: Math.min(score, 10), reasons };
  }
}

module.exports = { CMCClient };
