class CustomAssertions {
  // ВИПРАВЛЕНО: перевіряємо правильний об'єкт
  static assertRouteStructure(route) {
    // Якщо це результат toJSON(), використовуємо його
    const routeObj = route.toJSON ? route.toJSON() : route;
    
    expect(routeObj).toHaveProperty('points');
    expect(routeObj).toHaveProperty('chargingStops');
    expect(routeObj).toHaveProperty('stats');
    expect(Array.isArray(routeObj.points)).toBe(true);
    expect(Array.isArray(routeObj.chargingStops)).toBe(true);
    expect(routeObj.points.length).toBeGreaterThanOrEqual(2);
  }

  static assertLocationStructure(location) {
    expect(location).toHaveProperty('lat');
    expect(location).toHaveProperty('lon');
    expect(typeof location.lat).toBe('number');
    expect(typeof location.lon).toBe('number');
    expect(location.lat).toBeGreaterThanOrEqual(-90);
    expect(location.lat).toBeLessThanOrEqual(90);
    expect(location.lon).toBeGreaterThanOrEqual(-180);
    expect(location.lon).toBeLessThanOrEqual(180);
  }

  static assertStationStructure(station) {
    expect(station).toHaveProperty('id');
    expect(station).toHaveProperty('location');
    expect(station).toHaveProperty('powerKw');
    expect(station).toHaveProperty('availability');
    this.assertLocationStructure(station.location);
  }

  static assertValidDistance(distance, min = 0, max = 10000) {
    expect(typeof distance).toBe('number');
    expect(distance).toBeGreaterThanOrEqual(min);
    expect(distance).toBeLessThanOrEqual(max);
  }

  static assertValidPercentage(value) {
    expect(typeof value).toBe('number');
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);
  }

  static assertRouteHasStartAndEnd(route, start, end) {
    const routeObj = route.toJSON ? route.toJSON() : route;
    expect(routeObj.points[0]).toMatchObject({
      lat: start.lat,
      lon: start.lon,
    });
    expect(routeObj.points[routeObj.points.length - 1]).toMatchObject({
      lat: end.lat,
      lon: end.lon,
    });
  }

  static assertStationsSortedByDistance(stations, referencePoint) {
    for (let i = 0; i < stations.length - 1; i++) {
      const dist1 = referencePoint.distanceTo(stations[i].location);
      const dist2 = referencePoint.distanceTo(stations[i + 1].location);
      expect(dist1).toBeLessThanOrEqual(dist2);
    }
  }

  static assertAPIResponseStructure(response) {
    expect(response).toHaveProperty('success');
    expect(typeof response.success).toBe('boolean');
  }
}

module.exports = CustomAssertions;