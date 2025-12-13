/* ===========================================================
 * BaseExchangeAdapter - Базовый класс для адаптеров бирж
 * Наследуем и реализуем методы для каждой биржи
 * =========================================================== */

/**
 * Абстрактный базовый класс для адаптеров бирж
 * Определяем общий интерфейс для всех бирж
 */
export class BaseExchangeAdapter {
    constructor(symbol, streams = ['kline', 'depth', 'trade']) {
        this.symbol = symbol;
        this.streams = streams;
        this.ws = null;
        this.pingInterval = null;
        this.isConnected = false;

        // Коллбэки - переопределяются в WebSocketManager
        this.onMessage = null;
        this.onError = null;
        this.onClose = null;
    }

    /**
     * Получаем URL для подключения - ПЕРЕОПРЕДЕЛЯЕМ
     * @returns {string}
     */
    getWebSocketUrl() {
        throw new Error('getWebSocketUrl() нужно переопределить');
    }

    /**
     * Формируем сообщение подписки - ПЕРЕОПРЕДЕЛЯЕМ
     * @returns {Object|Array|null}
     */
    getSubscribeMessage() {
        throw new Error('getSubscribeMessage() нужно переопределить');
    }

    /**
     * Парсим входящее сообщение - ПЕРЕОПРЕДЕЛЯЕМ
     * @param {Object} data - Сырые данные от биржи
     * @returns {{ type: string, data: any } | null}
     */
    parseMessage(data) {
        throw new Error('parseMessage() нужно переопределить');
    }

    /**
     * Подключаемся к WebSocket
     */
    connect() {
        const url = this.getWebSocketUrl();

        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
            this.isConnected = true;
            this._onOpen();
        };

        this.ws.onmessage = (event) => {
            this._handleRawMessage(event.data);
        };

        this.ws.onerror = (error) => {
            if (this.onError) {
                this.onError(error);
            }
        };

        this.ws.onclose = () => {
            this.isConnected = false;
            this._cleanup();
            if (this.onClose) {
                this.onClose();
            }
        };
    }

    /**
     * Закрываем подключение
     */
    close() {
        if (this.ws) {
            this.ws.close();
            this._cleanup();
        }
    }

    /**
     * Отправляем сообщение
     * @param {Object} message
     */
    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    /**
     * Обработка при открытии соединения
     * @private
     */
    _onOpen() {
        // Отправляем сообщение подписки
        const subscribeMsg = this.getSubscribeMessage();
        if (subscribeMsg) {
            if (Array.isArray(subscribeMsg)) {
                subscribeMsg.forEach(msg => this.send(msg));
            } else {
                this.send(subscribeMsg);
            }
        }

        // Запускаем ping если нужен
        this._startPing();
    }

    /**
     * Обработка сырого сообщения
     * @private
     */
    _handleRawMessage(rawData) {
        try {
            // Некоторые биржи шлют сжатые данные (gzip)
            const data = this._decompress(rawData);
            const parsed = this.parseMessage(data);

            if (parsed && this.onMessage) {
                this.onMessage(parsed.type, parsed.data);
            }
        } catch (e) {
            console.error('Ошибка парсинга сообщения:', e);
        }
    }

    /**
     * Распаковываем данные если нужно
     * @private
     */
    _decompress(data) {
        // По умолчанию просто парсим JSON
        if (typeof data === 'string') {
            return JSON.parse(data);
        }
        // Для бинарных данных (gzip) - переопределяем в конкретных адаптерах
        return data;
    }

    /**
     * Запускаем ping для поддержания соединения
     * @private
     */
    _startPing() {
        // Переопределяем в конкретных адаптерах если нужен ping
    }

    /**
     * Очистка ресурсов
     * @private
     */
    _cleanup() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        this.ws = null;
    }
}
