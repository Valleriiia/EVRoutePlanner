class ChargingStation {
  constructor(id, location, powerKw = 50, availability = 'available') {
    this.id = id;
    this.location = location;
    this.powerKw = powerKw;
    this.availability = availability;
  }

  getLocation() {
    return this.location;
  }

  // Час зарядки в годинах
  getChargingTime(requiredKwh) {
    return requiredKwh / this.powerKw;
  }

  isAvailable() {
    return this.availability === 'available';
  }
}

module.exports = ChargingStation;