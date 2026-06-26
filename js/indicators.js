/* =========================================================
   indicators.js — सभी टेक्निकल इंडिकेटर्स का गणित
   सब कुछ shudh JavaScript में, OHLCV array से calculate होता है
   candle format: {t, o, h, l, c, v}
   ========================================================= */
const TA = {

  sma(values, p){
    if(values.length < p) return null;
    let s = 0;
    for(let i = values.length - p; i < values.length; i++) s += values[i];
    return s / p;
  },

  // पूरा EMA series लौटाता है
  emaSeries(values, p){
    if(values.length < p) return [];
    const k = 2 / (p + 1);
    const out = [];
    let ema = values.slice(0, p).reduce((a, b) => a + b, 0) / p;
    out[p - 1] = ema;
    for(let i = p; i < values.length; i++){
      ema = values[i] * k + ema * (1 - k);
      out[i] = ema;
    }
    return out;
  },

  ema(values, p){
    const s = this.emaSeries(values, p);
    return s.length ? s[s.length - 1] : null;
  },

  rsi(closes, p = 14){
    if(closes.length < p + 1) return null;
    let gain = 0, loss = 0;
    for(let i = 1; i <= p; i++){
      const d = closes[i] - closes[i - 1];
      if(d >= 0) gain += d; else loss -= d;
    }
    let ag = gain / p, al = loss / p;
    for(let i = p + 1; i < closes.length; i++){
      const d = closes[i] - closes[i - 1];
      ag = (ag * (p - 1) + Math.max(d, 0)) / p;
      al = (al * (p - 1) + Math.max(-d, 0)) / p;
    }
    if(al === 0) return 100;
    const rs = ag / al;
    return 100 - 100 / (1 + rs);
  },

  macd(closes, fast = 12, slow = 26, sig = 9){
    if(closes.length < slow + sig) return null;
    const ef = this.emaSeries(closes, fast);
    const es = this.emaSeries(closes, slow);
    const macdLine = [];
    for(let i = 0; i < closes.length; i++){
      if(ef[i] != null && es[i] != null) macdLine[i] = ef[i] - es[i];
    }
    const clean = macdLine.filter(v => v != null);
    const signalSeries = this.emaSeries(clean, sig);
    const macdVal = clean[clean.length - 1];
    const signalVal = signalSeries[signalSeries.length - 1];
    return { macd: macdVal, signal: signalVal, hist: macdVal - signalVal };
  },

  atr(candles, p = 14){
    if(candles.length < p + 1) return null;
    const trs = [];
    for(let i = 1; i < candles.length; i++){
      const c = candles[i], pc = candles[i - 1].c;
      trs.push(Math.max(c.h - c.l, Math.abs(c.h - pc), Math.abs(c.l - pc)));
    }
    let atr = trs.slice(0, p).reduce((a, b) => a + b, 0) / p;
    for(let i = p; i < trs.length; i++) atr = (atr * (p - 1) + trs[i]) / p;
    return atr;
  },

  bollinger(closes, p = 20, mult = 2){
    if(closes.length < p) return null;
    const slice = closes.slice(-p);
    const mid = slice.reduce((a, b) => a + b, 0) / p;
    const variance = slice.reduce((a, b) => a + (b - mid) ** 2, 0) / p;
    const sd = Math.sqrt(variance);
    return { upper: mid + mult * sd, mid, lower: mid - mult * sd, width: (mult * 2 * sd) / mid * 100 };
  },

  stochastic(candles, p = 14, smooth = 3){
    if(candles.length < p + smooth) return null;
    const ks = [];
    for(let i = p - 1; i < candles.length; i++){
      const win = candles.slice(i - p + 1, i + 1);
      const hh = Math.max(...win.map(c => c.h));
      const ll = Math.min(...win.map(c => c.l));
      const c = candles[i].c;
      ks.push(hh === ll ? 50 : ((c - ll) / (hh - ll)) * 100);
    }
    const k = ks.slice(-smooth).reduce((a, b) => a + b, 0) / smooth;
    const d = ks.slice(-smooth * 2, -smooth).reduce((a, b) => a + b, 0) / smooth;
    return { k, d };
  },

  // VWAP (सत्र भर)
  vwap(candles){
    let pv = 0, vol = 0;
    for(const c of candles){
      const tp = (c.h + c.l + c.c) / 3;
      pv += tp * c.v; vol += c.v;
    }
    return vol ? pv / vol : null;
  },

  // ADX — ट्रेंड की मजबूती
  adx(candles, p = 14){
    if(candles.length < p * 2) return null;
    let plusDM = [], minusDM = [], tr = [];
    for(let i = 1; i < candles.length; i++){
      const up = candles[i].h - candles[i - 1].h;
      const dn = candles[i - 1].l - candles[i].l;
      plusDM.push(up > dn && up > 0 ? up : 0);
      minusDM.push(dn > up && dn > 0 ? dn : 0);
      const c = candles[i], pc = candles[i - 1].c;
      tr.push(Math.max(c.h - c.l, Math.abs(c.h - pc), Math.abs(c.l - pc)));
    }
    const smooth = (arr) => {
      let s = arr.slice(0, p).reduce((a, b) => a + b, 0);
      const out = [s];
      for(let i = p; i < arr.length; i++){ s = s - s / p + arr[i]; out.push(s); }
      return out;
    };
    const trS = smooth(tr), pS = smooth(plusDM), mS = smooth(minusDM);
    const dx = [];
    for(let i = 0; i < trS.length; i++){
      const pdi = 100 * pS[i] / trS[i];
      const mdi = 100 * mS[i] / trS[i];
      dx.push(100 * Math.abs(pdi - mdi) / (pdi + mdi || 1));
    }
    const adx = dx.slice(-p).reduce((a, b) => a + b, 0) / p;
    return adx;
  },
};
