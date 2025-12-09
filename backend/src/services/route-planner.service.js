const GeneticAlgorithmService = require('./genetic-algorithm.service');
const ChargingStationService = require('./charging-station.service');
const OSRMRoutingService = require('./osrm-routing.service');
const Route = require('../models/Route');

class RoutePlannerService {
  constructor() {
    this.gaService = new GeneticAlgorithmService(50, 150, 0.15); // Збільшили generations до 150
    this.stationService = new ChargingStationService();
    this.routingService = new OSRMRoutingService();
    this.useRoadRouting = process.env.USE_ROAD_ROUTING !== 'false';
  }

  async buildRoute(userInput, vehicle, options = {}) {
    console.log('📍 Побудова маршруту...');
    
    userInput.validate();

    const start = userInput.getStart();
    const end = userInput.getEnd();
    const batteryLevel = userInput.batteryLevel;

    // КРОК 1: Оцінка відстані
    const straightDistance = start.distanceTo(end);
    const maxRange = vehicle.getRemainingRange(batteryLevel);
    const safeRange = maxRange * 0.85;

    console.log(`📊 Попередня оцінка:`);
    console.log(`   - Пряма відстань: ${straightDistance.toFixed(2)} км`);
    console.log(`   - Запас ходу: ${maxRange.toFixed(2)} км`);
    console.log(`   - Безпечний запас (85%): ${safeRange.toFixed(2)} км`);

    // КРОК 2: Якщо можна доїхати напряму
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

    // КРОК 3: НОВА ЛОГІКА - Розумний відбір станцій
    // Спочатку фільтруємо станції що явно не на маршруті
    const corridorWidth = Math.min(100, straightDistance * 0.2); // Вужчий коридор: 20% або 100км
    console.log(`   📏 Ширина коридору: ${corridorWidth.toFixed(0)} км`);
    
    let availableStations = await this.stationService.getStationsAlongRoute(
      start,
      end,
      corridorWidth
    );

    console.log(`⚡ Знайдено ${availableStations.length} станцій в базовому коридорі`);

    // ДОДАТКОВА ФІЛЬТРАЦІЯ: Видаляємо станції що явно не на шляху
    availableStations = availableStations.filter(station => {
      const toStation = start.distanceTo(station.location);
      const fromStation = station.location.distanceTo(end);
      const directDist = straightDistance;
      
      // Станція має бути "між" початком та кінцем
      const detour = (toStation + fromStation) - directDist;
      const maxDetour = Math.min(200, directDist * 0.3); // Макс 30% або 200км об'їзду
      
      return detour <= maxDetour;
    });

    console.log(`⚡ Після фільтрації об'їзду: ${availableStations.length} станцій`);

    if (availableStations.length === 0) {
      console.log('❌ Жодної станції не знайдено в коридорі');
      return this.createWarningRoute(
        start, 
        end, 
        'Не знайдено зарядних станцій на маршруті. Спробуйте інший маршрут або збільште початковий заряд батареї.'
      );
    }

    // КРОК 4: НОВА ЛОГІКА - Перевірка досяжності першої станції
    const firstReachableStation = this.findFirstReachableStation(
    availableStations, 
    start, 
    vehicle, 
    batteryLevel
  );

  if (!firstReachableStation) {
    // НОВИЙ ПІДХІД: Шукаємо станцію ПОБЛИЗУ старту (в радіусі 50 км)
    console.log('❌ Жодна станція на маршруті не досяжна');
    console.log('🔍 Пошук станції поблизу старту...');
    
    const nearbyStations = await this.stationService.getStationsNearby(
      start,
      50 // 50 км радіус
    );
    
    const nearbyReachable = nearbyStations.filter(station => {
      const dist = start.distanceTo(station.location);
      return dist <= vehicle.getRemainingRange(batteryLevel) * 0.95;
    });
    
    if (nearbyReachable.length > 0) {
      const nearest = nearbyReachable[0];
      const nearestDist = start.distanceTo(nearest.location);
      
      console.log(`✅ Знайдено станцію поблизу: ${nearest.id} на відстані ${nearestDist.toFixed(1)} км`);
      console.log(`🔄 Автоматично додаємо станцію до маршруту...`);
      
      // НОВИЙ ПІДХІД: Додаємо станцію до списку і будуємо маршрут
      const extendedStations = [nearest, ...availableStations];
      
      console.log(`⚡ Розширений список: ${extendedStations.length} станцій (додана поблизу старту)`);
      
      // Будуємо ланцюжок з новою станцією
      const reachableStations = this.buildStationChain(
        extendedStations,
        start,
        end,
        vehicle,
        batteryLevel
      );
      
      // КРИТИЧНО: Перевіряємо чи вдалося побудувати ланцюжок
      if (reachableStations.length === 0) {
        console.log('❌ КРИТИЧНА ПОМИЛКА: Не вдалося побудувати ланцюжок навіть з додатковою станцією');
        return this.createWarningRoute(
          start,
          end,
          `❌ Неможливо побудувати маршрут\n\n` +
          `Відстань: ${straightDistance.toFixed(0)} км\n` +
          `Ваш запас ходу: ${maxRange.toFixed(0)} км\n\n` +
          `Навіть з додатковою станцією поблизу старту (${nearest.location.address}) неможливо дістатися до пункту призначення.\n\n` +
          `📊 Причина: Відстань між доступними зарядними станціями перевищує максимальний запас ходу вашого електромобіля.\n\n` +
          `💡 Що робити:\n` +
          `• Збільште рівень заряду до 100%\n` +
          `• Виберіть авто з більшою ємністю батареї (понад 80 кВт·год)\n` +
          `• Оберіть коротший маршрут\n` +
          `• Перевірте наявність зарядних станцій на маршруті в інших джерелах`
        );
      }
      
      console.log(`✅ Ланцюжок побудовано: ${reachableStations.length} станцій`);
      
      // ПРОДОВЖУЄМО побудову маршруту
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

      if (this.useRoadRouting) {
        console.log('🗺️ Розрахунок фінального маршруту по дорогах...');
        await optimizedRoute.calculateStatsWithRouting(this.routingService);
      } else {
        optimizedRoute.calculateStats();
      }

      const validation = this.validateRouteStrict(optimizedRoute, vehicle, batteryLevel);
      
      if (!validation.isValid) {
        console.log(`⚠️ Маршрут не пройшов валідацію: ${validation.reason}`);
        
        // КРИТИЧНО: Якщо маршрут критично небезпечний - повертаємо попередження
        if (validation.critical) {
          return this.createWarningRoute(
            start,
            end,
            `❌ Маршрут небезпечний\n\n${validation.reason}`
          );
        }
        
        optimizedRoute.warning = `⚠️ ${validation.reason}\n\n` +
          `💡 Маршрут включає станцію поблизу старту: ${nearest.location.address || nearest.id} (${nearestDist.toFixed(1)} км)`;
      } else {
        console.log(`✅ Валідація пройдена. Залишковий заряд: ${validation.finalBattery.toFixed(1)}%`);
        optimizedRoute.warning = `ℹ️ Початкового заряду недостатньо для прямого маршруту.\n\n` +
          `✅ Маршрут автоматично побудовано через станцію поблизу:\n` +
          `📍 ${nearest.location.address || nearest.id} (${nearestDist.toFixed(1)} км від старту)`;
      }

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
    
    const nearestOnRoute = availableStations[0];
    const nearestDistance = start.distanceTo(nearestOnRoute.location);
    const requiredBattery = Math.ceil((nearestDistance / maxRange) * 100);
    
    console.log(`❌ Жодна станція не досяжна з поточним зарядом`);
    
    return this.createWarningRoute(
      start,
      end,
      `❌ Недостатньо заряду батареї\n\n` +
      `Відстань до найближчої станції: ${nearestDistance.toFixed(0)} км\n` +
      `Ваш поточний запас ходу: ${vehicle.getRemainingRange(batteryLevel).toFixed(0)} км\n\n` +
      `💡 Рекомендації:\n` +
      `• Збільште рівень заряду мінімум до ${requiredBattery}%\n` +
      `• Або почніть подорож з іншого місця де є зарядна станція поблизу`
    );
  }

  console.log(`✅ Перша досяжна станція: ${firstReachableStation.id} на відстані ${start.distanceTo(firstReachableStation.location).toFixed(1)} км`);

  // КРОК 5: Фільтрація станцій що створюють логічний ланцюжок
  const reachableStations = this.buildStationChain(
    availableStations,
    start,
    end,
    vehicle,
    batteryLevel
  );

  console.log(`✅ Побудовано ланцюжок з ${reachableStations.length} досяжних станцій`);

  if (reachableStations.length === 0) {
    console.log('❌ ПОМИЛКА: Не вдалося побудувати ланцюжок станцій');
    return this.createWarningRoute(
      start,
      end,
      `❌ Неможливо побудувати безпечний маршрут\n\n` +
      `Відстань: ${straightDistance.toFixed(0)} км\n` +
      `Максимальний запас ходу: ${vehicle.getRemainingRange(100).toFixed(0)} км після зарядки\n\n` +
      `📊 Проблема: Зарядні станції розташовані занадто далеко одна від одної для вашого електромобіля.\n\n` +
      `💡 Рішення:\n` +
      `• Виберіть авто з більшою ємністю батареї (рекомендується 75+ кВт·год)\n` +
      `• Збільште початковий заряд до 95-100%\n` +
      `• Оберіть інший маршрут через більші міста\n` +
      `• Зверніться до власника станцій для уточнення їх працездатності`
    );
  }

    // КРОК 6: Оптимізація з ГА
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

    // КРОК 7: Розрахунок фінального маршруту
    if (this.useRoadRouting) {
      console.log('🗺️ Розрахунок фінального маршруту по дорогах...');
      await optimizedRoute.calculateStatsWithRouting(this.routingService);
    } else {
      optimizedRoute.calculateStats();
    }

    // КРОК 8: НОВА валідація
    const validation = this.validateRouteStrict(optimizedRoute, vehicle, batteryLevel);
    
    if (!validation.isValid) {
      console.log(`⚠️ Маршрут не пройшов валідацію: ${validation.reason}`);
      optimizedRoute.warning = validation.reason;
      
      // Якщо маршрут критично небезпечний - повертаємо попередження
      if (validation.critical) {
        return this.createWarningRoute(
          start,
          end,
          validation.reason
        );
      }
    } else {
      console.log(`✅ Валідація пройдена. Залишковий заряд: ${validation.finalBattery.toFixed(1)}%`);
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
   * НОВИЙ: Пошук першої досяжної станції
   */
  findFirstReachableStation(stations, start, vehicle, batteryLevel) {
    const maxReach = vehicle.getRemainingRange(batteryLevel) * 0.9; // 90% для безпеки
    
    const sorted = [...stations].sort((a, b) => 
      start.distanceTo(a.location) - start.distanceTo(b.location)
    );
    
    for (const station of sorted) {
      const distance = start.distanceTo(station.location);
      if (distance <= maxReach) {
        return station;
      }
    }
    
    return null;
  }

  /**
   * ПОВНІСТЮ НОВА побудова ланцюжка - пошук по прямій лінії
   * Додає станції тільки якщо вони на шляху до мети
   */
  buildStationChain(stations, start, end, vehicle, batteryLevel) {
    const maxRangePerCharge = vehicle.getRemainingRange(100) * 0.75; // 75% для безпеки
    const minRangePerCharge = 50; // Мінімальна відстань між станціями
    
    console.log(`   🔗 НОВИЙ алгоритм побудови ланцюжка...`);
    console.log(`   📍 Старт: заряд ${batteryLevel}%, запас ${vehicle.getRemainingRange(batteryLevel).toFixed(0)} км`);
    console.log(`   🎯 Безпечний діапазон на заряд: ${minRangePerCharge}-${maxRangePerCharge.toFixed(0)} км`);
    
    const chain = [];
    let currentPos = start;
    let currentRange = vehicle.getRemainingRange(batteryLevel);
    const directDistance = start.distanceTo(end);
    
    // Оцінка необхідної кількості станцій
    const estimatedStops = Math.max(1, Math.ceil(directDistance / maxRangePerCharge));
    console.log(`   📊 Оцінка станцій: ${estimatedStops} (відстань ${directDistance.toFixed(0)} км)`);
    
    let iteration = 0;
    const maxIterations = estimatedStops * 3; // Запобігання нескінченному циклу
    
    while (iteration < maxIterations) {
      iteration++;
      
      const distToEnd = currentPos.distanceTo(end);
      
      // Перевірка: чи можемо доїхати до кінця
      if (distToEnd <= currentRange * 0.9) {
        console.log(`   ✅ Можна доїхати до кінця (${distToEnd.toFixed(0)} км)`);
        break;
      }
      
      // Шукаємо найкращу станцію для наступного кроку
      let bestStation = null;
      let bestScore = -Infinity;
      
      for (const station of stations) {
        // Пропускаємо вже використані
        if (chain.some(s => s.id === station.id)) continue;
        
        const distToStation = currentPos.distanceTo(station.location);
        const stationToEnd = station.location.distanceTo(end);
        
        // КРИТЕРІЙ 1: Станція має бути досяжна
        if (distToStation > currentRange * 0.95) continue;
        
        // КРИТЕРІЙ 2: Станція має наближати до мети (не віддаляти!)
        const progress = distToEnd - stationToEnd;
        if (progress <= 0) continue; // Станція віддаляє або не змінює відстань
        
        // КРИТЕРІЙ 3: Відстань до станції має бути розумною (не надто близько)
        if (distToStation < minRangePerCharge && chain.length > 0) continue;
        
        // КРИТЕРІЙ 4: Перевірка чи станція "на лінії" маршруту
        const distanceToLine = this.distanceToRouteLine(start, end, station.location);
        const maxDeviation = Math.max(150, directDistance * 0.25); // Макс 25% або 150км
        if (distanceToLine > maxDeviation) continue;
        
        // КРИТЕРІЙ 5: Після цієї станції має бути можливість дістатись до кінця
        // або до наступної станції
        const canReachEnd = stationToEnd <= maxRangePerCharge * 0.9;
        const hasNextStation = stations.some(s => 
          s.id !== station.id && 
          !chain.some(c => c.id === s.id) &&
          station.location.distanceTo(s.location) <= maxRangePerCharge * 0.9 &&
          s.location.distanceTo(end) < stationToEnd
        );
        
        if (!canReachEnd && !hasNextStation) continue;
        
        // ОЦІНКА станції
        const progressScore = progress * 3; // Наскільки наближає
        const distanceScore = 500 / (distToStation + 1); // Краще ближчі
        const lineScore = 1000 / (distanceToLine + 1); // Краще на лінії
        const efficiencyScore = (progress / distToStation) * 200; // Ефективність
        const powerScore = station.powerKw / 2; // Потужність
        
        const score = progressScore + distanceScore + lineScore + efficiencyScore + powerScore;
        
        if (score > bestScore) {
          bestScore = score;
          bestStation = station;
        }
      }
      
      // Якщо не знайшли станцію - проблема
      if (!bestStation) {
        console.log(`   ❌ Не знайдено придатної станції на ітерації ${iteration}`);
        console.log(`   📍 Поточна позиція: відстань до кінця ${distToEnd.toFixed(0)} км, запас ${currentRange.toFixed(0)} км`);
        
        // КРИТИЧНО: Повертаємо порожній масив якщо не можемо продовжити
        if (chain.length === 0 || distToEnd > currentRange) {
          console.log(`   ❌ КРИТИЧНО: Маршрут неможливий - повертаємо порожній ланцюжок`);
          return [];
        }
        
        break;
      }
      
      // Додаємо станцію
      const distToStation = currentPos.distanceTo(bestStation.location);
      const distToLine = this.distanceToRouteLine(start, end, bestStation.location);
      const progress = distToEnd - bestStation.location.distanceTo(end);
      
      chain.push(bestStation);
      console.log(`   ✓ ${chain.length}. ${bestStation.id}: +${progress.toFixed(0)}км прогресу, ${distToStation.toFixed(0)}км від поточної, ${distToLine.toFixed(0)}км від лінії`);
      
      // Оновлюємо позицію
      currentPos = bestStation.location;
      currentRange = maxRangePerCharge;
      
      // Захист від надмірної кількості станцій
      if (chain.length > estimatedStops + 3) {
        console.log(`   ⚠️ Забагато станцій (${chain.length}), зупинка`);
        break;
      }
    }
    
    // Фінальна діагностика
    if (chain.length === 0) {
      console.log(`   ❌ Не вдалося побудувати ланцюжок`);
      return [];
    }
    
    const lastPos = chain[chain.length - 1].location;
    const finalDist = lastPos.distanceTo(end);
    console.log(`   📊 Побудовано ланцюжок: ${chain.length} станцій`);
    console.log(`   📍 Залишилось до кінця: ${finalDist.toFixed(0)} км (запас ${maxRangePerCharge.toFixed(0)} км)`);
    
    if (finalDist > maxRangePerCharge * 0.9) {
      console.log(`   ⚠️ ПРОБЛЕМА: Останній сегмент недосяжний!`);
      console.log(`   ❌ КРИТИЧНО: Повертаємо порожній ланцюжок через недосяжність кінця`);
      return [];
    }
    
    return chain;
  }

  /**
   * Відстань від точки до лінії маршруту
   */
  distanceToRouteLine(start, end, point) {
    const A = point.lat - start.lat;
    const B = point.lon - start.lon;
    const C = end.lat - start.lat;
    const D = end.lon - start.lon;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq !== 0) {
      param = dot / lenSq;
    }
    
    let xx, yy;
    
    if (param < 0) {
      xx = start.lat;
      yy = start.lon;
    } else if (param > 1) {
      xx = end.lat;
      yy = end.lon;
    } else {
      xx = start.lat + param * C;
      yy = start.lon + param * D;
    }
    
    const dx = point.lat - xx;
    const dy = point.lon - yy;
    
    return Math.sqrt(dx * dx + dy * dy) * 111;
  }

  /**
   * ПОКРАЩЕНА строга валідація маршруту з мінімумом 15%
   */
  validateRouteStrict(route, vehicle, startBatteryLevel) {
    let currentBattery = startBatteryLevel;
    const points = route.points;
    const minSafeBattery = 15; // КРИТИЧНИЙ мінімум 15%
    const warningBattery = 20; // Попередження якщо менше 20%
    
    console.log('🔍 Строга валідація маршруту...');
    
    for (let i = 0; i < points.length - 1; i++) {
      const distance = points[i].distanceTo(points[i + 1]);
      const requiredCharge = vehicle.getRequiredCharge(distance);
      const batteryUsage = (requiredCharge / vehicle.batteryCapacity) * 100;
      
      console.log(`   Сегмент ${i + 1}: ${distance.toFixed(1)} км, потрібно ${batteryUsage.toFixed(1)}%, є ${currentBattery.toFixed(1)}%`);
      
      // Перевірка критичної недостачі заряду
      if (currentBattery < batteryUsage) {
        return {
          isValid: false,
          critical: true,
          reason: `Критична помилка: Недостатньо заряду для сегмента ${i + 1}. ` +
                  `Потрібно ${batteryUsage.toFixed(1)}%, доступно ${currentBattery.toFixed(1)}%. ` +
                  `Збільште початковий заряд або виберіть інший маршрут.`,
          segmentIndex: i
        };
      }
      
      currentBattery -= batteryUsage;
      
      // Попередження про низький заряд ПЕРЕД зарядкою
      if (currentBattery < minSafeBattery) {
        console.log(`   ⚠️ КРИТИЧНО: Заряд ${currentBattery.toFixed(1)}% < ${minSafeBattery}%`);
        
        // Перевіряємо чи наступна точка - станція зарядки
        const nextStation = route.chargingStops.find(station => 
          Math.abs(station.location.lat - points[i + 1].lat) < 0.001 &&
          Math.abs(station.location.lon - points[i + 1].lon) < 0.001
        );
        
        // Якщо НЕ станція зарядки - це критична помилка
        if (!nextStation) {
          return {
            isValid: false,
            critical: true,
            reason: `Критична помилка: Заряд опустився до ${currentBattery.toFixed(1)}% після сегмента ${i + 1}, ` +
                    `що нижче безпечного мінімуму ${minSafeBattery}%. Потрібна додаткова станція зарядки.`,
            segmentIndex: i
          };
        }
      } else if (currentBattery < warningBattery) {
        console.log(`   ⚠️ ПОПЕРЕДЖЕННЯ: Низький заряд ${currentBattery.toFixed(1)}%`);
      }
      
      // Перевірка чи є зарядка на наступній точці
      const nextStation = route.chargingStops.find(station => 
        Math.abs(station.location.lat - points[i + 1].lat) < 0.001 &&
        Math.abs(station.location.lon - points[i + 1].lon) < 0.001
      );
      
      if (nextStation) {
        console.log(`   🔋 Зарядка на станції ${nextStation.id}`);
        currentBattery = 95; // Заряджаємо до 95%
      }
    }
    
    // Фінальна перевірка заряду
    if (currentBattery < minSafeBattery) {
      return {
        isValid: false,
        critical: true,
        reason: `Критична помилка: Залишковий заряд (${currentBattery.toFixed(1)}%) нижче безпечного мінімуму ${minSafeBattery}%. ` +
                `Додайте ще одну зупинку на зарядку або збільште початковий заряд.`,
        finalBattery: currentBattery
      };
    } else if (currentBattery < warningBattery) {
      // М'яке попередження, але маршрут валідний
      console.log(`   ⚠️ Низький залишковий заряд: ${currentBattery.toFixed(1)}%`);
    }
    
    return {
      isValid: true,
      finalBattery: currentBattery
    };
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
   * Стара валідація (залишаємо для сумісності)
   */
  validateRoute(route, vehicle, startBatteryLevel) {
    return this.validateRouteStrict(route, vehicle, startBatteryLevel);
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