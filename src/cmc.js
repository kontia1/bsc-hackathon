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

  // Hackathon eligible tokens (149 BEP-20 on BSC, from hackathon rules)
  getEligibleSymbols() {
    return [
      'ETH','USDT','USDC','XRP','TRX','DOGE','ZEC','ADA','LINK','BCH','DAI','TON',
      'USD1','USDe','M','LTC','AVAX','SHIB','XAUt','WLFI','H','DOT','UNI','ASTER',
      'DEXE','USDD','ETC','AAVE','ATOM','U','STABLE','FIL','INJ','NIGHT','FET',
      'TUSD','BONK','PENGU','CAKE','SIREN','LUNC','ZRO','KITE','FDUSD','BEAT',
      'PIEVERSE','BTT','NFT','EDGE','FLOKI','LDO','B','FF','PENDLE','NEX','STG',
      'AXS','TWT','HOME','RAY','COMP','GWEI','XCN','GENIUS','XPL','BAT','SKYAI',
      'APE','IP','SFP','TAG','NXPC','AB','SAHARA','1INCH','CHEEMS','BANANAS31',
      'RIVER','MYX','RAVE','SNX','FORM','LAB','HTX','USDf','CTM','BDX','SLX',
      'UB','DUCKY','FRAX','BILL','WFI','KOGE','ALE','FRXUSD','USDF','GOMINING',
      'VCNT','GUA','DUSD','SMILEK','0G','BEAM','MY','SOON','REAL','Q','AIOZ',
      'ZIG','YFI','TAC','CYS','ZAMA','TRIA','HUMA','PLUME','ZIL','XPR','ZETA',
      'NILA','ROSE','VELO','UAI','BRETT','OPEN','BSB','TOSHI','BAS','ACH','AXL',
      'LUR','ELF','KAVA','APR','IRYS','EURI','XUSD','BARD','DUSK','SUSHI',
      'PEAQ','COAI','BDCA','XAUM'
    ];
  }

  // Filter eligible tokens for trading (hackathon universe only)
  async getTradeableUniverse(minVolume = 1e6, minMarketCap = 1e7) {
    const tokens = await this.getTopTokens(200);
    const eligible = new Set(this.getEligibleSymbols());
    
    // Stablecoins to exclude from trading (but keep in universe for reference)
    const stablecoins = new Set([
      'USDT', 'USDC', 'DAI', 'FDUSD', 'TUSD', 'USDD', 'FRAX', 'USD1', 'USDe',
      'USDf', 'USDF', 'FRXUSD', 'DUSD', 'XUSD', 'EURI', 'FDUSD', 'lisUSD'
    ]);
    
    return tokens
      .filter(t => eligible.has(t.symbol))
      .filter(t => !stablecoins.has(t.symbol))
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

  // Trending tokens (requires Hobbyist+ plan)
  async getTrending() {
    try {
      const data = await this._request('/v1/cryptocurrency/trending/latest?limit=20&convert=USD');
      const coins = data.data || [];
      return coins.map(c => ({
        id: c.id,
        name: c.name,
        symbol: c.symbol,
        rank: c.cmc_rank,
        price: c.quote?.USD?.price || 0,
        percentChange24h: c.quote?.USD?.percent_change_24h || 0,
        volume24h: c.quote?.USD?.volume_24h || 0,
        marketCap: c.quote?.USD?.market_cap || 0,
        numMarketPairs: c.num_market_pairs || 0,
        trendScore: c.trend_score || 0,
      }));
    } catch (e) {
      // Free tier: fall back to top movers from listings
      console.warn('[CMC] Trending unavailable (free tier), using top movers fallback');
      try {
        const tokens = await this.getTopTokens(20);
        return tokens.sort((a, b) => Math.abs(b.percentChange24h) - Math.abs(a.percentChange24h)).slice(0, 10);
      } catch (e2) {
        return [];
      }
    }
  }

  // Top gainers and losers (24h) — requires Hobbyist+ plan
  async getGainersLosers(limit = 10) {
    try {
      const data = await this._request(`/v1/cryptocurrency/trending/gainers-losers?limit=${limit}&convert=USD&sort=percent_change_24h&sort_dir=desc`);
      const gainers = (data.data?.gainers || []).map(c => this._formatToken(c));
      const losers = (data.data?.losers || []).map(c => this._formatToken(c));
      return { gainers, losers };
    } catch (e) {
      // Free tier: derive from listings
      console.warn('[CMC] Gainers/Losers unavailable, deriving from listings');
      try {
        const tokens = await this.getTopTokens(100);
        const sorted = tokens.sort((a, b) => b.percentChange24h - a.percentChange24h);
        return {
          gainers: sorted.slice(0, limit),
          losers: sorted.slice(-limit).reverse(),
        };
      } catch (e2) {
        return { gainers: [], losers: [] };
      }
    }
  }

  // Token social/community stats
  async getTokenSocialStats(symbols) {
    try {
      const ids = Array.isArray(symbols) ? symbols.join(',') : symbols;
      const data = await this._request(`/v2/cryptocurrency/info?aux=urls,description,tags,date_added&slug=${ids}`);
      const results = {};
      for (const [id, token] of Object.entries(data.data || {})) {
        results[token.symbol] = {
          name: token.name,
          symbol: token.symbol,
          description: token.description || '',
          dateAdded: token.date_added,
          urls: token.urls || {},
          tags: token.tags || [],
          hasWebsite: !!(token.urls?.website?.length),
          hasTwitter: !!(token.urls?.twitter?.length),
          hasTelegram: !!(token.urls?.technical_doc?.length),
          category: token.category || '',
        };
      }
      return results;
    } catch (e) {
      console.warn('[CMC] Social stats error:', e.message);
      return {};
    }
  }

  // Market sentiment composite (combines multiple signals)
  async getMarketSentiment() {
    try {
      const [fg, global, trending] = await Promise.all([
        this.getFearGreed(),
        this.getGlobalMetrics(),
        this.getTrending(),
      ]);

      const btcDom = global.btcDominance || 50;
      const stableMC = global.stablecoinMarketCap || 0;
      const totalMC = global.totalMarketCap || 1;

      // Stablecoin dominance (high = fear, waiting on sidelines)
      const stableRatio = stableMC / totalMC;
      const stableSignal = stableRatio > 0.12 ? 'HIGH_SIDELINE' : stableRatio > 0.08 ? 'MODERATE' : 'LOW_SIDELINE';

      // Trending concentration (top 3 = high = crowded)
      const top3Vol = trending.slice(0, 3).reduce((sum, t) => sum + (t.volume24h || 0), 0);
      const totalVol = trending.reduce((sum, t) => sum + (t.volume24h || 0), 0);
      const concentration = totalVol > 0 ? top3Vol / totalVol : 0;

      return {
        fearGreed: fg.value,
        fearGreedClass: fg.classification,
        btcDominance: btcDom,
        stablecoinRatio: (stableRatio * 100).toFixed(2) + '%',
        stableSignal,
        trendingCount: trending.length,
        trendingConcentration: (concentration * 100).toFixed(0) + '%',
        topTrending: trending.slice(0, 5).map(t => t.symbol),
        overallBias: fg.value < 35 ? 'ACCUMULATE' : fg.value > 65 ? 'DEFENSIVE' : 'NEUTRAL',
      };
    } catch (e) {
      console.warn('[CMC] Sentiment error:', e.message);
      return { fearGreed: 0, overallBias: 'UNKNOWN' };
    }
  }

  // Format token helper
  _formatToken(c) {
    return {
      id: c.id,
      name: c.name,
      symbol: c.symbol,
      rank: c.cmc_rank,
      price: c.quote?.USD?.price || 0,
      percentChange1h: c.quote?.USD?.percent_change_1h || 0,
      percentChange24h: c.quote?.USD?.percent_change_24h || 0,
      percentChange7d: c.quote?.USD?.percent_change_7d || 0,
      percentChange30d: c.quote?.USD?.percent_change_30d || 0,
      volume24h: c.quote?.USD?.volume_24h || 0,
      volumeChange24h: c.quote?.USD?.volume_change_24h || 0,
      marketCap: c.quote?.USD?.market_cap || 0,
      fdv: c.quote?.USD?.fully_diluted_market_cap || 0,
    };
  }
}

module.exports = { CMCClient };
