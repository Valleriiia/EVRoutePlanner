const ChargingStation = require('../../../src/models/ChargingStation');
const Location = require('../../../src/models/Location');

describe('ChargingStation Model', () => {
  let location;

  beforeEach(() => {
    location = new Location(50.4501, 30.5234, 'Київ');
  });

  describe('constructor', () => {
    test('створює станцію з дефолтними параметрами', () => {
      const station = new ChargingStation('TEST-1', location);
      expect(station.id).toBe('TEST-1');
      expect(station.powerKw).toBe(50);
      expect(station.availability).toBe('available');
    });

    test('створює станцію з кастомними параметрами', () => {
      const station = new ChargingStation('TEST-2', location, 150, 'unavailable');
      expect(station.powerKw).toBe(150);
      expect(station.availability).toBe('unavailable');
    });
  });

  describe('getChargingTime', () => {
    test('розраховує час зарядки', () => {
      const station = new ChargingStation('TEST-1', location, 100);
      expect(station.getChargingTime(50)).toBe(0.5);
    });

    test('час зарядки для 0 кВт·год дорівнює 0', () => {
      const station = new ChargingStation('TEST-1', location, 100);
      expect(station.getChargingTime(0)).toBe(0);
    });
  });

  describe('isAvailable', () => {
    test('повертає true для доступної станції', () => {
      const station = new ChargingStation('TEST-1', location, 50, 'available');
      expect(station.isAvailable()).toBe(true);
    });

    test('повертає false для недоступної станції', () => {
      const station = new ChargingStation('TEST-1', location, 50, 'unavailable');
      expect(station.isAvailable()).toBe(false);
    });
  });

  describe('getLocation', () => {
    test('повертає локацію станції', () => {
      const station = new ChargingStation('TEST-1', location);
      expect(station.getLocation()).toBe(location);
    });
  });
});