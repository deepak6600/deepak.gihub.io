/* =========================================================
   api.js — Binance पब्लिक API से रियल-टाइम डाटा
   ========================================================= */
const API = {

  async _json(url){
    const r = await fetch(url);
    if(!r.ok) throw new Error('HTTP ' + r.status + ' @ ' + url);
    return r.json();
  },

  /* candlestick (kline) डाटा → {t,o,h,l,c,v} */
  async klines(interval, limit){
    const url = `${CONFIG.spotBase}/api/v3/klines?symbol=${CONFIG.symbol}&interval=${interval}&limit=${limit}`;
    const raw = await this._json(url);
    return raw.map(k => ({
      t: k[0],
      o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5],
    }));
  },

  /* 24 घंटे का सांख्यिकी */
  async ticker24(){
    return this._json(`${CONFIG.spotBase}/api/v3/ticker/24hr?symbol=${CONFIG.symbol}`);
  },

  /* ऑर्डर बुक डेप्थ (order flow) */
  async depth(limit = 50){
    const d = await this._json(`${CONFIG.spotBase}/api/v3/depth?symbol=${CONFIG.symbol}&limit=${limit}`);
    return {
      bids: d.bids.map(b => ({ price: +b[0], qty: +b[1] })),
      asks: d.asks.map(a => ({ price: +a[0], qty: +a[1] })),
    };
  },

  /* हाल के aggregated trades — buy/sell दबाव */
  async aggTrades(limit = 500){
    const t = await this._json(`${CONFIG.spotBase}/api/v3/aggTrades?symbol=${CONFIG.symbol}&limit=${limit}`);
    let buyVol = 0, sellVol = 0;
    for(const x of t){
      const q = +x.q;
      // m=true मतलब buyer maker => यह sell-side aggression था
      if(x.m) sellVol += q; else buyVol += q;
    }
    return { buyVol, sellVol, count: t.length };
  },

  /* ---- Futures डाटा (whale / fund positioning) ---- */
  /* CORS कुछ क्षेत्रों में blok हो सकता है — इसलिए try/catch */
  async openInterest(){
    try{
      const oi = await this._json(`${CONFIG.futBase}/fapi/v1/openInterest?symbol=${CONFIG.symbol}`);
      const hist = await this._json(`${CONFIG.futBase}/futures/data/openInterestHist?symbol=${CONFIG.symbol}&period=15m&limit=2`);
      let change = null;
      if(hist.length === 2) change = ((+hist[1].sumOpenInterest - +hist[0].sumOpenInterest) / +hist[0].sumOpenInterest) * 100;
      return { value: +oi.openInterest, changePct: change };
    }catch(e){ return null; }
  },

  /* टॉप ट्रेडर्स का long/short ratio */
  async longShort(){
    try{
      const g = await this._json(`${CONFIG.futBase}/futures/data/globalLongShortAccountRatio?symbol=${CONFIG.symbol}&period=15m&limit=1`);
      const t = await this._json(`${CONFIG.futBase}/futures/data/topLongShortPositionRatio?symbol=${CONFIG.symbol}&period=15m&limit=1`);
      return {
        global: g.length ? +g[0].longShortRatio : null,
        globalLong: g.length ? +g[0].longAccount * 100 : null,
        globalShort: g.length ? +g[0].shortAccount * 100 : null,
        topRatio: t.length ? +t[0].longShortRatio : null,
        topLong: t.length ? +t[0].longAccount * 100 : null,
        topShort: t.length ? +t[0].shortAccount * 100 : null,
      };
    }catch(e){ return null; }
  },

  /* फंडिंग रेट */
  async funding(){
    try{
      const f = await this._json(`${CONFIG.futBase}/fapi/v1/premiumIndex?symbol=${CONFIG.symbol}`);
      return { rate: +f.lastFundingRate * 100, markPrice: +f.markPrice };
    }catch(e){ return null; }
  },

  /* ---- रियल-टाइम न्यूज़ (RSS → rss2json, फ्री, बिना key, CORS-friendly) ---- */
  async news(){
    // कई स्रोत — पहला जो चले उससे आगे बढ़ें, कई को मिला भी दें
    const feeds = [
      { url: 'https://cointelegraph.com/rss',                     src: 'Cointelegraph' },
      { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',   src: 'CoinDesk' },
      { url: 'https://bitcoinmagazine.com/feed',                  src: 'Bitcoin Magazine' },
      { url: 'https://cryptopotato.com/feed',                     src: 'CryptoPotato' },
    ];
    const fetchFeed = async (f) => {
      const url = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(f.url);
      const d = await this._json(url);
      if(d.status !== 'ok' || !d.items) return [];
      return d.items.map(it => ({
        title: it.title,
        url: it.link,
        source: f.src,
        img: it.thumbnail || (it.enclosure && it.enclosure.link) || '',
        time: it.pubDate ? new Date(it.pubDate.replace(' ', 'T')).getTime() : Date.now(),
      }));
    };
    const all = [];
    for(const f of feeds){
      try{
        const items = await fetchFeed(f);
        all.push(...items);
        if(all.length >= 12) break;   // पर्याप्त मिल गईं
      }catch(e){ /* अगले स्रोत पर जाएँ */ }
    }
    if(!all.length) return null;
    // नए-से-पुराने क्रम में
    all.sort((a, b) => b.time - a.time);
    return all.slice(0, 12);
  },

  /* ---- Fear & Greed Index (alternative.me, free) ---- */
  async fearGreed(){
    try{
      const d = await this._json('https://api.alternative.me/fng/?limit=1');
      const x = d.data?.[0];
      return x ? { value: +x.value, label: x.value_classification } : null;
    }catch(e){ return null; }
  },

  /* WebSocket लाइव price */
  connectLivePrice(onTick, onState){
    let ws;
    const open = () => {
      try{ ws = new WebSocket(CONFIG.wsUrl); }
      catch(e){ onState('err'); return; }
      ws.onopen = () => onState('live');
      ws.onmessage = (m) => {
        const d = JSON.parse(m.data);
        onTick(+d.p);
      };
      ws.onclose = () => { onState('err'); setTimeout(open, 3000); };
      ws.onerror = () => { onState('err'); ws.close(); };
    };
    open();
    return () => ws && ws.close();
  },
};
