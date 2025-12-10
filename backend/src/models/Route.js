class Route {
  constructor() {
    this.points = [];
    this.chargingStops = [];
    this.totalDistance = 0;
    this.totalTime = 0;
    this.totalChargingTime = 0;
    this.geometry = null;
    this.segments = [];
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

    this.totalTime = this.totalDistance / 80;
    
    return {
      distance: this.totalDistance,
      time: this.totalTime,
      chargingTime: this.totalChargingTime,
      totalTime: this.totalTime + this.totalChargingTime,
      chargingStops: this.chargingStops.length
    };
  }

  async calculateStatsWithRouting(routingService) {
    if (!routingService || this.points.length < 2) {
      return this.calculateStats();
    }

    try {
      console.log('Розрахунок маршруту через OSRM...');

      const routeData = await routingService.getRoute(
        this.points[0],
        this.points[this.points.length - 1],
        this.points.slice(1, -1)
      );

      this.totalDistance = routeData.distance;
      this.totalTime = routeData.duration;
      this.geometry = routeData.geometry;

      await this.calculateSegments(routingService);

      console.log(`Маршрут розраховано: ${this.totalDistance.toFixed(2)} км`);

      return {
        distance: this.totalDistance,
        time: this.totalTime,
        chargingTime: this.totalChargingTime,
        totalTime: this.totalTime + this.totalChargingTime,
        chargingStops: this.chargingStops.length,
        hasRoadGeometry: true
      };

    } catch (error) {
      console.warn('Помилка OSRM, використовуємо прямі лінії');
      return this.calculateStats();
    }
  }

  async calculateSegments(routingService) {
    this.segments = [];

    for (let i = 0; i < this.points.length - 1; i++) {
      try {
        const segmentData = await routingService.getRoute(
          this.points[i],
          this.points[i + 1]
        );

        this.segments.push({
          from: this.points[i],
          to: this.points[i + 1],
          distance: segmentData.distance,
          duration: segmentData.duration,
          geometry: segmentData.geometry
        });
      } catch (error) {
        const straightDistance = this.points[i].distanceTo(this.points[i + 1]);
        this.segments.push({
          from: this.points[i],
          to: this.points[i + 1],
          distance: straightDistance,
          duration: straightDistance / 80,
          geometry: [[this.points[i].lon, this.points[i].lat], 
                     [this.points[i + 1].lon, this.points[i + 1].lat]],
          isStraightLine: true
        });
      }
    }
  }

  toJSON() {
    const stats = {
      distance: this.totalDistance,
      time: this.totalTime,
      chargingTime: this.totalChargingTime,
      totalTime: this.totalTime + this.totalChargingTime,
      chargingStops: this.chargingStops.length
    };

    const result = {
      points: this.points,
      chargingStops: this.chargingStops,
      stats
    };

    if (this.warning) {
      result.warning = this.warning;
    }

    if (this.geometry) {
      result.geometry = {
        type: 'LineString',
        coordinates: this.geometry
      };
    }

    if (this.segments.length > 0) {
      result.segments = this.segments.map(seg => ({
        from: { lat: seg.from.lat, lon: seg.from.lon, address: seg.from.address },
        to: { lat: seg.to.lat, lon: seg.to.lon, address: seg.to.address },
        distance: seg.distance,
        duration: seg.duration,
        isStraightLine: seg.isStraightLine || false
      }));
    }

    return result;
  }

  toGeoJSON() {
    if (this.geometry) {
      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: this.geometry
        },
        properties: {
          distance: this.totalDistance,
          duration: this.totalTime,
          chargingStops: this.chargingStops.length
        }
      };
    }

    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: this.points.map(p => [p.lon, p.lat])
      },
      properties: {
        distance: this.totalDistance,
        duration: this.totalTime,
        chargingStops: this.chargingStops.length,
        isStraightLine: true
      }
    };
  }
}

module.exports = Route;