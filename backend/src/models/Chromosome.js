const ChargingStation = require('./ChargingStation');

class Chromosome {
  constructor(genes = []) {
    this.genes = genes; // масив Location та ChargingStation
    this.fitness = 0;
  }

  calculateFitness(startBatteryLevel, vehicle) {
    let fitness = 0;
    let currentBattery = startBatteryLevel;
    
    // Штраф за відстань
    let totalDistance = 0;
    for (let i = 0; i < this.genes.length - 1; i++) {
      const loc1 = this.getLocation(this.genes[i]);
const loc2 = this.getLocation(this.genes[i + 1]);
const dist = loc1.distanceTo(loc2);
      totalDistance += dist;
      
      const requiredCharge = vehicle.getRequiredCharge(dist);
      currentBattery -= (requiredCharge / vehicle.batteryCapacity) * 100;
      
      // Якщо зустрічаємо зарядну станцію
      if (this.genes[i + 1] instanceof ChargingStation) {
        currentBattery = 100; // Заряджаємо до повного
      }
      
      // Штраф за розрядку батареї нижче критичного рівня
      if (currentBattery < 10) {
        fitness -= 1000;
      }
    }
    
    // Фітнес = мінімізація відстані + штрафи
    fitness = -totalDistance;
    
    // Бонус за оптимальну кількість зарядок
    const chargingStations = this.genes.filter(g => g instanceof ChargingStation);
    fitness += (chargingStations.length * 10); // невеликий штраф за кожну зарядку
    
    this.fitness = fitness;
    return fitness;
  }

  mutate(mutationRate = 0.1) {
    // Мутація: випадкова зміна порядку зарядних станцій
    if (Math.random() < mutationRate && this.genes.length > 2) {
      const i = Math.floor(Math.random() * (this.genes.length - 2)) + 1;
      const j = Math.floor(Math.random() * (this.genes.length - 2)) + 1;
      [this.genes[i], this.genes[j]] = [this.genes[j], this.genes[i]];
    }
  }

  crossover(other) {
    const crossoverPoint = Math.floor(this.genes.length / 2);
    const childGenes = [
      ...this.genes.slice(0, crossoverPoint),
      ...other.genes.slice(crossoverPoint)
    ];
    return new Chromosome(childGenes);
  }

  clone() {
    return new Chromosome([...this.genes]);
  }

  getLocation(gene) {
  if (gene instanceof ChargingStation) {
    return gene.location;
  }
  return gene;
}
}

module.exports = Chromosome;