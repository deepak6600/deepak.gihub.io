/* =========================================================
   ui.js — सभी DOM रेंडरिंग
   ========================================================= */
const UI = {
  $(id){ return document.getElementById(id); },
  fmt(n, d = 2){ return n == null ? '--' : (+n).toLocaleString('en-US', { maximumFractionDigits: d }); },
  money(n){ return n == null ? '--' : '$' + (+n).toLocaleString('en-US', { maximumFractionDigits: 2 }); },

  setPrice(price, prevPrice){
    const el = this.$('livePrice');
    el.textContent = this.money(price);
    if(prevPrice != null){
      el.style.color = price >= prevPrice ? 'var(--green)' : 'var(--red)';
      setTimeout(() => el.style.color = '#fff', 350);
    }
  },

  setTicker(t){
    const ch = +t.priceChangePercent;
    const el = this.$('priceChange');
    el.textContent = (ch >= 0 ? '▲ +' : '▼ ') + ch.toFixed(2) + '%';
    el.className = 'change ' + (ch >= 0 ? 'up' : 'down');
    this.$('high24').textContent = this.money(+t.highPrice);
    this.$('low24').textContent = this.money(+t.lowPrice);
    this.$('vol24').textContent = (+t.volume).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' BTC';
  },

  setConn(state){
    const el = this.$('connStatus');
    el.className = 'conn ' + (state === 'live' ? 'live' : state === 'err' ? 'err' : '');
    el.querySelector('.dot').nextSibling; // no-op
    el.innerHTML = `<span class="dot"></span> ${state === 'live' ? 'LIVE' : state === 'err' ? 'RECONNECT…' : 'CONNECTING'}`;
  },

  setClock(){
    this.$('clock').textContent = new Date().toLocaleTimeString('en-GB');
  },

  setVerdict(agg){
    const s = this.$('masterSignal');
    s.textContent = agg.signal;
    s.className = agg.cls;
    const reasonMap = {
      LONG: `तेज़ी संकेत ${agg.bull.toFixed(1)} vs मंदी ${agg.bear.toFixed(1)} — खरीदार हावी। मल्टी-टाइमफ्रेम confluence LONG की ओर।`,
      SHORT: `मंदी संकेत ${agg.bear.toFixed(1)} vs तेज़ी ${agg.bull.toFixed(1)} — विक्रेता हावी। मल्टी-टाइमफ्रेम confluence SHORT की ओर।`,
      NEUTRAL: `तेज़ी ${agg.bull.toFixed(1)} और मंदी ${agg.bear.toFixed(1)} लगभग बराबर — बाज़ार अनिर्णय में। स्पष्ट दिशा का इंतज़ार करें।`,
    };
    this.$('masterReason').textContent = reasonMap[agg.signal];

    // confidence gauge
    this.$('confValue').textContent = agg.confidence;
    const arc = this.$('confArc');
    const circ = 2 * Math.PI * 52;
    arc.style.strokeDashoffset = circ - (agg.confidence / 100) * circ;
    arc.style.stroke = agg.signal === 'LONG' ? 'var(--green)' : agg.signal === 'SHORT' ? 'var(--red)' : 'var(--amber)';
  },

  renderTrades(trades){
    const g = this.$('tfGrid');
    g.innerHTML = trades.map(tr => {
      const dirCls = tr.dir === 'LONG' ? 'dir-long' : tr.dir === 'SHORT' ? 'dir-short' : 'dir-wait';
      const meterCol = tr.dir === 'LONG' ? 'var(--green)' : tr.dir === 'SHORT' ? 'var(--red)' : 'var(--amber)';
      const meterW = Math.min(100, Math.abs(tr.net) * 130 + 12);
      const levels = tr.dir === 'WAIT' ? '' : `
        <div class="tf-levels">
          <div class="lvl entry"><label>ENTRY</label><b>${this.money(tr.entry)}</b></div>
          <div class="lvl target"><label>TARGET</label><b>${this.money(tr.target)}</b></div>
          <div class="lvl stop"><label>STOP LOSS</label><b>${this.money(tr.stop)}</b></div>
          <div class="lvl rr"><label>R:R</label><b>${tr.rr ? tr.rr.toFixed(2) + ' : 1' : '--'}</b></div>
        </div>`;
      return `
        <div class="tf-card">
          <div class="tf-top">
            <span class="tf-name">${tr.tf}</span>
            <span class="tf-dir ${dirCls}">${tr.dir === 'LONG' ? '▲ LONG' : tr.dir === 'SHORT' ? '▼ SHORT' : '⏸ WAIT'}</span>
          </div>
          ${levels}
          <div class="tf-logic"><b>लॉजिक:</b> ${tr.logic}</div>
          <div class="tf-meter"><i style="width:${meterW}%;background:${meterCol}"></i></div>
        </div>`;
    }).join('');
  },

  renderIndicators(items, tf){
    this.$('indTf').textContent = tf;
    const tagCls = s => s === 'buy' ? 't-buy' : s === 'sell' ? 't-sell' : 't-neu';
    const tagTxt = s => s === 'buy' ? 'BUY' : s === 'sell' ? 'SELL' : 'NEUTRAL';
    this.$('indList').innerHTML = items.map(it => `
      <div class="ind-row">
        <div class="ind-name">${it.name}<small>${it.detail}</small></div>
        <div class="ind-val">${it.sub || ''}<span class="ind-tag ${tagCls(it.signal)}">${tagTxt(it.signal)}</span></div>
      </div>`).join('');
  },

  renderSMC(smcData){
    const ob = smcData.ob;
    this.$('smcBox').innerHTML = `
      <div class="kv"><span>Market Structure</span><b>${smcData.structure.trend}</b></div>
      <div class="kv"><span>Structure Event</span><b>${smcData.structure.event}</b></div>
      <div class="kv"><span>Bullish Order Block</span><b>${ob.bull ? UI.money(ob.bull.low) + ' – ' + UI.money(ob.bull.high) : '—'}</b></div>
      <div class="kv"><span>Bearish Order Block</span><b>${ob.bear ? UI.money(ob.bear.low) + ' – ' + UI.money(ob.bear.high) : '—'}</b></div>
      <div class="kv"><span>Buy-side Liquidity</span><b>${UI.money(smcData.liq.buyStops)}</b></div>
      <div class="kv"><span>Sell-side Liquidity</span><b>${UI.money(smcData.liq.sellStops)}</b></div>
      <div class="tagline">SMC: संस्थागत ("smart money") ऑर्डर ब्लॉक और liquidity ज़ोन दिखाता है जहाँ बड़े खिलाड़ी सक्रिय होते हैं। ${smcData.fvg.length ? 'हाल का FVG: ' + smcData.fvg[0].type + ' imbalance.' : ''}</div>`;
  },

  renderSR(sr, price){
    const row = (lvl, type) => {
      const dist = Math.abs(lvl.price - price) / price * 100;
      const w = Math.max(8, 100 - dist * 12);
      return `<div class="sr-level">
        <div class="sr-top"><span>${type === 'res' ? 'रेज़िस्टेंस' : 'सपोर्ट'} · ${lvl.touches}x touch</span><b>${UI.money(lvl.price)} <small>(${dist.toFixed(2)}%)</small></b></div>
        <div class="sr-bar ${type}"><i style="width:${w}%"></i></div>
      </div>`;
    };
    const resHtml = sr.res.map(r => row(r, 'res')).join('') || '<div class="skel">कोई स्पष्ट रेज़िस्टेंस नहीं</div>';
    const supHtml = sr.sup.map(s => row(s, 'sup')).join('') || '<div class="skel">कोई स्पष्ट सपोर्ट नहीं</div>';
    this.$('srBox').innerHTML = resHtml + supHtml +
      `<div class="tagline">ये स्तर pivot क्लस्टरिंग से निकाले गए हैं — जितने ज़्यादा touch, उतना मज़बूत स्तर।</div>`;
  },

  renderOrderFlow(flow, depth){
    let html = '';
    if(flow){
      const total = flow.buyVol + flow.sellVol || 1;
      const bp = flow.buyVol / total * 100, sp = 100 - bp;
      html += `<div class="of-bar">
        <div class="buy" style="width:${bp}%">BUY ${bp.toFixed(0)}%</div>
        <div class="sell" style="width:${sp}%">SELL ${sp.toFixed(0)}%</div>
      </div>
      <div class="kv"><span>हाल के aggressive trades</span><b>${flow.count}</b></div>`;
    }
    if(depth){
      const bidTot = depth.bids.reduce((s, b) => s + b.qty, 0);
      const askTot = depth.asks.reduce((s, a) => s + a.qty, 0);
      const maxQ = Math.max(...depth.bids.map(b => b.qty), ...depth.asks.map(a => a.qty)) || 1;
      const topBids = depth.bids.slice(0, 6).map(b =>
        `<div class="depth-row bid"><div class="db" style="width:${b.qty / maxQ * 100}%"></div><span>${UI.money(b.price)}</span><span>${b.qty.toFixed(2)}</span></div>`).join('');
      const topAsks = depth.asks.slice(0, 6).map(a =>
        `<div class="depth-row ask"><div class="db" style="width:${a.qty / maxQ * 100}%"></div><span>${UI.money(a.price)}</span><span>${a.qty.toFixed(2)}</span></div>`).join('');
      html += `<div class="kv"><span>Bid/Ask दबाव</span><b>${(bidTot / (bidTot + askTot) * 100).toFixed(0)}% bids</b></div>
        <div class="depth-cols">
          <div><h5>BIDS (खरीद दीवार)</h5>${topBids}</div>
          <div><h5>ASKS (बिक्री दीवार)</h5>${topAsks}</div>
        </div>`;
    }
    if(!html) html = '<div class="skel">order flow डाटा उपलब्ध नहीं</div>';
    this.$('ofBox').innerHTML = html;
  },

  renderVolumeProfile(vp){
    const rows = vp.buckets.map(b => {
      const isPoc = b === vp.poc;
      const mid = (b.low + b.high) / 2;
      return `<div class="vp-row ${isPoc ? 'poc' : ''}">
        <span class="vp-price">${UI.money(mid)}</span>
        <div class="vp-bar"><i style="width:${b.vol / vp.maxVol * 100}%"></i></div>
      </div>`;
    }).join('');
    this.$('vpBox').innerHTML = rows +
      `<div class="tagline">POC (Point of Control) = ${UI.money((vp.poc.low + vp.poc.high) / 2)} — सबसे ज़्यादा वॉल्यूम वाला भाव, जहाँ कीमत अक्सर लौटती है।</div>`;
  },

  renderWhale(whale){
    if(!whale || (!whale.ls && !whale.oi)){
      this.$('whaleBox').innerHTML = '<div class="skel">⚠ Futures डाटा आपके क्षेत्र में CORS के कारण उपलब्ध नहीं हो सका (Binance futures API प्रतिबंध)।</div>';
      return;
    }
    let html = '';
    if(whale.ls && whale.ls.topLong != null){
      html += `<div class="whale-ratio">
        <div class="l" style="width:${whale.ls.topLong}%">LONG ${whale.ls.topLong.toFixed(0)}%</div>
        <div class="s" style="width:${whale.ls.topShort}%">SHORT ${whale.ls.topShort.toFixed(0)}%</div>
      </div>
      <div class="kv"><span>टॉप ट्रेडर्स L/S Ratio</span><b>${whale.ls.topRatio.toFixed(2)}</b></div>`;
    }
    if(whale.ls && whale.ls.global != null)
      html += `<div class="kv"><span>ग्लोबल अकाउंट L/S</span><b>${whale.ls.global.toFixed(2)}</b></div>`;
    if(whale.oi){
      html += `<div class="kv"><span>Open Interest</span><b>${UI.fmt(whale.oi.value, 0)} BTC</b></div>`;
      if(whale.oi.changePct != null)
        html += `<div class="kv"><span>OI बदलाव (15m)</span><b style="color:${whale.oi.changePct >= 0 ? 'var(--green)' : 'var(--red)'}">${whale.oi.changePct >= 0 ? '+' : ''}${whale.oi.changePct.toFixed(2)}%</b></div>`;
    }
    if(whale.funding)
      html += `<div class="kv"><span>Funding Rate</span><b style="color:${whale.funding.rate >= 0 ? 'var(--green)' : 'var(--red)'}">${whale.funding.rate.toFixed(4)}%</b></div>`;
    html += `<div class="tagline">यह दिखाता है बड़े फंड/ट्रेडर्स कहाँ पोजीशन में हैं। ज़्यादा longs + बढ़ता OI = तेज़ी का दबाव; उल्टा = मंदी।</div>`;
    this.$('whaleBox').innerHTML = html;
  },

  renderHeatmap(hm){
    const rows = hm.cells.map(c => {
      const bookPct = c.book / hm.maxBook;
      const liqPct = c.liq / hm.maxLiq;
      // तीव्रता: liquidity (नीला) + liquidation (लाल/हरा)
      const intensity = Math.max(bookPct, liqPct);
      const isCur = hm.price >= c.low && hm.price < c.high;
      let bg;
      if(liqPct > bookPct && c.liq > 0){
        const col = c.side === 'long' ? '255,93,122' : '27,242,154';
        bg = `linear-gradient(90deg, rgba(${col},${0.15 + liqPct * 0.75}) 0%, rgba(${col},${0.05}) 100%)`;
      } else {
        bg = `linear-gradient(90deg, rgba(91,155,255,${0.12 + bookPct * 0.7}) 0%, rgba(58,234,255,0.05) 100%)`;
      }
      const tag = c.liq > 0 ? (c.side === 'long' ? 'LONG liq' : 'SHORT liq') : (c.book > hm.maxBook * 0.5 ? 'wall' : '');
      return `<div class="heat-row ${isCur ? 'cur' : ''}">
        <span class="heat-price">${UI.money(c.mid)}</span>
        <div class="heat-cell" style="background:${bg}"><b>${tag}</b></div>
      </div>`;
    }).join('');
    this.$('heatBox').innerHTML = `<div class="heat-wrap">${rows}</div>
      <div class="heat-legend">
        <span><i style="background:rgba(91,155,255,.8)"></i> ऑर्डर-बुक liquidity (दीवार)</span>
        <span><i style="background:rgba(27,242,154,.8)"></i> SHORT liquidation ज़ोन</span>
        <span><i style="background:rgba(255,93,122,.8)"></i> LONG liquidation ज़ोन</span>
      </div>
      <div class="tagline">यह दिखाता है किन भावों पर बड़ी liquidity और leverage liquidation क्लस्टर हैं — कीमत अक्सर इन ज़ोन की ओर खिंचती है (liquidity grab)। (ऑर्डर-बुक + सामान्य leverage पर आधारित अनुमान)</div>`;
  },

  renderFearGreed(fng){
    if(!fng){ this.$('fngBox').innerHTML = '<div class="skel">Fear & Greed डाटा उपलब्ध नहीं</div>'; return; }
    const circ = 2 * Math.PI * 52;
    let col = 'var(--amber)';
    if(fng.value <= 25) col = 'var(--red)';
    else if(fng.value <= 45) col = '#ff8c42';
    else if(fng.value >= 75) col = 'var(--green)';
    else if(fng.value >= 55) col = '#7ee787';
    const hi = {
      'Extreme Fear': 'अत्यधिक डर — अक्सर तलहटी (खरीद अवसर) का संकेत',
      'Fear': 'डर — बाज़ार सतर्क, contrarian खरीद संभव',
      'Neutral': 'तटस्थ — कोई स्पष्ट भावना नहीं',
      'Greed': 'लालच — तेज़ी पर सतर्क रहें',
      'Extreme Greed': 'अत्यधिक लालच — अक्सर शिखर (सुधार जोखिम) का संकेत',
    }[fng.label] || '';
    this.$('fngBox').innerHTML = `<div class="fng-wrap">
      <div class="fng-gauge">
        <svg viewBox="0 0 120 120" width="120" height="120">
          <circle class="fg-bg" cx="60" cy="60" r="52"></circle>
          <circle class="fg-fg" cx="60" cy="60" r="52"
            style="stroke:${col};stroke-dasharray:${circ};stroke-dashoffset:${circ - fng.value / 100 * circ}"></circle>
        </svg>
        <div class="fng-val"><span style="color:${col}">${fng.value}</span><label>/ 100</label></div>
      </div>
      <div class="fng-info">
        <h4 style="color:${col}">${fng.label}</h4>
        <p style="color:var(--muted);font-size:.88rem;line-height:1.5">${hi}</p>
      </div>
    </div>`;
  },

  renderNews(news){
    if(!news || !news.length){ this.$('newsList').innerHTML = '<div class="skel">⚠ न्यूज़ लोड नहीं हो सकी (नेटवर्क/CORS)</div>'; return; }
    const ago = (t) => {
      const m = Math.floor((Date.now() - t) / 60000);
      if(m < 60) return m + ' मिनट पहले';
      const h = Math.floor(m / 60);
      return h < 24 ? h + ' घंटे पहले' : Math.floor(h / 24) + ' दिन पहले';
    };
    this.$('newsList').innerHTML = news.map(n => `
      <a class="news-item" href="${n.url}" target="_blank" rel="noopener">
        ${n.img ? `<img src="${n.img}" alt="" onerror="this.style.display='none'">` : ''}
        <div class="news-body">
          <h4>${n.title}</h4>
          <div class="news-meta"><span class="src">${n.source}</span><span>${ago(n.time)}</span></div>
        </div>
      </a>`).join('');
  },

  renderProjection(projList){
    this.$('projGrid').innerHTML = projList.map(p => {
      const dirCol = p.proj.bias === 'LONG' ? 'var(--green)' : p.proj.bias === 'SHORT' ? 'var(--red)' : 'var(--amber)';
      const arrow = p.proj.bias === 'LONG' ? '▲' : p.proj.bias === 'SHORT' ? '▼' : '◆';
      return `<div class="proj-card">
        <div class="proj-top"><span class="proj-tf">अगले ${p.label}</span>
          <span class="proj-prob" style="color:${dirCol}">${arrow} ${p.proj.probUp}% UP</span></div>
        <div class="proj-range">
          <div class="pr-row"><label>संभावित ऊपरी</label><b style="color:var(--green)">${UI.money(p.proj.upper)}</b></div>
          <div class="pr-row mid"><label>केंद्र अनुमान</label><b style="color:var(--amber)">${UI.money(p.proj.mid)}</b></div>
          <div class="pr-row"><label>संभावित निचला</label><b style="color:var(--red)">${UI.money(p.proj.lower)}</b></div>
        </div>
        <div class="proj-bar">
          <div class="pb-track">
            <i class="pb-fill" style="width:${p.proj.probUp}%;background:${dirCol}"></i>
            <span class="pb-mark" style="left:50%"></span>
          </div>
          <small>momentum + ATR आधारित — रेंज ≈ ±${UI.money(p.proj.atr * 1.1)}</small>
        </div>
      </div>`;
    }).join('');
  },

  renderScenarios(scn){
    const ico = { bull: '🟢', bear: '🔴', range: '🟡' };
    this.$('scenarioBox').innerHTML = scn.map(s => `
      <div class="scn-item ${s.type}">
        <div class="scn-ico">${ico[s.type]}</div>
        <div class="scn-body">
          <h4>अगर: ${s.cond}</h4>
          <p>तो: ${s.then}</p>
        </div>
      </div>`).join('');
  },

  renderChartLegend(ind, sig){
    const col = sig === 'LONG' ? 'var(--green)' : sig === 'SHORT' ? 'var(--red)' : 'var(--amber)';
    this.$('chartLegend').innerHTML = `
      <span><i style="background:#3aeaff"></i> EMA${CONFIG.emaFast}</span>
      <span><i style="background:#b288ff"></i> EMA${CONFIG.emaSlow}</span>
      <span><i style="background:var(--amber)"></i> Projection</span>
      <span style="color:${col}">● ${sig}</span>`;
  },

  toast(msg, type){
    const t = this.$('toast');
    t.textContent = msg;
    t.className = 'toast show ' + (type || '');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.className = 'toast', 4000);
  },

  renderLogicFeed(items){
    // weight के अनुसार sort, top 12
    const sorted = [...items].sort((a, b) => b.weight - a.weight).slice(0, 14);
    this.$('logicFeed').innerHTML = sorted.map(it => {
      const cls = it.signal === 'buy' ? 'pos' : it.signal === 'sell' ? 'neg' : 'neu';
      const ico = it.signal === 'buy' ? '🟢' : it.signal === 'sell' ? '🔴' : '🟡';
      return `<div class="logic-item ${cls}">
        <div class="li-ico">${ico}</div>
        <div class="li-body"><h4>${it.name}</h4><p>${it.detail}</p></div>
        <div class="li-w">वज़न ${it.weight}</div>
      </div>`;
    }).join('');
  },
};
