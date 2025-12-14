const Route = require('../../../src/models/Route');
const Location = require('../../../src/models/Location');
const ChargingStation = require('../../../src/models/ChargingStation');

describe('Route Model', () => {
  let route, start, end, station;

  beforeEach(() => {
    route = new Route();
    start = new Location(50.4501, 30.5234, 'Київ');
    end = new Location(49.8397, 24.0297, 'Львів');
    station = new ChargingStation('TEST-1', new Location(50.0, 28.0), 100);
  });

  describe('constructor', () => {
    test('створює порожній маршрут', () => {
      expect(route.points).toEqual([]);
      expect(route.chargingStops).toEqual([]);
      expect(route.totalDistance).toBe(0);
      expect(route.totalTime).toBe(0);
    });
  });

  describe('addPoint', () => {
    test('додає точку до маршруту', () => {
      route.addPoint(start);
      expect(route.points).toHaveLength(1);
      expect(route.points[0]).toBe(start);
    });
  });

  describe('addChargingStop', () => {
    test('додає зарядну станцію', () => {
      route.addChargingStop(station);
      expect(route.chargingStops).toHaveLength(1);
      expect(route.chargingStops[0]).toBe(station);
    });
  });

  describe('calculateStats', () => {
    test('розраховує статистику для простого маршруту', () => {
      route.addPoint(start);
      route.addPoint(end);
      
      const stats = route.calculateStats();
      
      expect(stats.distance).toBeGreaterThan(460);
      expect(stats.distance).toBeLessThan(480);
      expect(stats.time).toBeGreaterThan(0);
      expect(stats.chargingStops).toBe(0);
    });

    test('враховує зарядні станції', () => {
      route.addPoint(start);
      route.addPoint(end);
      route.addChargingStop(station);
      
      const stats = route.calculateStats();
      expect(stats.chargingStops).toBe(1);
    });
  });

  describe('toJSON', () => {
    test('конвертує маршрут в JSON', () => {
      route.addPoint(start);
      route.addPoint(end);
      route.calculateStats();
      
      const json = route.toJSON();
      
      expect(json).toHaveProperty('points');
      expect(json).toHaveProperty('chargingStops');
      expect(json).toHaveProperty('stats');
      expect(json.points).toHaveLength(2);
    });

    test('включає попередження якщо є', () => {
      route.warning = 'Test warning';
      const json = route.toJSON();
      expect(json.warning).toBe('Test warning');
    });
  });

  describe('toGeoJSON', () => {
    test('конвертує в GeoJSON формат', () => {
      route.addPoint(start);
      route.addPoint(end);
      route.calculateStats();
      
      const geoJSON = route.toGeoJSON();
      
      expect(geoJSON.type).toBe('Feature');
      expect(geoJSON.geometry.type).toBe('LineString');
      expect(geoJSON.properties).toHaveProperty('distance');
    });
  });
});

describe('Route Model - Extended Coverage', () => {
  let route;

  beforeEach(() => {
    route = new Route();
  });

  describe('calculateSegments', () => {
    test('розраховує сегменти з routing service', async () => {
      const start = new Location(50.4501, 30.5234);
      const end = new Location(50.5, 30.6);
      route.addPoint(start);
      route.addPoint(end);

      const mockRoutingService = {
        getRoute: jest.fn().mockResolvedValue({
          distance: 10,
          duration: 0.2,
          geometry: [[30.5234, 50.4501], [30.6, 50.5]]
        })
      };

      await route.calculateSegments(mockRoutingService);

      expect(route.segments).toHaveLength(1);
      expect(route.segments[0].distance).toBe(10);
      expect(route.segments[0].geometry).toBeDefined();
    });

    test('обробляє помилку routing service', async () => {
      const start = new Location(50.4501, 30.5234);
      const end = new Location(50.5, 30.6);
      route.addPoint(start);
      route.addPoint(end);

      const mockRoutingService = {
        getRoute: jest.fn().mockRejectedValue(new Error('API Error'))
      };

      await route.calculateSegments(mockRoutingService);

      expect(route.segments).toHaveLength(1);
      expect(route.segments[0].isStraightLine).toBe(true);
    });

    test('розраховує кілька сегментів', async () => {
      const p1 = new Location(50.4501, 30.5234);
      const p2 = new Location(50.5, 30.6);
      const p3 = new Location(50.6, 30.7);
      
      route.addPoint(p1);
      route.addPoint(p2);
      route.addPoint(p3);

      const mockRoutingService = {
        getRoute: jest.fn()
          .mockResolvedValueOnce({
            distance: 10,
            duration: 0.2,
            geometry: [[30.5234, 50.4501], [30.6, 50.5]]
          })
          .mockResolvedValueOnce({
            distance: 12,
            duration: 0.25,
            geometry: [[30.6, 50.5], [30.7, 50.6]]
          })
      };

      await route.calculateSegments(mockRoutingService);

      expect(route.segments).toHaveLength(2);
      expect(mockRoutingService.getRoute).toHaveBeenCalledTimes(2);
    });
  });

  describe('calculateStatsWithRouting', () => {
    test('використовує geometry від routing service', async () => {
      const start = new Location(50.4501, 30.5234);
      const end = new Location(50.5, 30.6);
      route.addPoint(start);
      route.addPoint(end);

      const mockRoutingService = {
        getRoute: jest.fn().mockResolvedValue({
          distance: 10,
          duration: 0.2,
          geometry: [[30.5234, 50.4501], [30.6, 50.5]]
        })
      };

      const stats = await route.calculateStatsWithRouting(mockRoutingService);

      expect(stats.hasRoadGeometry).toBe(true);
      expect(route.geometry).toBeDefined();
      expect(route.totalDistance).toBe(10);
    });

    test('fallback на прямі лінії при помилці', async () => {
      const start = new Location(50.4501, 30.5234);
      const end = new Location(50.5, 30.6);
      route.addPoint(start);
      route.addPoint(end);

      const mockRoutingService = {
        getRoute: jest.fn().mockRejectedValue(new Error('OSRM Error'))
      };

      const stats = await route.calculateStatsWithRouting(mockRoutingService);

      expect(stats.hasRoadGeometry).toBeUndefined();
      expect(route.totalDistance).toBeGreaterThan(0);
    });

    test('розраховує час зарядки', async () => {
    const start = new Location(50.4501, 30.5234);
    const end = new Location(50.5, 30.6);
    const station = new ChargingStation('S1', new Location(50.475, 30.56), 100);
    
    route.addPoint(start);
    route.addPoint(end);
    route.addChargingStop(station);
    
    // Встановлюємо час зарядки
    route.totalChargingTime = station.getChargingTime(50); // 50 кВт·год зарядка
    
    const stats = route.calculateStats();

    // Перевіряємо що totalTime враховує зарядку
    expect(stats.totalTime).toBeGreaterThan(stats.time);
    expect(stats.chargingTime).toBeGreaterThan(0);
  });
  });

  describe('toGeoJSON з різними сценаріями', () => {
    test('з geometry від OSRM', () => {
      route.addPoint(new Location(50.4501, 30.5234));
      route.addPoint(new Location(50.5, 30.6));
      route.geometry = [[30.5234, 50.4501], [30.6, 50.5]];
      route.calculateStats();

      const geoJSON = route.toGeoJSON();

      expect(geoJSON.type).toBe('Feature');
      expect(geoJSON.geometry.coordinates).toEqual(route.geometry);
      expect(geoJSON.properties.isStraightLine).toBeUndefined();
    });

    test('без geometry (прямі лінії)', () => {
      route.addPoint(new Location(50.4501, 30.5234));
      route.addPoint(new Location(50.5, 30.6));
      route.calculateStats();

      const geoJSON = route.toGeoJSON();

      expect(geoJSON.properties.isStraightLine).toBe(true);
    });
  });

  describe('toJSON з різними конфігураціями', () => {
    test('з segments', () => {
      route.addPoint(new Location(50.4501, 30.5234));
      route.addPoint(new Location(50.5, 30.6));
      route.segments = [{
        from: new Location(50.4501, 30.5234),
        to: new Location(50.5, 30.6),
        distance: 10,
        duration: 0.2,
        isStraightLine: false
      }];
      route.calculateStats();

      const json = route.toJSON();

      expect(json.segments).toBeDefined();
      expect(json.segments).toHaveLength(1);
      expect(json.segments[0].distance).toBe(10);
    });

    test('з geometry', () => {
      route.addPoint(new Location(50.4501, 30.5234));
      route.addPoint(new Location(50.5, 30.6));
      route.geometry = [[30.5234, 50.4501], [30.6, 50.5]];
      route.calculateStats();

      const json = route.toJSON();

      expect(json.geometry).toBeDefined();
      expect(json.geometry.type).toBe('LineString');
    });

    test('з warning', () => {
      route.addPoint(new Location(50.4501, 30.5234));
      route.addPoint(new Location(50.5, 30.6));
      route.warning = 'Test warning';
      route.calculateStats();

      const json = route.toJSON();

      expect(json.warning).toBe('Test warning');
    });
  });
});