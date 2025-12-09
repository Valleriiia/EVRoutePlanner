/**
 * UI Controller для управління інтерфейсом
 * ОНОВЛЕНО: Додано обробку попереджень про неможливість побудови маршруту
 */
class UIController {
  constructor(apiClient, mapRenderer) {
    this.apiClient = apiClient;
    this.mapRenderer = mapRenderer;
    
    // DOM елементи
    this.form = document.getElementById('routeForm');
    this.startInput = document.getElementById('startPoint');
    this.endInput = document.getElementById('endPoint');
    this.batterySlider = document.getElementById('batteryLevel');
    this.batteryValue = document.getElementById('batteryValue');
    this.batteryBar = document.getElementById('batteryBar');
    this.batteryCapacity = document.getElementById('batteryCapacity');
    this.consumption = document.getElementById('consumption');
    this.buildBtn = document.getElementById('buildRouteBtn');
    this.resetBtn = document.getElementById('resetBtn');
    this.statusMessage = document.getElementById('statusMessage');
    this.routeInfo = document.getElementById('routeInfo');
    this.mapLoader = document.getElementById('mapLoader');
    
    // Координати
    this.startCoords = null;
    this.endCoords = null;
    
    this.initEventListeners();
    this.checkAPIHealth();
  }

  /**
   * Ініціалізація обробників подій
   */
  initEventListeners() {
    // Обробка форми
    this.form.addEventListener('submit', (e) => this.handleFormSubmit(e));
    this.resetBtn.addEventListener('click', () => this.handleReset());

    // Ініціалізація автокомпліту для початкової точки
    this.startAutocomplete = new AddressAutocomplete(
      this.startInput,
      document.getElementById('startSuggestions'),
      this.apiClient,
      (result) => this.handleStartSelect(result)
    );

    // Ініціалізація автокомпліту для кінцевої точки
    this.endAutocomplete = new AddressAutocomplete(
      this.endInput,
      document.getElementById('endSuggestions'),
      this.apiClient,
      (result) => this.handleEndSelect(result)
    );

    // Оновлення значення батареї
    this.batterySlider.addEventListener('input', (e) => {
      const value = e.target.value;
      this.batteryValue.textContent = `${value}%`;
      this.batteryBar.style.width = `${value}%`;
      
      // Зміна кольору залежно від рівня
      if (value < 20) {
        this.batteryBar.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
      } else if (value < 50) {
        this.batteryBar.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
      } else {
        this.batteryBar.style.background = 'linear-gradient(90deg, #10b981, #34d399)';
      }
    });

    // Кнопки масштабування карти
    document.getElementById('zoomIn')?.addEventListener('click', () => {
      this.mapRenderer.zoomIn();
    });
    
    document.getElementById('zoomOut')?.addEventListener('click', () => {
      this.mapRenderer.zoomOut();
    });
    
    document.getElementById('resetView')?.addEventListener('click', () => {
      this.mapRenderer.resetView();
    });
  }

  /**
   * Обробка вибору початкової точки
   */
  handleStartSelect(result) {
    this.startCoords = result;
    document.getElementById('startCoords').textContent = 
      `${result.lat.toFixed(4)}, ${result.lon.toFixed(4)}`;
    
    // Показуємо на карті
    this.mapRenderer.setView(result.lat, result.lon, 13);
    
    console.log('✅ Початкову точку обрано:', result);
  }

  /**
   * Обробка вибору кінцевої точки
   */
  handleEndSelect(result) {
    this.endCoords = result;
    document.getElementById('endCoords').textContent = 
      `${result.lat.toFixed(4)}, ${result.lon.toFixed(4)}`;
    
    // Показуємо на карті
    this.mapRenderer.setView(result.lat, result.lon, 13);
    
    console.log('✅ Кінцеву точку обрано:', result);
  }

  /**
   * Геокодування початкової точки (fallback)
   */
  async geocodeStart() {
    const address = this.startInput.value.trim();
    if (!address || this.startCoords) return;

    try {
      this.showStatus('Пошук адреси...', 'loading');
      const result = await this.apiClient.geocodeAddress(address);
      this.handleStartSelect(result);
      this.hideStatus();
    } catch (error) {
      this.showStatus(`Помилка: ${error.message}`, 'error');
      console.error('❌ Помилка геокодування:', error);
    }
  }

  /**
   * Геокодування кінцевої точки (fallback)
   */
  async geocodeEnd() {
    const address = this.endInput.value.trim();
    if (!address || this.endCoords) return;

    try {
      this.showStatus('Пошук адреси...', 'loading');
      const result = await this.apiClient.geocodeAddress(address);
      this.handleEndSelect(result);
      this.hideStatus();
    } catch (error) {
      this.showStatus(`Помилка: ${error.message}`, 'error');
      console.error('❌ Помилка геокодування:', error);
    }
  }

  /**
   * Обробка відправки форми
   */
  async handleFormSubmit(e) {
    e.preventDefault();

    // Перевірка геокодування
    if (!this.startCoords) {
      await this.geocodeStart();
    }
    if (!this.endCoords) {
      await this.geocodeEnd();
    }

    if (!this.startCoords || !this.endCoords) {
      this.showStatus('Будь ласка, введіть коректні адреси', 'error');
      return;
    }

    await this.requestRoute();
  }

  /**
   * Запит на побудову маршруту
   */
  async requestRoute() {
    try {
      this.showLoader();
      this.showStatus('Побудова маршруту...', 'loading');
      this.buildBtn.disabled = true;

      // Збір даних
      const routeData = {
        startPoint: {
          lat: this.startCoords.lat,
          lon: this.startCoords.lon,
          address: this.startInput.value
        },
        endPoint: {
          lat: this.endCoords.lat,
          lon: this.endCoords.lon,
          address: this.endInput.value
        },
        batteryLevel: parseFloat(this.batterySlider.value),
        vehicle: {
          batteryCapacity: parseFloat(this.batteryCapacity.value),
          consumptionPerKm: parseFloat(this.consumption.value)
        }
      };

      console.log('📤 Відправка запиту:', routeData);

      // Запит до API
      const response = await this.apiClient.buildRoute(routeData);

      console.log('📥 Отримано відповідь:', response);

      // ВИПРАВЛЕНО: Розрізняємо типи попереджень
      const hasWarning = response.route?.warning;
      const isCriticalWarning = hasWarning && response.route.warning.startsWith('❌');
      const isInfoWarning = hasWarning && response.route.warning.startsWith('ℹ️');
      
      if (isCriticalWarning || (response.hasWarning && response.message?.startsWith('❌'))) {
        // КРИТИЧНЕ попередження - маршрут неможливий
        const warningMessage = response.route?.warning || response.message;
        const routeWithWarning = {
          ...response.route,
          warning: warningMessage
        };
        
        console.log('⚠️ КРИТИЧНЕ: Показуємо попередження про неможливість маршруту');
        
        this.showRouteWarning(routeWithWarning);
        this.showStatus('⚠️ Маршрут неможливо побудувати', 'warning');
      } else if (isInfoWarning) {
        // ІНФОРМАЦІЙНЕ попередження - маршрут побудовано з зауваженнями
        console.log('ℹ️ ІНФО: Маршрут побудовано з інформаційним повідомленням');
        
        this.displayRoute(response.route);
        this.showInfoNotification(response.route.warning);
        this.showStatus(
          `✅ Маршрут побудовано за ${response.executionTime}ms`, 
          'success'
        );
      } else {
        // Звичайний успішний маршрут
        this.displayRoute(response.route);
        this.showStatus(
          `✅ Маршрут побудовано за ${response.executionTime}ms`, 
          'success'
        );
      }

    } catch (error) {
      console.error('❌ Помилка:', error);
      this.showStatus(`❌ Помилка: ${error.message}`, 'error');
      this.mapRenderer.clearRoute();
      this.routeInfo.style.display = 'none';
    } finally {
      this.hideLoader();
      this.buildBtn.disabled = false;
    }
  }

  /**
   * НОВЕ: Відображення маршруту з попередженням
   */
  showRouteWarning(route) {
    // Очищаємо попередній маршрут
    this.mapRenderer.clearRoute();
    
    // НОВЕ: Видаляємо старі інфо-повідомлення
    this.removeAllInfoNotifications();
    
    // Якщо є точки, показуємо їх на карті
    if (route.points && route.points.length >= 2) {
      this.mapRenderer.renderRoute(route);
      
      // НОВЕ: Примусове масштабування для попередження
      setTimeout(() => {
        if (this.mapRenderer.forceZoomToContent) {
          this.mapRenderer.forceZoomToContent();
        }
      }, 300);
    }

    // Показуємо інформаційне вікно з попередженням
    this.routeInfo.style.display = 'block';
    
    // Парсимо попередження для виділення окремих частин
    const warningText = route.warning || 'Маршрут неможливо побудувати';
    const lines = warningText.split('\n');
    
    // Витягуємо заголовок (перший рядок з ❌)
    const title = lines[0].replace('❌', '').trim();
    
    // Решту тексту
    const content = lines.slice(1).join('\n').trim();
    
    // НОВЕ: Чистий блок попередження
    const warningHtml = `
      <div style="
        background: #fef3c7;
        border: 2px solid #f59e0b;
        border-radius: 0.75rem;
        padding: 1.5rem;
        margin-bottom: 1.5rem;
      ">
        <h3 style="
          color: #92400e;
          font-size: 1.125rem;
          font-weight: 600;
          margin-bottom: 0.75rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        ">
          <span style="font-size: 1.5rem;">⚠️</span>
          ${title}
        </h3>
        <div style="
          color: #78350f;
          font-size: 0.875rem;
          line-height: 1.6;
          white-space: pre-line;
        ">${content}</div>
      </div>
    `;
    
    // ВИПРАВЛЕНО: Повністю замінюємо вміст (не додаємо до існуючого)
    this.routeInfo.innerHTML = `
      <h3 class="route-info__title">Результат побудови маршруту</h3>
      ${warningHtml}
    `;
    
    // Додаємо статистику (приглушену)
    const statsHtml = `
      <div style="opacity: 0.5; margin-bottom: 1rem;">
        <h4 style="font-size: 0.875rem; color: #6b7280; margin-bottom: 0.75rem;">
          Орієнтовна статистика (маршрут неможливий):
        </h4>
        <div class="route-stats">
          <div class="stat" style="opacity: 0.6;">
            <span class="stat__label">Відстань:</span>
            <span class="stat__value">${route.stats?.distance?.toFixed(2) || '?'} км</span>
          </div>
          <div class="stat" style="opacity: 0.6;">
            <span class="stat__label">Орієнтовний час:</span>
            <span class="stat__value">${route.stats?.time ? this.formatTime(route.stats.time) : '?'}</span>
          </div>
        </div>
      </div>
    `;
    
    // Блок з помилкою замість станцій
    const errorStationsHtml = `
      <div style="
        background: #fee2e2;
        border: 1px solid #fca5a5;
        border-radius: 0.5rem;
        padding: 1rem;
        text-align: center;
        color: #991b1b;
        font-size: 0.875rem;
      ">
        ❌ Маршрут не може бути побудований з поточними параметрами
      </div>
    `;
    
    // ВИПРАВЛЕНО: Повністю замінюємо вміст (не додаємо до існуючого)
    this.routeInfo.innerHTML = `
      <h3 class="route-info__title">Результат побудови маршруту</h3>
      ${warningHtml}
      ${statsHtml}
      <div class="stations-list">
        <h4 class="stations-list__title">Зупинки на зарядку:</h4>
        ${errorStationsHtml}
      </div>
    `;
    
    // Прокрутка до результатів
    this.routeInfo.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * НОВЕ: Відновлення HTML структури для route-info
   */
  ensureRouteInfoStructure() {
    // Перевіряємо чи існують необхідні елементи
    if (!document.getElementById('totalDistance')) {
      // Відновлюємо повну структуру
      this.routeInfo.innerHTML = `
        <h3 class="route-info__title">Характеристики маршруту</h3>
        <div class="route-stats">
          <div class="stat">
            <span class="stat__label">Відстань:</span>
            <span class="stat__value" id="totalDistance">-</span>
          </div>
          <div class="stat">
            <span class="stat__label">Час в дорозі:</span>
            <span class="stat__value" id="travelTime">-</span>
          </div>
          <div class="stat">
            <span class="stat__label">Час зарядки:</span>
            <span class="stat__value" id="chargingTime">-</span>
          </div>
          <div class="stat">
            <span class="stat__label">Зупинок на зарядку:</span>
            <span class="stat__value" id="chargingStops">-</span>
          </div>
        </div>
        <div id="stationsList" class="stations-list"></div>
      `;
    }
  }

  /**
   * НОВЕ: Видалення всіх інфо-повідомлень
   */
  removeAllInfoNotifications() {
    // Шукаємо по різних селекторах для надійності
    const selectors = [
      '[style*="background: #dbeafe"]',           // По стилю фону
      '[style*="border: 2px solid #3b82f6"]',    // По стилю border
      '.info-notification',                       // По класу (якщо є)
      '[data-info-notification]'                  // По data-атрибуту
    ];
    
    selectors.forEach(selector => {
      const elements = this.routeInfo.querySelectorAll(selector);
      elements.forEach(el => {
        // Додаткова перевірка що це саме інфо-блок
        if (el.textContent.includes('ℹ️') || 
            el.style.background.includes('#dbeafe') ||
            el.style.borderColor.includes('#3b82f6')) {
          console.log('🗑️ Видаляємо старе інфо-повідомлення');
          el.remove();
        }
      });
    });
  }

  /**
   * НОВЕ: Показати інформаційне повідомлення (не критичне)
   */
  showInfoNotification(message) {
    // Спочатку видаляємо старі
    this.removeAllInfoNotifications();
    
    // Додаємо синю інформаційну плашку на початок блоку статистики
    const routeInfoTitle = this.routeInfo.querySelector('.route-info__title');
    
    if (routeInfoTitle) {
      const infoBox = document.createElement('div');
      
      // НОВЕ: Додаємо data-атрибут для легкого пошуку
      infoBox.setAttribute('data-info-notification', 'true');
      
      infoBox.style.cssText = `
        background: #dbeafe;
        border: 2px solid #3b82f6;
        border-radius: 0.75rem;
        padding: 1rem;
        margin-bottom: 1.5rem;
      `;
      
      infoBox.innerHTML = `
        <div style="
          display: flex;
          align-items: start;
          gap: 0.75rem;
        ">
          <span style="
            font-size: 1.5rem;
            flex-shrink: 0;
          ">ℹ️</span>
          <div style="
            color: #1e40af;
            font-size: 0.875rem;
            line-height: 1.6;
            white-space: pre-line;
          ">${message}</div>
        </div>
      `;
      
      // Вставляємо після заголовку
      routeInfoTitle.after(infoBox);
      
      console.log('ℹ️ Показано інфо-повідомлення');
    }
  }

  /**
   * Відображення маршруту
   */
  displayRoute(route) {
    // Відображення на карті
    this.mapRenderer.renderRoute(route);

    // Показати блок з інформацією
    this.routeInfo.style.display = 'block';
    
    // ВИПРАВЛЕНО: Відновлюємо HTML структуру якщо її немає
    this.ensureRouteInfoStructure();
    
    // ВИПРАВЛЕНО: Видаляємо ВСІ старі інфо-повідомлення
    this.removeAllInfoNotifications();

    // Відображення статистики
    const stats = route.stats;
    const distanceEl = document.getElementById('totalDistance');
    const timeEl = document.getElementById('travelTime');
    const chargingTimeEl = document.getElementById('chargingTime');
    const stopsEl = document.getElementById('chargingStops');
    
    if (distanceEl) distanceEl.textContent = `${stats.distance.toFixed(2)} км`;
    if (timeEl) timeEl.textContent = `${this.formatTime(stats.time)}`;
    if (chargingTimeEl) chargingTimeEl.textContent = `${this.formatTime(stats.chargingTime)}`;
    if (stopsEl) stopsEl.textContent = `${stats.chargingStops}`;

    // Скидаємо opacity для статистики
    const statsElements = document.querySelectorAll('.route-stats .stat');
    statsElements.forEach(el => el.style.opacity = '1');

    // Відображення списку зарядних станцій
    this.displayChargingStations(route.chargingStops);
    
    // НОВЕ: Примусове масштабування карти через 300мс
    setTimeout(() => {
      if (this.mapRenderer.forceZoomToContent) {
        this.mapRenderer.forceZoomToContent();
      }
    }, 300);
    
    // Прокрутка до результатів
    this.routeInfo.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * Відображення списку зарядних станцій
   */
  displayChargingStations(stations) {
    const stationsList = document.getElementById('stationsList');
    
    // ВИПРАВЛЕНО: Перевірка чи елемент існує
    if (!stationsList) {
      console.warn('⚠️ Елемент stationsList не знайдено');
      return;
    }
    
    if (!stations || stations.length === 0) {
      stationsList.innerHTML = `
        <div style="
          background: #d1fae5;
          border: 1px solid #6ee7b7;
          border-radius: 0.5rem;
          padding: 1rem;
          text-align: center;
          color: #065f46;
          font-size: 0.875rem;
          font-weight: 500;
        ">
          ✅ Зарядка не потрібна - автомобіль доїде до пункту призначення
        </div>
      `;
      return;
    }

    let html = '<h4 class="stations-list__title">Зупинки на зарядку:</h4>';
    
    stations.forEach((station, index) => {
      html += `
        <div class="station-item">
          <div class="station-item__name">
            ⚡ Станція ${index + 1}: ${station.id}
          </div>
          <div class="station-item__details">
            📍 ${station.location.address || 'Адреса невідома'}<br>
            🔌 Потужність: ${station.powerKw} кВт<br>
            ✅ Статус: ${station.availability}
          </div>
        </div>
      `;
    });

    stationsList.innerHTML = html;
  }

  /**
   * Форматування часу
   */
  formatTime(hours) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    
    if (h > 0) {
      return `${h} год ${m} хв`;
    }
    return `${m} хв`;
  }

  /**
   * Скидання форми
   */
  handleReset() {
    this.form.reset();
    this.startCoords = null;
    this.endCoords = null;
    
    // Очищуємо автокомпліти
    if (this.startAutocomplete) this.startAutocomplete.clear();
    if (this.endAutocomplete) this.endAutocomplete.clear();
    
    document.getElementById('startCoords').textContent = '-';
    document.getElementById('endCoords').textContent = '-';
    this.batteryValue.textContent = '80%';
    this.batteryBar.style.width = '80%';
    this.batteryBar.style.background = 'linear-gradient(90deg, #10b981, #34d399)';
    this.mapRenderer.clearRoute();
    
    // ВИПРАВЛЕНО: Видаляємо інфо-повідомлення перед відновленням структури
    this.removeAllInfoNotifications();
    
    // Відновлюємо структуру перед хованням
    this.ensureRouteInfoStructure();
    this.routeInfo.style.display = 'none';
    this.hideStatus();
    
    console.log('🔄 Форму скинуто');
  }

  /**
   * Показати повідомлення статусу
   */
  showStatus(message, type = 'info') {
    this.statusMessage.textContent = message;
    this.statusMessage.className = `status-message status-message--${type}`;
    this.statusMessage.style.display = 'block';
    
    // НОВЕ: Не автоматично ховати попередження та помилки
    if (type === 'warning' || type === 'error') {
      // Залишаємо видимим
    } else if (type === 'success') {
      this.hideStatus();
    }
  }

  /**
   * Сховати повідомлення статусу
   */
  hideStatus() {
    setTimeout(() => {
      if (this.statusMessage.classList.contains('status-message--loading') ||
          this.statusMessage.classList.contains('status-message--success')) {
        this.statusMessage.style.display = 'none';
      }
    }, 3000);
  }

  /**
   * Показати loader на карті
   */
  showLoader() {
    this.mapLoader.style.display = 'flex';
  }

  /**
   * Сховати loader
   */
  hideLoader() {
    this.mapLoader.style.display = 'none';
  }

  /**
   * Перевірка здоров'я API
   */
  async checkAPIHealth() {
    try {
      const isHealthy = await this.apiClient.checkHealth();
      if (!isHealthy) {
        this.showStatus(
          '⚠️ Backend API недоступний. Перевірте з\'єднання.', 
          'warning'
        );
      } else {
        console.log('✅ Backend API доступний');
      }
    } catch (error) {
      console.warn('⚠️ Не вдалося перевірити backend:', error);
    }
  }
}

// Експорт
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIController;
}