const Chromosome = require('../models/Chromosome');
const ChargingStation = require('../models/ChargingStation');

class GeneticAlgorithmService {
  constructor(populationSize = 50, generations = 100, mutationRate = 0.1) {
    this.populationSize = populationSize;
    this.generations = generations;
    this.mutationRate = mutationRate;
  }

  optimize(initialRoute, availableStations, vehicle, startBatteryLevel) {
    console.log('🧬 Запуск генетичного алгоритму...');
    console.log(`   Станцій доступно: ${availableStations.length}`);
    console.log(`   Початковий заряд: ${startBatteryLevel}%`);
    
    // Ініціалізація популяції
    let population = this.initializePopulation(
      initialRoute.points[0],
      initialRoute.points[initialRoute.points.length - 1],
      availableStations
    );

    // Перевірка початкової популяції
    const initialWithStations = population.filter(c => c.genes.length > 2).length;
    console.log(`   Хромосом зі станціями: ${initialWithStations}/${population.length}`);

    let bestChromosome = null;
    let bestFitness = -Infinity;

    // Еволюція
    for (let generation = 0; generation < this.generations; generation++) {
      // Обчислення фітнесу
      population.forEach(chromosome => {
        chromosome.calculateFitness(startBatteryLevel, vehicle);
      });

      // Знаходження найкращого
      population.sort((a, b) => b.fitness - a.fitness);
      
      if (population[0].fitness > bestFitness) {
        bestFitness = population[0].fitness;
        bestChromosome = population[0].clone();
      }

      // Логування прогресу
      if (generation % 20 === 0) {
        const bestStations = population[0].genes.filter(g => g instanceof ChargingStation).length;
        console.log(`Generation ${generation}: Fitness=${bestFitness.toFixed(2)}, Stations=${bestStations}, Genes=${population[0].genes.length}`);
      }

      // Селекція та створення нового покоління
      const newPopulation = [];
      
      // Елітизм: зберігаємо найкращих
      const eliteCount = Math.floor(this.populationSize * 0.1);
      for (let i = 0; i < eliteCount; i++) {
        newPopulation.push(population[i].clone());
      }

      // Схрещування
      while (newPopulation.length < this.populationSize) {
        const parent1 = this.tournamentSelection(population);
        const parent2 = this.tournamentSelection(population);
        let child = parent1.crossover(parent2);
        child.mutate(this.mutationRate);
        newPopulation.push(child);
      }

      population = newPopulation;
    }

    const finalStations = bestChromosome.genes.filter(g => g instanceof ChargingStation).length;
    console.log(`✅ Оптимізація завершена`);
    console.log(`   Фітнес: ${bestFitness.toFixed(2)}`);
    console.log(`   Станцій в маршруті: ${finalStations}`);
    console.log(`   Всього точок: ${bestChromosome.genes.length}`);
    
    return this.chromosomeToRoute(bestChromosome);
  }

  initializePopulation(start, end, stations) {
    const population = [];
    
    // Розраховуємо чи потрібні станції
    const directDistance = start.distanceTo(end);
    const needsCharging = directDistance > 200; // Припускаємо що > 200км потрібна зарядка
    
    for (let i = 0; i < this.populationSize; i++) {
      const genes = [start];
      
      // Випадковий вибір зарядних станцій
      const shuffled = [...stations].sort(() => Math.random() - 0.5);
      
      // Якщо маршрут довгий - ОБОВ'ЯЗКОВО додаємо станції
      let count;
      if (needsCharging) {
        // Для довгих маршрутів: 1-3 станції (не 0!)
        count = Math.floor(Math.random() * 3) + 1; // 1, 2 або 3
      } else {
        // Для коротких: 0-1 станція
        count = Math.floor(Math.random() * 2); // 0 або 1
      }
      
      count = Math.min(count, stations.length); // Не більше ніж доступно
      
      for (let j = 0; j < count; j++) {
        genes.push(shuffled[j]);
      }
      
      // ОБОВ'ЯЗКОВО додаємо кінцеву точку
      genes.push(end);
      
      population.push(new Chromosome(genes));
    }
    
    console.log(`✅ Популяція створена: ${population.length} хромосом`);
    console.log(`   Довгий маршрут (${directDistance.toFixed(0)}км): ${needsCharging ? 'ТАК' : 'НІ'}`);
    console.log(`   Станцій на хромосому: ${needsCharging ? '1-3' : '0-1'}`);
    
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

  chromosomeToRoute(chromosome) {
    const Route = require('../models/Route');
    const route = new Route();
    
    // ВАЖЛИВО: гени повинні містити start, [stations...], end
    // Переконаємось що кінцева точка є в генах
    chromosome.genes.forEach((gene, index) => {
      if (gene instanceof ChargingStation) {
        // Додаємо станцію як точку зупинки
        route.addChargingStop(gene);
        route.addPoint(gene.location);
      } else {
        // Додаємо звичайну точку (start або end)
        route.addPoint(gene);
      }
    });
    
    // Розрахунок часу зарядки
    route.totalChargingTime = route.chargingStops.reduce((total, station) => {
      // Припускаємо що потрібно зарядити 50 кВт·год
      return total + station.getChargingTime(50);
    }, 0);
    
    route.calculateStats();
    
    // ВАЖЛИВО: Перевірка що маршрут дійсно має початок і кінець
    if (route.points.length < 2) {
      console.error('❌ Помилка: маршрут має менше 2 точок!');
    }
    
    return route;
  }
}

module.exports = GeneticAlgorithmService;