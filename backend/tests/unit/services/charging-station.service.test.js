const ChargingStationService = require('../../../src/services/charging-station.service');
const Location = require('../../../src/models/Location');

describe('ChargingStationService', () => {
  let service;

  beforeEach(() => {
    service = new ChargingStationService();
    service.setUseRealData(false); // Використовуємо тестові дані
  });

  describe('constructor', () => {
    test('ініціалізує сервіс', () => {
      expect(service).toBeDefined();
      expect(service.testStations).toBeDefined();
      expect(service.testStations.length).toBeGreaterThan(0);
    });
  });

  describe('getStationsNearby', () => {
    test('знаходить станції в радіусі', async () => {
      const kyiv = new Location(50.4501, 30.5234);
      const stations = await service.getStationsNearby(kyiv, 100);
      
      expect(stations).toBeInstanceOf(Array);
      expect(stations.length).toBeGreaterThan(0);
    });

    test('не знаходить станцій за межами радіусу', async () => {
      const location = new Location(60.0, 40.0); // Далеко від тестових
      const stations = await service.getStationsNearby(location, 10);
      
      expect(stations).toHaveLength(0);
    });

    test('сортує по відстані', async () => {
      const kyiv = new Location(50.4501, 30.5234);
      const stations = await service.getStationsNearby(kyiv, 500);
      
      if (stations.length > 1) {
        for (let i = 0; i < stations.length - 1; i++) {
          const dist1 = kyiv.distanceTo(stations[i].location);
          const dist2 = kyiv.distanceTo(stations[i + 1].location);
          expect(dist1).toBeLessThanOrEqual(dist2);
        }
      }
    });
  });

  describe('getStationsAlongRoute', () => {
    test('знаходить станції вздовж маршруту', async () => {
      const start = new Location(50.4501, 30.5234, 'Київ');
      const end = new Location(49.8397, 24.0297, 'Львів');
      
      const stations = await service.getStationsAlongRoute(start, end, 50);
      
      expect(stations).toBeInstanceOf(Array);
    });

    test('фільтрує по коридору', async () => {
      const start = new Location(50.4501, 30.5234);
      const end = new Location(50.5, 30.6);
      
      const stations = await service.getStationsAlongRoute(start, end, 10);
      
      // Станції повинні бути в межах коридору
      stations.forEach(station => {
        const toStart = start.distanceTo(station.location);
        const toEnd = station.location.distanceTo(end);
        const direct = start.distanceTo(end);
        const detour = toStart + toEnd - direct;
        
        expect(detour).toBeLessThan(10);
      });
    });
  });

  describe('getAllStations', () => {
    test('повертає всі тестові станції', async () => {
      const stations = await service.getAllStations();
      
      expect(stations).toBeInstanceOf(Array);
      expect(stations.length).toBeGreaterThan(0);
    });
  });

  describe('getStationById', () => {
    test('знаходить станцію по ID', async () => {
      const station = await service.getStationById('TEST-001');
      
      expect(station).toBeDefined();
      expect(station.id).toBe('TEST-001');
    });

    test('повертає null для неіснуючого ID', async () => {
      const station = await service.getStationById('NONEXISTENT');
      
      expect(station).toBeNull();
    });
  });

  describe('removeDuplicates', () => {
    test('видаляє дублікати', () => {
      const stations = service.testStations;
      const withDuplicates = [...stations, ...stations];
      
      const result = service.removeDuplicates(withDuplicates, 2);
      
      expect(result.length).toBeLessThanOrEqual(stations.length);
    });

    test('залишає найпотужніші станції', () => {
      const station1 = service.testStations[0];
      const station2 = { ...station1, id: 'DUP', powerKw: station1.powerKw + 50 };
      
      const result = service.removeDuplicates([station1, station2], 2);
      
      expect(result[0].powerKw).toBeGreaterThanOrEqual(station1.powerKw);
    });
  });

  describe('sortByDistanceFromStart', () => {
    test('сортує станції по відстані', () => {
      const start = new Location(50.4501, 30.5234);
      const stations = service.testStations.slice(0, 5);
      
      const sorted = service.sortByDistanceFromStart(stations, start);
      
      for (let i = 0; i < sorted.length - 1; i++) {
        const dist1 = start.distanceTo(sorted[i].location);
        const dist2 = start.distanceTo(sorted[i + 1].location);
        expect(dist1).toBeLessThanOrEqual(dist2);
      }
    });
  });

  describe('setUseRealData', () => {
    test('перемикає режим даних', () => {
      service.setUseRealData(true);
      expect(service.useRealData).toBe(true);
      
      service.setUseRealData(false);
      expect(service.useRealData).toBe(false);
    });
  });

  describe('clearCache', () => {
    test('очищає кеш', () => {
      expect(() => service.clearCache()).not.toThrow();
    });
  });
})