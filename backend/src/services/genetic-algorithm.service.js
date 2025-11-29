const Chromosome = require('../models/Chromosome');
const ChargingStation = require('../models/ChargingStation')

class GeneticAlgorithmService {
  constructor(populationSize = 50, generations = 100, mutationRate = 0.1) {
    this.populationSize = populationSize;
    this.generations = generations;
    this.mutationRate = mutationRate;
  }

  optimize(initialRoute, availableStations, vehicle, startBatteryLevel) {
    console.log('🧬 Запуск генетичного алгоритму...');
    
    // Ініціалізація популяції
    let population = this.initializePopulation(
      initialRoute.points[0],
      initialRoute.points[initialRoute.points.length - 1],
      availableStations
    );

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

      if (generation % 20 === 0) {
        console.log(`Generation ${generation}: Best fitness = ${bestFitness.toFixed(2)}`);
      }
    }

    console.log(`✅ Оптимізація завершена. Фітнес: ${bestFitness.toFixed(2)}`);
    return this.chromosomeToRoute(bestChromosome);
  }

  initializePopulation(start, end, stations) {
    const population = [];
    
    for (let i = 0; i < this.populationSize; i++) {
      const genes = [start];
      
      // Випадковий вибір зарядних станцій
      const shuffled = [...stations].sort(() => Math.random() - 0.5);
      const count = Math.floor(Math.random() * Math.min(3, stations.length));
      
      for (let j = 0; j < count; j++) {
        genes.push(shuffled[j]);
      }
      
      genes.push(end);
      population.push(new Chromosome(genes));
    }
    
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
      // Припускаємо що потрібно зарядити 50 кВт·год
      return total + station.getChargingTime(50);
    }, 0);
    
    route.calculateStats();
    return route;
  }
}

module.exports = GeneticAlgorithmService;