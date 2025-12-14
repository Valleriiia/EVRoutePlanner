const Vehicle = require('../../../src/models/Vehicle');

describe('Vehicle Model', () => {
  describe('constructor', () => {
    test('створює авто з дефолтними параметрами', () => {
      const vehicle = new Vehicle();
      expect(vehicle.batteryCapacity).toBe(60);
      expect(vehicle.consumptionPerKm).toBe(0.2);
    });

    test('створює авто з кастомними параметрами', () => {
      const vehicle = new Vehicle(75, 0.18);
      expect(vehicle.batteryCapacity).toBe(75);
      expect(vehicle.consumptionPerKm).toBe(0.18);
    });
  });

  describe('getRemainingRange', () => {
    test('розраховує запас ходу при 100%', () => {
      const vehicle = new Vehicle(60, 0.2);
      const range = vehicle.getRemainingRange(100);
      expect(range).toBe(300);
    });

    test('розраховує запас ходу при 50%', () => {
      const vehicle = new Vehicle(60, 0.2);
      const range = vehicle.getRemainingRange(50);
      expect(range).toBe(150);
    });

    test('запас ходу при 0% дорівнює 0', () => {
      const vehicle = new Vehicle(60, 0.2);
      expect(vehicle.getRemainingRange(0)).toBe(0);
    });
  });

  describe('getRequiredCharge', () => {
    test('розраховує необхідний заряд для відстані', () => {
      const vehicle = new Vehicle(60, 0.2);
      expect(vehicle.getRequiredCharge(100)).toBe(20);
    });

    test('заряд для 0 км дорівнює 0', () => {
      const vehicle = new Vehicle(60, 0.2);
      expect(vehicle.getRequiredCharge(0)).toBe(0);
    });
  });
});