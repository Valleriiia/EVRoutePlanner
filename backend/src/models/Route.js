class Route {
  constructor() {
    this.points = [];
    this.chargingStops = [];
    this.totalDistance = 0;
    this.totalTime = 0;
    this.totalChargingTime = 0;
    this.geometry = null; // GeoJSON геометрія маршруту
    this.segments = []; // Сегменти маршруту з деталями
  }

  addPoint(location) {
    this.points.push(location);
  }

  addChargingStop(station) {
    this.chargingStops.push(station);
  }

  /**
   * Розрахунок статистики маршруту (проста версія, без OSRM)
   */
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

  /**
   * Розрахунок статистики з використанням OSRM
   * @param {OSRMRoutingService} routingService 
   */
  async calculateStatsWithRouting(routingService) {
    if (!routingService || this.points.length < 2) {
      return this.calculateStats();
    }

    try {
      console.log('🗺️ Розрахунок маршруту через OSRM...');

      // Отримуємо маршрут по дорогах
      const routeData = await routingService.getRoute(
        this.points[0],
        this.points[this.points.length - 1],
        this.points.slice(1, -1) // Проміжні точки (станції)
      );

      this.totalDistance = routeData.distance;
      this.totalTime = routeData.duration;
      this.geometry = routeData.geometry; // Зберігаємо геометрію для карти

      // Розраховуємо сегменти між точками
      await this.calculateSegments(routingService);

      console.log(`✅ Маршрут розраховано: ${this.totalDistance.toFixed(2)} км`);

      return {
        distance: this.totalDistance,
        time: this.totalTime,
        chargingTime: this.totalChargingTime,
        totalTime: this.totalTime + this.totalChargingTime,
        chargingStops: this.chargingStops.length,
        hasRoadGeometry: true
      };

    } catch (error) {
      console.warn('⚠️ Помилка OSRM, використовуємо прямі лінії');
      return this.calculateStats();
    }
  }

  /**
   * Розрахунок окремих сегментів маршруту
   */
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
        // Fallback для сегмента
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

  /**
   * Експорт у JSON з підтримкою геометрії
   */
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

    // НОВЕ: Додаємо warning якщо є
    if (this.warning) {
      result.warning = this.warning;
    }

    // Додаємо геометрію якщо є
    if (this.geometry) {
      result.geometry = {
        type: 'LineString',
        coordinates: this.geometry
      };
    }

    // Додаємо сегменти якщо є
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

  /**
   * Експорт геометрії у GeoJSON для Leaflet
   */
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

    // Fallback: пряма лінія
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