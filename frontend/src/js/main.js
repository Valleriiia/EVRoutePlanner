document.addEventListener('DOMContentLoaded', () => {
  console.log('Ініціалізація EV Route Planner...');

  if (typeof L === 'undefined') {
    console.error('Leaflet не завантажено!');
    alert('Помилка завантаження карти. Перезавантажте сторінку.');
    return;
  }

  try {
    const apiClient = new APIClient('http://localhost:3000/api');
    console.log('API Client ініціалізовано');

    const mapRenderer = new MapRenderer('map');
    console.log('Map Renderer ініціалізовано');

    const uiController = new UIController(apiClient, mapRenderer);
    console.log('UI Controller ініціалізовано');

    loadChargingStations(apiClient, mapRenderer);

    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      window.app = {
        apiClient,
        mapRenderer,
        uiController
      };
      console.log('Debug mode: window.app доступний в консолі');
    }

    console.log('Додаток успішно запущено!');

  } catch (error) {
    console.error('Помилка ініціалізації:', error);
    alert('Помилка запуску додатку. Перевірте консоль для деталей.');
  }
});

async function loadChargingStations(apiClient, mapRenderer) {
  try {
    console.log('Завантаження зарядних станцій...');
    const response = await apiClient.getChargingStations();
    
    if (response.success && response.stations) {
      // mapRenderer.showAllChargingStations(response.stations);
      console.log(`Завантажено ${response.count} зарядних станцій`);
    }
  } catch (error) {
    console.warn('Не вдалося завантажити зарядні станції:', error);
  }
}

window.addEventListener('error', (event) => {
  console.error('Глобальна помилка:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Необроблений Promise:', event.reason);
});

window.utils = {
  formatDate: (date) => {
    return new Date(date).toLocaleString('uk-UA');
  },

  copyToClipboard: async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      console.log('Скопійовано в буфер обміну');
      return true;
    } catch (error) {
      console.error('Помилка копіювання:', error);
      return false;
    }
  },

  exportRouteData: (routeData) => {
    const dataStr = JSON.stringify(routeData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `route_${Date.now()}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
    console.log('Маршрут експортовано');
  }
};

console.log(`
╔═══════════════════════════════════════╗
║       EV Route Planner - v1.0.0       ║
║  Оптимальні маршрути для електрокарів ║
║            Курсовий проект            ║
╚═══════════════════════════════════════╝
`);