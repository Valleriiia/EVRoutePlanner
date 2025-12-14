const { validateRouteRequest, validateCoordinates } = require('../../../src/middleware/validation.middleware');

describe('Validation Middleware', () => {
  describe('validateRouteRequest', () => {
    let req, res, next;

    beforeEach(() => {
      req = { body: {} };
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      next = jest.fn();
    });

    test('пропускає валідний запит', () => {
      req.body = {
        startPoint: { lat: 50.4501, lon: 30.5234 },
        endPoint: { lat: 49.8397, lon: 24.0297 },
        batteryLevel: 80,
      };

      validateRouteRequest(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('відхиляє запит без startPoint', () => {
      req.body = {
        endPoint: { lat: 49.8397, lon: 24.0297 },
        batteryLevel: 80,
      };

      validateRouteRequest(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    test('відхиляє запит з невалідними координатами', () => {
      req.body = {
        startPoint: { lat: 100, lon: 30.5234 }, // Invalid lat
        endPoint: { lat: 49.8397, lon: 24.0297 },
        batteryLevel: 80,
      };

      validateRouteRequest(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('відхиляє запит з невалідним batteryLevel', () => {
      req.body = {
        startPoint: { lat: 50.4501, lon: 30.5234 },
        endPoint: { lat: 49.8397, lon: 24.0297 },
        batteryLevel: 150, // Over 100
      };

      validateRouteRequest(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('видаляє невідомі поля', () => {
      req.body = {
        startPoint: { lat: 50.4501, lon: 30.5234 },
        endPoint: { lat: 49.8397, lon: 24.0297 },
        batteryLevel: 80,
        unknownField: 'should be removed',
      };

      validateRouteRequest(req, res, next);

      expect(req.body.unknownField).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    test('валідує vehicle parameters', () => {
      req.body = {
        startPoint: { lat: 50.4501, lon: 30.5234 },
        endPoint: { lat: 49.8397, lon: 24.0297 },
        batteryLevel: 80,
        vehicle: {
          batteryCapacity: 60,
          consumptionPerKm: 0.2,
        },
      };

      validateRouteRequest(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('відхиляє невалідні vehicle parameters', () => {
      req.body = {
        startPoint: { lat: 50.4501, lon: 30.5234 },
        endPoint: { lat: 49.8397, lon: 24.0297 },
        batteryLevel: 80,
        vehicle: {
          batteryCapacity: 5, // Too small
          consumptionPerKm: 2, // Too high
        },
      };

      validateRouteRequest(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validateCoordinates', () => {
    let req, res, next;

    beforeEach(() => {
      req = { query: {} };
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      next = jest.fn();
    });

    test('валідує коректні координати', () => {
      req.query = { lat: '50.4501', lon: '30.5234' };

      validateCoordinates(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('відхиляє невалідну широту', () => {
      req.query = { lat: '100', lon: '30.5234' };

      validateCoordinates(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('відхиляє невалідну довготу', () => {
      req.query = { lat: '50.4501', lon: '200' };

      validateCoordinates(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});