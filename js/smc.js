/* =========================================================
   smc.js — Smart Money Concepts, Support/Resistance, Volume Profile
   ========================================================= */
const SMC = {

  /* ---- Liquidity & Liquidation Heatmap ----
     ऑर्डर-बुक liquidity + सामान्य leverage के liquidation स्तरों को मिलाकर
     एक intensity map बनाता है (फ्री डाटा आधारित अनुमान) */
  heatmap(depth, price, ls, bins = 21){
    const range = price * 0.03;            // ±3% बैंड
    const lo = price - range, hi = price + range;
    const step = (hi - lo) / bins;
    const cells = Array.from({ length: bins }, (_, i) => {
      const low = lo + i * step;
      return { low, high: low + step, mid: low + step / 2, book: 0, liq: 0, side: '' };
    });
    const idxOf = (p) => {
      let i = Math.floor((p - lo) / step);
      return (i < 0 || i >= bins) ? -1 : i;
    };

    // 1) ऑर्डर-बुक liquidity
    if(depth){
      for(const b of depth.bids){ const i = idxOf(b.price); if(i >= 0) cells[i].book += b.qty; }
      for(const a of depth.asks){ const i = idxOf(a.price); if(i >= 0) cells[i].book += a.qty; }
    }

    // 2) leverage liquidation clusters
    // long positions current price के नीचे liquidate होती हैं, short ऊपर
    const longBias = ls && ls.topLong != null ? ls.topLong / 100 : 0.5;
    const shortBias = 1 - longBias;
    const levs = [10, 25, 50, 100];
    const weight = { 10: 0.6, 25: 1, 50: 1.4, 100: 1.8 };
    for(const L of levs){
      const longLiq = price * (1 - 1 / L);   // नीचे
      const shortLiq = price * (1 + 1 / L);  // ऊपर
      let i = idxOf(longLiq);  if(i >= 0){ cells[i].liq += weight[L] * longBias * 100; cells[i].side = 'long'; }
      let j = idxOf(shortLiq); if(j >= 0){ cells[j].liq += weight[L] * shortBias * 100; cells[j].side = 'short'; }
    }

    const maxBook = Math.max(...cells.map(c => c.book), 1);
    const maxLiq = Math.max(...cells.map(c => c.liq), 1);
    return { cells: cells.reverse(), maxBook, maxLiq, price };
  },

  /* ---- दी गई utility: pivots, structure आदि नीचे ---- */
  pivots(candles, lb = 2){
    const highs = [], lows = [];
    for(let i = lb; i < candles.length - lb; i++){
      let isHigh = true, isLow = true;
      for(let j = 1; j <= lb; j++){
        if(candles[i].h <= candles[i - j].h || candles[i].h <= candles[i + j].h) isHigh = false;
        if(candles[i].l >= candles[i - j].l || candles[i].l >= candles[i + j].l) isLow = false;
      }
      if(isHigh) highs.push({ i, price: candles[i].h });
      if(isLow)  lows.push({ i, price: candles[i].l });
    }
    return { highs, lows };
  },

  /* ---- Market Structure: BOS / CHoCH ---- */
  structure(candles){
    const { highs, lows } = this.pivots(candles, 2);
    const lastHighs = highs.slice(-3).map(h => h.price);
    const lastLows = lows.slice(-3).map(l => l.price);
    let trend = 'Range', event = 'कोई स्पष्ट ब्रेक नहीं';

    const hh = lastHighs.length >= 2 && lastHighs[lastHighs.length - 1] > lastHighs[lastHighs.length - 2];
    const hl = lastLows.length >= 2 && lastLows[lastLows.length - 1] > lastLows[lastLows.length - 2];
    const lh = lastHighs.length >= 2 && lastHighs[lastHighs.length - 1] < lastHighs[lastHighs.length - 2];
    const ll = lastLows.length >= 2 && lastLows[lastLows.length - 1] < lastLows[lastLows.length - 2];

    if(hh && hl){ trend = 'Bullish (HH-HL)'; event = 'BOS ↑ — तेज़ी का ढांचा बरकरार'; }
    else if(lh && ll){ trend = 'Bearish (LH-LL)'; event = 'BOS ↓ — मंदी का ढांचा बरकरार'; }
    else if(hh && ll){ trend = 'Transition ↑'; event = 'CHoCH? — संभावित तेज़ी का बदलाव'; }
    else if(lh && hl){ trend = 'Transition ↓'; event = 'CHoCH? — संभावित मंदी का बदलाव'; }

    return {
      trend, event,
      lastHigh: lastHighs[lastHighs.length - 1] || null,
      lastLow: lastLows[lastLows.length - 1] || null,
    };
  },

  /* ---- Order Blocks: ब्रेक से पहले की आखिरी विपरीत कैंडल ---- */
  orderBlocks(candles){
    let bull = null, bear = null;
    for(let i = candles.length - 3; i > Math.max(0, candles.length - 40); i--){
      const c = candles[i], next = candles[i + 1];
      // bullish OB: लाल कैंडल जिसके बाद तेज़ी से ऊपर ब्रेक हुआ
      if(!bull && c.c < c.o && next.c > c.h){
        bull = { low: c.l, high: c.h, mid: (c.l + c.h) / 2 };
      }
      // bearish OB: हरी कैंडल जिसके बाद तेज़ी से नीचे ब्रेक हुआ
      if(!bear && c.c > c.o && next.c < c.l){
        bear = { low: c.l, high: c.h, mid: (c.l + c.h) / 2 };
      }
      if(bull && bear) break;
    }
    return { bull, bear };
  },

  /* ---- Fair Value Gap (FVG) / imbalance ---- */
  fvg(candles){
    const gaps = [];
    for(let i = 2; i < candles.length; i++){
      const a = candles[i - 2], c = candles[i];
      if(c.l > a.h) gaps.push({ type: 'bullish', from: a.h, to: c.l, i });
      if(c.h < a.l) gaps.push({ type: 'bearish', from: c.h, to: a.l, i });
    }
    return gaps.slice(-3).reverse();
  },

  /* ---- Liquidity: हाल के बराबर highs/lows (equal highs/lows) ---- */
  liquidity(candles){
    const recent = candles.slice(-30);
    const hi = Math.max(...recent.map(c => c.h));
    const lo = Math.min(...recent.map(c => c.l));
    return { buyStops: hi, sellStops: lo };
  },

  /* ---- Support & Resistance (pivot क्लस्टरिंग) ---- */
  supportResistance(candles, price){
    const { highs, lows } = this.pivots(candles, 3);
    const cluster = (arr) => {
      const pts = arr.map(p => p.price).sort((a, b) => a - b);
      const groups = [];
      const tol = price * 0.0035;
      for(const p of pts){
        const g = groups.find(g => Math.abs(g.avg - p) < tol);
        if(g){ g.sum += p; g.n++; g.avg = g.sum / g.n; }
        else groups.push({ sum: p, n: 1, avg: p });
      }
      return groups.sort((a, b) => b.n - a.n).map(g => ({ price: g.avg, touches: g.n }));
    };
    const res = cluster(highs).filter(r => r.price > price).sort((a, b) => a.price - b.price).slice(0, 3);
    const sup = cluster(lows).filter(r => r.price < price).sort((a, b) => b.price - a.price).slice(0, 3);
    return { res, sup };
  },

  /* ---- Volume Profile ---- */
  volumeProfile(candles, bins = 14){
    const lo = Math.min(...candles.map(c => c.l));
    const hi = Math.max(...candles.map(c => c.h));
    const step = (hi - lo) / bins || 1;
    const buckets = Array.from({ length: bins }, (_, i) => ({
      low: lo + i * step, high: lo + (i + 1) * step, vol: 0,
    }));
    for(const c of candles){
      const tp = (c.h + c.l + c.c) / 3;
      let idx = Math.floor((tp - lo) / step);
      idx = Math.max(0, Math.min(bins - 1, idx));
      buckets[idx].vol += c.v;
    }
    const maxVol = Math.max(...buckets.map(b => b.vol)) || 1;
    const poc = buckets.reduce((a, b) => b.vol > a.vol ? b : a, buckets[0]);
    // Value Area (70% volume)
    const total = buckets.reduce((s, b) => s + b.vol, 0);
    return { buckets: buckets.reverse(), maxVol, poc, total };
  },
};
