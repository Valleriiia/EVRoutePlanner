const express = require('express');
const router = express.Router();
const routeController = require('../controllers/route.controller');
const { validateRouteRequest } = require('../middleware/validation.middleware');

/**
 * @route   POST /api/route/build
 * @desc    Побудова оптимального маршруту
 * @access  Public
 */
router.post('/route/build', validateRouteRequest, routeController.buildRoute);

/**
 * @route   GET /api/charging-stations
 * @desc    Отримання списку всіх зарядних станцій
 * @access  Public
 */
router.get('/charging-stations', routeController.getChargingStations);

/**
 * @route   GET /api/charging-stations/near
 * @desc    Отримання зарядних станцій поблизу точки
 * @access  Public
 */
router.get('/charging-stations/near', routeController.getNearbyStations);

/**
 * @route   POST /api/route/optimize
 * @desc    Оптимізація існуючого маршруту
 * @access  Public
 */
router.post('/route/optimize', routeController.optimizeRoute);

/**
 * @route   GET /api/config/data-source
 * @desc    Отримання інформації про джерело даних станцій
 * @access  Public
 */
router.get('/config/data-source', (req, res) => {
  res.json({
    success: true,
    useRealData: process.env.USE_REAL_CHARGING_STATIONS !== 'false',
    source: process.env.USE_REAL_CHARGING_STATIONS !== 'false' ? 'OpenChargeMap API' : 'Test Data',
    apiUrl: 'https://openchargemap.org'
  });
});

/**
 * @route   GET /api/health/detailed
 * @desc    Детальна перевірка здоров'я всіх сервісів
 * @access  Public
 */
router.get('/health/detailed', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {}
  };

  try {
    const axios = require('axios');
    const startTime = Date.now();
    
    const response = await axios.get('https://api.openchargemap.io/v3/poi', {
      params: {
        latitude: 50.4501,
        longitude: 30.5234,
        distance: 10,
        maxresults: 1,
        compact: true
      },
      timeout: 5000
    });
    
    const responseTime = Date.now() - startTime;
    
    health.services.openChargeMap = {
      status: response.status === 200 ? 'ok' : 'degraded',
      responseTime: `${responseTime}ms`,
      available: true,
      message: `API доступний (${response.data.length || 0} станцій знайдено)`
    };
  } catch (error) {
    health.services.openChargeMap = {
      status: 'down',
      available: false,
      error: error.message,
      message: 'API недоступний - використовуються тестові дані'
    };
    health.status = 'degraded';
  }

  try {
    const axios = require('axios');
    const startTime = Date.now();
    
    const response = await axios.get(
      'https://router.project-osrm.org/route/v1/driving/30.5234,50.4501;30.6234,50.5501',
      {
        params: { overview: 'false' },
        timeout: 5000
      }
    );
    
    const responseTime = Date.now() - startTime;
    
    health.services.osrm = {
      status: response.data.code === 'Ok' ? 'ok' : 'degraded',
      responseTime: `${responseTime}ms`,
      available: true,
      message: 'OSRM API доступний'
    };
  } catch (error) {
    health.services.osrm = {
      status: 'down',
      available: false,
      error: error.message,
      message: 'OSRM API недоступний - використовуються прямі лінії'
    };
    health.status = 'degraded';
  }

  health.config = {
    useRealChargingStations: process.env.USE_REAL_CHARGING_STATIONS !== 'false',
    useRoadRouting: process.env.USE_ROAD_ROUTING !== 'false',
    environment: process.env.NODE_ENV || 'development'
  };

  health.recommendations = [];
  
  if (!health.services.openChargeMap?.available) {
    health.recommendations.push(
      'OpenChargeMap недоступний. Встановіть USE_REAL_CHARGING_STATIONS=false в .env для використання тестових даних.'
    );
  }
  
  if (!health.services.osrm?.available) {
    health.recommendations.push(
      'OSRM недоступний. Встановіть USE_ROAD_ROUTING=false в .env для використання прямих ліній.'
    );
  }

  res.json(health);
});

module.exports = router;