const RoutePlannerService = require('../../../src/services/route-planner.service');
const Location = require('../../../src/models/Location');
const Vehicle = require('../../../src/models/Vehicle');
const UserInput = require('../../../src/models/UserInput');
const TestDataFactory = require('../../helpers/test-data');
const CustomAssertions = require('../../helpers/assertions');

describe('RoutePlannerService', () => {
  let service;

  beforeEach(() => {
    service = new RoutePlannerService();
    service.setUseRealStations(false);
    service.setUseRoadRouting(false);
  });

  describe('constructor', () => {
    test('ініціалізує сервіс з усіма залежностями', () => {
      expect(service).toBeDefined();
      expect(service.gaService).toBeDefined();
      expect(service.stationService).toBeDefined();
      expect(service.routingService).toBeDefined();
    });
  });

  describe('buildRoute', () => {
    test('будує простий маршрут без станцій', async () => {
      const { start, end, batteryLevel, vehicle } = TestDataFactory.createShortRoute();
      const userInput = new UserInput(start, end, batteryLevel);

      const route = await service.buildRoute(userInput, vehicle);

      expect(route).toBeDefined();
      // ВИПРАВЛЕНО: перевіряємо сам об'єкт route, а не результат toJSON
      expect(route).toHaveProperty('points');
      expect(route).toHaveProperty('chargingStops');
      expect(route).toHaveProperty('totalDistance');
      expect(route.chargingStops).toHaveLength(0);
    }, 30000);

    test('будує маршрут зі станціями', async () => {
      const { start, end, batteryLevel, vehicle } = TestDataFactory.createKyivLvivRoute();
      const userInput = new UserInput(start, end, batteryLevel);

      const route = await service.buildRoute(userInput, vehicle);

      expect(route).toBeDefined();
      expect(route).toHaveProperty('points');
      expect(route).toHaveProperty('chargingStops');
      expect(route.points.length).toBeGreaterThanOrEqual(2);
      
      // Перевіряємо що маршрут містить початок і кінець
      expect(route.points[0]).toMatchObject({
        lat: start.lat,
        lon: start.lon
      });
      expect(route.points[route.points.length - 1]).toMatchObject({
        lat: end.lat,
        lon: end.lon
      });
    }, 30000);

    test('валідує UserInput перед побудовою', async () => {
      const invalidInput = new UserInput(null, null, 80);
      const vehicle = TestDataFactory.createVehicle();

      await expect(service.buildRoute(invalidInput, vehicle))
        .rejects.toThrow();
    });

    test('додає попередження для неможливого маршруту', async () => {
      const start = TestDataFactory.locations.kyiv;
      const end = TestDataFactory.locations.odesa;
      const userInput = new UserInput(start, end, 10);
      const vehicle = TestDataFactory.createVehicle(30, 0.3);

      const route = await service.buildRoute(userInput, vehicle);

      expect(route).toBeDefined();
      expect(route.warning).toBeDefined();
    }, 30000);
  });

  describe('analyzeReachability', () => {
    test('визначає досяжність першої станції', () => {
      const start = TestDataFactory.locations.kyiv;
      const end = TestDataFactory.locations.lviv;
      const stations = TestDataFactory.createStationsAlongRoute(start, end, 3);
      const vehicle = TestDataFactory.createVehicle();

      const analysis = service.analyzeReachability(stations, start, end, vehicle, 80);

      expect(analysis).toHaveProperty('canReachFirstStation');
      expect(analysis).toHaveProperty('currentRange');
      expect(analysis).toHaveProperty('nearestStation');
      expect(typeof analysis.canReachFirstStation).toBe('boolean');
    });

    test('розраховує поточний запас ходу', () => {
      const start = TestDataFactory.locations.kyiv;
      const end = TestDataFactory.locations.lviv;
      const stations = [];
      const vehicle = TestDataFactory.createVehicle(60, 0.2);

      const analysis = service.analyzeReachability(stations, start, end, vehicle, 80);

      expect(analysis.currentRange).toBeCloseTo(228, 0);
    });
  });

  describe('validateRouteStrict', () => {
    test('валідує коректний маршрут', () => {
      const { start, end, vehicle } = TestDataFactory.createShortRoute();
      const route = service.createDirectRoute(start, end);

      const validation = service.validateRouteStrict(route, vehicle, 80);

      expect(validation.isValid).toBe(true);
      expect(validation.finalBattery).toBeGreaterThan(0);
    });

    test('визначає недостатній заряд', () => {
      const start = TestDataFactory.locations.kyiv;
      const end = TestDataFactory.locations.lviv;
      const route = service.createDirectRoute(start, end);
      const vehicle = TestDataFactory.createVehicle();

      const validation = service.validateRouteStrict(route, vehicle, 10);

      expect(validation.isValid).toBe(false);
      expect(validation).toHaveProperty('reason');
    });
  });

  describe('buildStationChain', () => {
    test('будує ланцюжок станцій', () => {
      const start = TestDataFactory.locations.kyiv;
      const end = TestDataFactory.locations.lviv;
      const stations = TestDataFactory.createStationsAlongRoute(start, end, 5);
      const vehicle = TestDataFactory.createVehicle();

      const chain = service.buildStationChain(stations, start, end, vehicle, 80);

      expect(chain).toBeInstanceOf(Array);
      expect(chain.length).toBeGreaterThanOrEqual(0);
    });

    test('сортує станції по відстані від старту', () => {
      const start = TestDataFactory.locations.kyiv;
      const end = TestDataFactory.locations.lviv;
      const stations = TestDataFactory.createStationsAlongRoute(start, end, 5);
      const vehicle = TestDataFactory.createVehicle();

      const chain = service.buildStationChain(stations, start, end, vehicle, 80);

      if (chain.length > 1) {
        for (let i = 0; i < chain.length - 1; i++) {
          const dist1 = start.distanceTo(chain[i].location);
          const dist2 = start.distanceTo(chain[i + 1].location);
          expect(dist1).toBeLessThanOrEqual(dist2);
        }
      }
    });
  });

  describe('distanceToRouteLine', () => {
    test('розраховує відстань до лінії маршруту', () => {
      const start = TestDataFactory.locations.kyiv;
      const end = TestDataFactory.locations.lviv;
      const point = new Location(50.0, 28.0);

      const distance = service.distanceToRouteLine(start, end, point);

      expect(typeof distance).toBe('number');
      expect(distance).toBeGreaterThanOrEqual(0);
    });

    test('відстань для точки на лінії близька до 0', () => {
      const start = TestDataFactory.locations.kyiv;
      const end = TestDataFactory.locations.lviv;
      const midpoint = new Location(
        (start.lat + end.lat) / 2,
        (start.lon + end.lon) / 2
      );

      const distance = service.distanceToRouteLine(start, end, midpoint);

      expect(distance).toBeLessThan(50);
    });
  });

  describe('createWarningRoute', () => {
    test('створює маршрут з попередженням', () => {
      const start = TestDataFactory.locations.kyiv;
      const end = TestDataFactory.locations.lviv;
      const warning = 'Test warning message';

      const route = service.createWarningRoute(start, end, warning);

      expect(route).toBeDefined();
      expect(route.warning).toBe(warning);
      expect(route.points).toHaveLength(2);
    });
  });

  describe('removeDuplicateStations', () => {
    test('видаляє близькі станції', () => {
      const location1 = new Location(50.0, 28.0);
      const location2 = new Location(50.001, 28.001);
      
      const stations = [
        TestDataFactory.createStation('S1', location1, 100),
        TestDataFactory.createStation('S2', location2, 150),
      ];

      const result = service.removeDuplicateStations(stations, 5);

      expect(result.length).toBe(1);
      expect(result[0].powerKw).toBe(150);
    });

    test('зберігає віддалені станції', () => {
      const start = TestDataFactory.locations.kyiv;
      const end = TestDataFactory.locations.lviv;
      const stations = TestDataFactory.createStationsAlongRoute(start, end, 3);

      const result = service.removeDuplicateStations(stations, 5);

      expect(result.length).toBe(stations.length);
    });
  });

  describe('selectBestNearbyStation', () => {
    test('вибирає найкращу станцію поблизу', () => {
      const start = TestDataFactory.locations.kyiv;
      const end = TestDataFactory.locations.lviv;
      const stations = TestDataFactory.createStationsAlongRoute(start, end, 3);
      const vehicle = TestDataFactory.createVehicle();

      const best = service.selectBestNearbyStation(stations, start, end, vehicle);

      expect(best).toBeDefined();
      expect(best).toHaveProperty('id');
      expect(best).toHaveProperty('location');
      expect(best).toHaveProperty('powerKw');
    });
  });

  describe('clearCache', () => {
    test('очищає всі кеші', () => {
      expect(() => service.clearCache()).not.toThrow();
    });
  });
});