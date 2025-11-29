const GeneticAlgorithmService = require('./genetic-algorithm.service');
const ChargingStationService = require('./charging-station.service');
const Route = require('../models/Route');

class RoutePlannerService {
  constructor() {
    this.gaService = new GeneticAlgorithmService();
    this.stationService = new ChargingStationService();
  }

  async buildRoute(userInput, vehicle, options = {}) {
    console.log('📍 Побудова маршруту...');
    
    // Валідація вхідних даних
    userInput.validate();

    // Створення початкового маршруту
    const initialRoute = new Route();
    initialRoute.addPoint(userInput.getStart());
    initialRoute.addPoint(userInput.getEnd());

    // Отримання зарядних станцій ВЗДОВЖ МАРШРУТУ (ОНОВЛЕНО!)
    const relevantStations = await this.stationService.getStationsAlongRoute(
      userInput.getStart(),
      userInput.getEnd(),
      options.corridorWidth || 30
    );

    console.log(`⚡ Знайдено ${relevantStations.length} зарядних станцій на маршруті`);

    // Якщо станцій немає, спробуємо розширити пошук
    if (relevantStations.length === 0) {
      console.log('🔍 Розширення пошуку станцій...');
      const midLat = (userInput.getStart().lat + userInput.getEnd().lat) / 2;
      const midLon = (userInput.getStart().lon + userInput.getEnd().lon) / 2;
      const midPoint = new (require('../models').Location)(midLat, midLon);
      
      const nearbyStations = await this.stationService.getStationsNearby(
        midPoint,
        100 // радіус 100 км
      );
      
      relevantStations.push(...nearbyStations);
      console.log(`⚡ Після розширеного пошуку: ${relevantStations.length} станцій`);
    }

    // Перевірка чи потрібна зарядка
    const distance = userInput.getStart().distanceTo(userInput.getEnd());
    const maxRange = vehicle.getRemainingRange(userInput.batteryLevel);

    console.log(`📊 Аналіз маршруту:`);
    console.log(`   - Відстань: ${distance.toFixed(2)} км`);
    console.log(`   - Запас ходу: ${maxRange.toFixed(2)} км`);
    console.log(`   - Рівень заряду: ${userInput.batteryLevel}%`);

    if (distance <= maxRange * 0.9) {
      console.log('✅ Зарядка не потрібна - достатньо заряду батареї');
      initialRoute.calculateStats();
      return initialRoute;
    }

    if (relevantStations.length === 0) {
      console.log('⚠️ Зарядка потрібна, але станцій не знайдено');
      console.log('💡 Рекомендація: збільште рівень заряду або змініте маршрут');
      
      // Повертаємо маршрут з попередженням
      initialRoute.calculateStats();
      initialRoute.warning = 'Недостатньо заряду для маршруту. Станції не знайдено.';
      return initialRoute;
    }

    // Оптимізація з використанням ГА
    console.log('🔄 Потрібна оптимізація маршруту з зарядками');
    const optimizedRoute = this.gaService.optimize(
      initialRoute,
      relevantStations,
      vehicle,
      userInput.batteryLevel
    );

    return optimizedRoute;
  }

  /**
   * Фільтрація станцій (застарілий метод, залишено для зворотної сумісності)
   */
  filterStationsAlongRoute(start, end, stations, maxDeviationKm = 30) {
    console.log('⚠️ Використання застарілого методу filterStationsAlongRoute');
    return stations.filter(station => {
      const toStation = start.distanceTo(station.location);
      const fromStation = station.location.distanceTo(end);
      const direct = start.distanceTo(end);
      
      return (toStation + fromStation - direct) < maxDeviationKm;
    }).filter(station => station.isAvailable());
  }

  /**
   * Перемикання режиму станцій
   */
  setUseRealStations(useReal) {
    this.stationService.setUseRealData(useReal);
  }

  /**
   * Очищення кешу
   */
  clearCache() {
    this.stationService.clearCache();
  }
}

module.exports = RoutePlannerService;