const ChargingStation = require('./ChargingStation');

class Chromosome {
  constructor(genes = []) {
    this.genes = genes; // масив Location та ChargingStation
    this.fitness = 0;
    this.isValid = true; // Чи досяжний маршрут
  }

  /**
   * НОВИЙ: Автоматичне виправлення порядку станцій
   * Сортує станції по відстані від початку (якщо їх мало)
   */
  autoFixStationOrder() {
    const start = this.genes[0];
    const end = this.genes[this.genes.length - 1];
    
    const stations = this.genes
      .slice(1, -1)
      .filter(g => g instanceof ChargingStation);
    
    if (stations.length === 0) return;
    
    // Перевіряємо чи правильний порядок
    let needsFix = false;
    for (let i = 0; i < stations.length - 1; i++) {
      const dist1 = start.distanceTo(stations[i].location);
      const dist2 = start.distanceTo(stations[i + 1].location);
      
      if (dist2 < dist1) {
        needsFix = true;
        break;
      }
    }
    
    // Виправляємо якщо потрібно
    if (needsFix) {
      stations.sort((a, b) => {
        const distA = start.distanceTo(a.location);
        const distB = start.distanceTo(b.location);
        return distA - distB;
      });
      
      this.genes = [start, ...stations, end];
    }
  }

  getLocation(gene) {
    if (gene instanceof ChargingStation) {
      return gene.location;
    }
    return gene;
  }

  calculateFitness(startBatteryLevel, vehicle) {
    // НОВИЙ: Автоматичне виправлення порядку станцій (якщо їх мало)
    const stationCount = this.genes.filter(g => g instanceof ChargingStation).length;
    if (stationCount <= 3 && stationCount > 0) {
      this.autoFixStationOrder();
    }
    
    let fitness = 0;
    let currentBattery = startBatteryLevel;
    
    let totalDistance = 0;
    this.isValid = true;
    
    const start = this.getLocation(this.genes[0]);
    const end = this.getLocation(this.genes[this.genes.length - 1]);
    const directDistance = start.distanceTo(end);
    
    const minSafeBattery = 15; // КРИТИЧНИЙ мінімум
    
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
        fitness -= 100000; // ДУЖЕ ВЕЛИКИЙ штраф
        this.isValid = false;
        return fitness; // Негайно повертаємо
      }
      
      // Витрачаємо заряд
      currentBattery -= batteryUsagePercent;
      
      // КРИТИЧНИЙ ШТРАФ: Заряд нижче безпечного мінімуму
      if (currentBattery < minSafeBattery) {
        fitness -= 5000 * (minSafeBattery - currentBattery); // ДУЖЕ великий прогресивний штраф
      } else if (currentBattery < 20) {
        fitness -= 1000 * (20 - currentBattery); // Великий штраф за низький заряд
      } else if (currentBattery < 30) {
        fitness -= 300 * (30 - currentBattery); // М'якший штраф
      }
      
      // Якщо наступна точка - зарядна станція
      if (this.genes[i + 1] instanceof ChargingStation) {
        const chargeAmount = 100 - currentBattery;
        currentBattery = 100;
        
        // Оцінка доцільності використання станції
        if (chargeAmount > 40) {
          fitness += 800; // Дуже добре - зарядились коли справді потрібно
        } else if (chargeAmount > 25) {
          fitness += 400; // Добре - нормальна зарядка
        } else if (chargeAmount < 15) {
          fitness -= 1000; // Погано - непотрібна станція
        } else {
          fitness += 100; // Нормально
        }
      }
    }
    
    // Штраф за об'їзд
    const detour = totalDistance - directDistance;
    if (detour > 0) {
      fitness -= detour * 3; // 3 пункти за кожен км об'їзду
    }
    
    // ГОЛОВНИЙ КРИТЕРІЙ: Мінімізація загальної відстані
    fitness -= totalDistance * 2;
    
    // Штраф за кількість станцій
    const chargingStations = this.genes.filter(g => g instanceof ChargingStation);
    fitness -= chargingStations.length * 50;
    
    // Перевірка оптимальності розміщення станцій
    const stationDistances = this.getStationDistances();
    for (const dist of stationDistances) {
      // Штраф якщо станції надто близько (менше 50 км)
      if (dist < 50) {
        fitness -= 3000 * ((50 - dist) / 50);
      }
      // Штраф якщо станції надто далеко (більше 280 км)
      else if (dist > 280) {
        fitness -= 2000 * ((dist - 280) / 100);
      }
      // Оптимальний діапазон: 80-250 км між станціями
      else if (dist >= 80 && dist <= 250) {
        fitness += 400; // Бонус за оптимальний інтервал
      }
    }
    
    // Перевірка що станції йдуть по порядку маршруту
    const stationOrderPenalty = this.checkStationOrder(start, end);
    fitness -= stationOrderPenalty;
    
    // ВЕЛИКИЙ БОНУС за досяжність
    if (this.isValid && currentBattery >= minSafeBattery) {
      fitness += 20000; // Збільшили бонус
      fitness += currentBattery * 40; // Четверний бонус за залишковий заряд
      
      // ДОДАТКОВИЙ БОНУС: Безпечний запас (більше 20%)
      if (currentBattery >= 25) {
        fitness += 3000; // Великий бонус за безпечний запас
      } else if (currentBattery >= 20) {
        fitness += 1500; // Середній бонус
      }
      
      // ДОДАТКОВИЙ БОНУС: Якщо маршрут ефективний
      const efficiency = directDistance / totalDistance;
      if (efficiency > 0.9) {
        fitness += 5000; // Дуже ефективний маршрут
      } else if (efficiency > 0.8) {
        fitness += 2000; // Ефективний маршрут
      }
    }
    
    this.fitness = fitness;
    return fitness;
  }

  /**
   * НОВИЙ: Перевірка що станції йдуть по порядку вздовж маршруту
   */
  checkStationOrder(start, end) {
    let penalty = 0;
    const stations = this.genes.filter(g => g instanceof ChargingStation);
    
    if (stations.length <= 1) return 0;
    
    for (let i = 0; i < stations.length - 1; i++) {
      const dist1 = start.distanceTo(stations[i].location);
      const dist2 = start.distanceTo(stations[i + 1].location);
      
      // Якщо наступна станція ближча до початку - це погано
      if (dist2 < dist1) {
        penalty += 2000; // Штраф за неправильний порядок
      }
    }
    
    return penalty;
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
    
    const stationCount = this.genes.filter(g => g instanceof ChargingStation).length;
    
    // КРИТИЧНО: Не видаляємо і НЕ СОРТУЄМО станції якщо їх 3 або менше
    if (stationCount <= 3) {
      // Дозволяємо ТІЛЬКИ swap сусідніх станцій (найбезпечніше)
      this.swapAdjacentStations();
      return;
    }
    
    const mutationType = Math.random();
    
    if (mutationType < 0.35) {
      // Тип 1: Поміняти місцями дві сусідні станції (35%)
      this.swapAdjacentStations();
    } else if (mutationType < 0.65) {
      // Тип 2: Видалити випадкову станцію (30%)
      this.removeRandomStation();
    } else if (mutationType < 0.85) {
      // Тип 3: Впорядкувати станції по відстані (20%)
      this.sortStationsByDistance();
    } else {
      // Тип 4: Змінити порядок (15%)
      this.shuffleStations();
    }
  }

  /**
   * ПОКРАЩЕНИЙ: Поміняти місцями дві СУСІДНІ станції
   */
  swapAdjacentStations() {
    const stationIndices = this.getStationIndices();
    if (stationIndices.length < 2) return;
    
    // Вибираємо випадковий індекс і міняємо з наступним
    const i = Math.floor(Math.random() * (stationIndices.length - 1));
    const idx1 = stationIndices[i];
    const idx2 = stationIndices[i + 1];
    
    // КРИТИЧНО: Перевіряємо що це дійсно сусідні індекси в масиві
    if (Math.abs(idx1 - idx2) <= 2) { // Максимум 1 елемент між ними
      [this.genes[idx1], this.genes[idx2]] = [this.genes[idx2], this.genes[idx1]];
    }
  }

  /**
   * НОВИЙ: Впорядкувати станції по відстані від початку
   */
  sortStationsByDistance() {
    const start = this.genes[0];
    const end = this.genes[this.genes.length - 1];
    
    const stations = this.genes
      .slice(1, -1)
      .filter(g => g instanceof ChargingStation);
    
    // Сортуємо по відстані від початку
    stations.sort((a, b) => {
      const distA = start.distanceTo(a.location);
      const distB = start.distanceTo(b.location);
      return distA - distB;
    });
    
    this.genes = [start, ...stations, end];
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
    
    // КРИТИЧНО: Якщо станцій мало (≤3) - зберігаємо всі
    if (allStations.length <= 3) {
      allStations.sort((a, b) => {
        const distA = start.distanceTo(a.location);
        const distB = start.distanceTo(b.location);
        return distA - distB;
      });
      
      const childGenes = [start, ...allStations, end];
      return new Chromosome(childGenes);
    }
    
    // Випадково вибираємо 60-80% станцій (було 50-70%)
    const count = Math.floor(allStations.length * (0.6 + Math.random() * 0.2));
    const selectedStations = allStations
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.max(count, 2)); // Мінімум 2 станції
    
    // Сортуємо станції по відстані від початку для правильного порядку
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