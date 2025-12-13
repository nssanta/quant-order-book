/* ===========================================================
 * OKXAdapter - Адаптер для OKX WebSocket API
 * Подключаемся к ws.okx.com напрямую из браузера
 * =========================================================== */

import { BaseExchangeAdapter } from './BaseExchangeAdapter.js';

/**
 * Маппинг таймфреймов для OKX
 */
export const OKX_INTERVALS = {
    '1m': '1m',
    '3m': '3m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1H',
    '2h': '2H',
    '4h': '4H',
    '6h': '6H',
    '12h': '12H',
    '1d': '1D',
    '1w': '1W',
    '1M': '1M'
};

/**
 * Адаптер для OKX Spot WebSocket
 */
export class OKXAdapter extends BaseExchangeAdapter {
    constructor(symbol, streams = ['kline', 'depth', 'trade'], options = {}) {
        super(symbol, streams);
        this.interval = options.interval || '1H';
        this.depthLevel = options.depthLevel || 'books5'; // books5, books50-l2-tbt, books-l2-tbt
    }

    /**
     * OKX использует единый endpoint
     */
    getWebSocketUrl() {
        return 'wss://ws.okx.com:8443/ws/v5/public';
    }

    /**
     * Формируем сообщения подписки для OKX
     */
    getSubscribeMessage() {
        const instId = this._formatSymbol(this.symbol);
        const args = [];

        if (this.streams.includes('kline')) {
            args.push({
                channel: `candle${this.interval}`,
                instId
            });
        }

        if (this.streams.includes('depth')) {
            // books5 = 5 уровней, быстрое обновление
            // books50-l2-tbt = 50 уровней tick-by-tick
            args.push({
                channel: this.depthLevel,
                instId
            });
        }

        if (this.streams.includes('trade')) {
            args.push({
                channel: 'trades',
                instId
            });
        }

        return {
            op: 'subscribe',
            args
        };
    }

    /**
     * Парсим сообщения от OKX
     */
    parseMessage(data) {
        // Пропускаем служебные сообщения
        if (data.event === 'subscribe' || data.event === 'error') {
            if (data.event === 'error') {
                console.error('OKX ошибка:', data.msg);
            }
            return null;
        }

        // Пропускаем pong
        if (data === 'pong') return null;

        const channel = data.arg?.channel;
        const payload = data.data?.[0];

        if (!channel || !payload) return null;

        // Определяем тип канала
        if (channel.startsWith('candle')) {
            return this._parseKline(payload);
        }

        if (channel.startsWith('books')) {
            return this._parseDepth(data);
        }

        if (channel === 'trades') {
            return this._parseTrade(payload);
        }

        return null;
    }

    /**
     * Парсим свечу OKX
     * @private
     */
    _parseKline(data) {
        // OKX: [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
        return {
            type: 'kline',
            data: {
                time: parseInt(data[0]) / 1000,
                open: parseFloat(data[1]),
                high: parseFloat(data[2]),
                low: parseFloat(data[3]),
                close: parseFloat(data[4]),
                volume: parseFloat(data[5]),
                isClosed: data[8] === '1'
            }
        };
    }

    /**
     * Парсим стакан OKX
     * @private
     */
    _parseDepth(data) {
        const payload = data.data?.[0];
        if (!payload) return null;

        return {
            type: data.action === 'snapshot' ? 'depth' : 'depthUpdate',
            data: {
                bids: payload.bids, // [[price, size, liquidOrders, numOrders], ...]
                asks: payload.asks,
                timestamp: payload.ts
            }
        };
    }

    /**
     * Парсим сделку OKX
     * @private
     */
    _parseTrade(data) {
        return {
            type: 'trade',
            data: {
                id: data.tradeId,
                price: parseFloat(data.px),
                qty: parseFloat(data.sz),
                time: parseInt(data.ts),
                isBuyerMaker: data.side === 'sell'
            }
        };
    }

    /**
     * Запускаем ping для OKX
     * @private
     */
    _startPing() {
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send('ping');
            }
        }, 20000); // Пинг каждые 20 сек
    }

    /**
     * Форматируем символ для OKX (BTCUSDT -> BTC-USDT)
     * @private
     */
    _formatSymbol(symbol) {
        // Предполагаем что USDT всегда в конце
        if (symbol.endsWith('USDT')) {
            return symbol.replace('USDT', '-USDT');
        }
        return symbol;
    }

    /**
     * Меняем таймфрейм
     */
    changeInterval(newInterval) {
        if (this.interval === newInterval) return;

        const instId = this._formatSymbol(this.symbol);

        // Отписываемся
        this.send({
            op: 'unsubscribe',
            args: [{
                channel: `candle${this.interval}`,
                instId
            }]
        });

        // Подписываемся на новый
        this.send({
            op: 'subscribe',
            args: [{
                channel: `candle${newInterval}`,
                instId
            }]
        });

        this.interval = newInterval;
    }
}

/**
 * Получаем список торговых пар OKX
 */
export async function getOKXSymbols() {
    try {
        const response = await fetch('https://www.okx.com/api/v5/public/instruments?instType=SPOT');
        const data = await response.json();

        return data.data
            .filter(s => s.quoteCcy === 'USDT' && s.state === 'live')
            .map(s => ({
                symbol: s.instId.replace('-', ''),
                instId: s.instId,
                baseAsset: s.baseCcy,
                quoteAsset: s.quoteCcy
            }));
    } catch (e) {
        console.error('Ошибка получения списка пар OKX:', e);
        return [];
    }
}

/**
 * Получаем исторические свечи OKX
 */
export async function getOKXKlines(symbol, interval = '1H', limit = 100) {
    try {
        const instId = symbol.endsWith('USDT') ? symbol.replace('USDT', '-USDT') : symbol;
        const response = await fetch(
            `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${interval}&limit=${limit}`
        );
        const data = await response.json();

        // OKX возвращает от новых к старым, разворачиваем
        return data.data.reverse().map(k => ({
            time: parseInt(k[0]) / 1000,
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5])
        }));
    } catch (e) {
        console.error('Ошибка получения свечей OKX:', e);
        return [];
    }
}
