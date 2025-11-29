class Route {
  constructor() {
    this.points = [];
    this.chargingStops = [];
    this.totalDistance = 0;
    this.totalTime = 0;
    this.totalChargingTime = 0;
  }

  addPoint(location) {
    this.points.push(location);
  }

  addChargingStop(station) {
    this.chargingStops.push(station);
  }

  calculateStats() {
    this.totalDistance = 0;
    
    for (let i = 0; i < this.points.length - 1; i++) {
      this.totalDistance += this.points[i].distanceTo(this.points[i + 1]);
    }

    // Припускаємо середню швидкість 80 км/год
    this.totalTime = this.totalDistance / 80;
    
    return {
      distance: this.totalDistance,
      time: this.totalTime,
      chargingTime: this.totalChargingTime,
      totalTime: this.totalTime + this.totalChargingTime,
      chargingStops: this.chargingStops.length
    };
  }

  toJSON() {
    return {
      points: this.points,
      chargingStops: this.chargingStops,
      stats: this.calculateStats()
    };
  }
}

module.exports = Route;