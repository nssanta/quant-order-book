/* ===========================================================
 * StorageManager - Управление хранилищем данных
 * IndexedDB для рисунков, LocalStorage для настроек
 * =========================================================== */

import Dexie from 'dexie';

/**
 * Инициализируем Dexie базу данных
 */
const db = new Dexie('OrderBookPro');

// Определяем схему базы данных
db.version(1).stores({
    // Рисунки пользователя на графике
    drawings: '++id, symbol, exchange, type, createdAt',

    // История стаканов для replay (опционально)
    orderBookSnapshots: '++id, symbol, exchange, timestamp',

    // Пользовательские настройки индикаторов
    indicators: '++id, symbol, name, settings'
});

/**
 * Класс для управления хранилищем
 */
export class StorageManager {
    constructor() {
        this.db = db;
        this.settingsKey = 'orderbook_pro_settings';
    }

    // ============================================
    // Настройки (LocalStorage)
    // ============================================

    /**
     * Получаем все настройки
     * @returns {Object}
     */
    getSettings() {
        try {
            const raw = localStorage.getItem(this.settingsKey);
            return raw ? JSON.parse(raw) : this._getDefaultSettings();
        } catch {
            return this._getDefaultSettings();
        }
    }

    /**
     * Сохраняем настройки
     * @param {Object} settings
     */
    saveSettings(settings) {
        localStorage.setItem(this.settingsKey, JSON.stringify(settings));
    }

    /**
     * Обновляем конкретную настройку
     * @param {string} key
     * @param {any} value
     */
    updateSetting(key, value) {
        const settings = this.getSettings();
        settings[key] = value;
        this.saveSettings(settings);
        return settings;
    }

    /**
     * Дефолтные настройки
     * @private
     */
    _getDefaultSettings() {
        return {
            exchange: 'binance',
            symbol: 'BTCUSDT',
            timeframe: '1h',
            theme: 'dark',
            orderBookDepth: 20,
            orderBookMode: 'ladder', // 'ladder' | 'heatmap' | 'depth'
            showAnalytics: true,
            heatmapOpacity: 0.6,
            heatmapMaxAge: 300000, // 5 минут истории
        };
    }

    // ============================================
    // Рисунки (IndexedDB)
    // ============================================

    /**
     * Сохраняем рисунок на график
     * @param {Object} drawing - { type, points, style, symbol, exchange }
     * @returns {Promise<number>} - ID рисунка
     */
    async saveDrawing(drawing) {
        return await this.db.drawings.add({
            ...drawing,
            createdAt: Date.now()
        });
    }

    /**
     * Загружаем все рисунки для символа
     * @param {string} exchange
     * @param {string} symbol
     * @returns {Promise<Array>}
     */
    async getDrawings(exchange, symbol) {
        return await this.db.drawings
            .where({ exchange, symbol })
            .toArray();
    }

    /**
     * Обновляем рисунок
     * @param {number} id
     * @param {Object} updates
     */
    async updateDrawing(id, updates) {
        return await this.db.drawings.update(id, updates);
    }

    /**
     * Удаляем рисунок
     * @param {number} id
     */
    async deleteDrawing(id) {
        return await this.db.drawings.delete(id);
    }

    /**
     * Удаляем все рисунки для символа
     * @param {string} exchange
     * @param {string} symbol
     */
    async clearDrawings(exchange, symbol) {
        return await this.db.drawings
            .where({ exchange, symbol })
            .delete();
    }

    // ============================================
    // Снэпшоты стакана (IndexedDB) - для heatmap истории
    // ============================================

    /**
     * Сохраняем снэпшот стакана
     * @param {string} exchange
     * @param {string} symbol
     * @param {Object} data - { bids, asks }
     */
    async saveOrderBookSnapshot(exchange, symbol, data) {
        const timestamp = Date.now();

        await this.db.orderBookSnapshots.add({
            exchange,
            symbol,
            timestamp,
            data
        });

        // Очищаем старые снэпшоты (храним только последние 5 минут)
        const maxAge = this.getSettings().heatmapMaxAge;
        const cutoff = timestamp - maxAge;

        await this.db.orderBookSnapshots
            .where('timestamp')
            .below(cutoff)
            .delete();
    }

    /**
     * Получаем историю стаканов для heatmap
     * @param {string} exchange
     * @param {string} symbol
     * @param {number} since - timestamp начала
     * @returns {Promise<Array>}
     */
    async getOrderBookHistory(exchange, symbol, since) {
        return await this.db.orderBookSnapshots
            .where({ exchange, symbol })
            .filter(item => item.timestamp >= since)
            .toArray();
    }

    // ============================================
    // Индикаторы (IndexedDB)
    // ============================================

    /**
     * Сохраняем настройки индикатора
     * @param {string} symbol
     * @param {string} name
     * @param {Object} settings
     */
    async saveIndicator(symbol, name, settings) {
        const existing = await this.db.indicators
            .where({ symbol, name })
            .first();

        if (existing) {
            return await this.db.indicators.update(existing.id, { settings });
        } else {
            return await this.db.indicators.add({ symbol, name, settings });
        }
    }

    /**
     * Получаем индикаторы для символа
     * @param {string} symbol
     */
    async getIndicators(symbol) {
        return await this.db.indicators
            .where({ symbol })
            .toArray();
    }

    /**
     * Удаляем индикатор
     * @param {number} id
     */
    async deleteIndicator(id) {
        return await this.db.indicators.delete(id);
    }
}

// Создаём глобальный экземпляр
export const storage = new StorageManager();
