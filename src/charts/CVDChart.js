/* ===========================================================
 * CVDChart - График кумулятивной дельты объёма
 * Две линии: зелёная (покупки) и красная (продажи)
 * =========================================================== */

import * as d3 from 'd3';

export class CVDChart {
    constructor(container, options = {}) {
        this.container = typeof container === 'string'
            ? document.querySelector(container)
            : container;

        this.options = {
            height: 120,
            lineWidth: 2,
            buyColor: '#00c853',
            sellColor: '#ff1744',
            areaOpacity: 0.2,
            animationDuration: 300,
            maxDataPoints: 100,
            ...options
        };

        this.buyData = [];
        this.sellData = [];
        this.cvdData = [];

        this._init();
    }

    /**
     * Инициализируем SVG
     * @private
     */
    _init() {
        this.container.innerHTML = '';
        this.container.classList.add('cvd-chart');

        const rect = this.container.getBoundingClientRect();
        this.width = rect.width || 400;
        this.height = this.options.height;

        // Создаём SVG
        this.svg = d3.select(this.container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', this.height)
            .attr('viewBox', `0 0 ${this.width} ${this.height}`)
            .attr('preserveAspectRatio', 'none');

        // Градиенты
        const defs = this.svg.append('defs');

        // Градиент для покупок
        const buyGradient = defs.append('linearGradient')
            .attr('id', 'buyGradient')
            .attr('x1', '0%').attr('y1', '0%')
            .attr('x2', '0%').attr('y2', '100%');

        buyGradient.append('stop')
            .attr('offset', '0%')
            .attr('stop-color', this.options.buyColor)
            .attr('stop-opacity', this.options.areaOpacity);

        buyGradient.append('stop')
            .attr('offset', '100%')
            .attr('stop-color', this.options.buyColor)
            .attr('stop-opacity', 0);

        // Градиент для продаж
        const sellGradient = defs.append('linearGradient')
            .attr('id', 'sellGradient')
            .attr('x1', '0%').attr('y1', '100%')
            .attr('x2', '0%').attr('y2', '0%');

        sellGradient.append('stop')
            .attr('offset', '0%')
            .attr('stop-color', this.options.sellColor)
            .attr('stop-opacity', this.options.areaOpacity);

        sellGradient.append('stop')
            .attr('offset', '100%')
            .attr('stop-color', this.options.sellColor)
            .attr('stop-opacity', 0);

        // Нулевая линия
        this.zeroLine = this.svg.append('line')
            .attr('class', 'zero-line')
            .attr('x1', 0)
            .attr('x2', this.width)
            .attr('y1', this.height / 2)
            .attr('y2', this.height / 2)
            .attr('stroke', 'rgba(255,255,255,0.1)')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '4,4');

        // Области под линиями
        this.buyArea = this.svg.append('path')
            .attr('class', 'buy-area')
            .attr('fill', 'url(#buyGradient)');

        this.sellArea = this.svg.append('path')
            .attr('class', 'sell-area')
            .attr('fill', 'url(#sellGradient)');

        // Линии
        this.buyLine = this.svg.append('path')
            .attr('class', 'buy-line')
            .attr('fill', 'none')
            .attr('stroke', this.options.buyColor)
            .attr('stroke-width', this.options.lineWidth)
            .attr('stroke-linecap', 'round')
            .attr('stroke-linejoin', 'round');

        this.sellLine = this.svg.append('path')
            .attr('class', 'sell-line')
            .attr('fill', 'none')
            .attr('stroke', this.options.sellColor)
            .attr('stroke-width', this.options.lineWidth)
            .attr('stroke-linecap', 'round')
            .attr('stroke-linejoin', 'round');

        // CVD линия (основная)
        this.cvdLine = this.svg.append('path')
            .attr('class', 'cvd-line')
            .attr('fill', 'none')
            .attr('stroke', '#ffd600')
            .attr('stroke-width', 2.5)
            .attr('stroke-linecap', 'round')
            .attr('stroke-linejoin', 'round');

        // Легенда
        this._createLegend();

        // Resize observer
        this.resizeObserver = new ResizeObserver(() => this._handleResize());
        this.resizeObserver.observe(this.container);

        // Инжектим стили
        this._injectStyles();
    }

    /**
     * Создаём легенду
     * @private
     */
    _createLegend() {
        const legend = document.createElement('div');
        legend.className = 'cvd-chart__legend';
        legend.innerHTML = `
      <div class="cvd-chart__legend-item">
        <span class="cvd-chart__legend-dot" style="background: ${this.options.buyColor}"></span>
        <span>Покупки</span>
        <span class="cvd-chart__legend-value" id="cvd-buy-value">0</span>
      </div>
      <div class="cvd-chart__legend-item">
        <span class="cvd-chart__legend-dot" style="background: ${this.options.sellColor}"></span>
        <span>Продажи</span>
        <span class="cvd-chart__legend-value" id="cvd-sell-value">0</span>
      </div>
      <div class="cvd-chart__legend-item cvd-chart__legend-item--main">
        <span class="cvd-chart__legend-dot" style="background: #ffd600"></span>
        <span>CVD</span>
        <span class="cvd-chart__legend-value" id="cvd-value">0</span>
      </div>
    `;
        this.container.appendChild(legend);
    }

    /**
   * Добавляем новую сделку
   * @param {Object} trade - { price, volume, side: 'buy'|'sell', time }
   */
    addTrade(trade) {
        // Валидация входных данных
        if (!trade || typeof trade.volume !== 'number' || isNaN(trade.volume)) {
            console.warn('[CVDChart] Invalid trade volume:', trade);
            return;
        }

        if (trade.volume <= 0) {
            return; // Пропускаем нулевые сделки
        }

        const now = Date.now();

        // Получаем последние значения
        const lastBuy = this.buyData.length > 0 ? this.buyData[this.buyData.length - 1].value : 0;
        const lastSell = this.sellData.length > 0 ? this.sellData[this.sellData.length - 1].value : 0;

        // Обновляем кумулятивные значения
        const volume = Math.abs(trade.volume);
        const isBuy = trade.side === 'buy';

        const newBuy = isBuy ? lastBuy + volume : lastBuy;
        const newSell = !isBuy ? lastSell + volume : lastSell;
        const newCvd = newBuy - newSell;

        // Защита от NaN
        if (isNaN(newBuy) || isNaN(newSell) || isNaN(newCvd)) {
            console.error('[CVDChart] NaN detected:', { newBuy, newSell, newCvd, trade });
            return;
        }

        this.buyData.push({ time: now, value: newBuy });
        this.sellData.push({ time: now, value: newSell });
        this.cvdData.push({ time: now, value: newCvd });

        // Ограничиваем размер
        if (this.buyData.length > this.options.maxDataPoints) {
            this.buyData.shift();
            this.sellData.shift();
            this.cvdData.shift();
        }

        this._render();
        this._updateLegend(newBuy, newSell, newCvd);
    }

    /**
     * Рендерим график
     * @private
     */
    _render() {
        if (this.buyData.length < 2) return;

        const rect = this.container.getBoundingClientRect();
        this.width = rect.width || 400;

        // Обновляем viewBox
        this.svg.attr('viewBox', `0 0 ${this.width} ${this.height}`);

        // Шкалы
        const xScale = d3.scaleLinear()
            .domain([0, this.buyData.length - 1])
            .range([0, this.width]);

        const allValues = [
            ...this.buyData.map(d => d.value),
            ...this.sellData.map(d => d.value),
            ...this.cvdData.map(d => d.value)
        ];

        // Берём максимум и минимум для правильного масштабирования
        const maxVal = Math.max(...allValues);
        const minVal = Math.min(...allValues, 0); // Включаем 0

        // Добавляем padding 20% сверху и снизу
        const range = Math.max(maxVal - minVal, 1);
        const padding = range * 0.2;

        const yScale = d3.scaleLinear()
            .domain([minVal - padding, maxVal + padding])
            .range([this.height - 5, 5]); // Оставляем 5px отступ от краёв

        // Генераторы линий
        const lineGenerator = d3.line()
            .x((d, i) => xScale(i))
            .y(d => yScale(d.value))
            .curve(d3.curveMonotoneX);

        const buyAreaGenerator = d3.area()
            .x((d, i) => xScale(i))
            .y0(yScale(0))
            .y1(d => yScale(Math.max(0, d.value)))
            .curve(d3.curveMonotoneX);

        const sellAreaGenerator = d3.area()
            .x((d, i) => xScale(i))
            .y0(yScale(0))
            .y1(d => yScale(Math.min(0, -d.value)))
            .curve(d3.curveMonotoneX);

        // Обновляем нулевую линию
        this.zeroLine
            .attr('x2', this.width)
            .attr('y1', yScale(0))
            .attr('y2', yScale(0));

        // Обновляем области
        this.buyArea
            .datum(this.buyData)
            .attr('d', buyAreaGenerator);

        this.sellArea
            .datum(this.sellData)
            .attr('d', sellAreaGenerator);

        // Обновляем линии
        this.buyLine
            .datum(this.buyData)
            .attr('d', lineGenerator);

        this.sellLine
            .datum(this.sellData.map(d => ({ ...d, value: -d.value })))
            .attr('d', lineGenerator);

        this.cvdLine
            .datum(this.cvdData)
            .attr('d', lineGenerator);
    }

    /**
     * Обновляем легенду
     * @private
     */
    _updateLegend(buy, sell, cvd) {
        const formatValue = (v) => {
            if (Math.abs(v) >= 1000000) return (v / 1000000).toFixed(2) + 'M';
            if (Math.abs(v) >= 1000) return (v / 1000).toFixed(2) + 'K';
            return v.toFixed(2);
        };

        const buyEl = document.getElementById('cvd-buy-value');
        const sellEl = document.getElementById('cvd-sell-value');
        const cvdEl = document.getElementById('cvd-value');

        if (buyEl) buyEl.textContent = formatValue(buy);
        if (sellEl) sellEl.textContent = formatValue(sell);
        if (cvdEl) {
            cvdEl.textContent = (cvd >= 0 ? '+' : '') + formatValue(cvd);
            cvdEl.classList.toggle('positive', cvd >= 0);
            cvdEl.classList.toggle('negative', cvd < 0);
        }
    }

    /**
     * Обработка resize
     * @private
     */
    _handleResize() {
        this._render();
    }

    /**
     * Очищаем данные
     */
    clear() {
        this.buyData = [];
        this.sellData = [];
        this.cvdData = [];
        this.buyLine.attr('d', null);
        this.sellLine.attr('d', null);
        this.cvdLine.attr('d', null);
        this.buyArea.attr('d', null);
        this.sellArea.attr('d', null);
    }

    /**
     * Инжектим стили
     * @private
     */
    _injectStyles() {
        if (document.getElementById('cvd-chart-styles')) return;

        const style = document.createElement('style');
        style.id = 'cvd-chart-styles';
        style.textContent = `
      .cvd-chart {
        position: relative;
        width: 100%;
        background: var(--bg-tertiary, #1a1a24);
        border-radius: 8px;
        overflow: hidden;
      }
      
      .cvd-chart svg {
        display: block;
      }
      
      .cvd-chart__legend {
        position: absolute;
        top: 8px;
        right: 8px;
        display: flex;
        gap: 12px;
        font-size: 11px;
        z-index: 10;
      }
      
      .cvd-chart__legend-item {
        display: flex;
        align-items: center;
        gap: 4px;
        color: var(--text-muted, #5a5a5e);
      }
      
      .cvd-chart__legend-item--main {
        font-weight: 600;
      }
      
      .cvd-chart__legend-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
      
      .cvd-chart__legend-value {
        font-family: var(--font-mono, monospace);
        color: var(--text-primary, #e8e8ea);
      }
      
      .cvd-chart__legend-value.positive {
        color: var(--accent-green, #00c853);
      }
      
      .cvd-chart__legend-value.negative {
        color: var(--accent-red, #ff1744);
      }
    `;
        document.head.appendChild(style);
    }

    /**
     * Уничтожаем
     */
    destroy() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        this.container.innerHTML = '';
    }
}
