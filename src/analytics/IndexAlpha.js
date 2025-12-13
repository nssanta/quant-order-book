/* ===========================================================
 * IndexAlpha - Аналитика соотношения покупателей/продавцов
 * Расчёт индексов на основе Order Book и Trades
 * =========================================================== */

/**
 * Класс для расчёта аналитических индикаторов
 */
export class IndexAlpha {
    constructor() {
        this.tradesBuffer = [];      // Буфер последних сделок
        this.orderBookHistory = [];  // История стаканов
        this.maxBufferSize = 1000;   // Максимум сделок в буфере
        this.windowMs = 60000;       // Окно расчёта (1 минута)
    }

    /**
     * Добавляем сделку
     * @param {Object} trade - { price, qty, isBuyerMaker, time }
     */
    addTrade(trade) {
        this.tradesBuffer.push({
            ...trade,
            time: trade.time || Date.now()
        });

        // Ограничиваем буфер
        while (this.tradesBuffer.length > this.maxBufferSize) {
            this.tradesBuffer.shift();
        }
    }

    /**
     * Добавляем снэпшот стакана
     * @param {Object} orderBook - { bids: [], asks: [] }
     */
    addOrderBook(orderBook) {
        this.orderBookHistory.push({
            timestamp: Date.now(),
            data: orderBook
        });

        // Храним только последние 5 минут
        const cutoff = Date.now() - 300000;
        this.orderBookHistory = this.orderBookHistory.filter(h => h.timestamp >= cutoff);
    }

    /**
     * Рассчитываем Index Alpha (отношение покупателей к продавцам)
     * На основе объёмов в стакане
     * @returns {number} - < 1 = преобладают продавцы, > 1 = преобладают покупатели
     */
    calculateIndexAlpha(orderBook) {
        if (!orderBook?.bids?.length || !orderBook?.asks?.length) {
            return 1;
        }

        const bidVolume = orderBook.bids.reduce((sum, [, qty]) => sum + qty, 0);
        const askVolume = orderBook.asks.reduce((sum, [, qty]) => sum + qty, 0);

        if (askVolume === 0) return 999;

        return bidVolume / askVolume;
    }

    /**
     * Рассчитываем Delta (разница агрессивных покупок/продаж)
     * На основе сделок за период
     * @param {number} windowMs - Окно в миллисекундах
     * @returns {number} - положительное = buy pressure, отрицательное = sell pressure
     */
    calculateDelta(windowMs = this.windowMs) {
        const cutoff = Date.now() - windowMs;
        const recentTrades = this.tradesBuffer.filter(t => t.time >= cutoff);

        let buyVolume = 0;
        let sellVolume = 0;

        for (const trade of recentTrades) {
            if (trade.isBuyerMaker) {
                // isBuyerMaker=true означает что maker был покупатель, а taker продавец
                sellVolume += trade.qty * trade.price;
            } else {
                // taker был покупатель (агрессивная покупка)
                buyVolume += trade.qty * trade.price;
            }
        }

        return buyVolume - sellVolume;
    }

    /**
     * Рассчитываем CVD (Cumulative Volume Delta)
     * @returns {number}
     */
    calculateCVD() {
        let cvd = 0;

        for (const trade of this.tradesBuffer) {
            const value = trade.qty * trade.price;
            if (trade.isBuyerMaker) {
                cvd -= value;
            } else {
                cvd += value;
            }
        }

        return cvd;
    }

    /**
     * Рассчитываем Imbalance на ценовом уровне
     * @param {Object} orderBook
     * @param {number} priceLevel
     * @returns {number} - от -1 (полный перевес asks) до 1 (полный перевес bids)
     */
    calculateImbalance(orderBook, priceLevel = null) {
        if (!orderBook?.bids?.length || !orderBook?.asks?.length) {
            return 0;
        }

        // Если уровень не указан, берём best bid/ask
        const bestBid = orderBook.bids[0];
        const bestAsk = orderBook.asks[0];

        if (!bestBid || !bestAsk) return 0;

        const bidQty = bestBid[1];
        const askQty = bestAsk[1];
        const total = bidQty + askQty;

        if (total === 0) return 0;

        // Нормализуем от -1 до 1
        return (bidQty - askQty) / total;
    }

    /**
     * Находим значительные уровни дисбаланса
     * @param {Object} orderBook
     * @param {number} threshold - Порог (0-1)
     * @returns {Array} - [{ price, imbalance, side, qty }]
     */
    findImbalanceLevels(orderBook, threshold = 0.6) {
        const levels = [];

        if (!orderBook?.bids?.length || !orderBook?.asks?.length) {
            return levels;
        }

        // Проверяем каждый уровень bid
        for (let i = 0; i < Math.min(orderBook.bids.length, 20); i++) {
            const [bidPrice, bidQty] = orderBook.bids[i];

            // Ищем ближайший ask для сравнения
            const askIndex = Math.min(i, orderBook.asks.length - 1);
            const [, askQty] = orderBook.asks[askIndex];

            const total = bidQty + askQty;
            if (total === 0) continue;

            const imbalance = (bidQty - askQty) / total;

            if (Math.abs(imbalance) >= threshold) {
                levels.push({
                    price: bidPrice,
                    imbalance,
                    side: imbalance > 0 ? 'bid' : 'ask',
                    qty: imbalance > 0 ? bidQty : askQty
                });
            }
        }

        return levels;
    }

    /**
     * Получаем все метрики сразу
     * @param {Object} orderBook
     * @returns {Object}
     */
    getMetrics(orderBook) {
        const indexAlpha = this.calculateIndexAlpha(orderBook);
        const delta = this.calculateDelta();
        const cvd = this.calculateCVD();
        const imbalance = this.calculateImbalance(orderBook);

        return {
            indexAlpha: indexAlpha.toFixed(2),
            delta: this._formatNumber(delta),
            cvd: this._formatNumber(cvd),
            imbalance: (imbalance * 100).toFixed(1) + '%',

            // Raw values for further calculations
            raw: { indexAlpha, delta, cvd, imbalance }
        };
    }

    /**
     * Форматируем число для отображения
     * @private
     */
    _formatNumber(num) {
        const abs = Math.abs(num);
        const sign = num >= 0 ? '+' : '-';

        if (abs >= 1000000) {
            return sign + (abs / 1000000).toFixed(2) + 'M';
        }
        if (abs >= 1000) {
            return sign + (abs / 1000).toFixed(2) + 'K';
        }
        return sign + abs.toFixed(2);
    }

    /**
     * Очищаем буферы
     */
    clear() {
        this.tradesBuffer = [];
        this.orderBookHistory = [];
    }
}

// Создаём глобальный экземпляр
export const analytics = new IndexAlpha();
