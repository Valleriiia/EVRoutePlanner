const Chromosome = require('../models/Chromosome');
const ChargingStation = require('../models/ChargingStation');

class GeneticAlgorithmService {
  constructor(populationSize = 50, generations = 100, mutationRate = 0.15) {
    this.populationSize = populationSize;
    this.generations = generations;
    this.mutationRate = mutationRate;
  }

  optimize(initialRoute, availableStations, vehicle, startBatteryLevel) {
    console.log('🧬 Запуск оптимізованого генетичного алгоритму...');
    console.log(`   Станцій доступно: ${availableStations.length}`);
    console.log(`   Початковий заряд: ${startBatteryLevel}%`);
    
    const start = initialRoute.points[0];
    const end = initialRoute.points[initialRoute.points.length - 1];
    const directDistance = start.distanceTo(end);
    
    console.log(`   Пряма відстань: ${directDistance.toFixed(2)} км`);
    
    // ВАЖЛИВО: НЕ фільтруємо станції тут, використовуємо всі доступні
    // Фільтрація вже пройшла в route-planner.service
    const relevantStations = availableStations;
    
    console.log(`   Використовуємо всі ${relevantStations.length} станцій для оптимізації`);
    
    if (relevantStations.length === 0) {
      console.log('⚠️ Немає станцій для маршруту');
      return this.createSimpleRoute(start, end);
    }
    
    // Ініціалізація популяції
    let population = this.initializePopulation(
      start, 
      end, 
      relevantStations,
      vehicle,
      startBatteryLevel
    );

    let bestChromosome = null;
    let bestFitness = -Infinity;
    let generationsWithoutImprovement = 0;

    // Еволюція
    for (let generation = 0; generation < this.generations; generation++) {
      // Обчислення фітнесу
      population.forEach(chromosome => {
        chromosome.calculateFitness(startBatteryLevel, vehicle);
      });

      // Сортування по фітнесу
      population.sort((a, b) => b.fitness - a.fitness);
      
      // Оновлення найкращого
      if (population[0].fitness > bestFitness) {
        bestFitness = population[0].fitness;
        bestChromosome = population[0].clone();
        generationsWithoutImprovement = 0;
      } else {
        generationsWithoutImprovement++;
      }

      // Логування прогресу
      if (generation % 20 === 0 || generation === this.generations - 1) {
        const best = population[0];
        const stationCount = best.genes.filter(g => g instanceof ChargingStation).length;
        console.log(
          `Gen ${generation}: Fitness=${best.fitness.toFixed(0)}, ` +
          `Stations=${stationCount}, Valid=${best.isValid}`
        );
      }

      // Рання зупинка якщо немає покращень
      if (generationsWithoutImprovement > 30) {
        console.log(`⚡ Рання зупинка на поколінні ${generation} (немає покращень)`);
        break;
      }

      // Створення нового покоління
      const newPopulation = [];
      
      // Елітизм: зберігаємо топ 10%
      const eliteCount = Math.floor(this.populationSize * 0.1);
      for (let i = 0; i < eliteCount; i++) {
        newPopulation.push(population[i].clone());
      }

      // Схрещування та мутація
      while (newPopulation.length < this.populationSize) {
        const parent1 = this.tournamentSelection(population, 5);
        const parent2 = this.tournamentSelection(population, 5);
        
        let child = parent1.crossover(parent2);
        child.mutate(this.mutationRate);
        
        newPopulation.push(child);
      }

      population = newPopulation;
    }

    // Фінальна статистика
    const finalStations = bestChromosome.genes.filter(g => g instanceof ChargingStation).length;
    console.log(`✅ Оптимізація завершена`);
    console.log(`   Фінальний фітнес: ${bestFitness.toFixed(2)}`);
    console.log(`   Станцій в маршруті: ${finalStations}`);
    console.log(`   Маршрут досяжний: ${bestChromosome.isValid ? 'ТАК' : 'НІ'}`);
    
    return this.chromosomeToRoute(bestChromosome);
  }

  /**
   * Фільтрація релевантних станцій
   */
  filterRelevantStations(start, end, stations, vehicle, batteryLevel) {
    const directDistance = start.distanceTo(end);
    const maxRange = vehicle.getRemainingRange(batteryLevel);
    
    // Якщо можемо доїхати напряму - не потрібні станції
    if (directDistance <= maxRange * 0.85) {
      return [];
    }
    
    console.log(`   🔍 Фільтрація: пряма відстань ${directDistance.toFixed(0)} км, макс запас ${maxRange.toFixed(0)} км`);
    
    // Фільтруємо станції по базовим критеріям
    const validStations = stations.filter(station => {
      const toStation = start.distanceTo(station.location);
      const fromStation = station.location.distanceTo(end);
      
      // Перевірка 1: Станція не має бути надто далеко від прямої лінії (200 км об'їзду)
      const detour = (toStation + fromStation) - directDistance;
      if (detour > 200) {
        return false;
      }
      
      // Перевірка 2: Станція має бути в "коридорі" маршруту (±100 км для довгих маршрутів)
      const distanceToLine = this.distanceToLine(start, end, station.location);
      const corridorWidth = directDistance > 400 ? 100 : 50;
      if (distanceToLine > corridorWidth) {
        return false;
      }
      
      return true;
    });

    console.log(`   ✓ Після базової фільтрації: ${validStations.length} станцій`);

    // НОВЕ: Видаляємо дублікати
    const filteredStations = this.removeDuplicateStations(validStations, 10);
    
    console.log(`   ✓ Після видалення дублікатів: ${filteredStations.length} станцій`);
    
    return filteredStations;
  }

  /**
   * Відстань від точки до лінії
   */
  distanceToLine(start, end, point) {
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
    
    // Приблизна відстань в км
    return Math.sqrt(dx * dx + dy * dy) * 111; // 1 градус ≈ 111 км
  }

  /**
   * Ініціалізація популяції з розумним підходом
   */
  initializePopulation(start, end, stations, vehicle, batteryLevel) {
    const population = [];
    const directDistance = start.distanceTo(end);
    const maxRange = vehicle.getRemainingRange(100); // Запас після ПОВНОЇ зарядки
    
    // Реалістична оцінка: скільки разів потрібно зарядитись
    // При повній зарядці можна проїхати ~300 км, між зарядками ~250 км (з запасом)
    const chargingInterval = 250;
    const estimatedStops = Math.max(1, Math.ceil(directDistance / chargingInterval));
    
    console.log(`   📊 Оцінка зупинок: ${estimatedStops} (відстань ${directDistance.toFixed(0)} км, інтервал ${chargingInterval} км)`);
    console.log(`   📊 Доступно станцій: ${stations.length}`);
    console.log(`   📊 Запас після зарядки: ${maxRange.toFixed(0)} км`);
    
    // Сортуємо станції по відстані від початку
    const sortedStations = [...stations].sort((a, b) => {
      return start.distanceTo(a.location) - start.distanceTo(b.location);
    });
    
    // Якщо станцій мало або рівно стільки скільки потрібно - використовуємо всі
    const useAllStations = stations.length <= estimatedStops + 1;
    
    for (let i = 0; i < this.populationSize; i++) {
      const genes = [start];
      
      if (useAllStations) {
        // Якщо станцій мало - використовуємо всі або майже всі
        if (Math.random() < 0.8) {
          // 80% - всі станції
          genes.push(...sortedStations);
        } else {
          // 20% - випадкова підмножина (але не менше estimatedStops)
          const count = Math.max(estimatedStops, Math.floor(stations.length * 0.7));
          const shuffled = [...sortedStations].sort(() => Math.random() - 0.5);
          const selected = shuffled.slice(0, count);
          selected.sort((a, b) => start.distanceTo(a.location) - start.distanceTo(b.location));
          genes.push(...selected);
        }
      } else {
        // Якщо станцій багато - вибираємо розумно
        if (i < this.populationSize * 0.4) {
          // 40% популяції: рівномірний розподіл (крок по stations)
          const step = Math.max(1, Math.floor(sortedStations.length / estimatedStops));
          for (let j = 0; j < estimatedStops && j * step < sortedStations.length; j++) {
            genes.push(sortedStations[j * step]);
          }
        } else if (i < this.populationSize * 0.7) {
          // 30% популяції: estimatedStops +/- 1
          const count = estimatedStops + (Math.random() < 0.5 ? -1 : 1);
          const actualCount = Math.max(1, Math.min(count, sortedStations.length));
          const selected = [...sortedStations]
            .sort(() => Math.random() - 0.5)
            .slice(0, actualCount);
          
          selected.sort((a, b) => 
            start.distanceTo(a.location) - start.distanceTo(b.location)
          );
          
          genes.push(...selected);
        } else {
          // 30% популяції: повністю випадковий вибір
          const count = Math.floor(Math.random() * (estimatedStops + 2)) + 1;
          const actualCount = Math.min(count, sortedStations.length);
          const selected = [...sortedStations]
            .sort(() => Math.random() - 0.5)
            .slice(0, actualCount);
          
          selected.sort((a, b) => 
            start.distanceTo(a.location) - start.distanceTo(b.location)
          );
          
          genes.push(...selected);
        }
      }
      
      genes.push(end);
      population.push(new Chromosome(genes));
    }
    
    // Логування статистики початкової популяції
    const avgStations = population.reduce((sum, c) => 
      sum + c.genes.filter(g => g instanceof ChargingStation).length, 0
    ) / population.length;
    
    console.log(`   ✓ Популяція створена: середньо ${avgStations.toFixed(1)} станцій на хромосому`);
    
    return population;
  }

  tournamentSelection(population, tournamentSize = 5) {
    const tournament = [];
    for (let i = 0; i < tournamentSize; i++) {
      const randomIndex = Math.floor(Math.random() * population.length);
      tournament.push(population[randomIndex]);
    }
    tournament.sort((a, b) => b.fitness - a.fitness);
    return tournament[0];
  }

  createSimpleRoute(start, end) {
    const Route = require('../models/Route');
    const route = new Route();
    route.addPoint(start);
    route.addPoint(end);
    route.calculateStats();
    return route;
  }

  chromosomeToRoute(chromosome) {
    const Route = require('../models/Route');
    const route = new Route();
    
    chromosome.genes.forEach(gene => {
      if (gene instanceof ChargingStation) {
        route.addChargingStop(gene);
        route.addPoint(gene.location);
      } else {
        route.addPoint(gene);
      }
    });
    
    // Розрахунок часу зарядки
    route.totalChargingTime = route.chargingStops.reduce((total, station) => {
      return total + station.getChargingTime(50);
    }, 0);
    
    route.calculateStats();
    return route;
  }
}

module.exports = GeneticAlgorithmService;