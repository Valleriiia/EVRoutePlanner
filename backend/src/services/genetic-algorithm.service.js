const Chromosome = require('../models/Chromosome');
const ChargingStation = require('../models/ChargingStation');

class GeneticAlgorithmService {
  constructor(populationSize = 50, generations = 150, mutationRate = 0.15) {
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
    
    // КРИТИЧНО: Фільтруємо тільки релевантні станції
    const relevantStations = this.filterRelevantStations(
      start, 
      end, 
      availableStations, 
      vehicle, 
      startBatteryLevel
    );
    
    console.log(`   Релевантних станцій після фільтрації: ${relevantStations.length}`);
    
    if (relevantStations.length === 0) {
      console.log('⚠️ Немає релевантних станцій для маршруту');
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
      if (generationsWithoutImprovement > 50) {
        console.log(`⚡ Рання зупинка на поколінні ${generation} (немає покращень)`);
        break;
      }

      // Створення нового покоління
      const newPopulation = [];
      
      // НОВИЙ: Збільшений елітизм для малої кількості станцій
      const stationCount = population[0].genes.filter(g => g instanceof ChargingStation).length;
      let eliteCount;
      
      if (stationCount <= 2) {
        eliteCount = Math.floor(this.populationSize * 0.3); // 30% для 1-2 станцій
      } else if (stationCount <= 3) {
        eliteCount = Math.floor(this.populationSize * 0.2); // 20% для 3 станцій
      } else {
        eliteCount = Math.floor(this.populationSize * 0.1); // 10% для решти
      }
      
      // Елітизм: зберігаємо топ
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
   * ПОКРАЩЕНА ЛОГІКА: М'якша фільтрація релевантних станцій
   * Залишає більше станцій для генетичного алгоритму
   */
  filterRelevantStations(start, end, stations, vehicle, batteryLevel) {
    const directDistance = start.distanceTo(end);
    const maxRange = vehicle.getRemainingRange(100); // Після повної зарядки
    
    // Якщо можемо доїхати напряму - не потрібні станції
    if (directDistance <= maxRange * 0.85) {
      return [];
    }
    
    console.log(`   🔍 М'яка фільтрація станцій:`);
    console.log(`      Пряма відстань: ${directDistance.toFixed(0)} км`);
    console.log(`      Макс запас після зарядки: ${maxRange.toFixed(0)} км`);
    
    // НОВИЙ ПІДХІД: М'якша фільтрація, залишаємо більше станцій
    const validStations = stations.filter(station => {
      const toStation = start.distanceTo(station.location);
      const fromStation = station.location.distanceTo(end);
      
      // Перевірка 1: М'якший ліміт об'їзду (50% або 200км)
      const detour = (toStation + fromStation) - directDistance;
      const maxDetour = Math.max(200, directDistance * 0.5); // Збільшили до 50%
      
      if (detour > maxDetour) {
        return false;
      }
      
      // Перевірка 2: Розширений коридор (40% або 150км)
      const distanceToLine = this.distanceToLine(start, end, station.location);
      const corridorWidth = Math.max(150, directDistance * 0.4); // Збільшили до 40%
      
      if (distanceToLine > corridorWidth) {
        return false;
      }
      
      return true;
    });

    console.log(`      ✓ Після м'якої фільтрації: ${validStations.length} станцій`);

    // М'якше видалення дублікатів (тільки дуже близькі, < 10 км)
    const filteredStations = this.removeDuplicateStations(validStations, 10);
    
    console.log(`      ✓ Після видалення дублікатів: ${filteredStations.length} станцій`);
    
    // Сортуємо по відстані від початку
    return filteredStations.sort((a, b) => 
      start.distanceTo(a.location) - start.distanceTo(b.location)
    );
  }

  /**
   * М'якше видалення дублікатів станцій
   */
  removeDuplicateStations(stations, minDistanceKm = 10) {
    const result = [];
    
    // Сортуємо по потужності (спочатку найпотужніші)
    const sorted = [...stations].sort((a, b) => b.powerKw - a.powerKw);
    
    for (const station of sorted) {
      // Перевіряємо чи є вже близька станція
      const hasDuplicate = result.some(existing => {
        const distance = existing.location.distanceTo(station.location);
        return distance < minDistanceKm;
      });
      
      if (!hasDuplicate) {
        result.push(station);
      }
    }
    
    return result;
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
   * ПОКРАЩЕНА ініціалізація популяції
   * Враховує що ланцюжок вже оптимізований
   */
  initializePopulation(start, end, stations, vehicle, batteryLevel) {
    const population = [];
    const directDistance = start.distanceTo(end);
    const maxRangePerCharge = vehicle.getRemainingRange(100) * 0.75; // 75% для безпеки
    
    // Оцінка необхідної кількості зарядок
    const estimatedStops = Math.max(1, Math.ceil(directDistance / maxRangePerCharge));
    
    console.log(`   📊 Ініціалізація популяції:`);
    console.log(`      Оцінка зупинок: ${estimatedStops}`);
    console.log(`      Доступно станцій: ${stations.length}`);
    
    // НОВИЙ ПІДХІД: Якщо станцій мало - використовуємо всі можливі комбінації
    if (stations.length <= 5) {
      console.log(`      Стратегія: Використання всіх комбінацій (мало станцій)`);
      
      // Генеруємо всі можливі підмножини
      for (let i = 0; i < this.populationSize; i++) {
        const genes = [start];
        
        if (i === 0) {
          // Варіант 1: Всі станції (найбезпечніший)
          genes.push(...stations);
        } else if (i < this.populationSize * 0.5) {
          // 50%: Всі станції в різному порядку
          const shuffled = [...stations].sort(() => Math.random() - 0.5);
          shuffled.sort((a, b) => start.distanceTo(a.location) - start.distanceTo(b.location));
          genes.push(...shuffled);
        } else if (i < this.populationSize * 0.7) {
          // 20%: Видаляємо максимум 1 станцію (якщо їх більше 2)
          if (stations.length > 2) {
            const toRemove = Math.floor(Math.random() * stations.length);
            const filtered = stations.filter((_, idx) => idx !== toRemove);
            filtered.sort((a, b) => start.distanceTo(a.location) - start.distanceTo(b.location));
            genes.push(...filtered);
          } else {
            genes.push(...stations);
          }
        } else {
          // 30%: Випадкова підмножина (мінімум estimatedStops)
          const count = Math.max(estimatedStops, stations.length - 1);
          const selected = this.selectRandomSubset(stations, count);
          selected.sort((a, b) => start.distanceTo(a.location) - start.distanceTo(b.location));
          genes.push(...selected);
        }
        
        genes.push(end);
        population.push(new Chromosome(genes));
      }
    } else {
      // Стандартний підхід для багатьох станцій
      console.log(`      Стратегія: Різні підходи для різноманітності`);
      
      for (let i = 0; i < this.populationSize; i++) {
        const genes = [start];
        
        if (i < this.populationSize * 0.2) {
          // 20%: Всі станції
          genes.push(...stations);
        } else if (i < this.populationSize * 0.4) {
          // 20%: Рівномірний розподіл
          const selected = this.selectEvenlyDistributed(stations, estimatedStops);
          genes.push(...selected);
        } else if (i < this.populationSize * 0.6) {
          // 20%: Найближчі до лінії
          const selected = this.selectNearestToLine(stations, start, end, estimatedStops);
          genes.push(...selected);
        } else if (i < this.populationSize * 0.8) {
          // 20%: По потужності
          const selected = this.selectByPower(stations, estimatedStops);
          genes.push(...selected);
        } else {
          // 20%: Випадковий вибір
          const count = Math.max(estimatedStops, Math.floor(stations.length * 0.6));
          const selected = this.selectRandomSubset(stations, count);
          selected.sort((a, b) => start.distanceTo(a.location) - start.distanceTo(b.location));
          genes.push(...selected);
        }
        
        genes.push(end);
        population.push(new Chromosome(genes));
      }
    }
    
    return population;
  }

  /**
   * Вибір випадкової підмножини
   */
  selectRandomSubset(stations, count) {
    const shuffled = [...stations].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, stations.length));
  }

  /**
   * Вибір станцій рівномірно розподілених по маршруту
   */
  selectEvenlyDistributed(stations, count) {
    if (stations.length <= count) return [...stations];
    
    const step = stations.length / count;
    const selected = [];
    
    for (let i = 0; i < count; i++) {
      const index = Math.floor(i * step);
      selected.push(stations[index]);
    }
    
    return selected;
  }

  /**
   * Вибір станцій найближчих до прямої лінії маршруту
   */
  selectNearestToLine(stations, start, end, count) {
    const sorted = [...stations].sort((a, b) => {
      const distA = this.distanceToLine(start, end, a.location);
      const distB = this.distanceToLine(start, end, b.location);
      return distA - distB;
    });
    
    return sorted.slice(0, Math.min(count, sorted.length));
  }

  /**
   * Вибір найпотужніших станцій
   */
  selectByPower(stations, count) {
    const sorted = [...stations].sort((a, b) => b.powerKw - a.powerKw);
    return sorted.slice(0, Math.min(count, sorted.length));
  }

  /**
   * Вибір найкращих станцій (комбінований підхід)
   */
  selectBestStations(stations, start, end, count) {
    const scored = stations.map(station => {
      const distToLine = this.distanceToLine(start, end, station.location);
      const distFromStart = start.distanceTo(station.location);
      
      // Чим ближче до лінії і чим потужніша - тим краще
      const score = (1000 / (distToLine + 1)) + (station.powerKw / 10) - (distFromStart / 100);
      
      return { station, score };
    });
    
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.min(count, scored.length)).map(s => s.station);
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