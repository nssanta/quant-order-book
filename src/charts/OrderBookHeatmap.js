/* ===========================================================
 * OrderBookHeatmap - Кумулятивная тепловая карта стакана
 * 
 * Переписана для использования с KLineChart Overlays
 * =========================================================== */

export class OrderBookHeatmap {
    constructor(container, options = {}) {
        // container не используется напрямую, т.к. рисуем внутри chart
        this.options = {
            // Цвета
            bidColor: { r: 0, g: 200, b: 83 },
            askColor: { r: 255, g: 23, b: 68 },

            // Отображение
            opacity: 0.7,
            binsCount: 50,           // Уменьшил для производительности оверлеев
            minAlpha: 0.1,
            maxAlpha: 0.5,
            showVolumeLabels: false,

            ...options
        };

        // Данные стакана
        this.orderBook = {
            bids: new Map(),
            asks: new Map()
        };

        this.currentPrice = 0;
        this.maxVolume = 1;
        this.chartWrapper = null;

        // Троттлинг обновления рендеринга
        this.renderTimeout = null;
    }

    attachToChart(candlestickChart) {
        if (!candlestickChart) return;
        this.chartWrapper = candlestickChart;

        // Подписываемся на изменение видимой области для обновления хитмапа
        const chart = candlestickChart.getChartInstance();
        if (chart) {
            chart.subscribeAction('onVisibleRangeChange', () => {
                this._scheduleRender();
            });
        }

        console.log('[Heatmap] Attached to chart wrapper');
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

        this._scheduleRender();
    }

    _scheduleRender() {
        if (this.renderTimeout) return;
        this.renderTimeout = setTimeout(() => {
            this._render();
            this.renderTimeout = null;
        }, 200); // 5 FPS
    }

    addSnapshot(data, currentPrice) {
        this.update(data, currentPrice);
    }

    setVisible(visible) {
        // TODO: скрыть оверлеи
    }

    setOpacity(opacity) {
        this.options.opacity = opacity;
    }

    setColors(bidHex, askHex) {
        this.options.bidColor = this._hexToRgb(bidHex);
        this.options.askColor = this._hexToRgb(askHex);
    }

    setBinsCount(count) {
        this.options.binsCount = count;
    }

    setShowVolumeLabels(show) {
        this.options.showVolumeLabels = show;
    }

    forceRender() {
        this._render();
    }

    _hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 255, g: 255, b: 255 };
    }

    /**
     * Агрегировать уровни в бакеты
     */
    _aggregateToBins(levels, priceMin, priceMax) {
        const binsCount = this.options.binsCount;
        const priceRange = priceMax - priceMin;
        const binSize = priceRange / binsCount;

        // Создаём массив бакетов: [{ price, volume, step }]
        const bins = [];
        for (let i = 0; i < binsCount; i++) {
             bins.push({ price: priceMin + i * binSize, volume: 0, step: binSize });
        }

        for (const [price, volume] of levels) {
            if (price < priceMin || price >= priceMax) continue;
            const binIndex = Math.floor((price - priceMin) / binSize);
            if (binIndex >= 0 && binIndex < binsCount) {
                bins[binIndex].volume += volume;
            }
        }

        return bins;
    }

    _render() {
        if (!this.chartWrapper || !this.currentPrice || this.currentPrice <= 0) return;

        // Получаем диапазон цен. KLineChart не дает API, поэтому аппроксимируем вокруг текущей цены.
        const rangePercent = 0.05; // +/- 5%
        const priceMin = this.currentPrice * (1 - rangePercent);
        const priceMax = this.currentPrice * (1 + rangePercent);

        // Агрегируем
        const bidBins = this._aggregateToBins(this.orderBook.bids, priceMin, this.currentPrice); // Bids ниже цены
        const askBins = this._aggregateToBins(this.orderBook.asks, this.currentPrice, priceMax); // Asks выше цены

        // Макс объем
        let maxVol = 1;
        [...bidBins, ...askBins].forEach(b => { if (b.volume > maxVol) maxVol = b.volume; });

        const levels = [];

        // Bids
        bidBins.forEach(b => {
             if (b.volume > 0) {
                 const intensity = Math.min(b.volume / maxVol, 1);
                 const alpha = this.options.minAlpha + intensity * (this.options.maxAlpha - this.options.minAlpha);
                 levels.push({
                     price: b.price,
                     volume: b.volume,
                     step: b.step,
                     type: 'bid',
                     opacity: alpha
                 });
             }
        });

        // Asks
        askBins.forEach(b => {
             if (b.volume > 0) {
                 const intensity = Math.min(b.volume / maxVol, 1);
                 const alpha = this.options.minAlpha + intensity * (this.options.maxAlpha - this.options.minAlpha);
                 levels.push({
                     price: b.price,
                     volume: b.volume,
                     step: b.step,
                     type: 'ask',
                     opacity: alpha
                 });
             }
        });

        this.chartWrapper.updateHeatmap(levels);
    }

    clear() {
        this.orderBook.bids.clear();
        this.orderBook.asks.clear();
        if (this.chartWrapper) {
            this.chartWrapper.updateHeatmap([]);
        }
    }

    destroy() {
        if (this.renderTimeout) clearTimeout(this.renderTimeout);
        this.clear();
    }
}
