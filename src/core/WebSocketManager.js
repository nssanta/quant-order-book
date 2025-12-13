/* ===========================================================
 * WebSocketManager - Единый менеджер подключений к биржам
 * Обрабатываем все WebSocket подключения в одном месте
 * =========================================================== */

/**
 * Конфигурация throttling для разных типов данных
 * Используем умный throttling чтобы не флудить DOM
 */
export const THROTTLE_CONFIG = {
  klines: 0,         // Свечи: realtime (без задержки)
  trades: 100,       // Сделки: каждые 100ms
  orderBook: 250,    // Стакан: каждые 250ms (4 FPS)
  heatmap: 500,      // Heatmap: каждые 500ms (2 FPS)
  analytics: 1000    // Аналитика: каждую секунду
};

/**
 * Буфер для агрегации данных стакана
 * Накапливаем обновления и отдаём раз в N ms
 */
class OrderBookBuffer {
  constructor() {
    this.bids = new Map(); // price -> size
    this.asks = new Map(); // price -> size
    this.lastUpdate = 0;
    this.dirty = false;
  }

  /**
   * Применяем обновление к буферу
   * @param {Object} update - { bids: [[price, size]], asks: [[price, size]] }
   */
  apply(update) {
    if (update.bids) {
      for (const [price, size] of update.bids) {
        if (parseFloat(size) === 0) {
          this.bids.delete(price);
        } else {
          this.bids.set(price, size);
        }
      }
    }
    
    if (update.asks) {
      for (const [price, size] of update.asks) {
        if (parseFloat(size) === 0) {
          this.asks.delete(price);
        } else {
          this.asks.set(price, size);
        }
      }
    }
    
    this.dirty = true;
    this.lastUpdate = Date.now();
  }

  /**
   * Получаем агрегированное состояние стакана
   * @param {number} depth - Количество уровней
   * @returns {Object} - { bids: [], asks: [] }
   */
  getState(depth = 20) {
    const sortedBids = [...this.bids.entries()]
      .map(([p, s]) => [parseFloat(p), parseFloat(s)])
      .sort((a, b) => b[0] - a[0])
      .slice(0, depth);
      
    const sortedAsks = [...this.asks.entries()]
      .map(([p, s]) => [parseFloat(p), parseFloat(s)])
      .sort((a, b) => a[0] - b[0])
      .slice(0, depth);
    
    this.dirty = false;
    return { bids: sortedBids, asks: sortedAsks };
  }

  clear() {
    this.bids.clear();
    this.asks.clear();
    this.dirty = false;
  }
}

/**
 * Главный класс для управления WebSocket подключениями
 */
export class WebSocketManager {
  constructor() {
    this.connections = new Map(); // id -> WebSocket
    this.adapters = new Map();    // exchange -> adapter class
    this.buffers = new Map();     // symbol -> OrderBookBuffer
    this.listeners = new Map();   // event -> Set<callback>
    this.throttleTimers = new Map();
    this.isReconnecting = new Map();
    
    // Запускаем throttle таймеры
    this._startThrottleLoop();
  }

  /**
   * Регистрируем адаптер для биржи
   * @param {string} exchange - Название биржи
   * @param {class} AdapterClass - Класс адаптера
   */
  registerAdapter(exchange, AdapterClass) {
    this.adapters.set(exchange, AdapterClass);
  }

  /**
   * Подключаемся к бирже
   * @param {string} exchange - Название биржи
   * @param {string} symbol - Торговая пара
   * @param {Array<string>} streams - Потоки ['kline', 'depth', 'trade']
   */
  connect(exchange, symbol, streams = ['kline', 'depth', 'trade']) {
    const AdapterClass = this.adapters.get(exchange);
    if (!AdapterClass) {
      throw new Error(`Неизвестная биржа: ${exchange}`);
    }

    const id = `${exchange}:${symbol}`;
    
    // Закрываем предыдущее подключение если есть
    this.disconnect(id);
    
    // Создаём буфер для стакана
    this.buffers.set(id, new OrderBookBuffer());
    
    // Создаём адаптер и подключаемся
    const adapter = new AdapterClass(symbol, streams);
    
    adapter.onMessage = (type, data) => {
      this._handleMessage(id, type, data);
    };
    
    adapter.onError = (error) => {
      this._emit('error', { id, error });
      this._scheduleReconnect(exchange, symbol, streams);
    };
    
    adapter.onClose = () => {
      this._emit('disconnected', { id });
    };
    
    adapter.connect();
    this.connections.set(id, adapter);
    this._emit('connected', { id, exchange, symbol });
    
    return id;
  }

  /**
   * Отключаемся от биржи
   * @param {string} id - ID подключения
   */
  disconnect(id) {
    const adapter = this.connections.get(id);
    if (adapter) {
      adapter.close();
      this.connections.delete(id);
      this.buffers.delete(id);
    }
  }

  /**
   * Отключаем все подключения
   */
  disconnectAll() {
    for (const id of this.connections.keys()) {
      this.disconnect(id);
    }
  }

  /**
   * Подписываемся на события
   * @param {string} event - Тип события
   * @param {Function} callback - Обработчик
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  /**
   * Отписываемся от события
   */
  off(event, callback) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Получаем текущее состояние стакана
   * @param {string} id - ID подключения
   * @param {number} depth - Глубина
   */
  getOrderBook(id, depth = 20) {
    const buffer = this.buffers.get(id);
    return buffer ? buffer.getState(depth) : { bids: [], asks: [] };
  }

  /**
   * Обрабатываем входящее сообщение
   * @private
   */
  _handleMessage(id, type, data) {
    switch (type) {
      case 'kline':
        // Свечи отправляем сразу (без throttle)
        this._emit('kline', { id, data });
        break;
        
      case 'depth':
      case 'depthUpdate':
        // Стакан накапливаем в буфере
        const buffer = this.buffers.get(id);
        if (buffer) {
          buffer.apply(data);
        }
        break;
        
      case 'trade':
        // Сделки буферизуем (throttle 100ms)
        this._throttledEmit('trade', { id, data }, THROTTLE_CONFIG.trades);
        break;
        
      default:
        this._emit(type, { id, data });
    }
  }

  /**
   * Запускаем цикл throttle для стаканов
   * @private
   */
  _startThrottleLoop() {
    // Обновляем стаканы каждые 250ms
    setInterval(() => {
      for (const [id, buffer] of this.buffers) {
        if (buffer.dirty) {
          this._emit('orderBookUpdate', { 
            id, 
            data: buffer.getState() 
          });
        }
      }
    }, THROTTLE_CONFIG.orderBook);
  }

  /**
   * Отправляем событие с throttle
   * @private
   */
  _throttledEmit(event, data, delay) {
    const key = `${event}:${data.id}`;
    
    if (!this.throttleTimers.has(key)) {
      this._emit(event, data);
      
      this.throttleTimers.set(key, setTimeout(() => {
        this.throttleTimers.delete(key);
      }, delay));
    }
  }

  /**
   * Планируем переподключение
   * @private
   */
  _scheduleReconnect(exchange, symbol, streams) {
    const id = `${exchange}:${symbol}`;
    
    if (this.isReconnecting.get(id)) return;
    
    this.isReconnecting.set(id, true);
    
    setTimeout(() => {
      this.isReconnecting.delete(id);
      this.connect(exchange, symbol, streams);
    }, 5000); // Переподключаемся через 5 сек
  }

  /**
   * Отправляем событие подписчикам
   * @private
   */
  _emit(event, data) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(data);
        } catch (e) {
          console.error('Ошибка в обработчике события:', e);
        }
      }
    }
  }
}

// Создаём глобальный экземпляр
export const wsManager = new WebSocketManager();
