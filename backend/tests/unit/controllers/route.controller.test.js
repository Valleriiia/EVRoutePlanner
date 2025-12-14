describe('Route Controller', () => {
  let routeController;
  let RoutePlannerService;
  let ChargingStationService;
  let req, res, next;
  let mockBuildRoute, mockGetAllStations, mockGetStationsNearby;

  beforeEach(() => {
    // Очищаємо кеш модулів перед кожним тестом
    jest.resetModules();
    jest.clearAllMocks();

    // Створюємо mock функції
    mockBuildRoute = jest.fn();
    mockGetAllStations = jest.fn();
    mockGetStationsNearby = jest.fn();

    // Мокаємо модулі
    jest.doMock('../../../src/services/route-planner.service', () => {
      return jest.fn().mockImplementation(() => ({
        buildRoute: mockBuildRoute
      }));
    });

    jest.doMock('../../../src/services/charging-station.service', () => {
      return jest.fn().mockImplementation(() => ({
        getAllStations: mockGetAllStations,
        getStationsNearby: mockGetStationsNearby
      }));
    });

    // Імпортуємо після мокування
    routeController = require('../../../src/controllers/route.controller');
    RoutePlannerService = require('../../../src/services/route-planner.service');
    ChargingStationService = require('../../../src/services/charging-station.service');

    // Створюємо req, res, next
    req = {
      body: {},
      query: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe('buildRoute', () => {
    const mockRoute = {
      points: [
        { lat: 50.4501, lon: 30.5234, address: 'Київ' },
        { lat: 49.8397, lon: 24.0297, address: 'Львів' }
      ],
      chargingStops: [],
      stats: {
        distance: 470,
        time: 5.5,
        chargingTime: 0,
        totalTime: 5.5,
        chargingStops: 0
      },
      toJSON: function() {
        return {
          points: this.points,
          chargingStops: this.chargingStops,
          stats: this.stats
        };
      }
    };

    beforeEach(() => {
      req.body = {
        startPoint: { lat: 50.4501, lon: 30.5234, address: 'Київ' },
        endPoint: { lat: 49.8397, lon: 24.0297, address: 'Львів' },
        batteryLevel: 80,
        vehicle: {
          batteryCapacity: 60,
          consumptionPerKm: 0.2
        }
      };
    });

    test('успішно будує маршрут', async () => {
      mockBuildRoute.mockResolvedValue(mockRoute);

      await routeController.buildRoute(req, res, next);

      expect(mockBuildRoute).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();
      
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.route).toBeDefined();
      expect(response.executionTime).toBeDefined();
    });

    test('обробляє маршрут з попередженням', async () => {
      const routeWithWarning = {
        ...mockRoute,
        warning: 'Test warning'
      };

      mockBuildRoute.mockResolvedValue(routeWithWarning);

      await routeController.buildRoute(req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.hasWarning).toBe(true);
      expect(response.message).toBe('Test warning');
    });

    test('викликає next при помилці', async () => {
      const error = new Error('Test error');
      mockBuildRoute.mockRejectedValue(error);

      await routeController.buildRoute(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    test('використовує дефолтні параметри vehicle', async () => {
      delete req.body.vehicle;
      mockBuildRoute.mockResolvedValue(mockRoute);

      await routeController.buildRoute(req, res, next);

      expect(mockBuildRoute).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe('getChargingStations', () => {
    const mockStations = [
      {
        id: 'TEST-001',
        location: { lat: 50.4501, lon: 30.5234, address: 'Київ' },
        powerKw: 150,
        availability: 'available'
      }
    ];

    test('повертає список станцій', async () => {
      mockGetAllStations.mockResolvedValue(mockStations);

      await routeController.getChargingStations(req, res, next);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.count).toBe(1);
    });

    test('викликає next при помилці', async () => {
      const error = new Error('Database error');
      mockGetAllStations.mockRejectedValue(error);

      await routeController.getChargingStations(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getNearbyStations', () => {
    const mockStations = [
      {
        id: 'TEST-001',
        location: { lat: 50.45, lon: 30.52, address: 'Nearby' },
        powerKw: 100,
        availability: 'available'
      }
    ];

    beforeEach(() => {
      req.query = {
        lat: '50.4501',
        lon: '30.5234',
        radius: '50'
      };
    });

    test('знаходить станції поблизу', async () => {
      mockGetStationsNearby.mockResolvedValue(mockStations);

      await routeController.getNearbyStations(req, res, next);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
    });

    test('використовує дефолтний радіус', async () => {
      delete req.query.radius;
      mockGetStationsNearby.mockResolvedValue(mockStations);

      await routeController.getNearbyStations(req, res, next);

      expect(mockGetStationsNearby).toHaveBeenCalledWith(
        expect.anything(),
        50
      );
    });

    test('повертає помилку без координат', async () => {
      req.query = {};

      await routeController.getNearbyStations(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('викликає next при помилці сервісу', async () => {
      const error = new Error('Service error');
      mockGetStationsNearby.mockRejectedValue(error);

      await routeController.getNearbyStations(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('optimizeRoute', () => {
    beforeEach(() => {
      req.body = {
        route: { points: [], chargingStops: [] },
        batteryLevel: 80,
        vehicle: { batteryCapacity: 60, consumptionPerKm: 0.2 }
      };
    });

    test('повертає успішну відповідь', async () => {
      await routeController.optimizeRoute(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Оптимізація виконана'
        })
      );
    });

    test('викликає next при помилці', async () => {
      req.body = null;

      await routeController.optimizeRoute(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });
});

describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('використовує дефолтні значення', () => {
    delete process.env.PORT;
    delete process.env.NODE_ENV;

    const config = require('../../../src/config/config');

    expect(parseInt(config.server.port)).toBe(3000);
    expect(config.server.env).toBe('development');
  });

  test('читає значення з .env', () => {
    process.env.PORT = '4000';
    process.env.NODE_ENV = 'production';
    process.env.GA_POPULATION_SIZE = '100';

    const config = require('../../../src/config/config');

    expect(parseInt(config.server.port)).toBe(4000);
    expect(config.server.env).toBe('production');
    expect(config.geneticAlgorithm.populationSize).toBe(100);
  });

  test('має всі необхідні секції', () => {
    const config = require('../../../src/config/config');

    expect(config).toHaveProperty('server');
    expect(config).toHaveProperty('geneticAlgorithm');
    expect(config).toHaveProperty('vehicle');
    expect(config).toHaveProperty('logging');
  });

  test('vehicle має дефолтні параметри', () => {
    const config = require('../../../src/config/config');

    expect(config.vehicle.defaultBatteryCapacity).toBe(60);
    expect(config.vehicle.defaultConsumption).toBe(0.2);
    expect(config.vehicle.minBatteryLevel).toBe(10);
  });
});