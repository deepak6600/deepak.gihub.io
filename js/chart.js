/* =========================================================
   chart.js — TradingView Lightweight Charts रैपर
   लाइव कैंडल + EMA + S/R + ट्रेड स्तर + Future projection
   ========================================================= */
const CHART = {
  chart: null, candle: null, emaFast: null, emaSlow: null,
  projUp: null, projDn: null, projMid: null,
  priceLines: [],
  ready: false,

  init(elId){
    if(typeof LightweightCharts === 'undefined') return false;
    const el = document.getElementById(elId);
    if(!el) return false;

    this.chart = LightweightCharts.createChart(el, {
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#b9c5dc', fontFamily: 'JetBrains Mono' },
      grid: { vertLines: { color: 'rgba(94,124,180,0.08)' }, horzLines: { color: 'rgba(94,124,180,0.08)' } },
      rightPriceScale: { borderColor: 'rgba(94,124,180,0.2)' },
      timeScale: { borderColor: 'rgba(94,124,180,0.2)', timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
      autoSize: true,
    });

    this.candle = this.chart.addCandlestickSeries({
      upColor: '#1bf29a', downColor: '#ff5d7a',
      borderUpColor: '#1bf29a', borderDownColor: '#ff5d7a',
      wickUpColor: '#1bf29a', wickDownColor: '#ff5d7a',
    });
    this.emaFast = this.chart.addLineSeries({ color: '#3aeaff', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    this.emaSlow = this.chart.addLineSeries({ color: '#b288ff', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    this.projUp = this.chart.addLineSeries({ color: 'rgba(27,242,154,0.7)', lineWidth: 2, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
    this.projDn = this.chart.addLineSeries({ color: 'rgba(255,93,122,0.7)', lineWidth: 2, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
    this.projMid = this.chart.addLineSeries({ color: 'rgba(255,194,77,0.9)', lineWidth: 1, lineStyle: 1, priceLineVisible: false, lastValueVisible: false });

    this.ready = true;
    return true;
  },

  setData(candles, emaFastP, emaSlowP){
    if(!this.ready) return;
    const cd = candles.map(c => ({ time: Math.floor(c.t / 1000), open: c.o, high: c.h, low: c.l, close: c.c }));
    this.candle.setData(cd);

    const closes = candles.map(c => c.c);
    const ef = TA.emaSeries(closes, emaFastP);
    const es = TA.emaSeries(closes, emaSlowP);
    this.emaFast.setData(candles.map((c, i) => ef[i] != null ? { time: Math.floor(c.t / 1000), value: ef[i] } : null).filter(Boolean));
    this.emaSlow.setData(candles.map((c, i) => es[i] != null ? { time: Math.floor(c.t / 1000), value: es[i] } : null).filter(Boolean));
  },

  /* S/R एवं ट्रेड स्तर price lines के रूप में */
  setLevels(levels){
    if(!this.ready) return;
    this.priceLines.forEach(pl => this.candle.removePriceLine(pl));
    this.priceLines = [];
    levels.forEach(l => {
      this.priceLines.push(this.candle.createPriceLine({
        price: l.price, color: l.color, lineWidth: l.width || 1,
        lineStyle: l.dashed ? 2 : 0, axisLabelVisible: true, title: l.title,
      }));
    });
  },

  /* Future projection cone */
  setProjection(lastCandle, intervalSec, steps, mid, upper, lower){
    if(!this.ready || !lastCandle) return;
    const t0 = Math.floor(lastCandle.t / 1000);
    const up = [], dn = [], md = [];
    for(let i = 0; i <= steps; i++){
      const t = t0 + i * intervalSec;
      const f = i / steps;
      up.push({ time: t, value: lastCandle.c + (upper - lastCandle.c) * f });
      dn.push({ time: t, value: lastCandle.c + (lower - lastCandle.c) * f });
      md.push({ time: t, value: lastCandle.c + (mid - lastCandle.c) * f });
    }
    try{ this.projUp.setData(up); this.projDn.setData(dn); this.projMid.setData(md); }catch(e){}
  },

  clearProjection(){
    if(!this.ready) return;
    try{ this.projUp.setData([]); this.projDn.setData([]); this.projMid.setData([]); }catch(e){}
  },
};
