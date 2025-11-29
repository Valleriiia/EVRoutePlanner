/**
 * UI Controller для управління інтерфейсом
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

    // Геокодування при втраті фокусу
    this.startInput.addEventListener('blur', () => this.geocodeStart());
    this.endInput.addEventListener('blur', () => this.geocodeEnd());

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
   * Геокодування початкової точки
   */
  async geocodeStart() {
    const address = this.startInput.value.trim();
    if (!address) return;

    try {
      this.showStatus('Пошук адреси...', 'loading');
      const result = await this.apiClient.geocodeAddress(address);
      this.startCoords = result;
      
      document.getElementById('startCoords').textContent = 
        `${result.lat.toFixed(4)}, ${result.lon.toFixed(4)}`;
      
      this.hideStatus();
      console.log('✅ Початкову адресу знайдено:', result);
    } catch (error) {
      this.showStatus(`Помилка: ${error.message}`, 'error');
      console.error('❌ Помилка геокодування:', error);
    }
  }

  /**
   * Геокодування кінцевої точки
   */
  async geocodeEnd() {
    const address = this.endInput.value.trim();
    if (!address) return;

    try {
      this.showStatus('Пошук адреси...', 'loading');
      const result = await this.apiClient.geocodeAddress(address);
      this.endCoords = result;
      
      document.getElementById('endCoords').textContent = 
        `${result.lat.toFixed(4)}, ${result.lon.toFixed(4)}`;
      
      this.hideStatus();
      console.log('✅ Кінцеву адресу знайдено:', result);
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

      // Відображення результату
      this.displayRoute(response.route);
      this.showStatus(
        `Маршрут побудовано за ${response.executionTime}ms`, 
        'success'
      );

    } catch (error) {
      console.error('❌ Помилка:', error);
      this.showStatus(`Помилка: ${error.message}`, 'error');
    } finally {
      this.hideLoader();
      this.buildBtn.disabled = false;
    }
  }

  /**
   * Відображення маршруту
   */
  displayRoute(route) {
    // Відображення на карті
    this.mapRenderer.renderRoute(route);

    // Відображення статистики
    const stats = route.stats;
    document.getElementById('totalDistance').textContent = 
      `${stats.distance.toFixed(2)} км`;
    document.getElementById('travelTime').textContent = 
      `${this.formatTime(stats.time)}`;
    document.getElementById('chargingTime').textContent = 
      `${this.formatTime(stats.chargingTime)}`;
    document.getElementById('chargingStops').textContent = 
      `${stats.chargingStops}`;

    // Відображення списку зарядних станцій
    this.displayChargingStations(route.chargingStops);

    // Показати блок з інформацією
    this.routeInfo.style.display = 'block';
    
    // Прокрутка до результатів
    this.routeInfo.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * Відображення списку зарядних станцій
   */
  displayChargingStations(stations) {
    const stationsList = document.getElementById('stationsList');
    
    if (!stations || stations.length === 0) {
      stationsList.innerHTML = '<p>Зарядка не потрібна ✅</p>';
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
    document.getElementById('startCoords').textContent = '-';
    document.getElementById('endCoords').textContent = '-';
    this.batteryValue.textContent = '80%';
    this.batteryBar.style.width = '80%';
    this.mapRenderer.clearRoute();
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
  }

  /**
   * Сховати повідомлення статусу
   */
  hideStatus() {
    setTimeout(() => {
      this.statusMessage.style.display = 'none';
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