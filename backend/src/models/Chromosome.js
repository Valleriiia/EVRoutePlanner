const ChargingStation = require('./ChargingStation');

class Chromosome {
  constructor(genes = []) {
    this.genes = genes; // масив Location та ChargingStation
    this.fitness = 0;
  }

  // Отримання Location з гена (ChargingStation або Location)
  getLocation(gene) {
    if (gene instanceof ChargingStation) {
      return gene.location;
    }
    return gene;
  }

  calculateFitness(startBatteryLevel, vehicle) {
    let fitness = 0;
    let currentBattery = startBatteryLevel;
    
    // Розрахунок відстані та перевірка батареї
    let totalDistance = 0;
    let needsCharging = false;
    
    for (let i = 0; i < this.genes.length - 1; i++) {
      // Отримуємо Location об'єкти для розрахунку відстані
      const loc1 = this.getLocation(this.genes[i]);
      const loc2 = this.getLocation(this.genes[i + 1]);
      
      const dist = loc1.distanceTo(loc2);
      totalDistance += dist;
      
      const requiredCharge = vehicle.getRequiredCharge(dist);
      currentBattery -= (requiredCharge / vehicle.batteryCapacity) * 100;
      
      // КРИТИЧНИЙ штраф якщо батарея закінчується БЕЗ зарядки
      if (currentBattery < 5 && !(this.genes[i + 1] instanceof ChargingStation)) {
        fitness -= 10000; // ДУЖЕ великий штраф
        needsCharging = true;
      }
      
      // Якщо зустрічаємо зарядну станцію - заряджаємо
      if (this.genes[i + 1] instanceof ChargingStation) {
        currentBattery = 100; // Заряджаємо до повного
        fitness += 50; // НЕВЕЛИКИЙ бонус за використання станції (коли потрібно)
      }
      
      // Штраф за низький заряд
      if (currentBattery < 10) {
        fitness -= 500;
      }
    }
    
    // Основна мета - мінімізувати відстань
    fitness -= totalDistance;
    
    // Легкий штраф за кількість зарядок (щоб не додавало занадто багато)
    const chargingStations = this.genes.filter(g => g instanceof ChargingStation);
    fitness -= (chargingStations.length * 5); // легкий штраф
    
    // БОНУС якщо маршрут можливий (батарея не закінчилась)
    if (currentBattery >= 5) {
      fitness += 1000; // Бонус за досяжність маршруту
    }
    
    this.fitness = fitness;
    return fitness;
  }

  mutate(mutationRate = 0.1) {
    // Мутація: випадкова зміна порядку зарядних станцій
    // ВАЖЛИВО: НЕ чіпаємо перший (start) і останній (end) елементи!
    if (Math.random() < mutationRate && this.genes.length > 3) {
      // Тільки середні елементи (не start і не end)
      const i = Math.floor(Math.random() * (this.genes.length - 2)) + 1;
      const j = Math.floor(Math.random() * (this.genes.length - 2)) + 1;
      
      if (i !== j) {
        [this.genes[i], this.genes[j]] = [this.genes[j], this.genes[i]];
      }
    }
  }

  crossover(other) {
    // ВАЖЛИВО: Зберігаємо перший (start) і останній (end) елементи
    const start = this.genes[0];
    const end = this.genes[this.genes.length - 1];
    
    // Схрещуємо тільки середні елементи (станції)
    const thisMiddle = this.genes.slice(1, -1);
    const otherMiddle = other.genes.slice(1, -1);
    
    const crossoverPoint = Math.floor(thisMiddle.length / 2);
    
    const childMiddle = [
      ...thisMiddle.slice(0, crossoverPoint),
      ...otherMiddle.slice(crossoverPoint)
    ];
    
    // Збираємо: start + middle + end
    const childGenes = [start, ...childMiddle, end];
    
    return new Chromosome(childGenes);
  }

  clone() {
    return new Chromosome([...this.genes]);
  }
}

module.exports = Chromosome;