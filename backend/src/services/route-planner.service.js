const GeneticAlgorithmService = require('./genetic-algorithm.service');
const ChargingStationService = require('./charging-station.service');
const OSRMRoutingService = require('./osrm-routing.service'); // НОВИЙ!
const Route = require('../models/Route');

class RoutePlannerService {
  constructor() {
    this.gaService = new GeneticAlgorithmService(50, 100, 0.15);
    this.stationService = new ChargingStationService();
    this.routingService = new OSRMRoutingService(); // НОВИЙ!
    this.useRoadRouting = process.env.USE_ROAD_ROUTING !== 'false'; // За замовчуванням true
  }

  async buildRoute(userInput, vehicle, options = {}) {
    console.log('📍 Побудова маршруту...');
    
    userInput.validate();

    const start = userInput.getStart();
    const end = userInput.getEnd();
    const batteryLevel = userInput.batteryLevel;

    // КРОК 1: Оцінка відстані (швидка, по прямій)
    const straightDistance = start.distanceTo(end);
    const maxRange = vehicle.getRemainingRange(batteryLevel);
    const safeRange = maxRange * 0.85;

    console.log(`📊 Попередня оцінка:`);
    console.log(`   - Пряма відстань: ${straightDistance.toFixed(2)} км`);
    console.log(`   - Запас ходу: ${maxRange.toFixed(2)} км`);

    // КРОК 2: Якщо можна доїхати напряму - перевіряємо по дорогах
    if (straightDistance <= safeRange) {
      if (this.useRoadRouting) {
        console.log('🗺️ Перевірка відстані по дорогах...');
        
        try {
          const roadDistance = await this.routingService.getDistance(start, end);
          console.log(`   - Відстань по дорогах: ${roadDistance.toFixed(2)} км`);
          
          if (roadDistance <= safeRange) {
            console.log('✅ Маршрут досяжний без зарядки');
            return await this.createDirectRouteWithOSRM(start, end);
          } else {
            console.log('⚠️ По дорогах довше - потрібна зарядка');
          }
        } catch (error) {
          console.warn('⚠️ Помилка OSRM, використовуємо оцінку по прямій');
        }
      } else {
        console.log('✅ Маршрут досяжний без зарядки (оцінка по прямій)');
        return this.createDirectRoute(start, end);
      }
    }

    console.log('🔋 Потрібна зарядка, завантаження станцій...');

    // КРОК 3: Отримання станцій (як раніше)
    const corridorWidth = options.corridorWidth || 50;
    let relevantStations = await this.stationService.getStationsAlongRoute(
      start,
      end,
      corridorWidth
    );

    console.log(`⚡ Знайдено ${relevantStations.length} станцій на маршруті`);

    if (relevantStations.length > 0) {
      const nearest = relevantStations
        .map(s => ({ station: s, dist: start.distanceTo(s.location) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 3);
      
      console.log('📍 Найближчі станції:');
      nearest.forEach((item, i) => {
        console.log(`   ${i + 1}. ${item.station.id} - ${item.dist.toFixed(2)} км`);
      });
    }

    // КРОК 4: Фільтрація досяжних станцій
    const reachabilityFactor = batteryLevel < 50 ? 1.05 : 0.90;
    const reachableDistance = maxRange * reachabilityFactor;

    const sortedStations = relevantStations
      .map(station => ({
        station,
        distanceFromStart: start.distanceTo(station.location)
      }))
      .sort((a, b) => a.distanceFromStart - b.distanceFromStart);

    if (sortedStations.length === 0) {
      console.log('❌ Жодної станції не знайдено');
      return this.createWarningRoute(start, end, 'Станції на маршруті не знайдено');
    }

    console.log(`   Найближча станція: ${sortedStations[0].distanceFromStart.toFixed(2)} км`);
    console.log(`   Радіус досяжності: ${reachableDistance.toFixed(2)} км (фактор ${reachabilityFactor})`);

    let reachableStations = sortedStations
      .filter(item => item.distanceFromStart <= reachableDistance)
      .map(item => item.station);

    console.log(`   Досяжних станцій (первинно): ${reachableStations.length}`);

    if (reachableStations.length === 0) {
      const nearestDistance = sortedStations[0].distanceFromStart;
      const requiredBattery = Math.ceil((nearestDistance / (vehicle.batteryCapacity / vehicle.consumptionPerKm)) * 100);
      
      console.log(`❌ Жодна станція не досяжна`);
      
      return this.createWarningRoute(
        start,
        end,
        `Недостатньо заряду для досягнення найближчої станції (${nearestDistance.toFixed(1)} км). ` +
        `Збільште рівень заряду мінімум до ${requiredBattery}% або почніть подорож з іншого місця.`
      );
    }

    // Розподіл станцій
    const distance = straightDistance;
    const minDistanceBetween = distance > 500 ? 40 : 30;
    reachableStations = this.selectDistributedStations(
      reachableStations, 
      start, 
      end, 
      minDistanceBetween
    );

    console.log(`✅ Досяжних станцій (після розподілу): ${reachableStations.length}`);

    // КРОК 5: Оптимізація з ГА (як раніше)
    console.log('🧬 Запуск генетичного алгоритму...');
    
    const initialRoute = new Route();
    initialRoute.addPoint(start);
    initialRoute.addPoint(end);

    const optimizedRoute = this.gaService.optimize(
      initialRoute,
      reachableStations,
      vehicle,
      batteryLevel
    );

    // КРОК 6: Розрахунок фінального маршруту по дорогах
    if (this.useRoadRouting) {
      console.log('🗺️ Розрахунок фінального маршруту по дорогах...');
      await optimizedRoute.calculateStatsWithRouting(this.routingService);
    } else {
      optimizedRoute.calculateStats();
    }

    // Валідація
    const validation = this.validateRoute(optimizedRoute, vehicle, batteryLevel);
    
    if (!validation.isValid) {
      console.log(`⚠️ Маршрут не пройшов валідацію: ${validation.reason}`);
      optimizedRoute.warning = validation.reason;
    }

    // Перевірка кінцевої точки
    const lastPoint = optimizedRoute.points[optimizedRoute.points.length - 1];
    const distanceToEnd = lastPoint.distanceTo(end);
    
    if (distanceToEnd > 1) {
      console.log('⚠️ Кінцева точка відсутня, додаємо...');
      optimizedRoute.addPoint(end);
      
      if (this.useRoadRouting) {
        await optimizedRoute.calculateStatsWithRouting(this.routingService);
      } else {
        optimizedRoute.calculateStats();
      }
    }

    console.log(`✅ Маршрут побудовано успішно`);
    console.log(`   - Загальна відстань: ${optimizedRoute.totalDistance.toFixed(2)} км`);
    console.log(`   - Зупинок на зарядку: ${optimizedRoute.chargingStops.length}`);
    
    return optimizedRoute;
  }

  /**
   * Створення прямого маршруту з OSRM
   */
  async createDirectRouteWithOSRM(start, end) {
    const route = new Route();
    route.addPoint(start);
    route.addPoint(end);
    
    if (this.useRoadRouting) {
      await route.calculateStatsWithRouting(this.routingService);
    } else {
      route.calculateStats();
    }
    
    return route;
  }

  /**
   * Вибір станцій що рівномірно розподілені по маршруту
   */
  selectDistributedStations(stations, start, end, minDistanceBetween = 30) {
    if (stations.length === 0) return [];
    
    const result = [];
    const totalDistance = start.distanceTo(end);
    
    // Сортуємо по відстані від початку
    const sorted = stations
      .map(s => ({ station: s, dist: start.distanceTo(s.location) }))
      .sort((a, b) => a.dist - b.dist);
    
    console.log(`   🔍 Розподіл станцій: всього ${sorted.length}, мін. відстань ${minDistanceBetween} км`);
    
    // Додаємо першу станцію
    result.push(sorted[0].station);
    let lastDistance = sorted[0].dist;
    
    console.log(`   ✓ Станція 1: ${sorted[0].dist.toFixed(0)} км від початку`);
    
    // Додаємо наступні тільки якщо вони достатньо далеко
    for (let i = 1; i < sorted.length; i++) {
      const currentDistance = sorted[i].dist;
      const gapFromLast = currentDistance - lastDistance;
      
      // Перевіряємо відстань від останньої доданої станції
      if (gapFromLast >= minDistanceBetween) {
        result.push(sorted[i].station);
        console.log(`   ✓ Станція ${result.length}: ${currentDistance.toFixed(0)} км (розрив ${gapFromLast.toFixed(0)} км)`);
        lastDistance = currentDistance;
      } else {
        console.log(`   ✗ Пропущено: ${currentDistance.toFixed(0)} км (розрив ${gapFromLast.toFixed(0)} км < ${minDistanceBetween} км)`);
      }
      
      // Обмеження: не більше ніж потрібно для маршруту
      const maxStations = Math.ceil(totalDistance / 150) + 2; // ~150 км між станціями
      if (result.length >= maxStations) {
        console.log(`   ⚠️ Досягнуто максимум станцій (${maxStations})`);
        break;
      }
    }
    
    console.log(`   📍 Підсумок: вибрано ${result.length} розподілених станцій`);
    
    return result;
  }

  /**
   * Створення прямого маршруту без зарядки
   */
  createDirectRoute(start, end) {
    const route = new Route();
    route.addPoint(start);
    route.addPoint(end);
    route.calculateStats();
    return route;
  }

  /**
   * Створення маршруту з попередженням
   */
  createWarningRoute(start, end, warningMessage) {
    const route = new Route();
    route.addPoint(start);
    route.addPoint(end);
    route.calculateStats();
    route.warning = warningMessage;
    return route;
  }

  /**
   * Валідація маршруту
   */
  validateRoute(route, vehicle, startBatteryLevel) {
    let currentBattery = startBatteryLevel;
    const points = route.points;
    
    for (let i = 0; i < points.length - 1; i++) {
      const distance = points[i].distanceTo(points[i + 1]);
      const requiredCharge = vehicle.getRequiredCharge(distance);
      const batteryUsage = (requiredCharge / vehicle.batteryCapacity) * 100;
      
      if (currentBattery < batteryUsage) {
        return {
          isValid: false,
          reason: `Недостатньо заряду для сегмента ${i + 1}. ` +
                  `Потрібно ${batteryUsage.toFixed(1)}%, є ${currentBattery.toFixed(1)}%`
        };
      }
      
      currentBattery -= batteryUsage;
      
      // Перевірка чи є зарядка на наступній точці
      const nextStation = route.chargingStops.find(station => 
        Math.abs(station.location.lat - points[i + 1].lat) < 0.001 &&
        Math.abs(station.location.lon - points[i + 1].lon) < 0.001
      );
      
      if (nextStation) {
        currentBattery = 95; // Заряджаємо до 95%
      }
    }
    
    return {
      isValid: true,
      finalBattery: currentBattery
    };
  }

  setUseRealStations(useReal) {
    this.stationService.setUseRealData(useReal);
  }

  setUseRoadRouting(useRoad) {
    this.useRoadRouting = useRoad;
    console.log(`🗺️ Режим маршрутизації: ${useRoad ? 'ПО ДОРОГАХ (OSRM)' : 'ПРЯМІ ЛІНІЇ'}`);
  }

  clearCache() {
    this.stationService.clearCache();
    this.routingService.clearCache();
  }
}

module.exports = RoutePlannerService;