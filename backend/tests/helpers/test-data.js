const Location = require('../../src/models/Location');
const ChargingStation = require('../../src/models/ChargingStation');
const Vehicle = require('../../src/models/Vehicle');
const UserInput = require('../../src/models/UserInput');

/**
 * Фабрика для створення тестових даних
 */
class TestDataFactory {
  // Стандартні локації
  static locations = {
    kyiv: new Location(50.4501, 30.5234, 'Київ'),
    lviv: new Location(49.8397, 24.0297, 'Львів'),
    odesa: new Location(46.4825, 30.7233, 'Одеса'),
    kharkiv: new Location(49.9935, 36.2304, 'Харків'),
    dnipro: new Location(48.4647, 35.0462, 'Дніпро'),
  };

  // Створює локацію
  static createLocation(lat, lon, address = '') {
    return new Location(lat, lon, address);
  }

  // Створює зарядну станцію
  static createStation(id, location, powerKw = 100, availability = 'available') {
    return new ChargingStation(id, location, powerKw, availability);
  }

  // Створює масив станцій вздовж маршруту
  static createStationsAlongRoute(start, end, count = 3) {
    const stations = [];
    const latStep = (end.lat - start.lat) / (count + 1);
    const lonStep = (end.lon - start.lon) / (count + 1);

    for (let i = 1; i <= count; i++) {
      const lat = start.lat + latStep * i;
      const lon = start.lon + lonStep * i;
      const location = new Location(lat, lon, `Станція ${i}`);
      stations.push(new ChargingStation(`TEST-${i}`, location, 100));
    }

    return stations;
  }

  // Створює Vehicle
  static createVehicle(batteryCapacity = 60, consumptionPerKm = 0.2) {
    return new Vehicle(batteryCapacity, consumptionPerKm);
  }

  // Створює UserInput
  static createUserInput(start, end, batteryLevel = 80) {
    return new UserInput(start, end, batteryLevel);
  }

  // Створює стандартний маршрут Київ-Львів
  static createKyivLvivRoute() {
    return {
      start: this.locations.kyiv,
      end: this.locations.lviv,
      batteryLevel: 80,
      vehicle: this.createVehicle(),
    };
  }

  // Створює короткий маршрут
  static createShortRoute() {
    const start = this.locations.kyiv;
    const end = new Location(50.5, 30.6, 'Поблизу Києва');
    return {
      start,
      end,
      batteryLevel: 80,
      vehicle: this.createVehicle(),
    };
  }

  // Створює довгий маршрут
  static createLongRoute() {
    return {
      start: this.locations.kyiv,
      end: this.locations.odesa,
      batteryLevel: 80,
      vehicle: this.createVehicle(),
    };
  }

  // Створює API request body
  static createRouteRequestBody(start, end, batteryLevel = 80, vehicle = null) {
    return {
      startPoint: {
        lat: start.lat,
        lon: start.lon,
        address: start.address,
      },
      endPoint: {
        lat: end.lat,
        lon: end.lon,
        address: end.address,
      },
      batteryLevel,
      vehicle: vehicle ? {
        batteryCapacity: vehicle.batteryCapacity,
        consumptionPerKm: vehicle.consumptionPerKm,
      } : undefined,
    };
  }
}

module.exports = TestDataFactory;
