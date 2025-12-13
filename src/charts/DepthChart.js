/* ===========================================================
 * DepthChart - График глубины рынка (Depth Chart)
 * Визуализация кумулятивного объёма bid/ask
 * =========================================================== */

import * as d3 from 'd3';

/**
 * Компонент графика глубины
 * Используем D3.js для SVG рендера
 */
export class DepthChart {
    constructor(container, options = {}) {
        this.container = typeof container === 'string'
            ? document.querySelector(container)
            : container;

        this.options = {
            animationDuration: 250,
            bidColor: '#00c853',
            askColor: '#ff1744',
            bidFill: 'rgba(0, 200, 83, 0.2)',
            askFill: 'rgba(255, 23, 68, 0.2)',
            gridColor: 'rgba(255, 255, 255, 0.05)',
            textColor: '#8b8b8f',
            midLineColor: '#ffd600',
            ...options
        };

        this.data = { bids: [], asks: [] };
        this.svg = null;
        this.width = 0;
        this.height = 0;

        this._init();
        this._setupResizeObserver();
    }

    /**
     * Инициализируем SVG
     * @private
     */
    _init() {
        // Получаем размеры
        const rect = this.container.getBoundingClientRect();
        this.width = rect.width || 300;
        this.height = rect.height || 200;

        // Создаём SVG
        this.svg = d3.select(this.container)
            .append('svg')
            .attr('class', 'depth-chart')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', `0 0 ${this.width} ${this.height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');

        // Создаём группы для слоёв
        this.gridGroup = this.svg.append('g').attr('class', 'grid');
        this.bidsGroup = this.svg.append('g').attr('class', 'bids');
        this.asksGroup = this.svg.append('g').attr('class', 'asks');
        this.midLine = this.svg.append('line').attr('class', 'mid-line');
        this.tooltip = this.svg.append('g').attr('class', 'tooltip').style('display', 'none');

        // Добавляем обработчик мыши
        this._setupMouse();
    }

    /**
     * Обновляем данные
     * @param {Object} data - { bids: [[price, qty]], asks: [[price, qty]] }
     */
    update(data) {
        this.data = data;
        this._render();
    }

    /**
     * Основной рендер
     * @private
     */
    _render() {
        const { bids, asks } = this.data;
        if (!bids.length || !asks.length) return;

        const margin = { top: 20, right: 40, bottom: 30, left: 40 };
        const width = this.width - margin.left - margin.right;
        const height = this.height - margin.top - margin.bottom;

        // Вычисляем кумулятивные объёмы
        const cumBids = this._cumulative(bids, true);  // От высокой к низкой цене
        const cumAsks = this._cumulative(asks, false); // От низкой к высокой цене

        // Находим диапазоны
        const midPrice = (bids[0][0] + asks[0][0]) / 2;
        const priceRange = Math.max(
            midPrice - cumBids[cumBids.length - 1].price,
            cumAsks[cumAsks.length - 1].price - midPrice
        );

        const minPrice = midPrice - priceRange * 1.1;
        const maxPrice = midPrice + priceRange * 1.1;
        const maxVolume = Math.max(
            cumBids[cumBids.length - 1].cumulative,
            cumAsks[cumAsks.length - 1].cumulative
        );

        // Создаём шкалы
        const xScale = d3.scaleLinear()
            .domain([minPrice, maxPrice])
            .range([margin.left, width + margin.left]);

        const yScale = d3.scaleLinear()
            .domain([0, maxVolume])
            .range([height + margin.top, margin.top]);

        // Рисуем сетку
        this._renderGrid(xScale, yScale, width, height, margin);

        // Рисуем области
        this._renderArea(this.bidsGroup, cumBids, xScale, yScale, height + margin.top,
            this.options.bidColor, this.options.bidFill);
        this._renderArea(this.asksGroup, cumAsks, xScale, yScale, height + margin.top,
            this.options.askColor, this.options.askFill);

        // Рисуем среднюю линию
        this.midLine
            .attr('x1', xScale(midPrice))
            .attr('y1', margin.top)
            .attr('x2', xScale(midPrice))
            .attr('y2', height + margin.top)
            .attr('stroke', this.options.midLineColor)
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '4,4');

        // Сохраняем для тултипа
        this.scales = { x: xScale, y: yScale, margin };
        this.cumData = { bids: cumBids, asks: cumAsks };
    }

    /**
     * Вычисляем кумулятивные объёмы
     * @private
     */
    _cumulative(data, reverse) {
        const sorted = [...data].sort((a, b) => reverse ? b[0] - a[0] : a[0] - b[0]);
        let cumulative = 0;

        return sorted.map(([price, qty]) => {
            cumulative += qty;
            return { price, qty, cumulative };
        });
    }

    /**
     * Рисуем область
     * @private
     */
    _renderArea(group, data, xScale, yScale, baseline, strokeColor, fillColor) {
        // Создаём генератор линии
        const line = d3.line()
            .x(d => xScale(d.price))
            .y(d => yScale(d.cumulative))
            .curve(d3.curveStepAfter);

        // Создаём генератор области
        const area = d3.area()
            .x(d => xScale(d.price))
            .y0(baseline)
            .y1(d => yScale(d.cumulative))
            .curve(d3.curveStepAfter);

        // Рисуем область (fill)
        const areaPath = group.selectAll('.area').data([data]);
        areaPath.enter()
            .append('path')
            .attr('class', 'area')
            .merge(areaPath)
            .transition()
            .duration(this.options.animationDuration)
            .attr('d', area)
            .attr('fill', fillColor);

        // Рисуем линию (stroke)
        const linePath = group.selectAll('.line').data([data]);
        linePath.enter()
            .append('path')
            .attr('class', 'line')
            .merge(linePath)
            .transition()
            .duration(this.options.animationDuration)
            .attr('d', line)
            .attr('fill', 'none')
            .attr('stroke', strokeColor)
            .attr('stroke-width', 2);
    }

    /**
     * Рисуем сетку
     * @private
     */
    _renderGrid(xScale, yScale, width, height, margin) {
        // Горизонтальные линии
        const yTicks = yScale.ticks(5);
        const hLines = this.gridGroup.selectAll('.h-line').data(yTicks);

        hLines.enter()
            .append('line')
            .attr('class', 'h-line')
            .merge(hLines)
            .attr('x1', margin.left)
            .attr('x2', width + margin.left)
            .attr('y1', d => yScale(d))
            .attr('y2', d => yScale(d))
            .attr('stroke', this.options.gridColor);

        hLines.exit().remove();

        // Y-axis labels
        const yLabels = this.gridGroup.selectAll('.y-label').data(yTicks);

        yLabels.enter()
            .append('text')
            .attr('class', 'y-label')
            .merge(yLabels)
            .attr('x', margin.left - 5)
            .attr('y', d => yScale(d))
            .attr('dy', '0.35em')
            .attr('text-anchor', 'end')
            .attr('fill', this.options.textColor)
            .attr('font-size', '10px')
            .text(d => d.toFixed(2));

        yLabels.exit().remove();
    }

    /**
     * Настраиваем обработчик мыши для тултипа
     * @private
     */
    _setupMouse() {
        // Тултип скрыт по умолчанию, показывается при наведении
        // TODO: Добавить полноценный тултип
    }

    /**
     * Обрабатываем ресайз
     * @private
     */
    _setupResizeObserver() {
        this.resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0 &&
                    (Math.abs(this.width - width) > 5 || Math.abs(this.height - height) > 5)) {
                    this.width = width;
                    this.height = height;
                    this.svg.attr('viewBox', `0 0 ${width} ${height}`);
                    this._render();
                }
            }
        });

        this.resizeObserver.observe(this.container);
    }

    /**
     * Уничтожаем компонент
     */
    destroy() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        if (this.svg) {
            this.svg.remove();
        }
    }
}
