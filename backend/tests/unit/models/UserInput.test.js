const UserInput = require('../../../src/models/UserInput');
const Location = require('../../../src/models/Location');

describe('UserInput Model', () => {
  let start, end;

  beforeEach(() => {
    start = new Location(50.4501, 30.5234, 'Київ');
    end = new Location(49.8397, 24.0297, 'Львів');
  });

  describe('constructor', () => {
    test('створює input з усіма параметрами', () => {
      const input = new UserInput(start, end, 80);
      expect(input.startPoint).toBe(start);
      expect(input.endPoint).toBe(end);
      expect(input.batteryLevel).toBe(80);
    });
  });

  describe('validate', () => {
    test('валідує коректні дані', () => {
      const input = new UserInput(start, end, 80);
      expect(input.validate()).toBe(true);
    });

    test('викидає помилку при відсутності startPoint', () => {
      const input = new UserInput(null, end, 80);
      expect(() => input.validate()).toThrow('Початкова та кінцева точки обов\'язкові');
    });

    test('викидає помилку при відсутності endPoint', () => {
      const input = new UserInput(start, null, 80);
      expect(() => input.validate()).toThrow('Початкова та кінцева точки обов\'язкові');
    });

    test('викидає помилку при негативному batteryLevel', () => {
      const input = new UserInput(start, end, -10);
      expect(() => input.validate()).toThrow('Рівень заряду батареї повинен бути від 0 до 100');
    });

    test('викидає помилку при batteryLevel > 100', () => {
      const input = new UserInput(start, end, 150);
      expect(() => input.validate()).toThrow('Рівень заряду батареї повинен бути від 0 до 100');
    });
  });

  describe('getters', () => {
    test('getStart повертає початкову точку', () => {
      const input = new UserInput(start, end, 80);
      expect(input.getStart()).toBe(start);
    });

    test('getEnd повертає кінцеву точку', () => {
      const input = new UserInput(start, end, 80);
      expect(input.getEnd()).toBe(end);
    });
  });
});