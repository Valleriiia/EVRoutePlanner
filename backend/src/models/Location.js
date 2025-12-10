class Location {
  constructor(lat, lon, address = '') {
    this.lat = lat;
    this.lon = lon;
    this.address = address;
  }

  toString() {
    return `${this.address} (${this.lat}, ${this.lon})`;
  }

  distanceTo(other) {
    const R = 6371; 
    const dLat = this.toRad(other.lat - this.lat);
    const dLon = this.toRad(other.lon - this.lon);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRad(this.lat)) * Math.cos(this.toRad(other.lat)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  async roadDistanceTo(other, routingService) {
    if (!routingService) {
      return this.distanceTo(other);
    }

    try {
      return await routingService.getDistance(this, other);
    } catch (error) {
      console.warn('Помилка OSRM, використовуємо пряму відстань');
      return this.distanceTo(other);
    }
  }

  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }

  toGeoJSON() {
    return {
      type: 'Point',
      coordinates: [this.lon, this.lat]
    };
  }
}

module.exports = Location;