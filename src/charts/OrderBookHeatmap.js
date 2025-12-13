/* ===========================================================
 * OrderBookHeatmap - Кумулятивная тепловая карта стакана
 * 
 * КАК НА ОБРАЗЦЕ:
 * - Зелёные области (bids) снизу до цены
 * - Красные области (asks) сверху до цены
 * - Полноширинные прямоугольники
 * - Интенсивность = объём
 * - Агрегация по ценовым бакетам
 * =========================================================== */

export class OrderBookHeatmap {
    constructor(container, options = {}) {
        this.container = typeof container === 'string'
            ? document.querySelector(container)
            : container;

        if (!this.container) {
            console.error('[Heatmap] Container not found!');
            return;
        }

        this.options = {
            // Цвета
            bidColor: { r: 0, g: 200, b: 83 },
            askColor: { r: 255, g: 23, b: 68 },

            // Отображение
            opacity: 0.7,
            binsCount: 100,           // Количество ценовых бакетов (плотность)
            minAlpha: 0.1,            // Минимальная прозрачность
            maxAlpha: 0.9,            // Максимальная прозрачность
            showVolumeLabels: false,  // Показывать метки объёма слева

            ...options
        };

        // Данные стакана
        this.orderBook = {
            bids: new Map(),
            asks: new Map()
        };

        this.currentPrice = 0;
        this.maxVolume = 1;

        // Ссылки на график
        this.chartRef = null;
        this.candleSeriesRef = null;

        this._init();
    }

    _init() {
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'heatmap-canvas';
        this.canvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      opacity: ${this.options.opacity};
      z-index: 5;
    `;

        this.container.style.position = 'relative';
        this.container.appendChild(this.canvas);

        this.ctx = this.canvas.getContext('2d', { alpha: true });

        this.resizeObserver = new ResizeObserver(() => this._handleResize());
        this.resizeObserver.observe(this.container);
        this._handleResize();

        console.log('[Heatmap] Initialized with full-width cumulative areas');
    }

    attachToChart(candlestickChart) {
        if (!candlestickChart) return;

        this.chartRef = candlestickChart.getChartInstance();
        this.candleSeriesRef = candlestickChart.candleSeries;

        if (this.chartRef) {
            // Перерисовка при изменении масштаба
            this.chartRef.timeScale().subscribeVisibleLogicalRangeChange(() => {
                this._render();
            });
        }

        console.log('[Heatmap] Attached to chart');
    }

    _handleResize() {
        const rect = this.container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.width = Math.floor(rect.width);
        this.height = Math.floor(rect.height);

        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';

        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        this._render();
    }

    update(data, currentPrice) {
        if (!data) return;

        if (currentPrice && !isNaN(currentPrice) && currentPrice > 0) {
            this.currentPrice = currentPrice;
        }

        // Объединяем данные
        if (data.bids?.length) {
            for (const [price, qty] of data.bids) {
                const p = parseFloat(price);
                const v = parseFloat(qty);
                if (!isNaN(p) && !isNaN(v)) {
                    if (v > 0) {
                        this.orderBook.bids.set(p, v);
                    } else {
                        this.orderBook.bids.delete(p);
                    }
                }
            }
        }

        if (data.asks?.length) {
            for (const [price, qty] of data.asks) {
                const p = parseFloat(price);
                const v = parseFloat(qty);
                if (!isNaN(p) && !isNaN(v)) {
                    if (v > 0) {
                        this.orderBook.asks.set(p, v);
                    } else {
                        this.orderBook.asks.delete(p);
                    }
                }
            }
        }

        this._render();
    }

    addSnapshot(data, currentPrice) {
        this.update(data, currentPrice);
    }

    /**
     * Агрегировать уровни в бакеты
     */
    _aggregateToBins(levels, priceMin, priceMax, isBids) {
        const binsCount = this.options.binsCount;
        const priceRange = priceMax - priceMin;
        const binSize = priceRange / binsCount;

        // Создаём массив бакетов
        const bins = new Array(binsCount).fill(0);

        for (const [price, volume] of levels) {
            if (price < priceMin || price > priceMax) continue;

            const binIndex = Math.floor((price - priceMin) / binSize);
            if (binIndex >= 0 && binIndex < binsCount) {
                bins[binIndex] += volume;
            }
        }

        return bins;
    }

    _render() {
        if (!this.ctx || !this.currentPrice || this.currentPrice <= 0) return;

        this.ctx.clearRect(0, 0, this.width, this.height);

        // Определяем видимый диапазон цен
        let priceMin, priceMax;

        if (this.candleSeriesRef) {
            // Пытаемся получить диапазон из верхней и нижней границы canvas
            const topPrice = this.candleSeriesRef.coordinateToPrice(0);
            const bottomPrice = this.candleSeriesRef.coordinateToPrice(this.height);

            if (topPrice !== null && bottomPrice !== null) {
                priceMin = Math.min(topPrice, bottomPrice);
                priceMax = Math.max(topPrice, bottomPrice);
            }
        }

        // Fallback
        if (!priceMin || !priceMax) {
            const range = this.currentPrice * 0.15;
            priceMin = this.currentPrice - range;
            priceMax = this.currentPrice + range;
        }

        const priceRange = priceMax - priceMin;
        if (priceRange <= 0) return;

        // Агрегируем в бакеты
        const bidBins = this._aggregateToBins(this.orderBook.bids, priceMin, priceMax, true);
        const askBins = this._aggregateToBins(this.orderBook.asks, priceMin, priceMax, false);

        // Находим максимальный объём для нормализации
        const allVolumes = [...bidBins, ...askBins].filter(v => v > 0);
        if (allVolumes.length > 0) {
            allVolumes.sort((a, b) => a - b);
            const idx = Math.floor(allVolumes.length * 0.95);
            this.maxVolume = allVolumes[idx] || allVolumes[allVolumes.length - 1] || 1;
        }

        const binsCount = this.options.binsCount;
        const binHeight = this.height / binsCount;

        // Рисуем бакеты
        for (let i = 0; i < binsCount; i++) {
            // Y координата (индекс 0 = низ графика = низкая цена)
            // Инвертируем для отображения (высокие цены вверху)
            const y = this.height - (i + 1) * binHeight;

            // BIDS (зелёные)
            if (bidBins[i] > 0) {
                const intensity = Math.min(bidBins[i] / this.maxVolume, 1);
                const alpha = this.options.minAlpha + intensity * (this.options.maxAlpha - this.options.minAlpha);

                this.ctx.fillStyle = `rgba(${this.options.bidColor.r}, ${this.options.bidColor.g}, ${this.options.bidColor.b}, ${alpha})`;
                this.ctx.fillRect(0, y, this.width, binHeight + 0.5);

                // Метка объёма слева
                if (this.options.showVolumeLabels && intensity > 0.3) {
                    this._drawVolumeLabel(bidBins[i], 5, y + binHeight / 2, 'bid');
                }
            }

            // ASKS (красные)
            if (askBins[i] > 0) {
                const intensity = Math.min(askBins[i] / this.maxVolume, 1);
                const alpha = this.options.minAlpha + intensity * (this.options.maxAlpha - this.options.minAlpha);

                this.ctx.fillStyle = `rgba(${this.options.askColor.r}, ${this.options.askColor.g}, ${this.options.askColor.b}, ${alpha})`;
                this.ctx.fillRect(0, y, this.width, binHeight + 0.5);

                // Метка объёма слева
                if (this.options.showVolumeLabels && intensity > 0.3) {
                    this._drawVolumeLabel(askBins[i], 5, y + binHeight / 2, 'ask');
                }
            }
        }

        // Линия текущей цены
        if (this.candleSeriesRef) {
            const currentY = this.candleSeriesRef.priceToCoordinate(this.currentPrice);
            if (currentY !== null && currentY >= 0 && currentY <= this.height) {
                this.ctx.strokeStyle = 'rgba(255, 214, 0, 0.9)';
                this.ctx.lineWidth = 2;
                this.ctx.setLineDash([8, 4]);
                this.ctx.beginPath();
                this.ctx.moveTo(0, currentY);
                this.ctx.lineTo(this.width, currentY);
                this.ctx.stroke();
                this.ctx.setLineDash([]);
            }
        }
    }

    // Настройки
    setBinsCount(count) {
        this.options.binsCount = count;
        this._render();
    }

    /**
     * Принудительно перерисовать heatmap
     * Вызывать после изменения любых настроек
     */
    forceRender() {
        this._render();
    }

    setColors(bidHex, askHex) {
        this.options.bidColor = this._hexToRgb(bidHex);
        this.options.askColor = this._hexToRgb(askHex);
        this._render();
    }

    setOpacity(opacity) {
        this.options.opacity = opacity;
        this.canvas.style.opacity = opacity;
    }

    setShowVolumeLabels(show) {
        this.options.showVolumeLabels = show;
        this._render();
    }

    /**
     * Рисуем метку объёма с контрастным фоном
     */
    _drawVolumeLabel(volume, x, y, type) {
        // Форматируем объём
        let text;
        if (volume >= 1000000) {
            text = (volume / 1000000).toFixed(1) + 'M';
        } else if (volume >= 1000) {
            text = (volume / 1000).toFixed(1) + 'K';
        } else {
            text = volume.toFixed(1);
        }

        // Настройки текста
        this.ctx.font = 'bold 11px Inter, sans-serif';
        const textWidth = this.ctx.measureText(text).width;
        const padding = 4;
        const bgWidth = textWidth + padding * 2;
        const bgHeight = 14;

        // Тёмный фон для контраста
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        this.ctx.fillRect(x, y - bgHeight / 2, bgWidth, bgHeight);

        // Текст
        this.ctx.fillStyle = type === 'bid' ? '#00e676' : '#ff5252';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, x + padding, y);
    }

    setVisible(visible) {
        this.canvas.style.display = visible ? 'block' : 'none';
    }

    clear() {
        this.orderBook.bids.clear();
        this.orderBook.asks.clear();
        this.maxVolume = 1;
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.width, this.height);
        }
    }

    _hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 255, g: 255, b: 255 };
    }

    destroy() {
        if (this.resizeObserver) this.resizeObserver.disconnect();
        if (this.canvas?.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    }
}
