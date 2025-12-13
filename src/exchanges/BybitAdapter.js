/* ===========================================================
 * BybitAdapter - Адаптер для Bybit WebSocket API
 * Подключаемся к stream.bybit.com напрямую из браузера
 * =========================================================== */

import { BaseExchangeAdapter } from './BaseExchangeAdapter.js';

/**
 * Маппинг таймфреймов для Bybit
 */
export const BYBIT_INTERVALS = {
    '1m': '1',
    '3m': '3',
    '5m': '5',
    '15m': '15',
    '30m': '30',
    '1h': '60',
    '2h': '120',
    '4h': '240',
    '6h': '360',
    '12h': '720',
    '1d': 'D',
    '1w': 'W',
    '1M': 'M'
};

/**
 * Адаптер для Bybit Spot WebSocket V5
 */
export class BybitAdapter extends BaseExchangeAdapter {
    constructor(symbol, streams = ['kline', 'depth', 'trade'], options = {}) {
        super(symbol, streams);
        this.interval = options.interval || '60';
        this.depthLevel = options.depthLevel || 50; // 1, 50, 200
    }

    /**
     * Bybit V5 Spot WebSocket
     */
    getWebSocketUrl() {
        return 'wss://stream.bybit.com/v5/public/spot';
    }

    /**
     * Формируем сообщения подписки
     */
    getSubscribeMessage() {
        const symbol = this.symbol.toUpperCase();
        const args = [];

        if (this.streams.includes('kline')) {
            args.push(`kline.${this.interval}.${symbol}`);
        }

        if (this.streams.includes('depth')) {
            args.push(`orderbook.${this.depthLevel}.${symbol}`);
        }

        if (this.streams.includes('trade')) {
            args.push(`publicTrade.${symbol}`);
        }

        return {
            op: 'subscribe',
            args
        };
    }

    /**
     * Парсим сообщения от Bybit
     */
    parseMessage(data) {
        // Пропускаем служебные
        if (data.op === 'subscribe' || data.op === 'pong') {
            return null;
        }

        if (data.success === false) {
            console.error('Bybit ошибка:', data.ret_msg);
            return null;
        }

        const topic = data.topic;
        if (!topic) return null;

        // Определяем тип
        if (topic.startsWith('kline.')) {
            return this._parseKline(data);
        }

        if (topic.startsWith('orderbook.')) {
            return this._parseDepth(data);
        }

        if (topic.startsWith('publicTrade.')) {
            return this._parseTrade(data);
        }

        return null;
    }

    /**
     * Парсим свечу Bybit
     * @private
     */
    _parseKline(data) {
        const k = data.data?.[0];
        if (!k) return null;

        return {
            type: 'kline',
            data: {
                time: k.start / 1000,
                open: parseFloat(k.open),
                high: parseFloat(k.high),
                low: parseFloat(k.low),
                close: parseFloat(k.close),
                volume: parseFloat(k.volume),
                isClosed: k.confirm
            }
        };
    }

    /**
     * Парсим стакан Bybit
     * @private
     */
    _parseDepth(data) {
        const payload = data.data;
        if (!payload) return null;

        return {
            type: data.type === 'snapshot' ? 'depth' : 'depthUpdate',
            data: {
                bids: payload.b, // [[price, size], ...]
                asks: payload.a,
                updateId: payload.u,
                timestamp: data.ts
            }
        };
    }

    /**
     * Парсим сделку Bybit
     * @private
     */
    _parseTrade(data) {
        const trades = data.data;
        if (!trades?.length) return null;

        // Берём последнюю сделку
        const t = trades[trades.length - 1];

        return {
            type: 'trade',
            data: {
                id: t.i,
                price: parseFloat(t.p),
                qty: parseFloat(t.v),
                time: t.T,
                isBuyerMaker: t.S === 'Sell'
            }
        };
    }

    /**
     * Ping для Bybit
     * @private
     */
    _startPing() {
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.send({ op: 'ping' });
            }
        }, 20000);
    }

    /**
     * Меняем таймфрейм
     */
    changeInterval(newInterval) {
        if (this.interval === newInterval) return;

        const symbol = this.symbol.toUpperCase();

        // Отписываемся от старого
        this.send({
            op: 'unsubscribe',
            args: [`kline.${this.interval}.${symbol}`]
        });

        // Подписываемся на новый
        this.send({
            op: 'subscribe',
            args: [`kline.${newInterval}.${symbol}`]
        });

        this.interval = newInterval;
    }
}

/**
 * Получаем список пар Bybit
 */
export async function getBybitSymbols() {
    try {
        const response = await fetch('https://api.bybit.com/v5/market/instruments-info?category=spot');
        const data = await response.json();

        return data.result.list
            .filter(s => s.quoteCoin === 'USDT' && s.status === 'Trading')
            .map(s => ({
                symbol: s.symbol,
                baseAsset: s.baseCoin,
                quoteAsset: s.quoteCoin
            }));
    } catch (e) {
        console.error('Ошибка получения списка пар Bybit:', e);
        return [];
    }
}

/**
 * Получаем исторические свечи Bybit
 */
export async function getBybitKlines(symbol, interval = '60', limit = 200) {
    try {
        const response = await fetch(
            `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${interval}&limit=${limit}`
        );
        const data = await response.json();

        // Bybit возвращает от новых к старым
        return data.result.list.reverse().map(k => ({
            time: parseInt(k[0]) / 1000,
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5])
        }));
    } catch (e) {
        console.error('Ошибка получения свечей Bybit:', e);
        return [];
    }
}
