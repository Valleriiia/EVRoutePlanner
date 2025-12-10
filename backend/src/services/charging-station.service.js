const OpenChargeMapService = require('./opencharge.service');
const ChargingStation = require('../models/ChargingStation');
const Location = require('../models/Location');

class ChargingStationService {
  constructor() {
    this.openChargeMap = new OpenChargeMapService();
    this.useRealData = process.env.USE_REAL_CHARGING_STATIONS !== 'false';
    this.testStations = this.initializeTestStations();
  }

  async getStationsNearby(location, radiusKm = 100) {
    if (this.useRealData) {
      try {
        console.log('Запит реальних станцій з OpenChargeMap...');
        const realStations = await this.openChargeMap.getStationsNearby(
          location.lat,
          location.lon,
          radiusKm,
          50
        );
        
        if (realStations && realStations.length > 0) {
          return this.removeDuplicates(realStations, 2);
        }
        
        console.log('Реальних станцій не знайдено, використовуємо тестові');
      } catch (error) {
        console.error('Помилка отримання реальних станцій:', error.message);
      }
    }

    return this.testStations.filter(station => {
      const distance = location.distanceTo(station.location);
      return distance <= radiusKm;
    });
  }

  async getStationsAlongRoute(start, end, corridorWidth = 50) {
    if (this.useRealData) {
      try {
        console.log('Запит станцій вздовж маршруту...');
        const realStations = await this.openChargeMap.getStationsAlongRoute(
          start,
          end,
          corridorWidth
        );
        
        if (realStations && realStations.length > 0) {
          const filtered = this.removeDuplicates(realStations, 5);
          return this.sortByDistanceFromStart(filtered, start);
        }
        
        console.log('Станцій на маршруті не знайдено, використовуємо тестові');
      } catch (error) {
        console.error('Помилка:', error.message);
      }
    }

    const filtered = this.testStations.filter(station => {
      const toStation = start.distanceTo(station.location);
      const fromStation = station.location.distanceTo(end);
      const direct = start.distanceTo(end);
      
      return (toStation + fromStation - direct) < corridorWidth;
    });
    
    return this.sortByDistanceFromStart(filtered, start);
  }

  removeDuplicates(stations, minDistanceKm = 5) {
    const result = [];
    const processed = new Set();
    
    const sorted = [...stations].sort((a, b) => b.powerKw - a.powerKw);
    
    for (const station of sorted) {
      if (processed.has(station.id)) continue;
      
      const hasDuplicate = result.some(existing => {
        const distance = existing.location.distanceTo(station.location);
        return distance < minDistanceKm;
      });
      
      if (!hasDuplicate) {
        result.push(station);
        processed.add(station.id);
      } else {
        processed.add(station.id);
      }
    }
    
    const removedCount = stations.length - result.length;
    if (removedCount > 0) {
      console.log(`   Видалено дублікатів: ${removedCount} (залишено найпотужніші)`);
    }
    
    return result;
  }

  sortByDistanceFromStart(stations, start) {
    return stations.sort((a, b) => {
      const distA = start.distanceTo(a.location);
      const distB = start.distanceTo(b.location);
      return distA - distB;
    });
  }

  async getStationById(id) {
    const testStation = this.testStations.find(s => s.id === id);
    if (testStation) return testStation;

    if (id.startsWith('OCM-')) {
      return null;
    }

    return null;
  }

async getStationsNearby(location, radiusKm = 50) {
  if (this.useRealData) {
    try {
      console.log(`Пошук станцій поблизу (${radiusKm} км)...`);
      const realStations = await this.openChargeMap.getStationsNearby(
        location.lat,
        location.lon,
        radiusKm,
        20 
      );
      
      if (realStations && realStations.length > 0) {
        return this.sortByDistanceFromStart(realStations, location);
      }
      
      console.log('Реальних станцій не знайдено, використовуємо тестові');
    } catch (error) {
      console.error('Помилка:', error.message);
    }
  }

  const nearby = this.testStations.filter(station => {
    const distance = location.distanceTo(station.location);
    return distance <= radiusKm;
  });
  
  return this.sortByDistanceFromStart(nearby, location);
}

  async getAllStations() {
    return this.testStations;
  }

  initializeTestStations() {
    return [
      new ChargingStation('TEST-001', new Location(50.4501, 30.5234, 'Київ, центр'), 150, 'available'),
      new ChargingStation('TEST-002', new Location(50.4021, 30.3926, 'Київ, Теремки'), 100, 'available'),
      
      new ChargingStation('TEST-003', new Location(50.3800, 30.0950, 'Васильків (40 км)'), 100, 'available'),
      new ChargingStation('TEST-004', new Location(50.2547, 28.6587, 'Житомир (140 км)'), 150, 'available'),
      new ChargingStation('TEST-005', new Location(50.0650, 27.6831, 'Новоград-Волинський (220 км)'), 100, 'available'),
      new ChargingStation('TEST-006', new Location(50.2297, 26.2510, 'Рівне (320 км)'), 150, 'available'),
      new ChargingStation('TEST-007', new Location(49.8419, 24.0316, 'Львів (467 км)'), 150, 'available'),
      
      new ChargingStation('TEST-008', new Location(49.8397, 30.1090, 'Біла Церква (80 км)'), 100, 'available'),
      new ChargingStation('TEST-009', new Location(49.2328, 28.4810, 'Вінниця (260 км)'), 150, 'available'),
      new ChargingStation('TEST-010', new Location(49.4216, 26.9971, 'Хмельницький (380 км)'), 100, 'available'),
      new ChargingStation('TEST-011', new Location(49.5535, 25.5948, 'Тернопіль (420 км)'), 100, 'available'),
      
      new ChargingStation('TEST-012', new Location(48.6900, 31.8900, 'Умань (200 км)'), 100, 'available'),
      new ChargingStation('TEST-013', new Location(47.9103, 33.3917, 'Кропивницький (300 км)'), 100, 'available'),
      new ChargingStation('TEST-014', new Location(46.9659, 32.0000, 'Миколаїв (480 км)'), 100, 'available'),
      new ChargingStation('TEST-015', new Location(46.4825, 30.7233, 'Одеса (475 км)'), 150, 'available'),
      
      new ChargingStation('TEST-016', new Location(50.7472, 32.6686, 'Прилуки (150 км)'), 75, 'available'),
      new ChargingStation('TEST-017', new Location(50.2500, 34.4900, 'Лубни (220 км)'), 75, 'available'),
      new ChargingStation('TEST-018', new Location(49.9935, 36.2304, 'Харків (480 км)'), 150, 'available'),
      
      new ChargingStation('TEST-019', new Location(49.5883, 34.5514, 'Полтава (340 км)'), 100, 'available'),
      new ChargingStation('TEST-020', new Location(48.4647, 35.0462, 'Дніпро (480 км)'), 150, 'available'),
      
      new ChargingStation('TEST-021', new Location(48.9226, 24.7111, 'Івано-Франківськ'), 100, 'available'),
      new ChargingStation('TEST-022', new Location(48.6208, 22.2879, 'Ужгород'), 75, 'available'),
      new ChargingStation('TEST-023', new Location(48.0100, 24.1350, 'Коломия'), 50, 'available'),
      
      new ChargingStation('TEST-024', new Location(51.4982, 31.2893, 'Чернігів'), 75, 'available'),
      new ChargingStation('TEST-025', new Location(50.9077, 34.7981, 'Суми'), 75, 'available'),
    ];
  }

  setUseRealData(useReal) {
    this.useRealData = useReal;
    console.log(`🔄 Режим станцій: ${useReal ? 'РЕАЛЬНІ' : 'ТЕСТОВІ'}`);
  }

  clearCache() {
    this.openChargeMap.clearCache();
  }
}

module.exports = ChargingStationService;