/* =========================================================
   config.js — सेंट्रल सेटिंग्स
   ========================================================= */
const CONFIG = {
  symbol: 'BTCUSDT',
  // Binance पब्लिक endpoints (कोई API key ज़रूरत नहीं)
  spotBase: 'https://api.binance.com',
  futBase:  'https://fapi.binance.com',
  // WebSocket से लाइव price
  wsUrl: 'wss://stream.binance.com:9443/ws/btcusdt@trade',

  // हर टाइमफ्रेम के लिए candle limit
  timeframes: [
    { key: '5m',  label: '5 मिनट',  limit: 200 },
    { key: '15m', label: '15 मिनट', limit: 200 },
    { key: '30m', label: '30 मिनट', limit: 200 },
  ],

  // किस TF का इंडिकेटर पैनल में दिखाना है
  primaryTf: '15m',

  // refresh interval (ms)
  refreshMs: 15000,

  // indicator परिमाण
  emaFast: 9,
  emaMid: 21,
  emaSlow: 50,
  emaTrend: 200,
  rsiPeriod: 14,
  atrPeriod: 14,
  bbPeriod: 20,
  volProfileBins: 14,
};
