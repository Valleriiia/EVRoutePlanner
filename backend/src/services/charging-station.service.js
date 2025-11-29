const OpenChargeMapService = require('./opencharge.service');
const ChargingStation = require('../models/ChargingStation');
const Location = require('../models/Location');

class ChargingStationService {
  constructor() {
    this.openChargeMap = new OpenChargeMapService();
    this.useRealData = process.env.USE_REAL_CHARGING_STATIONS !== 'false'; // За замовчуванням true
    this.testStations = this.initializeTestStations(); // Резервні дані
  }

  /**
   * Отримання всіх доступних станцій поблизу точки
   */
  async getStationsNearby(location, radiusKm = 100) {
    if (this.useRealData) {
      try {
        console.log('🌐 Запит реальних станцій з OpenChargeMap...');
        const realStations = await this.openChargeMap.getStationsNearby(
          location.lat,
          location.lon,
          radiusKm,
          50
        );
        
        if (realStations.length > 0) {
          return realStations;
        }
        
        console.log('⚠️ Реальних станцій не знайдено, використовуємо тестові');
      } catch (error) {
        console.error('❌ Помилка отримання реальних станцій:', error.message);
      }
    }

    // Fallback до тестових даних
    return this.testStations.filter(station => {
      const distance = location.distanceTo(station.location);
      return distance <= radiusKm;
    });
  }

  /**
   * Отримання станцій вздовж маршруту
   */
  async getStationsAlongRoute(start, end, corridorWidth = 50) {
    if (this.useRealData) {
      try {
        console.log('🌐 Запит станцій вздовж маршруту...');
        const realStations = await this.openChargeMap.getStationsAlongRoute(
          start,
          end,
          corridorWidth
        );
        
        if (realStations.length > 0) {
          return realStations;
        }
        
        console.log('⚠️ Станцій на маршруті не знайдено, використовуємо тестові');
      } catch (error) {
        console.error('❌ Помилка:', error.message);
      }
    }

    // Fallback - фільтруємо тестові станції
    return this.testStations.filter(station => {
      const toStation = start.distanceTo(station.location);
      const fromStation = station.location.distanceTo(end);
      const direct = start.distanceTo(end);
      
      return (toStation + fromStation - direct) < corridorWidth;
    });
  }

  /**
   * Отримання станції за ID
   */
  async getStationById(id) {
    // Спочатку шукаємо в тестових даних
    const testStation = this.testStations.find(s => s.id === id);
    if (testStation) return testStation;

    // Якщо це ID з OpenChargeMap
    if (id.startsWith('OCM-')) {
      // Тут можна зробити окремий запит до API
      // Поки що повертаємо null
      return null;
    }

    return null;
  }

  /**
   * Отримання всіх станцій (для відображення на карті)
   */
  async getAllStations() {
    // Повертаємо тестові дані для загального огляду
    // Можна розширити щоб завантажувати станції для всієї України
    return this.testStations;
  }

  /**
   * Ініціалізація тестових станцій (резервні дані)
   */
  initializeTestStations() {
    return [
      new ChargingStation('TEST-001', new Location(50.4501, 30.5234, 'Київ, вул. Хрещатик'), 50, 'available'),
      new ChargingStation('TEST-002', new Location(50.2649, 30.6313, 'Бориспіль'), 150, 'available'),
      new ChargingStation('TEST-003', new Location(49.8397, 30.1090, 'Біла Церква'), 100, 'available'),
      new ChargingStation('TEST-004', new Location(49.2328, 28.4810, 'Вінниця'), 50, 'available'),
      new ChargingStation('TEST-005', new Location(48.4647, 35.0462, 'Дніпро'), 150, 'available'),
      new ChargingStation('TEST-006', new Location(49.9935, 36.2304, 'Харків'), 100, 'available'),
      new ChargingStation('TEST-007', new Location(46.4825, 30.7233, 'Одеса'), 150, 'available'),
      new ChargingStation('TEST-008', new Location(50.9077, 34.7981, 'Суми'), 50, 'available'),
      new ChargingStation('TEST-009', new Location(49.5883, 34.5514, 'Полтава'), 100, 'available'),
      new ChargingStation('TEST-010', new Location(48.9226, 24.7111, 'Івано-Франківськ'), 50, 'available'),
    ];
  }

  /**
   * Перемикання режиму (реальні/тестові дані)
   */
  setUseRealData(useReal) {
    this.useRealData = useReal;
    console.log(`🔄 Режим станцій: ${useReal ? 'РЕАЛЬНІ' : 'ТЕСТОВІ'}`);
  }

  /**
   * Очищення кешу
   */
  clearCache() {
    this.openChargeMap.clearCache();
  }
}

module.exports = ChargingStationService;