/* =========================================================
   analysis.js — AI विश्लेषण इंजन
   सभी इंडिकेटर्स को मिलाकर score, verdict, trade और logic बनाता है
   ========================================================= */
const ENGINE = {

  /* एक टाइमफ्रेम के candles का पूरा इंडिकेटर सेट */
  computeIndicators(candles){
    const closes = candles.map(c => c.c);
    const price = closes[closes.length - 1];
    return {
      price,
      emaFast: TA.ema(closes, CONFIG.emaFast),
      emaMid:  TA.ema(closes, CONFIG.emaMid),
      emaSlow: TA.ema(closes, CONFIG.emaSlow),
      emaTrend:TA.ema(closes, CONFIG.emaTrend),
      rsi: TA.rsi(closes, CONFIG.rsiPeriod),
      macd: TA.macd(closes),
      atr: TA.atr(candles, CONFIG.atrPeriod),
      bb: TA.bollinger(closes, CONFIG.bbPeriod),
      stoch: TA.stochastic(candles),
      vwap: TA.vwap(candles),
      adx: TA.adx(candles),
    };
  },

  /* प्रत्येक इंडिकेटर को सिग्नल + वज़न में बदलें */
  scoreIndicators(ind){
    const items = [];
    const add = (name, sub, signal, weight, detail) =>
      items.push({ name, sub, signal, weight, detail });

    const p = ind.price;

    // EMA संरचना (ट्रेंड)
    if(ind.emaFast && ind.emaSlow){
      const sig = ind.emaFast > ind.emaSlow ? 'buy' : 'sell';
      add('EMA संरचना', `9/21/50`, sig, 2,
        sig === 'buy' ? 'तेज़ EMA धीमी EMA के ऊपर — तेज़ी का momentum'
                      : 'तेज़ EMA धीमी EMA के नीचे — मंदी का momentum');
    }
    // EMA200 बड़ा ट्रेंड
    if(ind.emaTrend){
      const sig = p > ind.emaTrend ? 'buy' : 'sell';
      add('बड़ा ट्रेंड', `EMA200`, sig, 1.5,
        sig === 'buy' ? 'कीमत EMA200 के ऊपर — दीर्घकालिक तेज़ी' : 'कीमत EMA200 के नीचे — दीर्घकालिक मंदी');
    }
    // RSI
    if(ind.rsi != null){
      let sig = 'neu', d = `RSI ${ind.rsi.toFixed(1)} — संतुलित`;
      if(ind.rsi > 70){ sig = 'sell'; d = `RSI ${ind.rsi.toFixed(1)} — overbought, गिरावट जोखिम`; }
      else if(ind.rsi < 30){ sig = 'buy'; d = `RSI ${ind.rsi.toFixed(1)} — oversold, उछाल संभव`; }
      else if(ind.rsi > 55){ sig = 'buy'; d = `RSI ${ind.rsi.toFixed(1)} — तेज़ी की ओर झुकाव`; }
      else if(ind.rsi < 45){ sig = 'sell'; d = `RSI ${ind.rsi.toFixed(1)} — मंदी की ओर झुकाव`; }
      add('RSI (14)', '', sig, 1.5, d);
    }
    // MACD
    if(ind.macd){
      const sig = ind.macd.hist > 0 ? 'buy' : 'sell';
      add('MACD', '12/26/9', sig, 1.5,
        sig === 'buy' ? 'MACD signal के ऊपर — तेज़ी का दबाव' : 'MACD signal के नीचे — मंदी का दबाव');
    }
    // Stochastic
    if(ind.stoch){
      let sig = 'neu', d = `K ${ind.stoch.k.toFixed(0)} / D ${ind.stoch.d.toFixed(0)}`;
      if(ind.stoch.k < 20){ sig = 'buy'; d += ' — oversold उछाल'; }
      else if(ind.stoch.k > 80){ sig = 'sell'; d += ' — overbought'; }
      else if(ind.stoch.k > ind.stoch.d){ sig = 'buy'; d += ' — ऊपर crossover'; }
      else { sig = 'sell'; d += ' — नीचे crossover'; }
      add('Stochastic', '14/3', sig, 1, d);
    }
    // VWAP
    if(ind.vwap){
      const sig = p > ind.vwap ? 'buy' : 'sell';
      add('VWAP', '', sig, 1,
        sig === 'buy' ? 'कीमत VWAP के ऊपर — खरीदार नियंत्रण में' : 'कीमत VWAP के नीचे — विक्रेता नियंत्रण में');
    }
    // Bollinger
    if(ind.bb){
      let sig = 'neu', d = `width ${ind.bb.width.toFixed(2)}%`;
      if(p > ind.bb.upper){ sig = 'sell'; d = 'ऊपरी band के बाहर — extended'; }
      else if(p < ind.bb.lower){ sig = 'buy'; d = 'निचले band के बाहर — extended'; }
      else d += ' — band के अंदर';
      add('Bollinger', '20/2', sig, 0.8, d);
    }
    return items;
  },

  /* SMC संकेतों को score करें */
  scoreSMC(smcData, price){
    const items = [];
    const add = (name, signal, weight, detail) => items.push({ name, signal, weight, detail });
    if(smcData.structure.trend.startsWith('Bullish')) add('Market Structure', 'buy', 2, smcData.structure.event);
    else if(smcData.structure.trend.startsWith('Bearish')) add('Market Structure', 'sell', 2, smcData.structure.event);
    else if(smcData.structure.trend.includes('↑')) add('Market Structure', 'buy', 1, smcData.structure.event);
    else if(smcData.structure.trend.includes('↓')) add('Market Structure', 'sell', 1, smcData.structure.event);

    if(smcData.ob.bull && price >= smcData.ob.bull.low && price <= smcData.ob.bull.high)
      add('Bullish Order Block', 'buy', 1.5, 'कीमत मांग क्षेत्र (OB) पर — संस्थागत खरीद संभव');
    if(smcData.ob.bear && price >= smcData.ob.bear.low && price <= smcData.ob.bear.high)
      add('Bearish Order Block', 'sell', 1.5, 'कीमत आपूर्ति क्षेत्र (OB) पर — संस्थागत बिक्री संभव');

    if(smcData.fvg.length){
      const g = smcData.fvg[0];
      add('Fair Value Gap', g.type === 'bullish' ? 'buy' : 'sell', 0.8,
        `${g.type === 'bullish' ? 'तेज़ी' : 'मंदी'} imbalance — कीमत भरने आ सकती है`);
    }
    return items;
  },

  /* Order flow score */
  scoreFlow(flow){
    const items = [];
    if(!flow) return items;
    const total = flow.buyVol + flow.sellVol;
    if(total > 0){
      const buyPct = flow.buyVol / total * 100;
      const sig = buyPct > 55 ? 'buy' : buyPct < 45 ? 'sell' : 'neu';
      items.push({ name: 'Order Flow', signal: sig, weight: 1.5,
        detail: `aggressive खरीद ${buyPct.toFixed(0)}% vs बिक्री ${(100 - buyPct).toFixed(0)}% (हाल के trades)` });
    }
    return items;
  },

  /* Whale / futures positioning score */
  scoreWhale(whale){
    const items = [];
    if(!whale || !whale.ls) return items;
    const ls = whale.ls;
    if(ls.topRatio != null){
      const sig = ls.topRatio > 1.05 ? 'buy' : ls.topRatio < 0.95 ? 'sell' : 'neu';
      items.push({ name: 'Top Traders L/S', signal: sig, weight: 1.2,
        detail: `बड़े ट्रेडर्स का long/short ratio ${ls.topRatio.toFixed(2)} — ${sig === 'buy' ? 'long झुकाव' : sig === 'sell' ? 'short झुकाव' : 'संतुलित'}` });
    }
    if(whale.oi && whale.oi.changePct != null){
      // OI बढ़ना + कीमत दिशा confirm
      items.push({ name: 'Open Interest', signal: 'neu', weight: 0.6,
        detail: `OI ${whale.oi.changePct >= 0 ? '+' : ''}${whale.oi.changePct.toFixed(2)}% — ${whale.oi.changePct >= 0 ? 'नई पोजीशन जुड़ रहीं' : 'पोजीशन बंद हो रहीं'}` });
    }
    if(whale.funding && whale.funding.rate != null){
      const sig = whale.funding.rate > 0.02 ? 'sell' : whale.funding.rate < -0.02 ? 'buy' : 'neu';
      items.push({ name: 'Funding Rate', signal: sig, weight: 0.6,
        detail: `funding ${whale.funding.rate.toFixed(4)}% — ${whale.funding.rate > 0 ? 'longs भुगतान कर रहे (भीड़ long)' : 'shorts भुगतान कर रहे (भीड़ short)'}` });
    }
    return items;
  },

  /* सभी items से कुल स्कोर निकालें */
  aggregate(allItems){
    let bull = 0, bear = 0;
    for(const it of allItems){
      if(it.signal === 'buy') bull += it.weight;
      else if(it.signal === 'sell') bear += it.weight;
    }
    const total = bull + bear;
    const net = total ? (bull - bear) / total : 0; // -1..1
    let signal = 'NEUTRAL', cls = 'sig-neutral';
    if(net > 0.18){ signal = 'LONG'; cls = 'sig-long'; }
    else if(net < -0.18){ signal = 'SHORT'; cls = 'sig-short'; }
    const confidence = Math.min(95, Math.round(Math.abs(net) * 100 + (total > 8 ? 8 : 0)));
    return { bull, bear, net, signal, cls, confidence };
  },

  /* एक TF के लिए trade सेटअप — ATR आधारित Entry/Target/Stop */
  buildTrade(tf, ind, smcData, agg){
    const price = ind.price;
    const atr = ind.atr || price * 0.005;
    let dir = agg.signal;
    let entry, target, stop, logic;

    const supr = smcData.sr;
    const nearestRes = supr.res[0] ? supr.res[0].price : price + atr * 3;
    const nearestSup = supr.sup[0] ? supr.sup[0].price : price - atr * 3;

    if(dir === 'LONG'){
      entry = price;
      stop = Math.min(price - atr * 1.5, nearestSup - atr * 0.2);
      target = Math.max(price + atr * 2.5, nearestRes * 0.999);
      logic = `तेज़ी score हावी। Entry बाज़ार भाव पर, Stop निकटतम सपोर्ट (${this.fmt(nearestSup)}) के नीचे ${(atr).toFixed(0)}$ ATR बफ़र, Target निकटतम रेज़िस्टेंस (${this.fmt(nearestRes)}) की ओर।`;
    } else if(dir === 'SHORT'){
      entry = price;
      stop = Math.max(price + atr * 1.5, nearestRes + atr * 0.2);
      target = Math.min(price - atr * 2.5, nearestSup * 1.001);
      logic = `मंदी score हावी। Entry बाज़ार भाव पर, Stop निकटतम रेज़िस्टेंस (${this.fmt(nearestRes)}) के ऊपर ATR बफ़र, Target निकटतम सपोर्ट (${this.fmt(nearestSup)}) की ओर।`;
    } else {
      dir = 'WAIT';
      logic = `इस टाइमफ्रेम पर तेज़ी/मंदी संकेत लगभग बराबर हैं (net ${(agg.net * 100).toFixed(0)}%)। साफ़ ब्रेकआउट या रिटेस्ट का इंतज़ार करें — रेंज में ट्रेड से बचें।`;
    }

    let rr = null;
    if(dir !== 'WAIT'){
      const risk = Math.abs(entry - stop);
      const reward = Math.abs(target - entry);
      rr = risk ? (reward / risk) : null;
    }

    return {
      tf: tf.label, key: tf.key, dir,
      entry: dir !== 'WAIT' ? entry : null,
      target: dir !== 'WAIT' ? target : null,
      stop: dir !== 'WAIT' ? stop : null,
      rr, logic, confidence: agg.confidence, net: agg.net,
    };
  },

  /* एक horizon के लिए भविष्य अनुमान (bars = आगे की कैंडलें) */
  projectHorizon(ind, agg, bars = 1){
    const price = ind.price;
    const atr = ind.atr || price * 0.005;
    const net = agg.net;                       // -1..1
    const drift = net * atr * 0.6 * bars;      // momentum आधारित दिशा
    const band = atr * Math.sqrt(bars) * 1.1;  // अनिश्चितता (~70%)
    const mid = price + drift;
    const upper = mid + band;
    const lower = mid - band;
    let probUp = Math.round(50 + net * 42);
    probUp = Math.max(8, Math.min(92, probUp));
    return { price, mid, upper, lower, probUp, atr, bias: agg.signal };
  },

  /* "अगर ऐसा हुआ तो" परिदृश्य — S/R ब्रेक पर आधारित */
  scenarios(price, sr, atr){
    const out = [];
    const r1 = sr.res[0]?.price, r2 = sr.res[1]?.price;
    const s1 = sr.sup[0]?.price, s2 = sr.sup[1]?.price;
    if(r1){
      const tgt = r2 || (r1 + (r1 - price));
      out.push({ type: 'bull', cond: `कीमत रेज़िस्टेंस ${this.fmt(r1)} के ऊपर बंद होती है`,
        then: `तेज़ी जारी — अगला लक्ष्य ${this.fmt(tgt)} (≈ +${((tgt - price) / price * 100).toFixed(2)}%)। ब्रेकआउट रिटेस्ट पर long विचार।` });
    }
    if(s1){
      const tgt = s2 || (s1 - (price - s1));
      out.push({ type: 'bear', cond: `कीमत सपोर्ट ${this.fmt(s1)} के नीचे टूटती है`,
        then: `मंदी तेज़ — अगला लक्ष्य ${this.fmt(tgt)} (≈ ${((tgt - price) / price * 100).toFixed(2)}%)। ब्रेकडाउन रिटेस्ट पर short विचार।` });
    }
    out.push({ type: 'range', cond: `कीमत ${this.fmt(s1 || price - atr * 2)} – ${this.fmt(r1 || price + atr * 2)} के बीच रहती है`,
      then: `रेंज-बाउंड — किनारों से उल्टा ट्रेड (सपोर्ट पर खरीद, रेज़िस्टेंस पर बिक्री), बीच में ट्रेड से बचें।` });
    return out;
  },

  fmt(n){
    if(n == null) return '--';
    return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  },
};
