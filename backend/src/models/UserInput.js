class UserInput {
  constructor(startPoint, endPoint, batteryLevel) {
    this.startPoint = startPoint;
    this.endPoint = endPoint;
    this.batteryLevel = batteryLevel;
  }

  getStart() {
    return this.startPoint;
  }

  getEnd() {
    return this.endPoint;
  }

  validate() {
    if (!this.startPoint || !this.endPoint) {
      throw new Error('Початкова та кінцева точки обов\'язкові');
    }
    if (this.batteryLevel < 0 || this.batteryLevel > 100) {
      throw new Error('Рівень заряду батареї повинен бути від 0 до 100');
    }
    return true;
  }
}

module.exports = UserInput;