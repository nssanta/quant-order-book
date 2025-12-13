/* ===========================================================
 * SettingsPanel - Панель настроек
 * Цвета свечей, heatmap, уровни, плотность
 * =========================================================== */

import { storage } from '../core/StorageManager.js';

export class SettingsPanel {
  constructor(options = {}) {
    this.options = {
      onSettingsChange: null,
      ...options
    };

    // Значения по умолчанию
    this.defaults = {
      // Цвета свечей
      candleUpColor: '#00c853',
      candleDownColor: '#ff1744',

      // Цвета heatmap
      heatmapBidColor: '#00c853',
      heatmapAskColor: '#ff1744',
      heatmapOpacity: 0.7,
      heatmapLevels: 100,
      heatmapShowLabels: false,

      // Стакан
      orderBookDepth: 20,

      // Общие
      theme: 'dark'
    };

    this.settings = { ...this.defaults, ...storage.getSettings() };
    this.isOpen = false;

    this._createPanel();
    this._injectStyles();
  }

  /**
   * Создаём панель
   * @private
   */
  _createPanel() {
    // Overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'settings-overlay';
    this.overlay.addEventListener('click', () => this.close());

    // Panel
    this.panel = document.createElement('div');
    this.panel.className = 'settings-panel';
    this.panel.innerHTML = `
      <div class="settings-panel__header">
        <h2>⚙️ Настройки</h2>
        <button class="settings-panel__close" id="settings-close">✕</button>
      </div>
      
      <div class="settings-panel__content">
        <!-- Секция: Цвета свечей -->
        <div class="settings-section">
          <h3 class="settings-section__title">🕯️ Цвета свечей</h3>
          
          <div class="settings-row">
            <label>Рост (зелёная)</label>
            <input type="color" id="setting-candle-up" value="${this.settings.candleUpColor}">
          </div>
          
          <div class="settings-row">
            <label>Падение (красная)</label>
            <input type="color" id="setting-candle-down" value="${this.settings.candleDownColor}">
          </div>
        </div>
        
        <!-- Секция: Тепловая карта -->
        <div class="settings-section">
          <h3 class="settings-section__title">🌡️ Тепловая карта (Heatmap)</h3>
          
          <div class="settings-row">
            <label>Цвет покупок (Bid)</label>
            <input type="color" id="setting-heatmap-bid" value="${this.settings.heatmapBidColor}">
          </div>
          
          <div class="settings-row">
            <label>Цвет продаж (Ask)</label>
            <input type="color" id="setting-heatmap-ask" value="${this.settings.heatmapAskColor}">
          </div>
          
          <div class="settings-row">
            <label>Непрозрачность</label>
            <div class="settings-slider">
              <input type="range" id="setting-heatmap-opacity" 
                     min="0.1" max="1" step="0.1" 
                     value="${this.settings.heatmapOpacity}">
              <span id="opacity-value">${Math.round(this.settings.heatmapOpacity * 100)}%</span>
            </div>
          </div>
          
          <div class="settings-row">
            <label>Количество уровней</label>
            <select id="setting-heatmap-levels">
              <option value="50" ${this.settings.heatmapLevels === 50 ? 'selected' : ''}>50 (грубо)</option>
              <option value="100" ${this.settings.heatmapLevels === 100 ? 'selected' : ''}>100 (средне)</option>
              <option value="200" ${this.settings.heatmapLevels === 200 ? 'selected' : ''}>200 (точно)</option>
              <option value="300" ${this.settings.heatmapLevels === 300 ? 'selected' : ''}>300 (очень точно)</option>
              <option value="500" ${this.settings.heatmapLevels === 500 ? 'selected' : ''}>500 (максимум)</option>
            </select>
          </div>
          
          <div class="settings-row">
            <label>Показывать объёмы</label>
            <input type="checkbox" id="setting-heatmap-labels" ${this.settings.heatmapShowLabels ? 'checked' : ''}>
          </div>
        </div>
        
        <!-- Секция: Стакан -->
        <div class="settings-section">
          <h3 class="settings-section__title">📊 Стакан</h3>
          
          <div class="settings-row">
            <label>Глубина</label>
            <select id="setting-orderbook-depth">
              <option value="5" ${this.settings.orderBookDepth === 5 ? 'selected' : ''}>5 уровней</option>
              <option value="10" ${this.settings.orderBookDepth === 10 ? 'selected' : ''}>10 уровней</option>
              <option value="20" ${this.settings.orderBookDepth === 20 ? 'selected' : ''}>20 уровней</option>
              <option value="50" ${this.settings.orderBookDepth === 50 ? 'selected' : ''}>50 уровней</option>
              <option value="100" ${this.settings.orderBookDepth === 100 ? 'selected' : ''}>100 уровней</option>
            </select>
          </div>
        </div>
        
        <!-- Пресеты цветов -->
        <div class="settings-section">
          <h3 class="settings-section__title">🎨 Пресеты</h3>
          
          <div class="settings-presets">
            <button class="settings-preset" data-preset="classic">
              <span class="settings-preset__colors">
                <span style="background: #00c853"></span>
                <span style="background: #ff1744"></span>
              </span>
              Классика
            </button>
            <button class="settings-preset" data-preset="tradingview">
              <span class="settings-preset__colors">
                <span style="background: #26a69a"></span>
                <span style="background: #ef5350"></span>
              </span>
              TradingView
            </button>
            <button class="settings-preset" data-preset="binance">
              <span class="settings-preset__colors">
                <span style="background: #0ecb81"></span>
                <span style="background: #f6465d"></span>
              </span>
              Binance
            </button>
            <button class="settings-preset" data-preset="monochrome">
              <span class="settings-preset__colors">
                <span style="background: #4a90d9"></span>
                <span style="background: #8b8b8f"></span>
              </span>
              Монохром
            </button>
          </div>
        </div>
      </div>
      
      <div class="settings-panel__footer">
        <button class="btn" id="settings-reset">Сбросить</button>
        <button class="btn btn--primary" id="settings-save">Сохранить</button>
      </div>
    `;

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.panel);

    this._bindEvents();
  }

  /**
   * Привязываем события
   * @private
   */
  _bindEvents() {
    // Закрытие
    this.panel.querySelector('#settings-close').addEventListener('click', () => this.close());

    // Opacity slider
    const opacitySlider = this.panel.querySelector('#setting-heatmap-opacity');
    const opacityValue = this.panel.querySelector('#opacity-value');
    opacitySlider.addEventListener('input', (e) => {
      opacityValue.textContent = Math.round(e.target.value * 100) + '%';
    });

    // Пресеты
    this.panel.querySelectorAll('.settings-preset').forEach(btn => {
      btn.addEventListener('click', () => this._applyPreset(btn.dataset.preset));
    });

    // Сохранение
    this.panel.querySelector('#settings-save').addEventListener('click', () => this._save());

    // Сброс
    this.panel.querySelector('#settings-reset').addEventListener('click', () => this._reset());
  }

  /**
   * Применяем пресет
   * @private
   */
  _applyPreset(preset) {
    const presets = {
      classic: {
        candleUpColor: '#00c853',
        candleDownColor: '#ff1744',
        heatmapBidColor: '#00c853',
        heatmapAskColor: '#ff1744'
      },
      tradingview: {
        candleUpColor: '#26a69a',
        candleDownColor: '#ef5350',
        heatmapBidColor: '#26a69a',
        heatmapAskColor: '#ef5350'
      },
      binance: {
        candleUpColor: '#0ecb81',
        candleDownColor: '#f6465d',
        heatmapBidColor: '#0ecb81',
        heatmapAskColor: '#f6465d'
      },
      monochrome: {
        candleUpColor: '#4a90d9',
        candleDownColor: '#8b8b8f',
        heatmapBidColor: '#4a90d9',
        heatmapAskColor: '#8b8b8f'
      }
    };

    const p = presets[preset];
    if (!p) return;

    this.panel.querySelector('#setting-candle-up').value = p.candleUpColor;
    this.panel.querySelector('#setting-candle-down').value = p.candleDownColor;
    this.panel.querySelector('#setting-heatmap-bid').value = p.heatmapBidColor;
    this.panel.querySelector('#setting-heatmap-ask').value = p.heatmapAskColor;
  }

  /**
   * Сохраняем настройки
   * @private
   */
  _save() {
    this.settings = {
      candleUpColor: this.panel.querySelector('#setting-candle-up').value,
      candleDownColor: this.panel.querySelector('#setting-candle-down').value,
      heatmapBidColor: this.panel.querySelector('#setting-heatmap-bid').value,
      heatmapAskColor: this.panel.querySelector('#setting-heatmap-ask').value,
      heatmapOpacity: parseFloat(this.panel.querySelector('#setting-heatmap-opacity').value),
      heatmapLevels: parseInt(this.panel.querySelector('#setting-heatmap-levels').value),
      heatmapShowLabels: this.panel.querySelector('#setting-heatmap-labels').checked,
      orderBookDepth: parseInt(this.panel.querySelector('#setting-orderbook-depth').value)
    };

    // Сохраняем в LocalStorage
    Object.entries(this.settings).forEach(([key, value]) => {
      storage.updateSetting(key, value);
    });

    // Callback
    if (this.options.onSettingsChange) {
      this.options.onSettingsChange(this.settings);
    }

    this.close();

    // Toast
    this._showToast('Настройки сохранены!');
  }

  /**
   * Сбрасываем на дефолт
   * @private
   */
  _reset() {
    this.settings = { ...this.defaults };

    this.panel.querySelector('#setting-candle-up').value = this.defaults.candleUpColor;
    this.panel.querySelector('#setting-candle-down').value = this.defaults.candleDownColor;
    this.panel.querySelector('#setting-heatmap-bid').value = this.defaults.heatmapBidColor;
    this.panel.querySelector('#setting-heatmap-ask').value = this.defaults.heatmapAskColor;
    this.panel.querySelector('#setting-heatmap-opacity').value = this.defaults.heatmapOpacity;
    this.panel.querySelector('#opacity-value').textContent = Math.round(this.defaults.heatmapOpacity * 100) + '%';
    this.panel.querySelector('#setting-heatmap-levels').value = this.defaults.heatmapLevels;
    this.panel.querySelector('#setting-orderbook-depth').value = this.defaults.orderBookDepth;
  }

  /**
   * Показываем toast
   * @private
   */
  _showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast toast--success';
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
  }

  /**
   * Открываем панель
   */
  open() {
    this.isOpen = true;
    this.overlay.classList.add('active');
    this.panel.classList.add('active');
  }

  /**
   * Закрываем панель
   */
  close() {
    this.isOpen = false;
    this.overlay.classList.remove('active');
    this.panel.classList.remove('active');
  }

  /**
   * Переключаем
   */
  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  /**
   * Получаем текущие настройки
   */
  getSettings() {
    return { ...this.settings };
  }

  /**
   * Инжектим стили
   * @private
   */
  _injectStyles() {
    if (document.getElementById('settings-panel-styles')) return;

    const style = document.createElement('style');
    style.id = 'settings-panel-styles';
    style.textContent = `
      .settings-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
        z-index: 500;
        opacity: 0;
        visibility: hidden;
        transition: all 0.25s ease;
      }
      
      .settings-overlay.active {
        opacity: 1;
        visibility: visible;
      }
      
      .settings-panel {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.95);
        width: 400px;
        max-width: 95vw;
        max-height: 90vh;
        background: var(--bg-secondary, #12121a);
        border: 1px solid var(--border-color, rgba(255,255,255,0.08));
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        z-index: 510;
        opacity: 0;
        visibility: hidden;
        transition: all 0.25s ease;
        display: flex;
        flex-direction: column;
      }
      
      .settings-panel.active {
        opacity: 1;
        visibility: visible;
        transform: translate(-50%, -50%) scale(1);
      }
      
      .settings-panel__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.08));
      }
      
      .settings-panel__header h2 {
        font-size: 18px;
        font-weight: 600;
        margin: 0;
      }
      
      .settings-panel__close {
        background: none;
        border: none;
        color: var(--text-muted, #5a5a5e);
        font-size: 20px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
        transition: all 0.15s ease;
      }
      
      .settings-panel__close:hover {
        background: var(--bg-hover, #22222e);
        color: var(--text-primary, #e8e8ea);
      }
      
      .settings-panel__content {
        flex: 1;
        overflow-y: auto;
        padding: 16px 20px;
      }
      
      .settings-section {
        margin-bottom: 24px;
      }
      
      .settings-section__title {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-secondary, #8b8b8f);
        margin: 0 0 12px 0;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .settings-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }
      
      .settings-row label {
        font-size: 13px;
        color: var(--text-primary, #e8e8ea);
      }
      
      .settings-row input[type="color"] {
        width: 40px;
        height: 32px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        background: transparent;
      }
      
      .settings-row select {
        background: var(--bg-tertiary, #1a1a24);
        color: var(--text-primary, #e8e8ea);
        border: 1px solid var(--border-color, rgba(255,255,255,0.08));
        border-radius: 6px;
        padding: 8px 12px;
        font-size: 13px;
        cursor: pointer;
      }
      
      .settings-slider {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      
      .settings-slider input[type="range"] {
        flex: 1;
        height: 4px;
        -webkit-appearance: none;
        background: var(--bg-tertiary, #1a1a24);
        border-radius: 2px;
      }
      
      .settings-slider input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--accent-blue, #2979ff);
        cursor: pointer;
      }
      
      .settings-slider span {
        font-size: 12px;
        color: var(--text-muted, #5a5a5e);
        min-width: 40px;
        text-align: right;
      }
      
      .settings-presets {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
      }
      
      .settings-preset {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: var(--bg-tertiary, #1a1a24);
        border: 1px solid var(--border-color, rgba(255,255,255,0.08));
        border-radius: 8px;
        color: var(--text-primary, #e8e8ea);
        font-size: 12px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      
      .settings-preset:hover {
        border-color: var(--accent-blue, #2979ff);
      }
      
      .settings-preset__colors {
        display: flex;
        gap: 2px;
      }
      
      .settings-preset__colors span {
        width: 12px;
        height: 12px;
        border-radius: 3px;
      }
      
      .settings-panel__footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 16px 20px;
        border-top: 1px solid var(--border-color, rgba(255,255,255,0.08));
      }
    `;
    document.head.appendChild(style);
  }
}
