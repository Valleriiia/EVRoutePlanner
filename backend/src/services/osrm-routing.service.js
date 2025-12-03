const axios = require('axios');

/**
 * Сервіс для побудови маршрутів через реальні дороги
 * Використовує OSRM (Open Source Routing Machine)
 */
class OSRMRoutingService {
  constructor() {
    // Публічний сервер OSRM (для тестування)
    // Для production краще розгорнути свій сервер
    this.baseURL = 'https://router.project-osrm.org';
    this.cache = new Map();
  }

  /**
   * Отримання маршруту між двома точками
   * @param {Location} start - Початкова точка
   * @param {Location} end - Кінцева точка
   * @param {Array<Location>} waypoints - Проміжні точки (опціонально)
   * @returns {Promise<Object>} - Дані маршруту
   */
  async getRoute(start, end, waypoints = []) {
    try {
      // Формуємо координати: lon,lat (OSRM використовує lon,lat!)
      const coordinates = [
        `${start.lon},${start.lat}`,
        ...waypoints.map(w => `${w.lon},${w.lat}`),
        `${end.lon},${end.lat}`
      ].join(';');

      // Кеш ключ
      const cacheKey = coordinates;
      if (this.cache.has(cacheKey)) {
        console.log('📦 OSRM: Використання кешу');
        return this.cache.get(cacheKey);
      }

      console.log(`🗺️ OSRM: Запит маршруту (${waypoints.length + 2} точок)`);

      // Запит до OSRM
      const url = `${this.baseURL}/route/v1/driving/${coordinates}`;
      const params = {
        overview: 'full',        // Повна геометрія маршруту
        geometries: 'geojson',   // Формат GeoJSON
        steps: false,            // Без покрокових інструкцій
        annotations: false       // Без додаткових даних
      };

      const response = await axios.get(url, { 
        params,
        timeout: 10000 
      });

      if (response.data.code !== 'Ok') {
        throw new Error(`OSRM error: ${response.data.code}`);
      }

      const route = response.data.routes[0];
      
      // Парсимо результат
      const result = {
        distance: route.distance / 1000, // метри → кілометри
        duration: route.duration / 3600, // секунди → години
        geometry: route.geometry.coordinates, // масив [lon, lat]
        bbox: this.calculateBBox(route.geometry.coordinates)
      };

      // Зберігаємо в кеш
      this.cache.set(cacheKey, result);

      console.log(`✅ OSRM: Маршрут отримано (${result.distance.toFixed(2)} км)`);
      
      return result;

    } catch (error) {
      console.error('❌ OSRM помилка:', error.message);
      
      // Fallback: пряма лінія
      console.log('⚠️ Використання прямої лінії');
      return this.getStraightLine(start, end, waypoints);
    }
  }

  /**
   * Розрахунок відстані по дорогах між точками
   * @param {Location} from 
   * @param {Location} to 
   * @returns {Promise<number>} - Відстань в км
   */
  async getDistance(from, to) {
    const route = await this.getRoute(from, to);
    return route.distance;
  }

  /**
   * Отримання матриці відстаней (для оптимізації)
   * @param {Array<Location>} locations - Масив локацій
   * @returns {Promise<Array<Array<number>>>} - Матриця відстаней
   */
  async getDistanceMatrix(locations) {
    try {
      const coordinates = locations
        .map(loc => `${loc.lon},${loc.lat}`)
        .join(';');

      console.log(`🗺️ OSRM: Запит матриці відстаней (${locations.length}×${locations.length})`);

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

      // Конвертуємо в кілометри
      const distanceMatrix = response.data.distances.map(row =>
        row.map(dist => dist / 1000)
      );

      console.log(`✅ OSRM: Матриця отримана`);

      return distanceMatrix;

    } catch (error) {
      console.error('❌ OSRM Matrix помилка:', error.message);
      
      // Fallback: розрахунок по формулі Гаверсінуса
      return this.calculateStraightDistanceMatrix(locations);
    }
  }

  /**
   * Fallback: пряма лінія
   */
  getStraightLine(start, end, waypoints = []) {
    const points = [start, ...waypoints, end];
    const coordinates = points.map(p => [p.lon, p.lat]);
    
    let totalDistance = 0;
    for (let i = 0; i < points.length - 1; i++) {
      totalDistance += points[i].distanceTo(points[i + 1]);
    }

    return {
      distance: totalDistance,
      duration: totalDistance / 80, // Припускаємо 80 км/год
      geometry: coordinates,
      bbox: this.calculateBBox(coordinates),
      isStraightLine: true
    };
  }

  /**
   * Fallback: матриця по прямій
   */
  calculateStraightDistanceMatrix(locations) {
    return locations.map(from =>
      locations.map(to => from.distanceTo(to))
    );
  }

  /**
   * Розрахунок bounding box
   */
  calculateBBox(coordinates) {
    const lons = coordinates.map(c => c[0]);
    const lats = coordinates.map(c => c[1]);
    
    return [
      Math.min(...lons), // west
      Math.min(...lats), // south
      Math.max(...lons), // east
      Math.max(...lats)  // north
    ];
  }

  /**
   * Очищення кешу
   */
  clearCache() {
    this.cache.clear();
    console.log('🗑️ OSRM кеш очищено');
  }
}

module.exports = OSRMRoutingService;