/* ===========================================================
 * main.js - Точка входа приложения OrderBook Pro
 * Инициализируем все компоненты и связываем их вместе
 * =========================================================== */

import './styles/main.css';

import { wsManager } from './core/WebSocketManager.js';
import { storage } from './core/StorageManager.js';

import { BinanceAdapter, getBinanceKlines, getBinanceSymbols, getBinanceOrderBookSnapshot } from './exchanges/BinanceAdapter.js';
import { OKXAdapter, getOKXKlines, getOKXSymbols } from './exchanges/OKXAdapter.js';
import { BybitAdapter, getBybitKlines, getBybitSymbols } from './exchanges/BybitAdapter.js';
import { CoinbaseAdapter, getCoinbaseKlines, getCoinbaseSymbols } from './exchanges/CoinbaseAdapter.js';

import { CandlestickChart } from './charts/CandlestickChart.js';
import { DOMLadder } from './charts/DOMLadder.js';
import { DepthChart } from './charts/DepthChart.js';
import { OrderBookHeatmap } from './charts/OrderBookHeatmap.js';
import { CVDChart } from './charts/CVDChart.js';

import { analytics } from './analytics/IndexAlpha.js';
import { LevelsSummary } from './components/LevelsSummary.js';
import { SettingsPanel } from './components/SettingsPanel.js';

// ============================================
// Глобальное состояние приложения
// ============================================
const state = {
  exchange: 'binance',
  symbol: 'BTCUSDT',
  timeframe: '1h',
  orderBookMode: 'ladder',
  orderBookDepth: 20,
  currentPrice: 0,
  symbols: []
};

// ============================================
// Компоненты UI
// ============================================
let chart = null;
let orderBookView = null;
let heatmap = null;
let levelsSummary = null;
let cvdChart = null;
let settingsPanel = null;

// ============================================
// Маппинг таймфреймов для разных бирж
// ============================================
const TIMEFRAME_MAP = {
  binance: {
    '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '8h': '8h', '12h': '12h',
    '1d': '1d', '3d': '3d', '1w': '1w', '1M': '1M'
  },
  okx: {
    '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1H', '2h': '2H', '4h': '4H', '6h': '6H', '12h': '12H',
    '1d': '1D', '3d': '3D', '1w': '1W', '1M': '1M'
  },
  bybit: {
    '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
    '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720',
    '1d': 'D', '1w': 'W', '1M': 'M'
  },
  coinbase: {
    '1m': 'ONE_MINUTE', '5m': 'FIVE_MINUTE', '15m': 'FIFTEEN_MINUTE',
    '1h': 'ONE_HOUR', '6h': 'SIX_HOUR', '1d': 'ONE_DAY'
  }
};

// ============================================
// Инициализация
// ============================================
async function init() {
  console.log('🚀 Инициализируем OrderBook Pro...');

  // Загружаем сохранённые настройки
  const settings = storage.getSettings();
  Object.assign(state, settings);

  // Регистрируем адаптеры бирж
  wsManager.registerAdapter('binance', BinanceAdapter);
  wsManager.registerAdapter('okx', OKXAdapter);
  wsManager.registerAdapter('bybit', BybitAdapter);
  wsManager.registerAdapter('coinbase', CoinbaseAdapter);

  // Инициализируем UI
  initUI();

  // Подписываемся на WebSocket события
  setupWebSocketHandlers();

  // Загружаем список символов и подключаемся
  await loadSymbols();
  await connect();

  console.log('✅ OrderBook Pro готов!');
}

// ============================================
// Инициализация UI компонентов
// ============================================
function initUI() {
  // Создаём свечной график
  const chartArea = document.getElementById('chart-area');
  chart = new CandlestickChart(chartArea, { theme: 'dark', showVolume: true });

  // Создаём Order Book view (по умолчанию ladder)
  const orderBookContent = document.getElementById('orderbook-content');
  orderBookView = new DOMLadder(orderBookContent, { depth: state.orderBookDepth });

  // Создаём heatmap (поверх графика) и синхронизируем с chart
  heatmap = new OrderBookHeatmap(chartArea, { opacity: 0.6 });
  heatmap.attachToChart(chart);  // Синхронизация координат!

  // Создаём сводку ключевых уровней
  const levelsSummaryContainer = document.getElementById('levels-summary');
  if (levelsSummaryContainer) {
    levelsSummary = new LevelsSummary(levelsSummaryContainer);
  }

  // Создаём CVD график
  const cvdContainer = document.getElementById('cvd-chart');
  if (cvdContainer) {
    cvdChart = new CVDChart(cvdContainer, { height: 100 });
  }

  // Создаём панель настроек
  settingsPanel = new SettingsPanel({
    onSettingsChange: applySettings
  });

  // Обновляем UI с текущим состоянием
  updateUIState();

  // Инициализируем обработчики событий
  initEventHandlers();
}

/**
 * Применяем настройки к компонентам
 */
function applySettings(settings) {
  console.log('Применяем настройки:', settings);

  // Применяем к графику
  if (chart && chart.candleSeries) {
    chart.candleSeries.applyOptions({
      upColor: settings.candleUpColor,
      downColor: settings.candleDownColor,
      borderUpColor: settings.candleUpColor,
      borderDownColor: settings.candleDownColor,
      wickUpColor: settings.candleUpColor,
      wickDownColor: settings.candleDownColor
    });
  }

  // Применяем к heatmap
  if (heatmap) {
    heatmap.setColors(settings.heatmapBidColor, settings.heatmapAskColor);
    heatmap.setOpacity(settings.heatmapOpacity);
    if (heatmap.setBinsCount) {
      heatmap.setBinsCount(settings.heatmapLevels);
    }
    if (heatmap.setShowVolumeLabels) {
      heatmap.setShowVolumeLabels(settings.heatmapShowLabels);
    }
    // Принудительно перерисовываем heatmap
    if (heatmap.forceRender) {
      heatmap.forceRender();
    }
  }

  // Применяем глубину к стакану
  if (orderBookView?.setDepth) {
    orderBookView.setDepth(settings.orderBookDepth);
  }
}

// ============================================
// Обработчики событий UI
// ============================================
function initEventHandlers() {
  // Кнопка закрытия sidebar (мобильные)
  const sidebarClose = document.getElementById('sidebar-close');
  const sidebar = document.getElementById('sidebar');
  if (sidebarClose && sidebar) {
    sidebarClose.addEventListener('click', () => {
      sidebar.classList.remove('open');
    });
  }

  // Селектор биржи
  const exchangeSelector = document.getElementById('exchange-selector');
  exchangeSelector.querySelector('.selector__trigger').addEventListener('click', (e) => {
    exchangeSelector.classList.toggle('open');
  });

  exchangeSelector.querySelectorAll('.selector__option').forEach(opt => {
    opt.addEventListener('click', async () => {
      const newExchange = opt.dataset.exchange;
      if (newExchange !== state.exchange) {
        state.exchange = newExchange;
        storage.updateSetting('exchange', newExchange);
        exchangeSelector.classList.remove('open');
        updateUIState();
        await loadSymbols();
        await connect();
      }
    });
  });

  // Селектор символа
  const symbolSelector = document.getElementById('symbol-selector');
  symbolSelector.querySelector('.selector__trigger').addEventListener('click', () => {
    symbolSelector.classList.toggle('open');
  });

  // Поиск символа
  document.getElementById('symbol-search')?.addEventListener('input', (e) => {
    filterSymbols(e.target.value);
  });

  // Таймфреймы (кнопки)
  document.querySelectorAll('.timeframe-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tf = btn.dataset.tf;
      if (tf !== state.timeframe) {
        state.timeframe = tf;
        storage.updateSetting('timeframe', tf);

        document.querySelectorAll('.timeframe-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Синхронизируем с мобильным dropdown
        const select = document.getElementById('timeframe-select');
        if (select) select.value = tf;

        await loadKlines();
      }
    });
  });

  // Таймфреймы (мобильный dropdown)
  document.getElementById('timeframe-select')?.addEventListener('change', async (e) => {
    const tf = e.target.value;
    if (tf !== state.timeframe) {
      state.timeframe = tf;
      storage.updateSetting('timeframe', tf);

      // Синхронизируем с кнопками
      document.querySelectorAll('.timeframe-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tf === tf);
      });

      // Синхронизируем с header dropdown
      const headerSelect = document.getElementById('header-timeframe-select');
      if (headerSelect) headerSelect.value = tf;

      await loadKlines();
    }
  });

  // Таймфреймы (header dropdown - мобильный)
  document.getElementById('header-timeframe-select')?.addEventListener('change', async (e) => {
    const tf = e.target.value;
    if (tf !== state.timeframe) {
      state.timeframe = tf;
      storage.updateSetting('timeframe', tf);

      // Синхронизируем с кнопками
      document.querySelectorAll('.timeframe-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tf === tf);
      });

      // Синхронизируем с другим dropdown
      const otherSelect = document.getElementById('timeframe-select');
      if (otherSelect) otherSelect.value = tf;

      await loadKlines();
    }
  });

  // Режимы Order Book
  document.querySelectorAll('.orderbook__modes .btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode !== state.orderBookMode) {
        state.orderBookMode = mode;
        storage.updateSetting('orderBookMode', mode);

        document.querySelectorAll('.orderbook__modes .btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        switchOrderBookMode(mode);
      }
    });
  });

  // Глубина стакана
  document.getElementById('depth-select')?.addEventListener('change', (e) => {
    state.orderBookDepth = parseInt(e.target.value);
    storage.updateSetting('orderBookDepth', state.orderBookDepth);
    if (orderBookView?.setDepth) {
      orderBookView.setDepth(state.orderBookDepth);
    }
  });

  // Fullscreen
  document.getElementById('fullscreen-btn')?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  });

  // Настройки
  document.getElementById('settings-btn')?.addEventListener('click', () => {
    if (settingsPanel) {
      settingsPanel.toggle();
    }
  });

  // Heatmap toggle
  document.getElementById('heatmap-btn')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    btn.classList.toggle('active');
    const isActive = btn.classList.contains('active');

    if (heatmap) {
      heatmap.setVisible(isActive);
    }
  });

  // Индикаторы (placeholder для будущего)
  document.getElementById('indicators-btn')?.addEventListener('click', () => {
    showToast('Индикаторы скоро будут добавлены', 'info');
  });

  // ============================================
  // Bottom Navigation (Mobile App)
  // ============================================
  document.querySelectorAll('.bottom-nav__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;

      // Активируем кнопку
      document.querySelectorAll('.bottom-nav__btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Переключаем вкладки
      handleMobileTabSwitch(tab);
    });
  });

  // Закрываем дропдауны при клике вне
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.selector')) {
      document.querySelectorAll('.selector.open').forEach(s => s.classList.remove('open'));
    }
  });
}

// ============================================
// WebSocket обработчики
// ============================================
function setupWebSocketHandlers() {
  // Обновление свечи
  wsManager.on('kline', ({ data }) => {
    if (chart) {
      chart.updateCandle(data);
      state.currentPrice = data.close;
    }
  });

  // Обновление стакана
  wsManager.on('orderBookUpdate', ({ data }) => {
    // Обновляем Order Book view
    if (orderBookView?.update) {
      orderBookView.update(data);
    }

    // Обновляем heatmap
    if (heatmap) {
      heatmap.update(data, state.currentPrice);
    }

    // Обновляем аналитику
    analytics.addOrderBook(data);
    updateAnalytics(data);

    // Обновляем сводку уровней
    if (levelsSummary) {
      levelsSummary.update(data);
    }
  });

  // Сделки
  wsManager.on('trade', ({ data }) => {
    analytics.addTrade(data);
    state.currentPrice = data.price;

    // Обновляем CVD график
    if (cvdChart) {
      cvdChart.addTrade({
        price: data.price,
        volume: data.volume,
        side: data.isBuy ? 'buy' : 'sell',
        time: data.time
      });
    }
  });

  // Подключение
  wsManager.on('connected', ({ id, exchange, symbol }) => {
    console.log(`✅ Подключено: ${exchange} ${symbol}`);
    hideLoading();
    showToast(`Подключено к ${exchange}`, 'success');
  });

  // Ошибка
  wsManager.on('error', ({ error }) => {
    console.error('❌ WebSocket ошибка:', error);
    showToast('Ошибка подключения', 'error');
  });
}

// ============================================
// Подключение к бирже
// ============================================
async function connect() {
  showLoading();

  // Отключаемся от предыдущего
  wsManager.disconnectAll();

  // Очищаем heatmap при смене символа
  if (heatmap) {
    heatmap.clear();
  }
  if (cvdChart) {
    cvdChart.clear();
  }

  // Загружаем исторические свечи
  await loadKlines();

  // Загружаем полный снэпшот стакана через REST
  await loadOrderBookSnapshot();

  // Подключаемся к WebSocket
  const interval = TIMEFRAME_MAP[state.exchange]?.[state.timeframe] || state.timeframe;

  wsManager.connect(state.exchange, state.symbol, ['kline', 'depth', 'trade'], {
    interval,
    depthLevel: state.orderBookDepth
  });
}

// ============================================
// Загружаем снэпшот стакана через REST
// ============================================
async function loadOrderBookSnapshot() {
  try {
    let snapshot = null;

    switch (state.exchange) {
      case 'binance':
        // Загружаем максимум уровней (5000 - максимум Binance API!)
        snapshot = await getBinanceOrderBookSnapshot(state.symbol, 5000);
        break;
      // TODO: Добавить OKX, Bybit
    }

    if (snapshot && snapshot.bids?.length && snapshot.asks?.length) {
      // Диапазон цен в стакане
      const minBidPrice = parseFloat(snapshot.bids[snapshot.bids.length - 1][0]);
      const maxBidPrice = parseFloat(snapshot.bids[0][0]);
      const minAskPrice = parseFloat(snapshot.asks[0][0]);
      const maxAskPrice = parseFloat(snapshot.asks[snapshot.asks.length - 1][0]);

      console.log(`✅ Загружен снэпшот стакана:`);
      console.log(`   📊 ${snapshot.bids.length} bids (${minBidPrice.toFixed(2)} - ${maxBidPrice.toFixed(2)})`);
      console.log(`   📊 ${snapshot.asks.length} asks (${minAskPrice.toFixed(2)} - ${maxAskPrice.toFixed(2)})`);
      console.log(`   📏 Общий диапазон: ${minBidPrice.toFixed(2)} - ${maxAskPrice.toFixed(2)}`);

      // Обновляем Order Book view
      if (orderBookView?.update) {
        orderBookView.update(snapshot);
      }

      // Обновляем heatmap (используем update, не addSnapshot)
      if (heatmap) {
        heatmap.update(snapshot, state.currentPrice);
      }

      // Обновляем аналитику
      analytics.addOrderBook(snapshot);
      updateAnalytics(snapshot);

      if (levelsSummary) {
        levelsSummary.update(snapshot);
      }
    }
  } catch (e) {
    console.error('Ошибка загрузки снэпшота стакана:', e);
  }
}

// ============================================
// Загружаем исторические свечи
// ============================================
async function loadKlines() {
  showLoading();

  const interval = TIMEFRAME_MAP[state.exchange]?.[state.timeframe] || state.timeframe;
  let klines = [];

  try {
    switch (state.exchange) {
      case 'binance':
        klines = await getBinanceKlines(state.symbol, interval);
        break;
      case 'okx':
        klines = await getOKXKlines(state.symbol, interval);
        break;
      case 'bybit':
        klines = await getBybitKlines(state.symbol, interval);
        break;
      case 'coinbase':
        klines = await getCoinbaseKlines(state.symbol, interval);
        break;
    }

    if (klines.length > 0) {
      chart.setData(klines);
      state.currentPrice = klines[klines.length - 1].close;
    }
  } catch (e) {
    console.error('Ошибка загрузки свечей:', e);
    showToast('Ошибка загрузки данных', 'error');
  }

  hideLoading();
}

// ============================================
// Загружаем список символов
// ============================================
async function loadSymbols() {
  try {
    switch (state.exchange) {
      case 'binance':
        state.symbols = await getBinanceSymbols();
        break;
      case 'okx':
        state.symbols = await getOKXSymbols();
        break;
      case 'bybit':
        state.symbols = await getBybitSymbols();
        break;
      case 'coinbase':
        state.symbols = await getCoinbaseSymbols();
        break;
    }

    renderSymbolOptions(state.symbols);

    // Проверяем что текущий символ есть в списке
    const hasSymbol = state.symbols.some(s => s.symbol === state.symbol);
    if (!hasSymbol && state.symbols.length > 0) {
      state.symbol = state.symbols[0].symbol;
      storage.updateSetting('symbol', state.symbol);
      updateUIState();
    }
  } catch (e) {
    console.error('Ошибка загрузки списка пар:', e);
  }
}

// ============================================
// Рендерим список символов в dropdown
// ============================================
function renderSymbolOptions(symbols) {
  const container = document.getElementById('symbol-options');
  if (!container) return;

  container.innerHTML = symbols.slice(0, 100).map(s => `
    <div class="selector__option ${s.symbol === state.symbol ? 'selected' : ''}" data-symbol="${s.symbol}">
      <span>${s.baseAsset}/${s.quoteAsset}</span>
    </div>
  `).join('');

  // Обработчики
  container.querySelectorAll('.selector__option').forEach(opt => {
    opt.addEventListener('click', async () => {
      const symbol = opt.dataset.symbol;
      if (symbol !== state.symbol) {
        state.symbol = symbol;
        storage.updateSetting('symbol', symbol);
        document.getElementById('symbol-selector').classList.remove('open');
        updateUIState();
        await connect();
      }
    });
  });
}

// ============================================
// Фильтруем символы по поиску
// ============================================
function filterSymbols(query) {
  const filtered = state.symbols.filter(s =>
    s.symbol.toLowerCase().includes(query.toLowerCase()) ||
    s.baseAsset.toLowerCase().includes(query.toLowerCase())
  );
  renderSymbolOptions(filtered);
}

// ============================================
// Переключаем режим Order Book
// ============================================
function switchOrderBookMode(mode) {
  const container = document.getElementById('orderbook-content');

  // Уничтожаем текущий view
  if (orderBookView?.destroy) {
    orderBookView.destroy();
  }

  container.innerHTML = '';

  switch (mode) {
    case 'ladder':
      orderBookView = new DOMLadder(container, { depth: state.orderBookDepth });
      break;
    case 'depth':
      orderBookView = new DepthChart(container);
      break;
    case 'heatmap':
      // Для heatmap показываем mini версию в sidebar
      orderBookView = new DOMLadder(container, { depth: 10, showTotal: false });
      break;
  }

  // Показываем/скрываем основной heatmap
  if (heatmap) {
    heatmap.setOpacity(mode === 'heatmap' ? 0.7 : 0.3);
  }
}

// ============================================
// Обновляем аналитику
// ============================================
function updateAnalytics(orderBook) {
  const metrics = analytics.getMetrics(orderBook);

  // Обновляем DOM
  const alphaEl = document.getElementById('metric-alpha');
  const deltaEl = document.getElementById('metric-delta');
  const cvdEl = document.getElementById('metric-cvd');
  const imbalanceEl = document.getElementById('metric-imbalance');
  const spreadEl = document.getElementById('metric-spread');

  if (alphaEl) {
    alphaEl.textContent = metrics.indexAlpha;
    alphaEl.classList.toggle('metric__value--positive', metrics.raw.indexAlpha > 1);
    alphaEl.classList.toggle('metric__value--negative', metrics.raw.indexAlpha < 1);
  }

  if (deltaEl) {
    deltaEl.textContent = metrics.delta;
    deltaEl.classList.toggle('metric__value--positive', metrics.raw.delta > 0);
    deltaEl.classList.toggle('metric__value--negative', metrics.raw.delta < 0);
  }

  if (cvdEl) {
    cvdEl.textContent = metrics.cvd;
    cvdEl.classList.toggle('metric__value--positive', metrics.raw.cvd > 0);
    cvdEl.classList.toggle('metric__value--negative', metrics.raw.cvd < 0);
  }

  if (imbalanceEl) {
    imbalanceEl.textContent = metrics.imbalance;
    imbalanceEl.classList.toggle('metric__value--positive', metrics.raw.imbalance > 0.1);
    imbalanceEl.classList.toggle('metric__value--negative', metrics.raw.imbalance < -0.1);
  }

  // Spread
  if (spreadEl && orderBook.bids?.length && orderBook.asks?.length) {
    const spread = orderBook.asks[0][0] - orderBook.bids[0][0];
    spreadEl.textContent = spread.toFixed(2);
  }
}

// ============================================
// Обновляем UI из state
// ============================================
function updateUIState() {
  // Биржа
  const exchangeLabel = document.getElementById('exchange-label');
  if (exchangeLabel) {
    exchangeLabel.textContent = state.exchange.charAt(0).toUpperCase() + state.exchange.slice(1);
  }

  // Символ
  const symbolLabel = document.getElementById('symbol-label');
  if (symbolLabel) {
    symbolLabel.textContent = state.symbol;
  }

  // Глубина
  const depthSelect = document.getElementById('depth-select');
  if (depthSelect) {
    depthSelect.value = state.orderBookDepth;
  }

  // Активный таймфрейм
  document.querySelectorAll('.timeframe-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tf === state.timeframe);
  });

  // Активный режим Order Book
  document.querySelectorAll('.orderbook__modes .btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === state.orderBookMode);
  });
}

// ============================================
// Mobile Tab Navigation
// ============================================
function handleMobileTabSwitch(tab) {
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.querySelector('.main-content');

  // Скрываем всё
  sidebar?.classList.remove('open');

  switch (tab) {
    case 'chart':
      // Показываем график (по умолчанию)
      break;

    case 'draw':
      // Открыть панель рисования
      showDrawPanel();
      break;

    case 'book':
      // Показываем Order Book
      sidebar?.classList.add('open');
      break;

    case 'info':
      // Показываем Info Panel с описанием метрик
      showInfoPanel();
      break;

    case 'settings':
      // Открываем настройки
      if (settingsPanel) {
        settingsPanel.open();
      }
      break;
  }
}

/**
 * Показываем панель рисования
 */
function showDrawPanel() {
  let drawPanel = document.getElementById('draw-panel');

  if (!drawPanel) {
    drawPanel = document.createElement('div');
    drawPanel.id = 'draw-panel';
    drawPanel.className = 'info-panel'; // Используем тот же стиль
    drawPanel.innerHTML = `
      <div class="info-panel__overlay" onclick="this.parentNode.classList.remove('open')"></div>
      <div class="info-panel__content">
        <div class="info-panel__header">
          <h2>✏️ Рисование</h2>
          <button class="info-panel__close" onclick="this.closest('.info-panel').classList.remove('open')">✕</button>
        </div>
        <div class="info-panel__body">
          <div class="draw-tools">
             <button class="btn btn--block" onclick="startDrawing('trendLine')">📈 Линия тренда</button>
             <button class="btn btn--block" onclick="startDrawing('rect')" style="margin-top: 10px;">⬜ Прямоугольник</button>
             <button class="btn btn--block btn--outline" onclick="clearDrawings()" style="margin-top: 20px;">🗑️ Очистить все</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(drawPanel);

    // Глобальные функции для кнопок
    window.startDrawing = (type) => {
        if (chart) {
            chart.startDrawing(type);
            document.getElementById('draw-panel').classList.remove('open');
            showToast(`Инструмент: ${type === 'trendLine' ? 'Линия' : 'Прямоугольник'}`, 'success');
        }
    };

    window.clearDrawings = () => {
        if (chart && chart.chart) {
            chart.chart.removeOverlay();
            chart.saveDrawings();
            document.getElementById('draw-panel').classList.remove('open');
            showToast('Все рисунки удалены', 'info');
        }
    };

    // Инжектим стили если еще нет
    injectInfoPanelStyles();
  }

  drawPanel.classList.add('open');
}

/**
 * Показываем панель Info с описанием метрик
 */
function showInfoPanel() {
  // Создаём модальное окно с описанием
  let infoPanel = document.getElementById('info-panel');

  if (!infoPanel) {
    infoPanel = document.createElement('div');
    infoPanel.id = 'info-panel';
    infoPanel.className = 'info-panel';
    infoPanel.innerHTML = `
      <div class="info-panel__overlay" onclick="this.parentNode.classList.remove('open')"></div>
      <div class="info-panel__content">
        <div class="info-panel__header">
          <h2>📖 Метрики</h2>
          <button class="info-panel__close" onclick="this.closest('.info-panel').classList.remove('open')">✕</button>
        </div>
        <div class="info-panel__body">
          <div class="info-item">
            <h3>Index α (Alpha)</h3>
            <p>Соотношение силы покупателей к продавцам. > 1 = покупатели сильнее, < 1 = продавцы сильнее.</p>
          </div>
          <div class="info-item">
            <h3>Delta</h3>
            <p>Разница между объёмом покупок и продаж. + = больше покупают, - = больше продают.</p>
          </div>
          <div class="info-item">
            <h3>CVD (Cumulative Volume Delta)</h3>
            <p>Накопленная дельта за период. Показывает тренд давления покупателей/продавцов.</p>
          </div>
          <div class="info-item">
            <h3>Imbalance</h3>
            <p>Дисбаланс стакана. + = больше bid (покупок), - = больше ask (продаж).</p>
          </div>
          <div class="info-item">
            <h3>Spread</h3>
            <p>Разница между лучшей ценой продажи и покупки. Меньше = выше ликвидность.</p>
          </div>
          <div class="info-item">
            <h3>Heatmap</h3>
            <p>Зелёные зоны = bid (ордера на покупку). Красные = ask (ордера на продажу). Ярче = больше объём.</p>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(infoPanel);

    // Инжектим стили
    injectInfoPanelStyles();
  }

  infoPanel.classList.add('open');
}

function injectInfoPanelStyles() {
  if (document.getElementById('info-panel-styles')) return;

  const style = document.createElement('style');
  style.id = 'info-panel-styles';
  style.textContent = `
    .info-panel {
      position: fixed;
      inset: 0;
      z-index: 300;
      opacity: 0;
      visibility: hidden;
      transition: all 0.3s ease;
    }
    .info-panel.open {
      opacity: 1;
      visibility: visible;
    }
    .info-panel__overlay {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(4px);
    }
    .info-panel__content {
      position: absolute;
      bottom: 60px;
      left: 0;
      right: 0;
      max-height: 70vh;
      background: var(--bg-secondary, #12121a);
      border-radius: 20px 20px 0 0;
      overflow: hidden;
      transform: translateY(100%);
      transition: transform 0.3s ease;
    }
    .info-panel.open .info-panel__content {
      transform: translateY(0);
    }
    .info-panel__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.08));
    }
    .info-panel__header h2 {
      margin: 0;
      font-size: 18px;
    }
    .info-panel__close {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 20px;
      cursor: pointer;
    }
    .info-panel__body {
      padding: 16px 20px;
      overflow-y: auto;
      max-height: calc(70vh - 60px);
    }
    .info-item {
      margin-bottom: 16px;
      padding: 12px;
      background: var(--bg-tertiary, #1a1a24);
      border-radius: 8px;
    }
    .info-item h3 {
      margin: 0 0 8px 0;
      font-size: 14px;
      color: var(--accent-blue, #2979ff);
    }
    .info-item p {
      margin: 0;
      font-size: 13px;
      color: var(--text-secondary, #8b8b8f);
      line-height: 1.5;
    }
  `;
  document.head.appendChild(style);
}

// ============================================
// Хелперы
// ============================================
function showLoading() {
  const loading = document.getElementById('chart-loading');
  if (loading) loading.style.display = 'flex';
}

function hideLoading() {
  const loading = document.getElementById('chart-loading');
  if (loading) loading.style.display = 'none';
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// ============================================
// Запускаем приложение
// ============================================
document.addEventListener('DOMContentLoaded', init);
