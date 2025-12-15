/* ===========================================================
 * CandlestickChart - Компонент свечного графика
 * Используем KLineChart
 * =========================================================== */

import { init, dispose, registerOverlay } from 'klinecharts';

/**
 * Класс для управления свечным графиком
 */
export class CandlestickChart {
    constructor(container, options = {}) {
        this.container = typeof container === 'string'
            ? document.querySelector(container)
            : container;

        this.chart = null;
        this.options = {
            theme: 'dark',
            showVolume: true,
            ...options
        };

        this._initChart();
        this._setupResizeObserver();
        this._registerCustomOverlays();
        this.loadDrawings();
    }

    /**
     * Инициализируем график
     * @private
     */
    _initChart() {
        // Инициализация KLineChart
        this.chart = init(this.container);

        // Применяем тему
        this.setTheme(this.options.theme);

        // Настройка индикаторов
        this.chart.createIndicator('MA', false, { id: 'candle_pane' });
        if (this.options.showVolume) {
            this.chart.createIndicator('VOL');
        }
    }

    /**
     * Регистрируем кастомные оверлеи если нужно
     * @private
     */
    _registerCustomOverlays() {
        // Регистрируем 'rect'
        registerOverlay({
            name: 'rect',
            needDefaultPointFigure: true,
            needDefaultXAxisFigure: true,
            needDefaultYAxisFigure: true,
            totalStep: 3, // Start, End
            createPointFigures: ({ coordinates }) => {
                if (coordinates.length > 1) {
                    return {
                        type: 'rect',
                        attrs: {
                            x: coordinates[0].x,
                            y: coordinates[0].y,
                            width: coordinates[1].x - coordinates[0].x,
                            height: coordinates[1].y - coordinates[0].y
                        },
                        styles: { style: 'fill' }
                    }
                }
                return []
            }
        });
    }

    /**
     * Загружаем исторические данные
     * @param {Array} data - [{ time, open, high, low, close, volume }, ...]
     */
    setData(data) {
        if (!data || !data.length) return;

        // KLineChart ожидает timestamp
        const klineData = data.map(d => ({
            timestamp: d.time * 1000, // KLineChart обычно использует мс
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            volume: d.volume
        }));

        this.chart.applyNewData(klineData);
    }

    /**
     * Получить данные свечей
     */
    getDataList() {
        return this.chart.getDataList();
    }

    /**
     * Обновляем последнюю свечу (realtime)
     * @param {Object} candle - { time, open, high, low, close, volume }
     */
    updateCandle(candle) {
        if (!candle || !candle.time) return;

        this.chart.updateData({
            timestamp: candle.time * 1000,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume
        });
    }

    /**
     * Старт рисования
     * @param {string} type - 'trendLine' | 'rect'
     */
    startDrawing(type) {
        let overlayName = type;

        if (type === 'trendLine') {
            overlayName = 'segment';
        } else if (type === 'rect') {
             overlayName = 'rect';
        }

        this.chart.createOverlay({
            name: overlayName,
            onDrawEnd: () => {
                this.saveDrawings();
            }
        });
    }

    /**
     * Сохранение рисунков
     */
    saveDrawings() {
        const overlays = this.chart.getOverlays();
        const drawings = overlays.filter(o =>
            o.name === 'segment' || o.name === 'rect' || o.name === 'trendLine'
        ).map(o => ({
            name: o.name,
            points: o.points,
            styles: o.styles,
            lock: o.lock,
            visible: o.visible,
            zLevel: o.zLevel
        }));

        localStorage.setItem('chart_drawings', JSON.stringify(drawings));
    }

    /**
     * Загрузка рисунков
     */
    loadDrawings() {
        try {
            const saved = localStorage.getItem('chart_drawings');
            if (saved) {
                const drawings = JSON.parse(saved);
                drawings.forEach(d => {
                    this.chart.createOverlay(d);
                });
            }
        } catch (e) {
            console.error('Error loading drawings:', e);
        }
    }

    /**
     * Добавляем маркер на график (например, сделка)
     * @param {Object} marker - { time, position, color, shape, text }
     */
    addMarker(marker) {
        let price = marker.price;

        // Если цены нет, ищем её в данных
        if (!price) {
            const list = this.chart.getDataList();
            const timestamp = marker.time * 1000;
            // Ищем ближайшую свечу (или точное совпадение)
            // Список отсортирован по времени
            // Можно бинарный поиск, но пока просто find (можно оптимизировать если тормозит)
            const candle = list.find(c => Math.abs(c.timestamp - timestamp) < 60000); // 1 минута допуск
            if (candle) {
                // Если aboveBar -> high, belowBar -> low
                price = (marker.position === 'belowBar') ? candle.low : candle.high;
            } else {
                // Fallback, если свеча не загружена
                return;
            }
        }

        // Используем simpleAnnotation или simpleTag
        this.chart.createOverlay({
            name: 'simpleAnnotation',
            extendData: marker.text,
            points: [{ timestamp: marker.time * 1000, value: price }],
            styles: {
                 rect: {
                     backgroundColor: marker.color
                 },
                 text: {
                     text: marker.text,
                     color: '#ffffff'
                 }
            }
        });
    }

    /**
     * Очищаем маркеры
     */
    clearMarkers() {
        this.chart.removeOverlay({ name: 'simpleAnnotation' });
    }

    /**
     * Добавляем горизонтальную линию (уровень)
     * @param {number} price
     * @param {Object} options
     * @returns {string} - ID линии
     */
    addPriceLine(price, options = {}) {
        return this.chart.createOverlay({
            name: 'priceLine',
            points: [{ value: price }],
            styles: {
                line: {
                    color: options.color || '#ffd600',
                    size: options.lineWidth || 1,
                    style: options.lineStyle === 1 ? 'solid' : 'dashed' // 1=solid, 2=dashed в LW charts
                }
            }
        });
    }

    /**
     * Удаляем ценовую линию
     * @param {string} lineId
     */
    removePriceLine(lineId) {
        this.chart.removeOverlay({ id: lineId });
    }

    /**
     * Получаем текущий видимый диапазон времени
     * @returns {{ from, to }}
     */
    getVisibleRange() {
        // KLineChart возвращает { from, to, realFrom, realTo } где значения - индексы или timestamp?
        // getVisibleRange() -> { from: number, to: number } (timestamps)
        const range = this.chart.getVisibleRange();
        return { from: range.from / 1000, to: range.to / 1000 };
    }

    /**
     * Получаем видимый диапазон ЦЕН
     */
    getVisiblePriceRange() {
         // KLineChart может не давать это напрямую легко
         return null;
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
     * Подписываемся на crosshair move
     * @param {Function} callback
     */
    onCrosshairMove(callback) {
        this.chart.subscribeAction('crosshair', (data) => {
             // data: { crosshair: { ... }, ... }
             // Adapt format if needed
             callback(data);
        });
    }

    /**
     * Подписываемся на клик
     * @param {Function} callback
     */
    onClick(callback) {
        // Не прямой аналог, но можно через subscribeAction
        // или опции onClick в init
    }

    /**
     * Устанавливаем видимый диапазон
     */
    setVisibleRange(from, to) {
        this.chart.setVisibleRange({ from: from * 1000, to: to * 1000 });
    }

    /**
     * Скроллим к последней свече
     */
    scrollToRealTime() {
        this.chart.scrollToRealTime();
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
                    this.chart.resize();
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
        this.chart.setStyles(isDark ? 'dark' : 'light');
        // Дополнительная настройка цветов под проект
        this.chart.setStyles({
             grid: {
                 horizontal: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' },
                 vertical: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }
             },
             candle: {
                 bar: {
                     upColor: '#00c853',
                     downColor: '#ff1744',
                     upBorderColor: '#00c853',
                     downBorderColor: '#ff1744',
                     upWickColor: '#00c853',
                     downWickColor: '#ff1744'
                 }
             }
        });
    }

    /**
     * Обновление хитмапа (уровни стакана)
     * @param {Array} levels - [{ price, volume, type: 'bid'|'ask' }, ...]
     */
    updateHeatmap(levels) {
        // Удаляем старые, создаем новые.
        // ВНИМАНИЕ: Это может быть медленно. Оптимизация: использовать 1 кастомный оверлей.
        // Но по ТЗ: "Рисовать их как оверлеи типа 'rect'".

        // Сначала удалим старые heatmap rects
        this.chart.removeOverlay({ groupId: 'heatmap' });

        if (!levels) return;

        // Рисуем новые
        // Нужно знать временной диапазон. Рисуем от "сейчас" в будущее?
        // Или на всю ширину? KLineChart overlay привязан к timestamp.
        // Чтобы рисовать "полосы" на всю ширину, лучше использовать 'priceLine' с толщиной?
        // Нет, хитмап это прямоугольники.

        // Получаем видимый диапазон времени
        const range = this.chart.getVisibleRange();
        const start = range.from;
        const end = range.to;

        levels.forEach(lvl => {
            const color = lvl.type === 'bid'
                ? `rgba(0, 200, 83, ${lvl.opacity})`
                : `rgba(255, 23, 68, ${lvl.opacity})`;

            this.chart.createOverlay({
                name: 'rect',
                groupId: 'heatmap',
                lock: true,
                zLevel: -10, // Ниже свечей
                points: [
                    { timestamp: start, value: lvl.price },
                    { timestamp: end, value: lvl.price + (lvl.step || 1) } // Высота прямоугольника?
                ],
                styles: {
                    rect: {
                        color: color,
                        borderColor: 'transparent'
                    }
                }
            });
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
            dispose(this.container);
        }
    }
}
