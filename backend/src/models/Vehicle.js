class Vehicle {
  constructor(batteryCapacity = 60, consumptionPerKm = 0.2) {
    this.batteryCapacity = batteryCapacity; // кВт·год
    this.consumptionPerKm = consumptionPerKm; // кВт·год/км
  }

  getRemainingRange(currentBatteryLevel) {
    const remainingCapacity = (currentBatteryLevel / 100) * this.batteryCapacity;
    return remainingCapacity / this.consumptionPerKm;
  }

  getRequiredCharge(distance) {
    return distance * this.consumptionPerKm;
  }
}

module.exports = Vehicle;