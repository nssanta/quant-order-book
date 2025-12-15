# 📊 Quant Order Book

[![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-yellow.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Vite](https://img.shields.io/badge/Vite-5.x-646CFF.svg)](https://vitejs.dev/)
[![KLineChart](https://img.shields.io/badge/Charts-KLineChart-0088cc.svg)](https://klinecharts.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

**Профессиональная** платформа визуализации криптовалютного стакана с тепловыми картами в реальном времени, продвинутой аналитикой и mobile-first дизайном. Создана для трейдеров, которым нужны **институциональные инструменты** в чистом, отзывчивом интерфейсе.

[🇬🇧 English](README.md) | [🇷🇺 Русская версия](README_RU.md)

---

## 🎯 Почему OrderBook Pro?

Традиционные инструменты стакана либо:
- Требуют дорогих подписок (TradingView Premium, Bookmap)
- Не имеют визуализации тепловой карты в реальном времени
- Плохо работают на мобильных
- Не показывают кумулятивную дельту объёмов (CVD)

**Quant Order Book решает эти проблемы:**

✅ **Тепловая карта в реальном времени** — 5000 уровней стакана на графике  
✅ **Профессиональное рисование** — Трендовые, Фибоначчи, Каналы, Текст, Фигуры
✅ **Технические индикаторы** — MA, EMA, MACD, RSI, Bollinger Bands и ещё 20+
✅ **Мульти-биржа** — Binance, OKX, Bybit  
✅ **Quant-метрики** — Index α, Delta, CVD, Imbalance, Spread  
✅ **Mobile-First** — удобная нижняя навигация и адаптивность
✅ **Бесплатно** — open-source, без подписок  

---

## 🚀 Быстрый старт

### Требования

- Node.js 18+ 
- npm или yarn

### Установка

```bash
# Клонируем репозиторий
git clone https://github.com/nssanta/quant-order-book.git
cd quant-order-book

# Устанавливаем зависимости
npm install

# Запускаем dev сервер
npm run dev
```

Открой **http://localhost:5173** в браузере.

### Production сборка

```bash
npm run build
npm run preview
```

---

## 📖 Возможности

### 🌡️ Тепловая карта стакана

Визуализация глубины стакана в реальном времени поверх свечного графика:

- **Зелёные зоны** = Bid-ордера (покупатели)
- **Красные зоны** = Ask-ордера (продавцы)  
- **Яркость** = Интенсивность объёма
- **Авто-скролл** = Карта следует за графиком

### ✏️ Инструменты рисования

Полный набор инструментов на базе KLineChart:
- **Линии**: Тренд, Луч, Прямая
- **Уровни**: Горизонтальный луч, Отрезок, Ценовая линия
- **Фигуры**: Прямоугольник, Круг, Каналы, Фибоначчи
- **Текст**: Заметки, Таги

### 📊 Индикаторы

Обширная библиотека встроенных индикаторов:
- **Тренд**: MA, EMA, SMA, BOLL, SAR, BBI
- **Осцилляторы**: MACD, KDJ, RSI, CCI, AO, ROC
- **Объём**: VOL, OBV, MFI, PVT
- **Другие**: WR, MTM, CR, DMA, TRIX

### 📊 Продвинутая аналитика

| Метрика | Описание |
|---------|----------|
| **Index α** | Соотношение силы покупателей к продавцам. >1 = покупатели сильнее |
| **Delta** | Объём покупок минус объём продаж |
| **CVD** | Кумулятивная дельта объёмов за период |
| **Imbalance** | Дисбаланс bid/ask в стакане (%) |
| **Spread** | Лучший ask - лучший bid |

### 📱 Мобильный интерфейс

- **Bottom Navigation** — 5 вкладок: Chart, Draw, Book, Info, Settings
- **Компактный Header** — Биржа, Пара, Таймфрейм в одну строку
- **Touch-Optimized** — Свайпы, пинч-зум, адаптивная вёрстка
- **Оптимизированный стакан** — Сайдбар на весь экран

### 🏦 Поддержка бирж

| Биржа | Статус | Функции |
|-------|--------|---------|
| Binance | ✅ Полный | Свечи, Стакан, Сделки |
| OKX | ✅ Полный | Свечи, Стакан |
| Bybit | ✅ Полный | Свечи, Стакан |
| Coinbase | ⚠️ Базовый | Только свечи |

---

## 🏗️ Структура проекта

```
orderbook-pro/
├── index.html              # Точка входа
├── src/
│   ├── main.js             # Инициализация и UI логика
│   ├── charts/
│   │   ├── CandlestickChart.js    # KLineChart обёртка
│   │   ├── OrderBookHeatmap.js    # Хитмап на оверлеях
│   │   ├── CVDChart.js            # D3.js CVD визуализация
│   │   ├── DepthChart.js          # Глубина стакана
│   │   └── DOMLadder.js           # DOM Ladder вид
│   ├── components/
│   │   ├── SettingsPanel.js       # Настройки пользователя
│   │   └── LevelsSummary.js       # Ключевые уровни цен
│   ├── exchanges/
│   │   ├── BinanceAdapter.js      # Binance WebSocket
│   │   ├── OKXAdapter.js          # OKX WebSocket
│   │   ├── BybitAdapter.js        # Bybit WebSocket
│   │   └── CoinbaseAdapter.js     # Coinbase WebSocket
│   ├── analytics/
│   │   ├── IndexAlpha.js          # Quant-метрики
│   │   └── LevelAnalyzer.js       # Детекция уровней
│   ├── core/
│   │   ├── WebSocketManager.js    # Multi-WS менеджер
│   │   └── StorageManager.js      # LocalStorage
│   └── styles/
│       └── main.css               # TradingView-like тема
```

---

## ⚙️ Настройки

Панель настроек позволяет кастомизировать:

| Настройка | Опции | По умолчанию |
|-----------|-------|--------------|
| Цвет роста свечи | Любой HEX | `#00c853` |
| Цвет падения свечи | Любой HEX | `#ff1744` |
| Прозрачность heatmap | 0.1 - 1.0 | `0.7` |
| Уровней heatmap | 50-500 | `100` |
| Глубина стакана | 5-100 | `20` |

Пресеты: Classic, TradingView, Binance, Monochrome

---

## 🔧 Технические детали

### Ключевые технологии

- **KLineChart** — Профессиональный движок для финансовых графиков
- **D3.js** — CVD chart визуализация  
- **WebSocket** — Стриминг данных в реальном времени
- **Vite** — Быстрый dev сервер и сборщик

### Производительность

- Отрисовка хитмапа через оверлеи
- Эффективная обработка WebSocket сообщений
- Debounced ре-рендер при изменении настроек

---

## 📄 Лицензия

MIT License — бесплатно для личного и коммерческого использования.
