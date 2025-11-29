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

module.exports = router;