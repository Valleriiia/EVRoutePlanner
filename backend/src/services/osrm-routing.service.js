const axios = require('axios');

class OSRMRoutingService {
  constructor() {
    this.baseURL = 'https://router.project-osrm.org';
    this.cache = new Map();
  }

  async getRoute(start, end, waypoints = []) {
    try {
      const coordinates = [
        `${start.lon},${start.lat}`,
        ...waypoints.map(w => `${w.lon},${w.lat}`),
        `${end.lon},${end.lat}`
      ].join(';');

      const cacheKey = coordinates;
      if (this.cache.has(cacheKey)) {
        console.log('OSRM: Використання кешу');
        return this.cache.get(cacheKey);
      }

      console.log(`OSRM: Запит маршруту (${waypoints.length + 2} точок)`);

      const url = `${this.baseURL}/route/v1/driving/${coordinates}`;
      const params = {
        overview: 'full',
        geometries: 'geojson',
        steps: false,
        annotations: false
      };

      const response = await axios.get(url, { 
        params,
        timeout: 10000 
      });

      if (response.data.code !== 'Ok') {
        throw new Error(`OSRM error: ${response.data.code}`);
      }

      const route = response.data.routes[0];
      
      const result = {
        distance: route.distance / 1000,
        duration: route.duration / 3600,
        geometry: route.geometry.coordinates,
        bbox: this.calculateBBox(route.geometry.coordinates)
      };

      this.cache.set(cacheKey, result);

      console.log(`OSRM: Маршрут отримано (${result.distance.toFixed(2)} км)`);
      
      return result;

    } catch (error) {
      console.error('OSRM помилка:', error.message);
      
      console.log('Використання прямої лінії');
      return this.getStraightLine(start, end, waypoints);
    }
  }

  async getDistance(from, to) {
    const route = await this.getRoute(from, to);
    return route.distance;
  }

  async getDistanceMatrix(locations) {
    try {
      const coordinates = locations
        .map(loc => `${loc.lon},${loc.lat}`)
        .join(';');

      console.log(`OSRM: Запит матриці відстаней (${locations.length}×${locations.length})`);

      const url = `${this.baseURL}/table/v1/driving/${coordinates}`;
      const params = {
        annotations: 'distance,duration'
      };

      const response = await axios.get(url, { 
        params,
        timeout: 15000 
      });

      if (response.data.code !== 'Ok') {
        throw new Error(`OSRM error: ${response.data.code}`);
      }

      const distanceMatrix = response.data.distances.map(row =>
        row.map(dist => dist / 1000)
      );

      console.log(`OSRM: Матриця отримана`);

      return distanceMatrix;

    } catch (error) {
      console.error('OSRM Matrix помилка:', error.message);
      
      return this.calculateStraightDistanceMatrix(locations);
    }
  }

  getStraightLine(start, end, waypoints = []) {
    const points = [start, ...waypoints, end];
    const coordinates = points.map(p => [p.lon, p.lat]);
    
    let totalDistance = 0;
    for (let i = 0; i < points.length - 1; i++) {
      totalDistance += points[i].distanceTo(points[i + 1]);
    }

    return {
      distance: totalDistance,
      duration: totalDistance / 80,
      geometry: coordinates,
      bbox: this.calculateBBox(coordinates),
      isStraightLine: true
    };
  }

  calculateStraightDistanceMatrix(locations) {
    return locations.map(from =>
      locations.map(to => from.distanceTo(to))
    );
  }

  calculateBBox(coordinates) {
    const lons = coordinates.map(c => c[0]);
    const lats = coordinates.map(c => c[1]);
    
    return [
      Math.min(...lons),
      Math.min(...lats),
      Math.max(...lons),
      Math.max(...lats)
    ];
  }

  clearCache() {
    this.cache.clear();
    console.log('OSRM кеш очищено');
  }
}

module.exports = OSRMRoutingService;