/* ===========================================================
 * DOMLadder - Вертикальный стакан (DOM Ladder)
 * Классическая визуализация Order Book
 * =========================================================== */

/**
 * Компонент стакана в виде вертикальной лестницы
 * Быстрый рендер через innerHTML (не React, максимум скорость)
 */
export class DOMLadder {
  constructor(container, options = {}) {
    this.container = typeof container === 'string'
      ? document.querySelector(container)
      : container;

    this.options = {
      depth: 20,           // Количество уровней
      precision: 2,        // Знаки после запятой для цены
      qtyPrecision: 4,     // Знаки для объёма
      showTotal: true,     // Показывать накопленный объём
      animate: true,       // Анимация обновлений
      ...options
    };

    this.data = { bids: [], asks: [] };
    this.maxVolume = 0;

    this._init();
  }

  /**
   * Инициализируем DOM
   * @private
   */
  _init() {
    this.container.classList.add('dom-ladder');
    this.container.innerHTML = `
      <div class="dom-ladder__header">
        <span class="dom-ladder__col">Объём</span>
        <span class="dom-ladder__col dom-ladder__col--price">Цена</span>
        <span class="dom-ladder__col">Объём</span>
      </div>
      <div class="dom-ladder__body">
        <div class="dom-ladder__asks"></div>
        <div class="dom-ladder__spread"></div>
        <div class="dom-ladder__bids"></div>
      </div>
    `;

    this.asksContainer = this.container.querySelector('.dom-ladder__asks');
    this.bidsContainer = this.container.querySelector('.dom-ladder__bids');
    this.spreadElement = this.container.querySelector('.dom-ladder__spread');

    // Добавляем стили если их нет
    this._injectStyles();
  }

  /**
   * Обновляем данные стакана
   * @param {Object} data - { bids: [[price, qty]], asks: [[price, qty]] }
   */
  update(data) {
    this.data = data;

    // Вычисляем макс объём для размера баров
    const allVolumes = [
      ...data.bids.map(b => parseFloat(b[1])),
      ...data.asks.map(a => parseFloat(a[1]))
    ];
    this.maxVolume = Math.max(...allVolumes, 0.001);

    // Рендерим asks (сверху вниз, от высокой цены к низкой)
    this._renderAsks();

    // Рендерим spread
    this._renderSpread();

    // Рендерим bids (сверху вниз, от высокой цены к низкой)
    this._renderBids();
  }

  /**
   * Рендерим asks
   * @private
   */
  _renderAsks() {
    const asks = this.data.asks.slice(0, this.options.depth);
    // Asks показываем снизу вверх (переворачиваем)
    const reversed = [...asks].reverse();

    let total = 0;
    const rows = reversed.map(([price, qty]) => {
      const qtyNum = parseFloat(qty);
      total += qtyNum;
      const percent = (qtyNum / this.maxVolume) * 100;

      return `
        <div class="dom-ladder__row dom-ladder__row--ask">
          <div class="dom-ladder__bar dom-ladder__bar--ask" style="width: ${percent}%"></div>
          <span class="dom-ladder__cell">${this.options.showTotal ? total.toFixed(this.options.qtyPrecision) : ''}</span>
          <span class="dom-ladder__cell dom-ladder__cell--price dom-ladder__cell--ask">
            ${parseFloat(price).toFixed(this.options.precision)}
          </span>
          <span class="dom-ladder__cell dom-ladder__cell--qty">${qtyNum.toFixed(this.options.qtyPrecision)}</span>
        </div>
      `;
    });

    this.asksContainer.innerHTML = rows.join('');
  }

  /**
   * Рендерим bids
   * @private
   */
  _renderBids() {
    const bids = this.data.bids.slice(0, this.options.depth);

    let total = 0;
    const rows = bids.map(([price, qty]) => {
      const qtyNum = parseFloat(qty);
      total += qtyNum;
      const percent = (qtyNum / this.maxVolume) * 100;

      return `
        <div class="dom-ladder__row dom-ladder__row--bid">
          <div class="dom-ladder__bar dom-ladder__bar--bid" style="width: ${percent}%"></div>
          <span class="dom-ladder__cell dom-ladder__cell--qty">${qtyNum.toFixed(this.options.qtyPrecision)}</span>
          <span class="dom-ladder__cell dom-ladder__cell--price dom-ladder__cell--bid">
            ${parseFloat(price).toFixed(this.options.precision)}
          </span>
          <span class="dom-ladder__cell">${this.options.showTotal ? total.toFixed(this.options.qtyPrecision) : ''}</span>
        </div>
      `;
    });

    this.bidsContainer.innerHTML = rows.join('');
  }

  /**
   * Рендерим spread
   * @private
   */
  _renderSpread() {
    const bestAsk = this.data.asks[0]?.[0] || 0;
    const bestBid = this.data.bids[0]?.[0] || 0;

    if (!bestAsk || !bestBid) {
      this.spreadElement.innerHTML = '<span>—</span>';
      return;
    }

    const spread = bestAsk - bestBid;
    const spreadPercent = ((spread / bestAsk) * 100).toFixed(3);

    this.spreadElement.innerHTML = `
      <span class="dom-ladder__spread-value">${spread.toFixed(this.options.precision)}</span>
      <span class="dom-ladder__spread-percent">(${spreadPercent}%)</span>
    `;
  }

  /**
   * Устанавливаем глубину отображения
   * @param {number} depth
   */
  setDepth(depth) {
    this.options.depth = depth;
    if (this.data.bids.length || this.data.asks.length) {
      this.update(this.data);
    }
  }

  /**
   * Устанавливаем точность цены
   * @param {number} precision
   */
  setPrecision(precision) {
    this.options.precision = precision;
    if (this.data.bids.length || this.data.asks.length) {
      this.update(this.data);
    }
  }

  /**
   * Добавляем встроенные стили
   * @private
   */
  _injectStyles() {
    if (document.getElementById('dom-ladder-styles')) return;

    const style = document.createElement('style');
    style.id = 'dom-ladder-styles';
    style.textContent = `
      .dom-ladder {
        display: flex;
        flex-direction: column;
        height: 100%;
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 11px;
        color: var(--text-primary, #e8e8ea);
        background: var(--bg-secondary, #12121a);
      }
      
      .dom-ladder__header {
        display: flex;
        padding: 8px;
        border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.08));
        color: var(--text-muted, #5a5a5e);
        font-size: 10px;
        text-transform: uppercase;
      }
      
      .dom-ladder__col {
        flex: 1;
        text-align: right;
      }
      
      .dom-ladder__col--price {
        text-align: center;
      }
      
      .dom-ladder__body {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
      }
      
      .dom-ladder__asks {
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        flex: 1;
      }
      
      .dom-ladder__bids {
        flex: 1;
      }
      
      .dom-ladder__spread {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 6px;
        background: var(--bg-tertiary, #1a1a24);
        border-top: 1px solid var(--border-color);
        border-bottom: 1px solid var(--border-color);
      }
      
      .dom-ladder__spread-value {
        font-weight: 600;
        color: var(--text-primary);
      }
      
      .dom-ladder__spread-percent {
        color: var(--text-muted);
      }
      
      .dom-ladder__row {
        display: flex;
        align-items: center;
        height: 22px;
        position: relative;
      }
      
      .dom-ladder__row:hover {
        background: var(--bg-hover, #22222e);
      }
      
      .dom-ladder__bar {
        position: absolute;
        top: 0;
        bottom: 0;
        opacity: 0.25;
        transition: width 0.15s ease;
      }
      
      .dom-ladder__bar--ask {
        right: 0;
        background: var(--accent-red, #ff1744);
      }
      
      .dom-ladder__bar--bid {
        left: 0;
        background: var(--accent-green, #00c853);
      }
      
      .dom-ladder__cell {
        flex: 1;
        padding: 0 6px;
        text-align: right;
        z-index: 1;
      }
      
      .dom-ladder__cell--price {
        text-align: center;
        font-weight: 600;
      }
      
      .dom-ladder__cell--ask {
        color: var(--accent-red, #ff1744);
      }
      
      .dom-ladder__cell--bid {
        color: var(--accent-green, #00c853);
      }
      
      .dom-ladder__cell--qty {
        color: var(--text-secondary, #8b8b8f);
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Уничтожаем компонент
   */
  destroy() {
    this.container.innerHTML = '';
  }
}
