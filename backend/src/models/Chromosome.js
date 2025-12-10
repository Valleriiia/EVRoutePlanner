const ChargingStation = require('./ChargingStation');

class Chromosome {
  constructor(genes = []) {
    this.genes = genes;
    this.fitness = 0;
    this.isValid = true; 
  }

  autoFixStationOrder() {
    const start = this.genes[0];
    const end = this.genes[this.genes.length - 1];
    
    const stations = this.genes
      .slice(1, -1)
      .filter(g => g instanceof ChargingStation);
    
    if (stations.length === 0) return;
    
    let needsFix = false;
    for (let i = 0; i < stations.length - 1; i++) {
      const dist1 = start.distanceTo(stations[i].location);
      const dist2 = start.distanceTo(stations[i + 1].location);
      
      if (dist2 < dist1) {
        needsFix = true;
        break;
      }
    }
    
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
    
    const minSafeBattery = 15;
    
    for (let i = 0; i < this.genes.length - 1; i++) {
      const loc1 = this.getLocation(this.genes[i]);
      const loc2 = this.getLocation(this.genes[i + 1]);
      
      const segmentDistance = loc1.distanceTo(loc2);
      totalDistance += segmentDistance;
      
      const requiredCharge = vehicle.getRequiredCharge(segmentDistance);
      const batteryUsagePercent = (requiredCharge / vehicle.batteryCapacity) * 100;
      
      if (currentBattery < batteryUsagePercent) {
        fitness -= 100000;
        this.isValid = false;
        return fitness; 
      }
      
      currentBattery -= batteryUsagePercent;
      
      if (currentBattery < minSafeBattery) {
        fitness -= 5000 * (minSafeBattery - currentBattery); 
      } else if (currentBattery < 20) {
        fitness -= 1000 * (20 - currentBattery);
      } else if (currentBattery < 30) {
        fitness -= 300 * (30 - currentBattery); 
      }
      
      if (this.genes[i + 1] instanceof ChargingStation) {
        const chargeAmount = 100 - currentBattery;
        currentBattery = 100;
        
        if (chargeAmount > 40) {
          fitness += 800; 
        } else if (chargeAmount > 25) {
          fitness += 400;
        } else if (chargeAmount < 15) {
          fitness -= 1000; 
        } else {
          fitness += 100; 
        }
      }
    }
    
    const detour = totalDistance - directDistance;
    if (detour > 0) {
      fitness -= detour * 3;
    }
    
    fitness -= totalDistance * 2;
    
    const chargingStations = this.genes.filter(g => g instanceof ChargingStation);
    fitness -= chargingStations.length * 50;
    
    const stationDistances = this.getStationDistances();
    for (const dist of stationDistances) {
      if (dist < 50) {
        fitness -= 3000 * ((50 - dist) / 50);
      }
      else if (dist > 280) {
        fitness -= 2000 * ((dist - 280) / 100);
      }
      else if (dist >= 80 && dist <= 250) {
        fitness += 400; 
      }
    }
    
    const stationOrderPenalty = this.checkStationOrder(start, end);
    fitness -= stationOrderPenalty;
    
    if (this.isValid && currentBattery >= minSafeBattery) {
      fitness += 20000; 
      fitness += currentBattery * 40; 
      
      if (currentBattery >= 25) {
        fitness += 3000;
      } else if (currentBattery >= 20) {
        fitness += 1500; 
      }
      
      const efficiency = directDistance / totalDistance;
      if (efficiency > 0.9) {
        fitness += 5000;
      } else if (efficiency > 0.8) {
        fitness += 2000; 
      }
    }
    
    this.fitness = fitness;
    return fitness;
  }

  checkStationOrder(start, end) {
    let penalty = 0;
    const stations = this.genes.filter(g => g instanceof ChargingStation);
    
    if (stations.length <= 1) return 0;
    
    for (let i = 0; i < stations.length - 1; i++) {
      const dist1 = start.distanceTo(stations[i].location);
      const dist2 = start.distanceTo(stations[i + 1].location);
      
      if (dist2 < dist1) {
        penalty += 2000;
      }
    }
    
    return penalty;
  }

  getStationDistances() {
    const distances = [];
    let lastStationIndex = -1;
    
    for (let i = 0; i < this.genes.length; i++) {
      if (this.genes[i] instanceof ChargingStation) {
        if (lastStationIndex !== -1) {
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
    
    if (stationCount <= 3) {
      this.swapAdjacentStations();
      return;
    }
    
    const mutationType = Math.random();
    
    if (mutationType < 0.35) {
      this.swapAdjacentStations();
    } else if (mutationType < 0.65) {
      this.removeRandomStation();
    } else if (mutationType < 0.85) {
      this.sortStationsByDistance();
    } else {
      this.shuffleStations();
    }
  }

  swapAdjacentStations() {
    const stationIndices = this.getStationIndices();
    if (stationIndices.length < 2) return;
    
    const i = Math.floor(Math.random() * (stationIndices.length - 1));
    const idx1 = stationIndices[i];
    const idx2 = stationIndices[i + 1];
    
    if (Math.abs(idx1 - idx2) <= 2) { 
      [this.genes[idx1], this.genes[idx2]] = [this.genes[idx2], this.genes[idx1]];
    }
  }

  sortStationsByDistance() {
    const start = this.genes[0];
    const end = this.genes[this.genes.length - 1];
    
    const stations = this.genes
      .slice(1, -1)
      .filter(g => g instanceof ChargingStation);
    
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
    
    const allStations = [...thisStations];
    for (const station of otherStations) {
      if (!allStations.find(s => s.id === station.id)) {
        allStations.push(station);
      }
    }
    
    if (allStations.length <= 3) {
      allStations.sort((a, b) => {
        const distA = start.distanceTo(a.location);
        const distB = start.distanceTo(b.location);
        return distA - distB;
      });
      
      const childGenes = [start, ...allStations, end];
      return new Chromosome(childGenes);
    }
    
    const count = Math.floor(allStations.length * (0.6 + Math.random() * 0.2));
    const selectedStations = allStations
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.max(count, 2)); 
    
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