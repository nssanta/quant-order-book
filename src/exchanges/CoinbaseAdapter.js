/* ===========================================================
 * CoinbaseAdapter - Адаптер для Coinbase Advanced Trade WebSocket
 * Подключаемся к advanced-trade-ws.coinbase.com
 * =========================================================== */

import { BaseExchangeAdapter } from './BaseExchangeAdapter.js';

/**
 * Coinbase не поддерживает свечи через WebSocket
 * Только level2 (стакан) и market_trades
 */
export class CoinbaseAdapter extends BaseExchangeAdapter {
    constructor(symbol, streams = ['depth', 'trade'], options = {}) {
        // Coinbase не имеет realtime klines, только REST
        super(symbol, streams.filter(s => s !== 'kline'));
        this.productId = this._formatSymbol(symbol);
    }

    /**
     * Coinbase Advanced Trade WebSocket
     */
    getWebSocketUrl() {
        return 'wss://advanced-trade-ws.coinbase.com';
    }

    /**
     * Формируем подписку для Coinbase
     */
    getSubscribeMessage() {
        const channels = [];

        if (this.streams.includes('depth')) {
            channels.push('level2');
        }

        if (this.streams.includes('trade')) {
            channels.push('market_trades');
        }

        return {
            type: 'subscribe',
            product_ids: [this.productId],
            channel: channels[0], // Coinbase требует отдельную подписку на каждый канал
            // Для нескольких каналов шлём несколько сообщений
        };
    }

    /**
     * Переопределяем открытие для multiple subscriptions
     * @private
     */
    _onOpen() {
        // Coinbase требует отдельное сообщение для каждого канала
        if (this.streams.includes('depth')) {
            this.send({
                type: 'subscribe',
                product_ids: [this.productId],
                channel: 'level2'
            });
        }

        if (this.streams.includes('trade')) {
            this.send({
                type: 'subscribe',
                product_ids: [this.productId],
                channel: 'market_trades'
            });
        }

        this._startPing();
    }

    /**
     * Парсим сообщения от Coinbase
     */
    parseMessage(data) {
        const channel = data.channel;

        if (!channel) return null;

        // Пропускаем служебные
        if (data.type === 'subscriptions' || data.type === 'error') {
            if (data.type === 'error') {
                console.error('Coinbase ошибка:', data.message);
            }
            return null;
        }

        if (channel === 'l2_data' || channel === 'level2') {
            return this._parseDepth(data);
        }

        if (channel === 'market_trades') {
            return this._parseTrade(data);
        }

        return null;
    }

    /**
     * Парсим стакан Coinbase
     * @private
     */
    _parseDepth(data) {
        const events = data.events;
        if (!events?.length) return null;

        const event = events[0];
        const updates = event.updates || [];

        const bids = [];
        const asks = [];

        for (const u of updates) {
            const entry = [u.price_level, u.new_quantity];
            if (u.side === 'bid') {
                bids.push(entry);
            } else {
                asks.push(entry);
            }
        }

        return {
            type: event.type === 'snapshot' ? 'depth' : 'depthUpdate',
            data: { bids, asks }
        };
    }

    /**
     * Парсим сделку Coinbase
     * @private
     */
    _parseTrade(data) {
        const trades = data.events?.[0]?.trades;
        if (!trades?.length) return null;

        const t = trades[trades.length - 1];

        return {
            type: 'trade',
            data: {
                id: t.trade_id,
                price: parseFloat(t.price),
                qty: parseFloat(t.size),
                time: new Date(t.time).getTime(),
                isBuyerMaker: t.side === 'SELL'
            }
        };
    }

    /**
     * Ping для Coinbase (heartbeat)
     * @private
     */
    _startPing() {
        // Coinbase использует heartbeat channel
        this.send({
            type: 'subscribe',
            product_ids: [this.productId],
            channel: 'heartbeats'
        });
    }

    /**
     * Форматируем символ для Coinbase (BTCUSDT -> BTC-USD)
     * @private
     */
    _formatSymbol(symbol) {
        // Coinbase использует USD, не USDT
        if (symbol.endsWith('USDT')) {
            return symbol.replace('USDT', '-USD');
        }
        if (symbol.endsWith('USD')) {
            return symbol.slice(0, -3) + '-USD';
        }
        return symbol;
    }
}

/**
 * Получаем список продуктов Coinbase
 */
export async function getCoinbaseSymbols() {
    try {
        const response = await fetch('https://api.coinbase.com/api/v3/brokerage/market/products');
        const data = await response.json();

        return data.products
            .filter(p => p.quote_currency_id === 'USD' && p.status === 'online')
            .map(p => ({
                symbol: p.product_id.replace('-', ''),
                productId: p.product_id,
                baseAsset: p.base_currency_id,
                quoteAsset: p.quote_currency_id
            }));
    } catch (e) {
        console.error('Ошибка получения списка пар Coinbase:', e);
        return [];
    }
}

/**
 * Получаем исторические свечи Coinbase
 * @param {string} symbol
 * @param {string} granularity - ONE_MINUTE, FIVE_MINUTE, FIFTEEN_MINUTE, THIRTY_MINUTE, ONE_HOUR, TWO_HOUR, SIX_HOUR, ONE_DAY
 * @param {number} limit
 */
export async function getCoinbaseKlines(symbol, granularity = 'ONE_HOUR', limit = 300) {
    try {
        const productId = symbol.endsWith('USDT')
            ? symbol.replace('USDT', '-USD')
            : symbol;

        const end = Math.floor(Date.now() / 1000);
        const start = end - (limit * getGranularitySeconds(granularity));

        const response = await fetch(
            `https://api.coinbase.com/api/v3/brokerage/market/products/${productId}/candles?start=${start}&end=${end}&granularity=${granularity}`
        );
        const data = await response.json();

        // Coinbase возвращает от новых к старым
        return data.candles.reverse().map(k => ({
            time: parseInt(k.start),
            open: parseFloat(k.open),
            high: parseFloat(k.high),
            low: parseFloat(k.low),
            close: parseFloat(k.close),
            volume: parseFloat(k.volume)
        }));
    } catch (e) {
        console.error('Ошибка получения свечей Coinbase:', e);
        return [];
    }
}

/**
 * Переводим granularity в секунды
 */
function getGranularitySeconds(granularity) {
    const map = {
        'ONE_MINUTE': 60,
        'FIVE_MINUTE': 300,
        'FIFTEEN_MINUTE': 900,
        'THIRTY_MINUTE': 1800,
        'ONE_HOUR': 3600,
        'TWO_HOUR': 7200,
        'SIX_HOUR': 21600,
        'ONE_DAY': 86400
    };
    return map[granularity] || 3600;
}
