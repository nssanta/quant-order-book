/* ===========================================================
 * LevelAnalyzer - Анализ ключевых уровней стакана
 * Находим и ранжируем сильные уровни поддержки/сопротивления
 * =========================================================== */

/**
 * Определяем силу уровня (0-100)
 * Чем больше объём на уровне относительно среднего - тем сильнее
 */
export class LevelAnalyzer {
    constructor(options = {}) {
        this.options = {
            significanceThreshold: 2.0,  // Уровень считается значимым если > 2x от среднего
            clusterRange: 0.001,         // Кластеризация уровней в пределах 0.1%
            maxLevels: 10,               // Максимум уровней в сводке
            ...options
        };

        this.history = [];  // История объёмов для расчёта среднего
        this.maxHistorySize = 100;
    }

    /**
     * Анализируем стакан и находим ключевые уровни
     * @param {Object} orderBook - { bids: [[price, qty]], asks: [[price, qty]] }
     * @returns {Object} - { supportLevels: [], resistanceLevels: [], summary: {} }
     */
    analyze(orderBook) {
        if (!orderBook?.bids?.length || !orderBook?.asks?.length) {
            return { supportLevels: [], resistanceLevels: [], summary: {} };
        }

        // Вычисляем средний объём
        const allVolumes = [
            ...orderBook.bids.map(([, v]) => v),
            ...orderBook.asks.map(([, v]) => v)
        ];
        const avgVolume = allVolumes.reduce((a, b) => a + b, 0) / allVolumes.length;
        const maxVolume = Math.max(...allVolumes);

        // Сохраняем для истории
        this.history.push(avgVolume);
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }

        // Исторический средний
        const historicalAvg = this.history.reduce((a, b) => a + b, 0) / this.history.length;

        // Находим значимые уровни поддержки (bids)
        const supportLevels = this._findSignificantLevels(
            orderBook.bids,
            avgVolume,
            maxVolume,
            'support'
        );

        // Находим значимые уровни сопротивления (asks)
        const resistanceLevels = this._findSignificantLevels(
            orderBook.asks,
            avgVolume,
            maxVolume,
            'resistance'
        );

        // Формируем сводку
        const summary = this._buildSummary(orderBook, supportLevels, resistanceLevels);

        return { supportLevels, resistanceLevels, summary };
    }

    /**
     * Находим значимые уровни
     * @private
     */
    _findSignificantLevels(levels, avgVolume, maxVolume, type) {
        const significant = [];
        const threshold = avgVolume * this.options.significanceThreshold;

        for (const [price, qty] of levels) {
            if (qty >= threshold) {
                // Рассчитываем силу уровня (0-100)
                const strength = Math.min(100, Math.round((qty / maxVolume) * 100));

                // Определяем цвет по силе
                const color = this._getColorByStrength(strength, type);

                significant.push({
                    price: parseFloat(price),
                    volume: qty,
                    strength,
                    color,
                    type,
                    ratio: (qty / avgVolume).toFixed(2) + 'x'
                });
            }
        }

        // Кластеризуем близкие уровни
        const clustered = this._clusterLevels(significant);

        // Сортируем по силе и берём топ
        return clustered
            .sort((a, b) => b.strength - a.strength)
            .slice(0, this.options.maxLevels);
    }

    /**
     * Кластеризуем близкие уровни
     * @private
     */
    _clusterLevels(levels) {
        if (levels.length === 0) return [];

        const clusters = [];
        const used = new Set();

        for (let i = 0; i < levels.length; i++) {
            if (used.has(i)) continue;

            const cluster = [levels[i]];
            used.add(i);

            for (let j = i + 1; j < levels.length; j++) {
                if (used.has(j)) continue;

                const priceDiff = Math.abs(levels[i].price - levels[j].price) / levels[i].price;
                if (priceDiff <= this.options.clusterRange) {
                    cluster.push(levels[j]);
                    used.add(j);
                }
            }

            // Объединяем кластер
            const totalVolume = cluster.reduce((sum, l) => sum + l.volume, 0);
            const avgPrice = cluster.reduce((sum, l) => sum + l.price, 0) / cluster.length;
            const maxStrength = Math.max(...cluster.map(l => l.strength));

            clusters.push({
                price: avgPrice,
                volume: totalVolume,
                strength: maxStrength,
                color: this._getColorByStrength(maxStrength, cluster[0].type),
                type: cluster[0].type,
                ratio: cluster[0].ratio,
                count: cluster.length
            });
        }

        return clusters;
    }

    /**
     * Получаем цвет по силе уровня
     * @private
     */
    _getColorByStrength(strength, type) {
        // Градиент от слабого к сильному
        if (type === 'support') {
            // Зелёные тона: светло-зелёный -> ярко-зелёный
            if (strength < 30) return 'rgba(0, 200, 83, 0.3)';
            if (strength < 50) return 'rgba(0, 200, 83, 0.5)';
            if (strength < 70) return 'rgba(0, 200, 83, 0.7)';
            if (strength < 90) return 'rgba(0, 255, 100, 0.85)';
            return 'rgba(0, 255, 100, 1)';
        } else {
            // Красные тона: светло-красный -> ярко-красный
            if (strength < 30) return 'rgba(255, 23, 68, 0.3)';
            if (strength < 50) return 'rgba(255, 23, 68, 0.5)';
            if (strength < 70) return 'rgba(255, 23, 68, 0.7)';
            if (strength < 90) return 'rgba(255, 50, 80, 0.85)';
            return 'rgba(255, 50, 80, 1)';
        }
    }

    /**
     * Формируем сводку
     * @private
     */
    _buildSummary(orderBook, supportLevels, resistanceLevels) {
        const totalBidVolume = orderBook.bids.reduce((sum, [, v]) => sum + v, 0);
        const totalAskVolume = orderBook.asks.reduce((sum, [, v]) => sum + v, 0);

        const bestBid = orderBook.bids[0]?.[0] || 0;
        const bestAsk = orderBook.asks[0]?.[0] || 0;
        const midPrice = (bestBid + bestAsk) / 2;
        const spread = bestAsk - bestBid;
        const spreadPercent = (spread / midPrice * 100).toFixed(4);

        // Ближайший сильный уровень поддержки
        const nearestSupport = supportLevels
            .filter(l => l.price < midPrice)
            .sort((a, b) => b.price - a.price)[0];

        // Ближайший сильный уровень сопротивления
        const nearestResistance = resistanceLevels
            .filter(l => l.price > midPrice)
            .sort((a, b) => a.price - b.price)[0];

        return {
            midPrice,
            spread,
            spreadPercent,
            totalBidVolume,
            totalAskVolume,
            bidAskRatio: (totalBidVolume / totalAskVolume).toFixed(2),
            nearestSupport,
            nearestResistance,
            supportCount: supportLevels.length,
            resistanceCount: resistanceLevels.length
        };
    }

    /**
     * Форматируем для отображения
     * @param {number} value
     * @returns {string}
     */
    formatVolume(value) {
        if (value >= 1000000) return (value / 1000000).toFixed(2) + 'M';
        if (value >= 1000) return (value / 1000).toFixed(2) + 'K';
        return value.toFixed(2);
    }
}

// Глобальный экземпляр
export const levelAnalyzer = new LevelAnalyzer();
