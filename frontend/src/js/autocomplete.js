/**
 * Autocomplete компонент для пошуку адрес
 */
class AddressAutocomplete {
  constructor(inputElement, suggestionsElement, apiClient, onSelect) {
    this.input = inputElement;
    this.suggestions = suggestionsElement;
    this.apiClient = apiClient;
    this.onSelect = onSelect;
    
    this.searchTimeout = null;
    this.selectedIndex = -1;
    this.results = [];
    this.isOpen = false;
    
    this.init();
  }

  init() {
    // Обробник вводу тексту
    this.input.addEventListener('input', (e) => {
      this.handleInput(e.target.value);
    });

    // Обробник клавіатури
    this.input.addEventListener('keydown', (e) => {
      this.handleKeydown(e);
    });

    // Закриття при кліку поза елементом
    document.addEventListener('click', (e) => {
      if (!this.input.contains(e.target) && !this.suggestions.contains(e.target)) {
        this.close();
      }
    });

    // Фокус - показуємо останні результати якщо є
    this.input.addEventListener('focus', () => {
      if (this.results.length > 0 && this.input.value.length >= 3) {
        this.open();
      }
    });
  }

  /**
   * Обробка вводу тексту
   */
  handleInput(query) {
    // Очищаємо попередній таймер
    clearTimeout(this.searchTimeout);

    if (query.length < 3) {
      this.close();
      return;
    }

    // Показуємо loading
    this.showLoading();

    // Debounce - чекаємо 300мс після останнього вводу
    this.searchTimeout = setTimeout(() => {
      this.search(query);
    }, 300);
  }

  /**
   * Пошук адрес
   */
  async search(query) {
    try {
      const results = await this.apiClient.searchAddresses(query, 7);
      this.results = results;

      if (results.length === 0) {
        this.showEmpty();
      } else {
        this.renderResults(results);
      }
    } catch (error) {
      console.error('Помилка пошуку:', error);
      this.showError();
    }
  }

  /**
   * Відображення результатів
   */
  renderResults(results) {
    let html = '';
    
    results.forEach((result, index) => {
      html += `
        <div class="suggestion-item" data-index="${index}">
          <div class="suggestion-item__main">
            <span class="suggestion-item__icon">${this.getIcon(result.type)}</span>
            <span>${this.highlightMatch(result.name, this.input.value)}</span>
            <span class="suggestion-item__type">${result.type}</span>
          </div>
          <div class="suggestion-item__details">
            ${result.displayName}
          </div>
        </div>
      `;
    });

    this.suggestions.innerHTML = html;
    this.open();

    // Додаємо обробники кліків
    this.suggestions.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        this.selectResult(index);
      });

      // Виділення при наведенні
      item.addEventListener('mouseenter', () => {
        this.setActiveItem(parseInt(item.dataset.index));
      });
    });
  }

  /**
   * Виділення збігів в тексті
   */
  highlightMatch(text, query) {
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<strong>$1</strong>');
  }

  /**
   * Отримання іконки
   */
  getIcon(type) {
    return type.split(' ')[0]; // Повертаємо емодзі з типу
  }

  /**
   * Вибір результату
   */
  selectResult(index) {
    if (index < 0 || index >= this.results.length) return;

    const result = this.results[index];
    
    // Встановлюємо значення в input
    this.input.value = result.name;
    
    // Викликаємо callback
    if (this.onSelect) {
      this.onSelect({
        lat: result.lat,
        lon: result.lon,
        displayName: result.displayName,
        name: result.name
      });
    }

    // Закриваємо список
    this.close();
  }

  /**
   * Обробка клавіатури
   */
  handleKeydown(e) {
    if (!this.isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.moveSelection(1);
        break;
      
      case 'ArrowUp':
        e.preventDefault();
        this.moveSelection(-1);
        break;
      
      case 'Enter':
        e.preventDefault();
        if (this.selectedIndex >= 0) {
          this.selectResult(this.selectedIndex);
        }
        break;
      
      case 'Escape':
        this.close();
        break;
    }
  }

  /**
   * Переміщення виділення
   */
  moveSelection(direction) {
    const newIndex = this.selectedIndex + direction;
    
    if (newIndex >= -1 && newIndex < this.results.length) {
      this.setActiveItem(newIndex);
    }
  }

  /**
   * Встановлення активного елемента
   */
  setActiveItem(index) {
    // Видаляємо попереднє виділення
    this.suggestions.querySelectorAll('.suggestion-item').forEach(item => {
      item.classList.remove('active');
    });

    this.selectedIndex = index;

    // Додаємо нове виділення
    if (index >= 0) {
      const items = this.suggestions.querySelectorAll('.suggestion-item');
      if (items[index]) {
        items[index].classList.add('active');
        items[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  /**
   * Показати loading
   */
  showLoading() {
    this.suggestions.innerHTML = '<div class="suggestions-loading">🔍 Пошук...</div>';
    this.open();
  }

  /**
   * Показати порожній результат
   */
  showEmpty() {
    this.suggestions.innerHTML = '<div class="suggestions-empty">Нічого не знайдено</div>';
    this.open();
  }

  /**
   * Показати помилку
   */
  showError() {
    this.suggestions.innerHTML = '<div class="suggestions-empty">❌ Помилка пошуку</div>';
    this.open();
  }

  /**
   * Відкрити список
   */
  open() {
    this.suggestions.style.display = 'block';
    this.isOpen = true;
    this.selectedIndex = -1;
  }

  /**
   * Закрити список
   */
  close() {
    this.suggestions.style.display = 'none';
    this.isOpen = false;
    this.selectedIndex = -1;
  }

  /**
   * Очистити
   */
  clear() {
    this.input.value = '';
    this.results = [];
    this.close();
  }
}

// Експорт
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AddressAutocomplete;
}