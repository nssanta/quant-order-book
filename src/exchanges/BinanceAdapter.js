/* ===========================================================
 * BinanceAdapter - Адаптер для Binance WebSocket API
 * Подключаемся к stream.binance.com напрямую из браузера
 * =========================================================== */

import { BaseExchangeAdapter } from './BaseExchangeAdapter.js';

/**
 * Маппинг таймфреймов для Binance
 */
export const BINANCE_INTERVALS = {
    '1s': '1s',
    '1m': '1m',
    '3m': '3m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1h',
    '2h': '2h',
    '4h': '4h',
    '6h': '6h',
    '8h': '8h',
    '12h': '12h',
    '1d': '1d',
    '3d': '3d',
    '1w': '1w',
    '1M': '1M'
};

/**
 * Адаптер для Binance Spot WebSocket
 */
export class BinanceAdapter extends BaseExchangeAdapter {
    constructor(symbol, streams = ['kline', 'depth', 'trade'], options = {}) {
        super(symbol, streams);
        this.interval = options.interval || '1h';
        this.depthLevel = options.depthLevel || 20; // 5, 10, 20
    }

    /**
     * Формируем URL с нужными стримами
     * Binance позволяет комбинировать стримы в одном подключении
     */
    getWebSocketUrl() {
        const symbol = this.symbol.toLowerCase();
        const streamNames = [];

        if (this.streams.includes('kline')) {
            streamNames.push(`${symbol}@kline_${this.interval}`);
        }

        if (this.streams.includes('depth')) {
            // Используем @depth@100ms для более частых обновлений
            streamNames.push(`${symbol}@depth@100ms`);
        }

        if (this.streams.includes('trade')) {
            streamNames.push(`${symbol}@trade`);
        }

        // Комбинированный стрим
        return `wss://stream.binance.com:9443/stream?streams=${streamNames.join('/')}`;
    }

    /**
     * Binance не требует сообщения подписки для комбинированных стримов
     */
    getSubscribeMessage() {
        return null;
    }

    /**
     * Парсим сообщения от Binance
     */
    parseMessage(data) {
        // Binance комбинированный стрим имеет формат: { stream, data }
        if (!data.stream || !data.data) {
            return null;
        }

        const streamName = data.stream;
        const payload = data.data;

        // Определяем тип стрима
        if (streamName.includes('@kline_')) {
            return this._parseKline(payload);
        }

        if (streamName.includes('@depth')) {
            return this._parseDepth(payload);
        }

        if (streamName.includes('@trade')) {
            return this._parseTrade(payload);
        }

        return null;
    }

    /**
     * Парсим свечу
     * @private
     */
    _parseKline(data) {
        const k = data.k;
        return {
            type: 'kline',
            data: {
                time: k.t / 1000, // Unix timestamp в секундах
                open: parseFloat(k.o),
                high: parseFloat(k.h),
                low: parseFloat(k.l),
                close: parseFloat(k.c),
                volume: parseFloat(k.v),
                isClosed: k.x // Свеча закрыта?
            }
        };
    }

    /**
     * Парсим обновление стакана
     * @private
     */
    _parseDepth(data) {
        return {
            type: 'depthUpdate',
            data: {
                bids: data.b, // [[price, qty], ...]
                asks: data.a,
                lastUpdateId: data.u
            }
        };
    }

    /**
     * Парсим сделку
     * @private
     */
    _parseTrade(data) {
        const price = parseFloat(data.p);
        const volume = parseFloat(data.q);

        // Защита от NaN
        if (isNaN(price) || isNaN(volume)) {
            console.warn('[BinanceAdapter] Invalid trade data:', data);
            return null;
        }

        return {
            type: 'trade',
            data: {
                id: data.t,
                price,
                volume,  // Используем volume вместо qty
                qty: volume,
                time: data.T,
                isBuy: !data.m,  // m=true означает продажа, так что !m = покупка
                isBuyerMaker: data.m
            }
        };
    }

    /**
     * Меняем таймфрейм на лету
     * @param {string} newInterval
     */
    changeInterval(newInterval) {
        if (this.interval === newInterval) return;

        const symbol = this.symbol.toLowerCase();
        const oldStream = `${symbol}@kline_${this.interval}`;
        const newStream = `${symbol}@kline_${newInterval}`;

        // Отписываемся от старого, подписываемся на новый
        this.send({
            method: 'UNSUBSCRIBE',
            params: [oldStream],
            id: Date.now()
        });

        this.send({
            method: 'SUBSCRIBE',
            params: [newStream],
            id: Date.now() + 1
        });

        this.interval = newInterval;
    }
}

/**
 * Получаем список торговых пар с Binance
 * @returns {Promise<Array>}
 */
export async function getBinanceSymbols() {
    try {
        const response = await fetch('https://api.binance.com/api/v3/exchangeInfo');
        const data = await response.json();

        return data.symbols
            .filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT')
            .map(s => ({
                symbol: s.symbol,
                baseAsset: s.baseAsset,
                quoteAsset: s.quoteAsset
            }));
    } catch (e) {
        console.error('Ошибка получения списка пар Binance:', e);
        return [];
    }
}

/**
 * Получаем начальный снэпшот стакана
 * @param {string} symbol
 * @param {number} limit
 */
export async function getBinanceOrderBookSnapshot(symbol, limit = 100) {
    try {
        const response = await fetch(
            `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=${limit}`
        );
        const data = await response.json();

        return {
            bids: data.bids,
            asks: data.asks,
            lastUpdateId: data.lastUpdateId
        };
    } catch (e) {
        console.error('Ошибка получения стакана Binance:', e);
        return { bids: [], asks: [], lastUpdateId: 0 };
    }
}

/**
 * Получаем исторические свечи
 * @param {string} symbol
 * @param {string} interval
 * @param {number} limit
 */
export async function getBinanceKlines(symbol, interval = '1h', limit = 500) {
    try {
        const response = await fetch(
            `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
        );
        const data = await response.json();

        return data.map(k => ({
            time: k[0] / 1000,
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5])
        }));
    } catch (e) {
        console.error('Ошибка получения свечей Binance:', e);
        return [];
    }
}
