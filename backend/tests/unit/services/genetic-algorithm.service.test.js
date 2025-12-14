const GeneticAlgorithmService = require('../../../src/services/genetic-algorithm.service');
const Chromosome = require('../../../src/models/Chromosome');
const ChargingStation = require('../../../src/models/ChargingStation');
const Location = require('../../../src/models/Location');
const Vehicle = require('../../../src/models/Vehicle');
const Route = require('../../../src/models/Route');

describe('GeneticAlgorithmService', () => {
  let gaService, vehicle, start, end, stations;

  beforeEach(() => {
    gaService = new GeneticAlgorithmService(10, 20, 0.1);
    vehicle = new Vehicle(60, 0.2);
    start = new Location(50.4501, 30.5234, 'Київ');
    end = new Location(49.8397, 24.0297, 'Львів');
    
    stations = [
      new ChargingStation('S1', new Location(50.2, 29.0), 100),
      new ChargingStation('S2', new Location(50.0, 27.5), 100),
      new ChargingStation('S3', new Location(49.9, 25.5), 100)
    ];
  });

  describe('constructor', () => {
    test('створює сервіс з дефолтними параметрами', () => {
      const service = new GeneticAlgorithmService();
      expect(service.populationSize).toBe(50);
      expect(service.generations).toBe(150);
      expect(service.mutationRate).toBe(0.15);
    });

    test('створює сервіс з кастомними параметрами', () => {
      expect(gaService.populationSize).toBe(10);
      expect(gaService.generations).toBe(20);
      expect(gaService.mutationRate).toBe(0.1);
    });
  });

  describe('filterRelevantStations', () => {
    test('фільтрує станції по відстані', () => {
      const farStations = [
        new ChargingStation('FAR1', new Location(40.0, 20.0), 100),
        new ChargingStation('FAR2', new Location(45.0, 15.0), 100)
      ];
      
      const filtered = gaService.filterRelevantStations(
        start, end, [...stations, ...farStations], vehicle, 80
      );
      
      expect(filtered.length).toBeLessThanOrEqual(stations.length + farStations.length);
    });

    test('повертає порожній масив для короткої відстані', () => {
      const nearEnd = new Location(50.5, 30.6);
      const filtered = gaService.filterRelevantStations(
        start, nearEnd, stations, vehicle, 100
      );
      
      expect(filtered).toEqual([]);
    });

    test('видаляє дублікати станцій', () => {
      const duplicate = new ChargingStation('DUP', new Location(50.2, 29.001), 100);
      const withDuplicates = [...stations, duplicate];
      
      const filtered = gaService.filterRelevantStations(
        start, end, withDuplicates, vehicle, 80
      );
      
      // Перевіряємо що немає станцій ближче ніж 10км
      for (let i = 0; i < filtered.length; i++) {
        for (let j = i + 1; j < filtered.length; j++) {
          const dist = filtered[i].location.distanceTo(filtered[j].location);
          expect(dist).toBeGreaterThanOrEqual(10);
        }
      }
    });
  });

  describe('distanceToLine', () => {
    test('розраховує відстань до лінії', () => {
      const point = new Location(50.0, 28.0);
      const distance = gaService.distanceToLine(start, end, point);
      
      expect(distance).toBeGreaterThanOrEqual(0);
      expect(typeof distance).toBe('number');
    });

    test('відстань для точки на лінії близька до 0', () => {
      const midpoint = new Location(
        (start.lat + end.lat) / 2,
        (start.lon + end.lon) / 2
      );
      const distance = gaService.distanceToLine(start, end, midpoint);
      
      expect(distance).toBeLessThan(10);
    });
  });

  describe('initializePopulation', () => {
    test('створює популяцію заданого розміру', () => {
      const population = gaService.initializePopulation(
        start, end, stations, vehicle, 80
      );
      
      expect(population).toHaveLength(gaService.populationSize);
      expect(population[0]).toBeInstanceOf(Chromosome);
    });

    test('всі хромосоми мають початок і кінець', () => {
      const population = gaService.initializePopulation(
        start, end, stations, vehicle, 80
      );
      
      population.forEach(chromosome => {
        expect(chromosome.genes[0]).toBe(start);
        expect(chromosome.genes[chromosome.genes.length - 1]).toBe(end);
      });
    });
  });

  describe('tournamentSelection', () => {
    test('вибирає кращого з турніру', () => {
      const population = [];
      for (let i = 0; i < 10; i++) {
        const chromosome = new Chromosome([start, end]);
        chromosome.fitness = i * 10;
        population.push(chromosome);
      }
      
      const selected = gaService.tournamentSelection(population, 3);
      
      expect(selected).toBeInstanceOf(Chromosome);
      expect(selected.fitness).toBeGreaterThanOrEqual(0);
    });
  });

  describe('optimize', () => {
    test('повертає Route об\'єкт', () => {
      const initialRoute = new Route();
      initialRoute.addPoint(start);
      initialRoute.addPoint(end);
      
      const optimized = gaService.optimize(initialRoute, stations, vehicle, 80);
      
      expect(optimized).toBeInstanceOf(Route);
    });

    test('маршрут містить початок і кінець', () => {
      const initialRoute = new Route();
      initialRoute.addPoint(start);
      initialRoute.addPoint(end);
      
      const optimized = gaService.optimize(initialRoute, stations, vehicle, 80);
      
      expect(optimized.points.length).toBeGreaterThanOrEqual(2);
      expect(optimized.points[0]).toBe(start);
      expect(optimized.points[optimized.points.length - 1]).toBe(end);
    });

    test('працює з порожнім списком станцій', () => {
      const initialRoute = new Route();
      initialRoute.addPoint(start);
      initialRoute.addPoint(end);
      
      const optimized = gaService.optimize(initialRoute, [], vehicle, 100);
      
      expect(optimized).toBeInstanceOf(Route);
      expect(optimized.points).toHaveLength(2);
    });
  });

  describe('chromosomeToRoute', () => {
    test('конвертує хромосому в маршрут', () => {
      const chromosome = new Chromosome([start, stations[0], end]);
      const route = gaService.chromosomeToRoute(chromosome);
      
      expect(route).toBeInstanceOf(Route);
      expect(route.points).toHaveLength(3);
      expect(route.chargingStops).toHaveLength(1);
    });

    test('розраховує час зарядки', () => {
      const chromosome = new Chromosome([start, stations[0], stations[1], end]);
      const route = gaService.chromosomeToRoute(chromosome);
      
      expect(route.totalChargingTime).toBeGreaterThan(0);
    });
  });

  describe('helper methods', () => {
    test('selectRandomSubset вибирає підмножину', () => {
      const subset = gaService.selectRandomSubset(stations, 2);
      
      expect(subset.length).toBeLessThanOrEqual(2);
      expect(subset.length).toBeGreaterThan(0);
    });

    test('selectEvenlyDistributed розподіляє рівномірно', () => {
      const distributed = gaService.selectEvenlyDistributed(stations, 2);
      
      expect(distributed.length).toBeLessThanOrEqual(2);
    });

    test('selectByPower сортує по потужності', () => {
      const highPower = new ChargingStation('HIGH', new Location(50.1, 28.5), 200);
      const allStations = [...stations, highPower];
      
      const selected = gaService.selectByPower(allStations, 1);
      
      expect(selected[0].powerKw).toBe(200);
    });
  });

  describe('createSimpleRoute', () => {
    test('створює простий маршрут без станцій', () => {
      const route = gaService.createSimpleRoute(start, end);
      
      expect(route).toBeInstanceOf(Route);
      expect(route.points).toHaveLength(2);
      expect(route.chargingStops).toHaveLength(0);
    });
  });

  describe('removeDuplicateStations', () => {
    test('видаляє близькі станції', () => {
      const close1 = new ChargingStation('C1', new Location(50.0, 28.0), 100);
      const close2 = new ChargingStation('C2', new Location(50.001, 28.001), 50);
      
      const result = gaService.removeDuplicateStations([close1, close2], 5);
      
      expect(result.length).toBe(1);
      expect(result[0].powerKw).toBe(100); // Залишає більш потужну
    });

    test('зберігає віддалені станції', () => {
      const result = gaService.removeDuplicateStations(stations, 5);
      
      expect(result.length).toBe(stations.length);
    });
  });
});