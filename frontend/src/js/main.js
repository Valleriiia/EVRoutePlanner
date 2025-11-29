/**
 * Головний файл додатку
 * Ініціалізація всіх компонентів
 */

// Перевірка завантаження DOM
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Ініціалізація EV Route Planner...');

  // Перевірка доступності Leaflet
  if (typeof L === 'undefined') {
    console.error('❌ Leaflet не завантажено!');
    alert('Помилка завантаження карти. Перезавантажте сторінку.');
    return;
  }

  try {
    // Ініціалізація API Client
    const apiClient = new APIClient('http://localhost:3000/api');
    console.log('✅ API Client ініціалізовано');

    // Ініціалізація Map Renderer
    const mapRenderer = new MapRenderer('map');
    console.log('✅ Map Renderer ініціалізовано');

    // Ініціалізація UI Controller
    const uiController = new UIController(apiClient, mapRenderer);
    console.log('✅ UI Controller ініціалізовано');

    // Завантаження зарядних станцій для відображення на карті
    loadChargingStations(apiClient, mapRenderer);

    // Глобальні об'єкти для debugging (тільки в dev режимі)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      window.app = {
        apiClient,
        mapRenderer,
        uiController
      };
      console.log('🔧 Debug mode: window.app доступний в консолі');
    }

    console.log('✅ Додаток успішно запущено!');

  } catch (error) {
    console.error('❌ Помилка ініціалізації:', error);
    alert('Помилка запуску додатку. Перевірте консоль для деталей.');
  }
});

/**
 * Завантаження та відображення зарядних станцій
 */
async function loadChargingStations(apiClient, mapRenderer) {
  try {
    console.log('📡 Завантаження зарядних станцій...');
    const response = await apiClient.getChargingStations();
    
    if (response.success && response.stations) {
      // Можна відобразити всі станції на карті
      // mapRenderer.showAllChargingStations(response.stations);
      console.log(`✅ Завантажено ${response.count} зарядних станцій`);
    }
  } catch (error) {
    console.warn('⚠️ Не вдалося завантажити зарядні станції:', error);
  }
}

/**
 * Обробка помилок
 */
window.addEventListener('error', (event) => {
  console.error('❌ Глобальна помилка:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('❌ Необроблений Promise:', event.reason);
});

/**
 * Utilities
 */
window.utils = {
  /**
   * Форматування дати
   */
  formatDate: (date) => {
    return new Date(date).toLocaleString('uk-UA');
  },

  /**
   * Копіювання тексту в буфер обміну
   */
  copyToClipboard: async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      console.log('✅ Скопійовано в буфер обміну');
      return true;
    } catch (error) {
      console.error('❌ Помилка копіювання:', error);
      return false;
    }
  },

  /**
   * Експорт даних маршруту в JSON
   */
  exportRouteData: (routeData) => {
    const dataStr = JSON.stringify(routeData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `route_${Date.now()}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
    console.log('✅ Маршрут експортовано');
  }
};

// Вітальне повідомлення
console.log(`
╔════════════════════════════════════════╗
║   EV Route Planner - v1.0.0           ║
║   Оптимальні маршрути для електро     ║
║   🚗⚡ Курсовий проект ТВ-33           ║
╚════════════════════════════════════════╝
`);