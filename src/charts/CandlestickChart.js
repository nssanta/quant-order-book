/* ===========================================================
 * CandlestickChart - Компонент свечного графика
 * Используем TradingView Lightweight Charts
 * =========================================================== */

import { createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries } from 'lightweight-charts';

/**
 * Класс для управления свечным графиком
 */
export class CandlestickChart {
    constructor(container, options = {}) {
        this.container = typeof container === 'string'
            ? document.querySelector(container)
            : container;

        this.chart = null;
        this.candleSeries = null;
        this.volumeSeries = null;
        this.drawings = [];
        this.markers = [];

        this.options = {
            theme: 'dark',
            showVolume: true,
            ...options
        };

        this._initChart();
        this._setupResizeObserver();
    }

    /**
     * Инициализируем график
     * @private
     */
    _initChart() {
        const isDark = this.options.theme === 'dark';

        this.chart = createChart(this.container, {
            layout: {
                background: { type: ColorType.Solid, color: isDark ? '#0a0a0f' : '#ffffff' },
                textColor: isDark ? '#8b8b8f' : '#333333',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                fontSize: 12
            },
            grid: {
                vertLines: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' },
                horzLines: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }
            },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: {
                    color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
                    width: 1,
                    style: 2,
                    labelBackgroundColor: isDark ? '#1a1a24' : '#f0f0f0'
                },
                horzLine: {
                    color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
                    width: 1,
                    style: 2,
                    labelBackgroundColor: isDark ? '#1a1a24' : '#f0f0f0'
                }
            },
            rightPriceScale: {
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                scaleMargins: {
                    top: 0.1,
                    bottom: 0.1 // Main price scale bottom margin adjusted as volume now has its own scale
                }
            },
            timeScale: {
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                timeVisible: true,
                secondsVisible: false,
                tickMarkFormatter: (time) => {
                    const date = new Date(time * 1000);
                    return date.toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }
            },
            handleScale: {
                axisPressedMouseMove: {
                    time: true,
                    price: true
                }
            },
            handleScroll: {
                mouseWheel: true,
                pressedMouseMove: true,
                horzTouchDrag: true,
                vertTouchDrag: true
            }
        });

        // Создаём серию свечей (v5 API: addSeries с типом)
        this.candleSeries = this.chart.addSeries(CandlestickSeries, {
            upColor: '#00c853',
            downColor: '#ff1744',
            borderUpColor: '#00c853',
            borderDownColor: '#ff1744',
            wickUpColor: '#00c853',
            wickDownColor: '#ff1744'
        });

        // Создаём серию объёма (v5 API)
        if (this.options.showVolume) {
            this.volumeSeries = this.chart.addSeries(HistogramSeries, {
                color: '#2979ff',
                priceFormat: { type: 'volume' },
                priceScaleId: 'volume', // Set a specific priceScaleId for volume
            });

            // Настраиваем отдельную шкалу для объёма
            this.chart.priceScale('volume').applyOptions({
                scaleMargins: {
                    top: 0.85, // Adjusted margin for volume scale
                    bottom: 0
                }
            });
        }
    }

    /**
     * Загружаем исторические данные
     * @param {Array} data - [{ time, open, high, low, close, volume }, ...]
     */
    setData(data) {
        if (!data || !data.length) return;

        // Форматируем данные для свечей
        const candleData = data.map(d => ({
            time: d.time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close
        }));

        this.candleSeries.setData(candleData);

        // Форматируем данные для объёма
        if (this.volumeSeries) {
            const volumeData = data.map(d => ({
                time: d.time,
                value: d.volume,
                color: d.close >= d.open
                    ? 'rgba(0,200,83,0.3)'
                    : 'rgba(255,23,68,0.3)'
            }));

            this.volumeSeries.setData(volumeData);
        }

        // Скроллим к последней свече
        this.chart.timeScale().fitContent();
    }

    /**
     * Обновляем последнюю свечу (realtime)
     * @param {Object} candle - { time, open, high, low, close, volume }
     */
    updateCandle(candle) {
        if (!candle || !candle.time) return;

        // Защита от обновления старых данных
        // Lightweight Charts не позволяет обновлять свечи со временем раньше последней
        try {
            this.candleSeries.update({
                time: candle.time,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close
            });

            if (this.volumeSeries) {
                this.volumeSeries.update({
                    time: candle.time,
                    value: candle.volume,
                    color: candle.close >= candle.open
                        ? 'rgba(0,200,83,0.3)'
                        : 'rgba(255,23,68,0.3)'
                });
            }
        } catch (e) {
            // Игнорируем ошибку "Cannot update oldest data"
            // Это происходит когда WebSocket присылает старые данные
        }
    }

    /**
     * Добавляем маркер на график (например, сделка)
     * @param {Object} marker - { time, position, color, shape, text }
     */
    addMarker(marker) {
        this.markers.push({
            time: marker.time,
            position: marker.position || 'aboveBar',
            color: marker.color || '#2979ff',
            shape: marker.shape || 'circle',
            text: marker.text || ''
        });

        this.candleSeries.setMarkers(this.markers);
    }

    /**
     * Очищаем маркеры
     */
    clearMarkers() {
        this.markers = [];
        this.candleSeries.setMarkers([]);
    }

    /**
     * Добавляем горизонтальную линию (уровень)
     * @param {number} price
     * @param {Object} options
     * @returns {Object} - Линия для удаления
     */
    addPriceLine(price, options = {}) {
        return this.candleSeries.createPriceLine({
            price,
            color: options.color || '#ffd600',
            lineWidth: options.lineWidth || 1,
            lineStyle: options.lineStyle || 2,
            axisLabelVisible: true,
            title: options.title || ''
        });
    }

    /**
     * Удаляем ценовую линию
     * @param {Object} line
     */
    removePriceLine(line) {
        this.candleSeries.removePriceLine(line);
    }

    /**
     * Получаем текущий видимый диапазон времени
     * @returns {{ from, to }}
     */
    getVisibleRange() {
        return this.chart.timeScale().getVisibleRange();
    }

    /**
     * Получаем видимый диапазон ЦЕН (для heatmap)
     * @returns {{ min, max } | null}
     */
    getVisiblePriceRange() {
        try {
            const priceScale = this.chart.priceScale('right');
            // Lightweight Charts v5 не имеет прямого метода getVisiblePriceRange
            // Используем данные свечей для определения диапазона
            const visibleRange = this.chart.timeScale().getVisibleLogicalRange();
            if (!visibleRange) return null;

            // Получаем barsInLogicalRange не работает в v5, используем другой подход
            // Возвращаем null чтобы heatmap использовал свой fallback
            return null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Получаем chart instance для прямого доступа
     */
    getChartInstance() {
        return this.chart;
    }

    /**
     * Получаем контейнер графика
     */
    getContainer() {
        return this.container;
    }

    /**
     * Подписываемся на crosshair move (для показа цены)
     * @param {Function} callback - (param) => {}
     */
    onCrosshairMove(callback) {
        this.chart.subscribeCrosshairMove(callback);
    }

    /**
     * Подписываемся на клик
     * @param {Function} callback
     */
    onClick(callback) {
        this.chart.subscribeClick(callback);
    }

    /**
     * Устанавливаем видимый диапазон
     * @param {number} from - Unix timestamp
     * @param {number} to - Unix timestamp
     */
    setVisibleRange(from, to) {
        this.chart.timeScale().setVisibleRange({ from, to });
    }

    /**
     * Скроллим к последней свече
     */
    scrollToRealTime() {
        this.chart.timeScale().scrollToRealTime();
    }

    /**
     * Следим за ресайзом контейнера
     * @private
     */
    _setupResizeObserver() {
        this.resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    this.chart.resize(width, height);
                }
            }
        });

        this.resizeObserver.observe(this.container);
    }

    /**
     * Меняем тему
     * @param {string} theme - 'dark' | 'light'
     */
    setTheme(theme) {
        const isDark = theme === 'dark';

        this.chart.applyOptions({
            layout: {
                background: { type: ColorType.Solid, color: isDark ? '#0a0a0f' : '#ffffff' },
                textColor: isDark ? '#8b8b8f' : '#333333'
            },
            grid: {
                vertLines: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' },
                horzLines: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }
            }
        });
    }

    /**
     * Уничтожаем график
     */
    destroy() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        if (this.chart) {
            this.chart.remove();
        }
    }
}
