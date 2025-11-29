class Location {
  constructor(lat, lon, address = '') {
    this.lat = lat;
    this.lon = lon;
    this.address = address;
  }

  toString() {
    return `${this.address} (${this.lat}, ${this.lon})`;
  }

  // Розрахунок відстані між двома точками (формула Гаверсінуса)
  distanceTo(other) {
    const R = 6371; // Радіус Землі в км
    const dLat = this.toRad(other.lat - this.lat);
    const dLon = this.toRad(other.lon - this.lon);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRad(this.lat)) * Math.cos(this.toRad(other.lat)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }
}

module.exports  = Location;