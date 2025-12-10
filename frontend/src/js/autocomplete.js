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
    this.input.addEventListener('input', (e) => {
      this.handleInput(e.target.value);
    });

    this.input.addEventListener('keydown', (e) => {
      this.handleKeydown(e);
    });

    document.addEventListener('click', (e) => {
      if (!this.input.contains(e.target) && !this.suggestions.contains(e.target)) {
        this.close();
      }
    });

    this.input.addEventListener('focus', () => {
      if (this.results.length > 0 && this.input.value.length >= 3) {
        this.open();
      }
    });
  }

  handleInput(query) {
    clearTimeout(this.searchTimeout);

    if (query.length < 3) {
      this.close();
      return;
    }

    this.showLoading();

    this.searchTimeout = setTimeout(() => {
      this.search(query);
    }, 300);
  }

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

  renderResults(results) {
    let html = '';
    
    results.forEach((result, index) => {
      html += `
        <div class="suggestion-item" data-index="${index}">
          <div class="suggestion-item__main">
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

    this.suggestions.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        this.selectResult(index);
      });

      item.addEventListener('mouseenter', () => {
        this.setActiveItem(parseInt(item.dataset.index));
      });
    });
  }

  highlightMatch(text, query) {
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<strong>$1</strong>');
  }

  selectResult(index) {
    if (index < 0 || index >= this.results.length) return;

    const result = this.results[index];
    
    this.input.value = result.name;
    
    if (this.onSelect) {
      this.onSelect({
        lat: result.lat,
        lon: result.lon,
        displayName: result.displayName,
        name: result.name
      });
    }

    this.close();
  }

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

  moveSelection(direction) {
    const newIndex = this.selectedIndex + direction;
    
    if (newIndex >= -1 && newIndex < this.results.length) {
      this.setActiveItem(newIndex);
    }
  }

  setActiveItem(index) {
    this.suggestions.querySelectorAll('.suggestion-item').forEach(item => {
      item.classList.remove('active');
    });

    this.selectedIndex = index;

    if (index >= 0) {
      const items = this.suggestions.querySelectorAll('.suggestion-item');
      if (items[index]) {
        items[index].classList.add('active');
        items[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  showLoading() {
    this.suggestions.innerHTML = '<div class="suggestions-loading">Пошук...</div>';
    this.open();
  }

  showEmpty() {
    this.suggestions.innerHTML = '<div class="suggestions-empty">Нічого не знайдено</div>';
    this.open();
  }

  showError() {
    this.suggestions.innerHTML = '<div class="suggestions-empty">Помилка пошуку</div>';
    this.open();
  }

  open() {
    this.suggestions.style.display = 'block';
    this.isOpen = true;
    this.selectedIndex = -1;
  }

  close() {
    this.suggestions.style.display = 'none';
    this.isOpen = false;
    this.selectedIndex = -1;
  }

  clear() {
    this.input.value = '';
    this.results = [];
    this.close();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AddressAutocomplete;
}