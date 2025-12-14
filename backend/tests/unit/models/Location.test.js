const Location = require('../../../src/models/Location');

describe('Location Model', () => {
  describe('constructor', () => {
    test('створює локацію з координатами', () => {
      const loc = new Location(50.4501, 30.5234);
      expect(loc.lat).toBe(50.4501);
      expect(loc.lon).toBe(30.5234);
      expect(loc.address).toBe('');
    });

    test('створює локацію з адресою', () => {
      const loc = new Location(50.4501, 30.5234, 'Київ');
      expect(loc.address).toBe('Київ');
    });
  });

  describe('distanceTo', () => {
    test('розраховує відстань між двома точками', () => {
      const kyiv = new Location(50.4501, 30.5234);
      const lviv = new Location(49.8397, 24.0297);
      const distance = kyiv.distanceTo(lviv);
      
      expect(distance).toBeGreaterThan(460);
      expect(distance).toBeLessThan(480);
    });

    test('відстань до тієї ж точки дорівнює 0', () => {
      const loc = new Location(50.4501, 30.5234);
      expect(loc.distanceTo(loc)).toBe(0);
    });

    test('відстань симетрична', () => {
      const loc1 = new Location(50.4501, 30.5234);
      const loc2 = new Location(49.8397, 24.0297);
      
      expect(loc1.distanceTo(loc2)).toBeCloseTo(loc2.distanceTo(loc1), 1);
    });
  });

  describe('toGeoJSON', () => {
    test('конвертує в GeoJSON формат', () => {
      const loc = new Location(50.4501, 30.5234);
      const geoJSON = loc.toGeoJSON();
      
      expect(geoJSON).toEqual({
        type: 'Point',
        coordinates: [30.5234, 50.4501]
      });
    });
  });

  describe('toString', () => {
    test('повертає рядкове представлення', () => {
      const loc = new Location(50.4501, 30.5234, 'Київ');
      expect(loc.toString()).toBe('Київ (50.4501, 30.5234)');
    });
  });
});

describe('Location Model - Extended', () => {
  describe('Edge cases', () => {
    test('обробляє нульові координати', () => {
      const loc = new Location(0, 0);
      expect(loc.lat).toBe(0);
      expect(loc.lon).toBe(0);
    });

    test('обробляє екстремальні координати', () => {
      const north = new Location(90, 0);
      const south = new Location(-90, 0);
      const east = new Location(0, 180);
      const west = new Location(0, -180);
      
      expect(north.lat).toBe(90);
      expect(south.lat).toBe(-90);
      expect(east.lon).toBe(180);
      expect(west.lon).toBe(-180);
    });

    test('toRad конвертує градуси в радіани', () => {
      const loc = new Location(0, 0);
      expect(loc.toRad(180)).toBeCloseTo(Math.PI);
      expect(loc.toRad(90)).toBeCloseTo(Math.PI / 2);
      expect(loc.toRad(0)).toBe(0);
    });

    test('відстань через екватор', () => {
      const north = new Location(45, 0);
      const south = new Location(-45, 0);
      const distance = north.distanceTo(south);
      
      expect(distance).toBeGreaterThan(9900);
      expect(distance).toBeLessThan(10100);
    });

    test('відстань через меридіан', () => {
      const west = new Location(0, -90);
      const east = new Location(0, 90);
      const distance = west.distanceTo(east);
      
      expect(distance).toBeGreaterThan(19900);
      expect(distance).toBeLessThan(20100);
    });
  });

  describe('roadDistanceTo', () => {
    test('повертає пряму відстань без routing service', async () => {
      const loc1 = new Location(50.4501, 30.5234);
      const loc2 = new Location(50.5, 30.6);
      
      const roadDistance = await loc1.roadDistanceTo(loc2, null);
      const straightDistance = loc1.distanceTo(loc2);
      
      expect(roadDistance).toBe(straightDistance);
    });

    test('використовує routing service якщо доступний', async () => {
      const loc1 = new Location(50.4501, 30.5234);
      const loc2 = new Location(50.5, 30.6);
      
      const mockRoutingService = {
        getDistance: jest.fn().mockResolvedValue(10.5)
      };
      
      const distance = await loc1.roadDistanceTo(loc2, mockRoutingService);
      
      expect(mockRoutingService.getDistance).toHaveBeenCalledWith(loc1, loc2);
      expect(distance).toBe(10.5);
    });

    test('fallback на пряму відстань при помилці', async () => {
      const loc1 = new Location(50.4501, 30.5234);
      const loc2 = new Location(50.5, 30.6);
      
      const mockRoutingService = {
        getDistance: jest.fn().mockRejectedValue(new Error('API Error'))
      };
      
      const distance = await loc1.roadDistanceTo(loc2, mockRoutingService);
      const straightDistance = loc1.distanceTo(loc2);
      
      expect(distance).toBe(straightDistance);
    });
  });

  describe('toString з різними адресами', () => {
  test('порожня адреса', () => {
    const loc = new Location(50.4501, 30.5234);
    expect(loc.toString()).toBe(' (50.4501, 30.5234)');
  });

  test('довга адреса', () => {
    const loc = new Location(50.4501, 30.5234, 'Україна, Київська область, місто Київ, вулиця Хрещатик, будинок 1');
    expect(loc.toString()).toContain('Хрещатик');
  });

  // ВИПРАВЛЕНО: перевіряємо фактичну адресу
  test('адреса з спецсимволами', () => {
    const loc = new Location(50.4501, 30.5234, 'Київ, вул. О\'Коннора');
    // Перевіряємо повну адресу або частину без спецсимволів
    expect(loc.toString()).toContain('Київ');
    expect(loc.toString()).toContain('50.4501');
    // АБО просто перевірте що toString працює
    expect(loc.toString()).toBe('Київ, вул. О\'Коннора (50.4501, 30.5234)');
  });
});
});