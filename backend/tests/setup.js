jest.setTimeout(30000);

process.env.NODE_ENV = 'test';
process.env.USE_REAL_CHARGING_STATIONS = 'false';
process.env.USE_ROAD_ROUTING = 'false';

// Зберігаємо оригінальні функції консолі
const originalConsoleError = console.error;
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

// Приховуємо console.error в тестах (окрім критичних помилок)
global.console = {
  ...console,
  // Приховуємо звичайні логи
  log: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  
  // Фільтруємо console.error - показуємо тільки неочікувані помилки
  error: jest.fn((...args) => {
    const message = args[0];
    
    // Список очікуваних повідомлень про помилки в тестах
    const expectedErrors = [
      'Помилка побудови маршруту:',
      'Помилка отримання станцій:',
      'Помилка пошуку станцій:',
      'Помилка оптимізації:',
      'Помилка OSRM',
      'Test error',
      'Database error',
      'Service error'
    ];
    
    // Якщо це очікувана помилка з тестів - не показуємо
    const isExpectedError = expectedErrors.some(expected => 
      typeof message === 'string' && message.includes(expected)
    );
    
    // Показуємо тільки неочікувані помилки
    if (!isExpectedError) {
      originalConsoleError(...args);
    }
  }),
  
  // Залишаємо warn видимим
  warn: originalConsoleWarn,
};

// Очищаємо моки після кожного тесту
afterEach(() => {
  jest.clearAllMocks();
});

// Відновлюємо консоль після всіх тестів (опціонально)
afterAll(() => {
  global.console.error = originalConsoleError;
  global.console.log = originalConsoleLog;
  global.console.warn = originalConsoleWarn;
});

