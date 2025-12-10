class APIClient {
  constructor(baseURL = 'http://localhost:3000/api') {
    this.baseURL = baseURL;
  }

  async buildRoute(routeData) {
    try {
      const response = await fetch(`${this.baseURL}/route/build`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(routeData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Помилка побудови маршруту');
      }

      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  async getChargingStations() {
    try {
      const response = await fetch(`${this.baseURL}/charging-stations`);
      
      if (!response.ok) {
        throw new Error('Помилка отримання зарядних станцій');
      }

      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  async searchAddresses(query, limit = 5) {
    try {
      if (!query || query.length < 3) {
        return [];
      }

      const encodedQuery = encodeURIComponent(query);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=${limit}&countrycodes=ua&addressdetails=1`
      );

      if (!response.ok) {
        throw new Error('Помилка пошуку адрес');
      }

      const data = await response.json();
      
      return data.map(item => ({
        displayName: item.display_name,
        name: item.name || item.display_name.split(',')[0],
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        type: this.getLocationType(item.type),
        address: {
          city: item.address?.city || item.address?.town || item.address?.village,
          state: item.address?.state,
          country: item.address?.country
        },
        importance: item.importance || 0
      }));
    } catch (error) {
      console.error('Autocomplete Error:', error);
      return [];
    }
  }

  getLocationType(osmType) {
    const types = {
      'city': 'Місто',
      'town': 'Місто',
      'village': 'Село',
      'hamlet': 'Селище',
      'road': 'Вулиця',
      'house': 'Будинок',
      'administrative': 'Регіон',
      'suburb': 'Район',
      'neighbourhood': 'Мікрорайон'
    };
    return types[osmType] || 'Місце';
  }

  async geocodeAddress(address) {
    try {
      const encodedAddress = encodeURIComponent(address);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1&countrycodes=ua`
      );

      if (!response.ok) {
        throw new Error('Помилка геокодування адреси');
      }

      const data = await response.json();
      
      if (data.length === 0) {
        throw new Error('Адресу не знайдено');
      }

      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        displayName: data[0].display_name
      };
    } catch (error) {
      console.error('Geocoding Error:', error);
      throw error;
    }
  }

  async reverseGeocode(lat, lon) {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`
      );

      if (!response.ok) {
        throw new Error('Помилка зворотнього геокодування');
      }

      const data = await response.json();
      return data.display_name || `${lat}, ${lon}`;
    } catch (error) {
      console.error('Reverse Geocoding Error:', error);
      return `${lat}, ${lon}`;
    }
  }

  async checkHealth() {
    try {
      const response = await fetch(`${this.baseURL}/health`);
      return response.ok;
    } catch (error) {
      console.error('Health Check Error:', error);
      return false;
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = APIClient;
}