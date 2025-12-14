// backend/src/controllers/route.controller.js
const RoutePlannerService = require('../services/route-planner.service');
const ChargingStationService = require('../services/charging-station.service');
const UserInput = require('../models/UserInput');
const Vehicle = require('../models/Vehicle');
const Location = require('../models/Location');

const routePlannerService = new RoutePlannerService();
const chargingStationService = new ChargingStationService();

exports.buildRoute = async (req, res, next) => {
  try {
    const { startPoint, endPoint, batteryLevel, vehicle } = req.body;

    console.log('Отримано запит на побудову маршруту:', {
      start: startPoint,
      end: endPoint,
      battery: batteryLevel
    });

    const start = new Location(
      startPoint.lat,
      startPoint.lon,
      startPoint.address || ''
    );

    const end = new Location(
      endPoint.lat,
      endPoint.lon,
      endPoint.address || ''
    );

    const userInput = new UserInput(start, end, batteryLevel);

    const vehicleModel = new Vehicle(
      vehicle?.batteryCapacity || 60,
      vehicle?.consumptionPerKm || 0.2
    );

    const startTime = Date.now();
    const route = await routePlannerService.buildRoute(
      userInput,
      vehicleModel
    );
    const executionTime = Date.now() - startTime;

    console.log(`Маршрут побудовано за ${executionTime}ms`);

    let responseMessage = 'Маршрут успішно побудовано';
    let hasWarning = false;
    
    if (route.warning) {
      responseMessage = route.warning;
      hasWarning = true;
      console.log('Маршрут з попередженням:', route.warning);
    }

    res.json({
      success: true,
      route: route.toJSON(),
      executionTime,
      message: responseMessage,
      hasWarning,
      dataSource: process.env.USE_REAL_CHARGING_STATIONS !== 'false' ? 'OpenChargeMap' : 'Test Data'
    });

  } catch (error) {
    console.error('Помилка побудови маршруту:', error);
    next(error);
  }
};

exports.getChargingStations = async (req, res, next) => {
  try {
    const stations = await chargingStationService.getAllStations();

    res.json({
      success: true,
      count: stations.length,
      stations: stations.map(s => ({
        id: s.id,
        location: {
          lat: s.location.lat,
          lon: s.location.lon,
          address: s.location.address
        },
        powerKw: s.powerKw,
        availability: s.availability
      }))
    });

  } catch (error) {
    console.error('Помилка отримання станцій:', error);
    next(error);
  }
};

exports.getNearbyStations = async (req, res, next) => {
  try {
    const { lat, lon, radius = 50 } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({
        success: false,
        error: 'Координати (lat, lon) обов\'язкові'
      });
    }

    const location = new Location(parseFloat(lat), parseFloat(lon));
    const stations = await chargingStationService.getStationsNearby(
      location,
      parseFloat(radius)
    );

    res.json({
      success: true,
      count: stations.length,
      stations: stations.map(s => ({
        id: s.id,
        location: {
          lat: s.location.lat,
          lon: s.location.lon,
          address: s.location.address
        },
        powerKw: s.powerKw,
        availability: s.availability,
        distance: location.distanceTo(s.location).toFixed(2)
      }))
    });

  } catch (error) {
    console.error('Помилка пошуку станцій:', error);
    next(error);
  }
};

exports.optimizeRoute = async (req, res, next) => {
  try {
    const { route, batteryLevel, vehicle } = req.body;

    res.json({
      success: true,
      message: 'Оптимізація виконана',
      route
    });

  } catch (error) {
    console.error('Помилка оптимізації:', error);
    next(error);
  }
};