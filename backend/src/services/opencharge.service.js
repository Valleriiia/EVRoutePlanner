const axios = require('axios');
const ChargingStation = require('../models/ChargingStation');
const Location = require('../models/Location');

class OpenChargeMapService {
  constructor() {
    this.baseURL = 'https://api.openchargemap.io/v3/poi';
    this.apiKey = process.env.OPENCHARGE_API_KEY || null;
    this.cache = new Map();
    this.cacheExpiry = 3600000;
  }

  async getStationsNearby(latitude, longitude, distance = 50, maxResults = 50) {
    try {
      const cacheKey = `${latitude},${longitude},${distance}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        console.log('Використання кешованих даних');
        return cached;
      }

      console.log(`Пошук станцій: lat=${latitude}, lon=${longitude}, radius=${distance}km`);

      const params = {
        latitude,
        longitude,
        distance,
        distanceunit: 'KM',
        maxresults: maxResults,
        compact: true,
        verbose: false,
        countrycode: 'UA',
        levelid: '2,3',
        statustypeid: 50,
      };

      if (this.apiKey) {
        params.key = this.apiKey;
      }

      const response = await axios.get(this.baseURL, {
        params,
        timeout: 10000,
        headers: {
          'User-Agent': 'EV-Route-Planner/1.0'
        }
      });

      const stations = this.parseStations(response.data);
      
      this.saveToCache(cacheKey, stations);

      console.log(`Знайдено ${stations.length} станцій`);
      return stations;

    } catch (error) {
      console.error('Помилка OpenChargeMap API:', error.message);
      
      console.log('Використання тестових даних');
      return this.getFallbackStations(latitude, longitude);
    }
  }

  async getStationsAlongRoute(start, end, corridorWidth = 50) {
    try {
      const centerLat = (start.lat + end.lat) / 2;
      const centerLon = (start.lon + end.lon) / 2;
      
      const distance = start.distanceTo(end) / 2 + corridorWidth;

      const allStations = await this.getStationsNearby(
        centerLat, 
        centerLon, 
        Math.min(distance, 500),
        100
      );

      const stationsInCorridor = allStations.filter(station => {
        const distToStart = start.distanceTo(station.location);
        const distToEnd = station.location.distanceTo(end);
        const directDist = start.distanceTo(end);
        
        return (distToStart + distToEnd - directDist) < corridorWidth;
      });

      console.log(`Знайдено ${stationsInCorridor.length} станцій вздовж маршруту`);
      return stationsInCorridor;

    } catch (error) {
      console.error('Помилка пошуку станцій на маршруті:', error.message);
      return [];
    }
  }

  parseStations(data) {
    if (!Array.isArray(data)) return [];

    return data.map(poi => {
      try {
        const location = new Location(
          poi.AddressInfo.Latitude,
          poi.AddressInfo.Longitude,
          this.formatAddress(poi.AddressInfo)
        );

        const powerKw = this.getMaxPower(poi.Connections);

        const availability = this.getAvailability(poi.StatusType);

        return new ChargingStation(
          `OCM-${poi.ID}`,
          location,
          powerKw,
          availability
        );
      } catch (error) {
        console.error('Помилка парсингу станції:', error);
        return null;
      }
    }).filter(Boolean);
  }

  formatAddress(addressInfo) {
    const parts = [];
    
    if (addressInfo.Title) parts.push(addressInfo.Title);
    if (addressInfo.AddressLine1) parts.push(addressInfo.AddressLine1);
    if (addressInfo.Town) parts.push(addressInfo.Town);
    
    return parts.join(', ') || 'Невідома адреса';
  }

  getMaxPower(connections) {
    if (!Array.isArray(connections) || connections.length === 0) {
      return 50;
    }

    const powers = connections
      .map(conn => conn.PowerKW || 0)
      .filter(p => p > 0);

    return powers.length > 0 ? Math.max(...powers) : 50;
  }

  getAvailability(statusType) {
    if (!statusType) return 'unknown';
    
    const statusId = statusType.ID;
    
    if (statusId === 50) return 'available';
    if (statusId === 150) return 'unavailable';
    if (statusId === 200) return 'private';
    
    return 'unknown';
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    const isExpired = Date.now() - cached.timestamp > this.cacheExpiry;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  saveToCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  getFallbackStations(lat, lon) {
    console.log('Використання резервних тестових станцій');
    
    const testStations = [
      { lat: 50.4501, lon: 30.5234, address: 'Київ, вул. Хрещатик', power: 50 },
      { lat: 50.2649, lon: 30.6313, address: 'Бориспіль', power: 150 },
      { lat: 49.8397, lon: 30.1090, address: 'Біла Церква', power: 100 },
      { lat: 49.2328, lon: 28.4810, address: 'Вінниця', power: 50 },
      { lat: 48.4647, lon: 35.0462, address: 'Дніпро', power: 150 },
      { lat: 46.4825, lon: 30.7233, address: 'Одеса', power: 150 },
    ];

    return testStations.map(s => 
      new ChargingStation(
        `TEST-${s.lat}-${s.lon}`,
        new Location(s.lat, s.lon, s.address),
        s.power,
        'available'
      )
    );
  }

  clearCache() {
    this.cache.clear();
    console.log('Кеш очищено');
  }
}

module.exports = OpenChargeMapService;