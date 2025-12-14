const request = require('supertest');
const app = require('../../src/server');

describe('Route Planning Integration Tests', () => {
  describe('End-to-End Route Building', () => {
    test('будує маршрут Київ - Львів', async () => {
      const routeData = {
        startPoint: { lat: 50.4501, lon: 30.5234, address: 'Київ' },
        endPoint: { lat: 49.8397, lon: 24.0297, address: 'Львів' },
        batteryLevel: 80,
        vehicle: { batteryCapacity: 60, consumptionPerKm: 0.2 }
      };
      
      const response = await request(app)
        .post('/api/route/build')
        .send(routeData);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      const route = response.body.route;
      expect(route.points.length).toBeGreaterThanOrEqual(2);
      expect(route.stats.distance).toBeGreaterThan(400);
      expect(route.stats.distance).toBeLessThan(600);
    }, 30000);

    test('будує маршрут з низьким зарядом', async () => {
      const routeData = {
        startPoint: { lat: 50.4501, lon: 30.5234 },
        endPoint: { lat: 49.8397, lon: 24.0297 },
        batteryLevel: 30,
        vehicle: { batteryCapacity: 60, consumptionPerKm: 0.2 }
      };
      
      const response = await request(app)
        .post('/api/route/build')
        .send(routeData);
      
      expect(response.status).toBe(200);
      
      // При низькому заряді має бути більше станцій або попередження
      const route = response.body.route;
      const hasStations = route.chargingStops.length > 0;
      const hasWarning = route.warning !== undefined;
      
      expect(hasStations || hasWarning).toBe(true);
    }, 30000);

    test('будує маршрут з високою ємністю батареї', async () => {
      const routeData = {
        startPoint: { lat: 50.4501, lon: 30.5234 },
        endPoint: { lat: 49.8397, lon: 24.0297 },
        batteryLevel: 100,
        vehicle: { batteryCapacity: 100, consumptionPerKm: 0.15 }
      };
      
      const response = await request(app)
        .post('/api/route/build')
        .send(routeData);
      
      expect(response.status).toBe(200);
      
      // З великою батареєю може не потрібна зарядка
      const route = response.body.route;
      expect(route.chargingStops.length).toBeLessThanOrEqual(2);
    }, 30000);
  });

  describe('Route Optimization Scenarios', () => {
    test('оптимізує короткий маршрут', async () => {
      const routeData = {
        startPoint: { lat: 50.4501, lon: 30.5234 },
        endPoint: { lat: 50.6, lon: 30.8 },
        batteryLevel: 90,
        vehicle: { batteryCapacity: 60, consumptionPerKm: 0.2 }
      };
      
      const response = await request(app)
        .post('/api/route/build')
        .send(routeData);
      
      expect(response.status).toBe(200);
      expect(response.body.route.chargingStops).toHaveLength(0);
      expect(response.body.route.stats.distance).toBeLessThan(50);
    }, 30000);

    test('оптимізує довгий маршрут', async () => {
      const routeData = {
        startPoint: { lat: 50.4501, lon: 30.5234 },
        endPoint: { lat: 46.4825, lon: 30.7233 }, // Одеса
        batteryLevel: 80,
        vehicle: { batteryCapacity: 60, consumptionPerKm: 0.2 }
      };
      
      const response = await request(app)
        .post('/api/route/build')
        .send(routeData);
      
      expect(response.status).toBe(200);
      
      const route = response.body.route;
      expect(route.stats.distance).toBeGreaterThan(400);
      // Довгий маршрут потребує зарядки
      expect(route.chargingStops.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Edge Cases', () => {
    test('обробляє однакові start і end точки', async () => {
      const routeData = {
        startPoint: { lat: 50.4501, lon: 30.5234 },
        endPoint: { lat: 50.4501, lon: 30.5234 },
        batteryLevel: 80,
        vehicle: { batteryCapacity: 60, consumptionPerKm: 0.2 }
      };
      
      const response = await request(app)
        .post('/api/route/build')
        .send(routeData);
      
      expect(response.status).toBe(200);
      expect(response.body.route.stats.distance).toBeLessThan(1);
    }, 30000);

    test('обробляє мінімальний заряд', async () => {
      const routeData = {
        startPoint: { lat: 50.4501, lon: 30.5234 },
        endPoint: { lat: 50.5, lon: 30.6 },
        batteryLevel: 10,
        vehicle: { batteryCapacity: 60, consumptionPerKm: 0.2 }
      };
      
      const response = await request(app)
        .post('/api/route/build')
        .send(routeData);
      
      expect(response.status).toBe(200);
    }, 30000);
  });
});