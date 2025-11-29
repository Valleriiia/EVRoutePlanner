require('dotenv').config();

module.exports = {
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5500'
  },

  geneticAlgorithm: {
    populationSize: parseInt(process.env.GA_POPULATION_SIZE) || 50,
    generations: parseInt(process.env.GA_GENERATIONS) || 100,
    mutationRate: parseFloat(process.env.GA_MUTATION_RATE) || 0.1
  },

  vehicle: {
    defaultBatteryCapacity: 60, // кВт·год
    defaultConsumption: 0.2, // кВт·год/км
    minBatteryLevel: 10, // мінімальний рівень заряду %
    maxDeviationKm: 30 // максимальне відхилення від маршруту для станцій
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info'
  }
};