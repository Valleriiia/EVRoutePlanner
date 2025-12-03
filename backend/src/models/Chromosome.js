const ChargingStation = require('./ChargingStation');

class Chromosome {
  constructor(genes = []) {
    this.genes = genes; // масив Location та ChargingStation
    this.fitness = 0;
    this.isValid = true; // Чи досяжний маршрут
  }

  // Отримання Location з гена
  getLocation(gene) {
    if (gene instanceof ChargingStation) {
      return gene.location;
    }
    return gene;
  }

  calculateFitness(startBatteryLevel, vehicle) {
    let fitness = 0;
    let currentBattery = startBatteryLevel;
    
    let totalDistance = 0;
    this.isValid = true;
    
    // Перевіряємо кожен сегмент маршруту
    for (let i = 0; i < this.genes.length - 1; i++) {
      const loc1 = this.getLocation(this.genes[i]);
      const loc2 = this.getLocation(this.genes[i + 1]);
      
      const segmentDistance = loc1.distanceTo(loc2);
      totalDistance += segmentDistance;
      
      // Розрахунок необхідного заряду для сегмента
      const requiredCharge = vehicle.getRequiredCharge(segmentDistance);
      const batteryUsagePercent = (requiredCharge / vehicle.batteryCapacity) * 100;
      
      // КРИТИЧНО: Перевірка чи можемо дістатись наступної точки
      if (currentBattery < batteryUsagePercent) {
        // Машина не доїде до наступної точки!
        fitness -= 100000; // ДУЖЕ ДУЖЕ великий штраф
        this.isValid = false;
        return fitness; // Негайно повертаємо
      }
      
      // Витрачаємо заряд
      currentBattery -= batteryUsagePercent;
      
      // Штраф за критично низький заряд (менше 15%)
      if (currentBattery < 15) {
        fitness -= 500 * (15 - currentBattery);
      }
      
      // Якщо наступна точка - зарядна станція
      if (this.genes[i + 1] instanceof ChargingStation) {
        // Заряджаємо до 100% для максимального запасу ходу
        const chargeAmount = 100 - currentBattery;
        currentBattery = 100;
        
        // Бонус за використання станції коли потрібно
        if (chargeAmount > 40) {
          fitness += 200; // Зарядились значно - це добре
        } else if (chargeAmount < 20) {
          fitness -= 300; // Зарядились мало - станція була непотрібна
        }
      }
    }
    
    // ГОЛОВНИЙ КРИТЕРІЙ: Мінімізація відстані
    fitness -= totalDistance * 1.5;
    
    // М'якший штраф за кількість станцій
    const chargingStations = this.genes.filter(g => g instanceof ChargingStation);
    fitness -= chargingStations.length * 30;
    
    // Перевірка відстаней між станціями (м'якші штрафи)
    const stationDistances = this.getStationDistances();
    for (const dist of stationDistances) {
      // Штраф якщо станції надто близько (менше 40 км)
      if (dist < 40) {
        fitness -= 2000 * (40 - dist) / 40; // Прогресивний штраф
      }
      // Легкий штраф якщо станції дуже далеко (більше 250 км)
      else if (dist > 250) {
        fitness -= 500;
      }
    }
    
    // ВЕЛИКИЙ БОНУС за досяжність
    if (this.isValid && currentBattery >= 10) {
      fitness += 10000; // Дуже великий бонус за досяжний маршрут
      fitness += currentBattery * 20; // Подвійний бонус за залишковий заряд
    }
    
    this.fitness = fitness;
    return fitness;
  }

  // Отримання відстаней між послідовними станціями
  getStationDistances() {
    const distances = [];
    let lastStationIndex = -1;
    
    for (let i = 0; i < this.genes.length; i++) {
      if (this.genes[i] instanceof ChargingStation) {
        if (lastStationIndex !== -1) {
          // Розрахуємо відстань між станціями
          let dist = 0;
          for (let j = lastStationIndex; j < i; j++) {
            const loc1 = this.getLocation(this.genes[j]);
            const loc2 = this.getLocation(this.genes[j + 1]);
            dist += loc1.distanceTo(loc2);
          }
          distances.push(dist);
        }
        lastStationIndex = i;
      }
    }
    
    return distances;
  }

  mutate(mutationRate = 0.1) {
    if (Math.random() > mutationRate || this.genes.length <= 3) {
      return;
    }
    
    const mutationType = Math.random();
    
    if (mutationType < 0.4) {
      // Тип 1: Поміняти місцями дві станції (40%)
      this.swapStations();
    } else if (mutationType < 0.7) {
      // Тип 2: Видалити випадкову станцію (30%)
      this.removeRandomStation();
    } else {
      // Тип 3: Змінити порядок станцій (30%)
      this.shuffleStations();
    }
  }

  swapStations() {
    const stationIndices = this.getStationIndices();
    if (stationIndices.length < 2) return;
    
    const i = stationIndices[Math.floor(Math.random() * stationIndices.length)];
    const j = stationIndices[Math.floor(Math.random() * stationIndices.length)];
    
    if (i !== j) {
      [this.genes[i], this.genes[j]] = [this.genes[j], this.genes[i]];
    }
  }

  removeRandomStation() {
    const stationIndices = this.getStationIndices();
    if (stationIndices.length === 0) return;
    
    const indexToRemove = stationIndices[Math.floor(Math.random() * stationIndices.length)];
    this.genes.splice(indexToRemove, 1);
  }

  shuffleStations() {
    const start = this.genes[0];
    const end = this.genes[this.genes.length - 1];
    const middle = this.genes.slice(1, -1);
    
    // Перемішуємо тільки середні елементи
    for (let i = middle.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [middle[i], middle[j]] = [middle[j], middle[i]];
    }
    
    this.genes = [start, ...middle, end];
  }

  getStationIndices() {
    const indices = [];
    for (let i = 1; i < this.genes.length - 1; i++) {
      if (this.genes[i] instanceof ChargingStation) {
        indices.push(i);
      }
    }
    return indices;
  }

  crossover(other) {
    const start = this.genes[0];
    const end = this.genes[this.genes.length - 1];
    
    const thisStations = this.genes.slice(1, -1).filter(g => g instanceof ChargingStation);
    const otherStations = other.genes.slice(1, -1).filter(g => g instanceof ChargingStation);
    
    // Об'єднуємо станції та видаляємо дублікати
    const allStations = [...thisStations];
    for (const station of otherStations) {
      if (!allStations.find(s => s.id === station.id)) {
        allStations.push(station);
      }
    }
    
    // Випадково вибираємо 50-70% станцій
    const count = Math.floor(allStations.length * (0.5 + Math.random() * 0.2));
    const selectedStations = allStations
      .sort(() => Math.random() - 0.5)
      .slice(0, count);
    
    // Сортуємо станції по відстані від початку
    selectedStations.sort((a, b) => {
      const distA = start.distanceTo(a.location);
      const distB = start.distanceTo(b.location);
      return distA - distB;
    });
    
    const childGenes = [start, ...selectedStations, end];
    return new Chromosome(childGenes);
  }

  clone() {
    const cloned = new Chromosome([...this.genes]);
    cloned.fitness = this.fitness;
    cloned.isValid = this.isValid;
    return cloned;
  }
}

module.exports = Chromosome;