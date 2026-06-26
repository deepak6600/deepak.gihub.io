/* =========================================================
   app.js — मुख्य नियंत्रक (टैब डैशबोर्ड + चार्ट + projection)
   ========================================================= */
(function(){
  let lastPrice = null;
  let lastSignal = null;
  let soundOn = false;
  let chartTf = '15m';

  // साझा state — हर TF का परिणाम
  const state = { tf: {}, ls: null, depth: null };

  /* ---------- घड़ी ---------- */
  setInterval(() => UI.setClock(), 1000);
  UI.setClock();

  /* ---------- चार्ट init ---------- */
  const chartOk = CHART.init('chart');

  /* ---------- लाइव price WebSocket ---------- */
  API.connectLivePrice(
    (price) => { UI.setPrice(price, lastPrice); lastPrice = price; },
    (state) => UI.setConn(state)
  );

  /* ---------- सिग्नल बदलने पर बीप ---------- */
  function beep(){
    if(!soundOn) return;
    try{
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.frequency.value = 880; g.gain.value = 0.05;
      o.start(); o.stop(ac.currentTime + 0.18);
    }catch(e){}
  }

  /* ---------- चार्ट अपडेट चुने हुए TF के अनुसार ---------- */
  function updateChart(){
    if(!chartOk) return;
    const d = state.tf[chartTf];
    if(!d) return;
    CHART.setData(d.candles, CONFIG.emaFast, CONFIG.emaSlow);

    // S/R + ट्रेड स्तर
    const levels = [];
    d.smcData.sr.res.slice(0, 2).forEach(r => levels.push({ price: r.price, color: 'rgba(255,93,122,0.6)', title: 'R', dashed: true }));
    d.smcData.sr.sup.slice(0, 2).forEach(s => levels.push({ price: s.price, color: 'rgba(27,242,154,0.6)', title: 'S', dashed: true }));
    const tr = d.trade;
    if(tr && tr.dir !== 'WAIT'){
      levels.push({ price: tr.entry, color: '#3aeaff', title: 'Entry', width: 2 });
      levels.push({ price: tr.target, color: '#1bf29a', title: 'Target', width: 2 });
      levels.push({ price: tr.stop, color: '#ff5d7a', title: 'Stop', width: 2 });
    }
    CHART.setLevels(levels);

    // future projection cone (8 बार आगे)
    const proj = ENGINE.projectHorizon(d.ind, d.agg, 8);
    const intervalSec = { '5m': 300, '15m': 900, '30m': 1800 }[chartTf];
    CHART.setProjection(d.candles[d.candles.length - 1], intervalSec, 8, proj.mid, proj.upper, proj.lower);

    UI.renderChartLegend(d.ind, d.agg.signal);
  }

  /* ---------- मुख्य विश्लेषण चक्र ---------- */
  async function runAnalysis(){
    try{
      const tfData = await Promise.all(
        CONFIG.timeframes.map(tf => API.klines(tf.key, tf.limit).then(c => ({ tf, candles: c })))
      );

      const [ticker, depth, flow, oi, ls, funding] = await Promise.all([
        API.ticker24().catch(() => null),
        API.depth(40).catch(() => null),
        API.aggTrades(500).catch(() => null),
        API.openInterest(),
        API.longShort(),
        API.funding(),
      ]);
      if(ticker) UI.setTicker(ticker);
      const whale = { oi, ls, funding };
      state.ls = ls; state.depth = depth;

      const trades = [];
      let primaryItems = [], primaryInd = null, primarySMC = null;
      const masterItems = [];

      for(const { tf, candles } of tfData){
        const ind = ENGINE.computeIndicators(candles);
        const price = ind.price;
        const smcData = {
          structure: SMC.structure(candles),
          ob: SMC.orderBlocks(candles),
          fvg: SMC.fvg(candles),
          liq: SMC.liquidity(candles),
          sr: SMC.supportResistance(candles, price),
          vp: SMC.volumeProfile(candles, CONFIG.volProfileBins),
        };
        const indItems = ENGINE.scoreIndicators(ind);
        const smcItems = ENGINE.scoreSMC(smcData, price);
        const tfAllItems = [...indItems, ...smcItems];

        if(tf.key === CONFIG.primaryTf){
          tfAllItems.push(...ENGINE.scoreFlow(flow), ...ENGINE.scoreWhale(whale));
          primaryItems = indItems; primaryInd = ind; primarySMC = smcData;
        }
        const agg = ENGINE.aggregate(tfAllItems);
        const trade = ENGINE.buildTrade(tf, ind, smcData, agg);
        trades.push(trade);

        // state में रखो
        state.tf[tf.key] = { candles, ind, smcData, agg, trade };

        const tfWeight = tf.key === '30m' ? 1.3 : tf.key === '15m' ? 1.0 : 0.7;
        tfAllItems.forEach(it => masterItems.push({ ...it, weight: it.weight * tfWeight }));
      }

      // master verdict
      const masterAgg = ENGINE.aggregate(masterItems);
      UI.setVerdict(masterAgg);
      UI.renderTrades(trades);

      // सिग्नल बदला? → alert
      if(lastSignal && masterAgg.signal !== lastSignal && masterAgg.signal !== 'NEUTRAL'){
        UI.toast(`⚡ नया सिग्नल: ${masterAgg.signal} (${masterAgg.confidence}% confidence)`, masterAgg.signal.toLowerCase());
        beep();
      }
      lastSignal = masterAgg.signal;

      // पैनल
      if(primaryInd){
        UI.renderIndicators(primaryItems, CONFIG.primaryTf);
        UI.renderSMC(primarySMC);
        UI.renderSR(primarySMC.sr, primaryInd.price);
        UI.renderVolumeProfile(primarySMC.vp);

        // AI Future projection — 5m/15m/30m हर एक 1 बार आगे
        const projList = CONFIG.timeframes.map(tf => {
          const d = state.tf[tf.key];
          return { label: tf.label, proj: ENGINE.projectHorizon(d.ind, d.agg, 1) };
        });
        UI.renderProjection(projList);
        UI.renderScenarios(ENGINE.scenarios(primaryInd.price, primarySMC.sr, primaryInd.atr || primaryInd.price * 0.005));
      }
      UI.renderOrderFlow(flow, depth);
      UI.renderWhale(whale);
      if(primaryInd && depth) UI.renderHeatmap(SMC.heatmap(depth, primaryInd.price, ls, 21));

      // logic feed
      UI.renderLogicFeed([
        ...primaryItems,
        ...ENGINE.scoreSMC(primarySMC, primaryInd.price),
        ...ENGINE.scoreFlow(flow),
        ...ENGINE.scoreWhale(whale),
      ]);

      // चार्ट
      updateChart();

    }catch(e){
      console.error('विश्लेषण त्रुटि:', e);
      UI.setConn('err');
    }
  }

  runAnalysis();
  setInterval(runAnalysis, CONFIG.refreshMs);

  /* ---------- न्यूज़ + Fear&Greed ---------- */
  async function runSlowFeeds(){
    const [news, fng] = await Promise.all([
      API.news().catch(() => null),
      API.fearGreed().catch(() => null),
    ]);
    UI.renderNews(news);
    UI.renderFearGreed(fng);
  }
  runSlowFeeds();
  setInterval(runSlowFeeds, 60000);

  /* ---------- टैब स्विचिंग ---------- */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.querySelector(`.tab-page[data-page="${btn.dataset.tab}"]`).classList.add('active');
      if(btn.dataset.tab === 'overview' && chartOk){
        setTimeout(() => { CHART.chart && CHART.chart.timeScale().fitContent(); updateChart(); }, 50);
      }
    });
  });

  /* ---------- चार्ट TF बटन ---------- */
  document.querySelectorAll('#chartTfTabs button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#chartTfTabs button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      chartTf = b.dataset.tf;
      updateChart();
      if(CHART.chart) CHART.chart.timeScale().fitContent();
    });
  });

  /* ---------- साउंड टॉगल ---------- */
  document.getElementById('soundBtn').addEventListener('click', (e) => {
    soundOn = !soundOn;
    e.target.textContent = soundOn ? '🔊' : '🔔';
    e.target.classList.toggle('on', soundOn);
    if(soundOn){ beep(); UI.toast('सिग्नल अलर्ट साउंड चालू', ''); }
  });

  /* ---------- फुलस्क्रीन ---------- */
  document.getElementById('fsBtn').addEventListener('click', () => {
    if(!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  /* ---------- थीम स्विचर ---------- */
  const savedTheme = localStorage.getItem('nexusTheme') || 'nexus';
  applyTheme(savedTheme);
  document.querySelectorAll('.theme-dot').forEach(dot =>
    dot.addEventListener('click', () => applyTheme(dot.dataset.theme)));
  function applyTheme(name){
    if(name === 'nexus') document.body.removeAttribute('data-theme');
    else document.body.setAttribute('data-theme', name);
    localStorage.setItem('nexusTheme', name);
    document.querySelectorAll('.theme-dot').forEach(d =>
      d.classList.toggle('active', d.dataset.theme === name));
  }
})();
