/* ===========================================================
 * LevelsSummary - Компонент сводки ключевых уровней
 * Показываем топ уровни поддержки/сопротивления с силой
 * =========================================================== */

import { levelAnalyzer } from '../analytics/LevelAnalyzer.js';

/**
 * UI компонент для отображения сводки уровней
 */
export class LevelsSummary {
    constructor(container, options = {}) {
        this.container = typeof container === 'string'
            ? document.querySelector(container)
            : container;

        this.options = {
            maxLevels: 5,
            showStrengthBar: true,
            ...options
        };

        this.data = null;

        this._init();
    }

    /**
     * Инициализируем DOM
     * @private
     */
    _init() {
        this.container.classList.add('levels-summary');
        this.container.innerHTML = `
      <div class="levels-summary__header">
        <span class="levels-summary__title">🎯 Ключевые уровни</span>
        <span class="levels-summary__badge" id="levels-count">0</span>
      </div>
      
      <div class="levels-summary__stats" id="levels-stats">
        <div class="levels-summary__stat">
          <span class="levels-summary__stat-label">Bid/Ask</span>
          <span class="levels-summary__stat-value" id="stat-ratio">1.00</span>
        </div>
        <div class="levels-summary__stat">
          <span class="levels-summary__stat-label">Ближ. поддержка</span>
          <span class="levels-summary__stat-value levels-summary__stat-value--bid" id="stat-support">—</span>
        </div>
        <div class="levels-summary__stat">
          <span class="levels-summary__stat-label">Ближ. сопротивл.</span>
          <span class="levels-summary__stat-value levels-summary__stat-value--ask" id="stat-resistance">—</span>
        </div>
      </div>
      
      <div class="levels-summary__section">
        <div class="levels-summary__section-header">
          <span>🟢 Поддержка</span>
        </div>
        <div class="levels-summary__list" id="support-levels"></div>
      </div>
      
      <div class="levels-summary__section">
        <div class="levels-summary__section-header">
          <span>🔴 Сопротивление</span>
        </div>
        <div class="levels-summary__list" id="resistance-levels"></div>
      </div>
    `;

        this.supportList = this.container.querySelector('#support-levels');
        this.resistanceList = this.container.querySelector('#resistance-levels');

        this._injectStyles();
    }

    /**
     * Обновляем данные
     * @param {Object} orderBook - { bids, asks }
     */
    update(orderBook) {
        const analysis = levelAnalyzer.analyze(orderBook);
        this.data = analysis;

        this._renderStats(analysis.summary);
        this._renderLevels(analysis.supportLevels, this.supportList, 'support');
        this._renderLevels(analysis.resistanceLevels, this.resistanceList, 'resistance');

        // Обновляем счётчик
        const count = analysis.supportLevels.length + analysis.resistanceLevels.length;
        document.getElementById('levels-count').textContent = count;
    }

    /**
     * Рендерим статистику
     * @private
     */
    _renderStats(summary) {
        const ratioEl = document.getElementById('stat-ratio');
        const supportEl = document.getElementById('stat-support');
        const resistanceEl = document.getElementById('stat-resistance');

        if (ratioEl) {
            ratioEl.textContent = summary.bidAskRatio;
            ratioEl.classList.toggle('levels-summary__stat-value--positive', parseFloat(summary.bidAskRatio) > 1);
            ratioEl.classList.toggle('levels-summary__stat-value--negative', parseFloat(summary.bidAskRatio) < 1);
        }

        if (supportEl && summary.nearestSupport) {
            supportEl.textContent = `${summary.nearestSupport.price.toFixed(2)} (${summary.nearestSupport.strength}%)`;
        }

        if (resistanceEl && summary.nearestResistance) {
            resistanceEl.textContent = `${summary.nearestResistance.price.toFixed(2)} (${summary.nearestResistance.strength}%)`;
        }
    }

    /**
     * Рендерим список уровней
     * @private
     */
    _renderLevels(levels, container, type) {
        const topLevels = levels.slice(0, this.options.maxLevels);

        container.innerHTML = topLevels.map(level => `
      <div class="levels-summary__item">
        <div class="levels-summary__item-info">
          <span class="levels-summary__item-price" style="color: ${level.color}">
            ${level.price.toFixed(2)}
          </span>
          <span class="levels-summary__item-volume">
            ${levelAnalyzer.formatVolume(level.volume)}
          </span>
          <span class="levels-summary__item-ratio">${level.ratio}</span>
        </div>
        ${this.options.showStrengthBar ? `
          <div class="levels-summary__strength-bar">
            <div 
              class="levels-summary__strength-fill levels-summary__strength-fill--${type}"
              style="width: ${level.strength}%; opacity: ${0.3 + level.strength / 100 * 0.7}"
            ></div>
            <span class="levels-summary__strength-value">${level.strength}%</span>
          </div>
        ` : ''}
      </div>
    `).join('') || '<div class="levels-summary__empty">Нет значимых уровней</div>';
    }

    /**
     * Получаем текущие уровни для отрисовки на графике
     * @returns {Array}
     */
    getLevelsForChart() {
        if (!this.data) return [];

        return [
            ...this.data.supportLevels.map(l => ({ ...l, lineColor: l.color })),
            ...this.data.resistanceLevels.map(l => ({ ...l, lineColor: l.color }))
        ];
    }

    /**
     * Добавляем стили
     * @private
     */
    _injectStyles() {
        if (document.getElementById('levels-summary-styles')) return;

        const style = document.createElement('style');
        style.id = 'levels-summary-styles';
        style.textContent = `
      .levels-summary {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
        background: var(--bg-secondary, #12121a);
        border-top: 1px solid var(--border-color, rgba(255,255,255,0.08));
        font-size: 12px;
      }
      
      .levels-summary__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      
      .levels-summary__title {
        font-weight: 600;
        font-size: 13px;
      }
      
      .levels-summary__badge {
        background: var(--accent-blue, #2979ff);
        color: white;
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 10px;
        font-weight: 600;
      }
      
      .levels-summary__stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
      }
      
      .levels-summary__stat {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 8px;
        background: var(--bg-tertiary, #1a1a24);
        border-radius: 6px;
      }
      
      .levels-summary__stat-label {
        font-size: 9px;
        color: var(--text-muted, #5a5a5e);
        text-transform: uppercase;
      }
      
      .levels-summary__stat-value {
        font-weight: 600;
        font-family: var(--font-mono, monospace);
      }
      
      .levels-summary__stat-value--bid {
        color: var(--accent-green, #00c853);
      }
      
      .levels-summary__stat-value--ask {
        color: var(--accent-red, #ff1744);
      }
      
      .levels-summary__stat-value--positive {
        color: var(--accent-green, #00c853);
      }
      
      .levels-summary__stat-value--negative {
        color: var(--accent-red, #ff1744);
      }
      
      .levels-summary__section {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      
      .levels-summary__section-header {
        font-size: 11px;
        color: var(--text-secondary, #8b8b8f);
        font-weight: 500;
      }
      
      .levels-summary__list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      
      .levels-summary__item {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 6px 8px;
        background: var(--bg-tertiary, #1a1a24);
        border-radius: 4px;
      }
      
      .levels-summary__item-info {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .levels-summary__item-price {
        font-weight: 600;
        font-family: var(--font-mono, monospace);
        flex: 1;
      }
      
      .levels-summary__item-volume {
        color: var(--text-secondary, #8b8b8f);
        font-family: var(--font-mono, monospace);
      }
      
      .levels-summary__item-ratio {
        color: var(--accent-yellow, #ffd600);
        font-size: 10px;
        font-weight: 500;
      }
      
      .levels-summary__strength-bar {
        position: relative;
        height: 4px;
        background: var(--bg-primary, #0a0a0f);
        border-radius: 2px;
        overflow: hidden;
      }
      
      .levels-summary__strength-fill {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        border-radius: 2px;
        transition: width 0.3s ease;
      }
      
      .levels-summary__strength-fill--support {
        background: linear-gradient(90deg, var(--accent-green, #00c853), #00ff64);
      }
      
      .levels-summary__strength-fill--resistance {
        background: linear-gradient(90deg, var(--accent-red, #ff1744), #ff4466);
      }
      
      .levels-summary__strength-value {
        position: absolute;
        right: 4px;
        top: -12px;
        font-size: 9px;
        color: var(--text-muted, #5a5a5e);
      }
      
      .levels-summary__empty {
        color: var(--text-muted, #5a5a5e);
        font-style: italic;
        padding: 8px;
        text-align: center;
      }
    `;

        document.head.appendChild(style);
    }

    /**
     * Уничтожаем компонент
     */
    destroy() {
        this.container.innerHTML = '';
    }
}
