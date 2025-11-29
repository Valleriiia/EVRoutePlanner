/**
 * API Client для комунікації з backend
 */
class APIClient {
  constructor(baseURL = 'http://localhost:3000/api') {
    this.baseURL = baseURL;
  }

  /**
   * Побудова маршруту
   * @param {Object} routeData - Дані для побудови маршруту
   * @returns {Promise<Object>} - Дані маршруту
   */
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

  /**
   * Отримання списку зарядних станцій
   * @returns {Promise<Array>} - Масив зарядних станцій
   */
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

  /**
   * Геокодування адреси в координати
   * @param {string} address - Адреса
   * @returns {Promise<Object>} - Координати {lat, lon}
   */
  async geocodeAddress(address) {
    try {
      // Використовуємо Nominatim OpenStreetMap API для геокодування
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

  /**
   * Зворотнє геокодування координат в адресу
   * @param {number} lat - Широта
   * @param {number} lon - Довгота
   * @returns {Promise<string>} - Адреса
   */
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

  /**
   * Перевірка доступності API
   * @returns {Promise<boolean>}
   */
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

// Експорт для використання в інших модулях
if (typeof module !== 'undefined' && module.exports) {
  module.exports = APIClient;
}