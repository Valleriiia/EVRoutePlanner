/**
 * Map Renderer для відображення маршрутів на карті
 * ОНОВЛЕНО: Підтримка геометрії з OSRM
 */
class MapRenderer {
  constructor(mapElementId) {
    this.mapElementId = mapElementId;
    this.map = null;
    this.routeLayer = null;
    this.markersLayer = null;
    this.chargingStationsLayer = null;
    this.defaultCenter = [48.3794, 31.1656]; // Центр України
    this.defaultZoom = 6;
    
    this.initMap();
  }

  /**
   * Ініціалізація карти
   */
  initMap() {
    try {
      this.map = L.map(this.mapElementId).setView(this.defaultCenter, this.defaultZoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
        minZoom: 3
      }).addTo(this.map);

      this.routeLayer = L.layerGroup().addTo(this.map);
      this.markersLayer = L.layerGroup().addTo(this.map);
      this.chargingStationsLayer = L.layerGroup().addTo(this.map);

      console.log('🗺️ Карту ініціалізовано');
    } catch (error) {
      console.error('❌ Помилка ініціалізації карти:', error);
      throw error;
    }
  }

  /**
   * Відображення маршруту на карті
   * ОНОВЛЕНО: Підтримка геометрії з OSRM
   */
  renderRoute(routeData) {
    this.clearRoute();

    if (!routeData || !routeData.points || routeData.points.length === 0) {
      console.error('Немає даних маршруту для відображення');
      return;
    }

    const points = routeData.points;
    const chargingStops = routeData.chargingStops || [];

    // НОВЕ: Використовуємо геометрію з OSRM якщо доступна
    if (routeData.geometry && routeData.geometry.coordinates) {
      console.log('🗺️ Використання геометрії з OSRM');
      this.renderRoadRoute(routeData.geometry.coordinates, routeData.stats);
    } 
    // Альтернатива: Пряма лінія між точками
    else {
      console.log('📏 Використання прямих ліній');
      const latLngs = points.map(point => [point.lat, point.lon]);
      this.renderStraightRoute(latLngs);
    }

    // Початковий маркер
    const startPoint = points[0];
    const startMarker = L.marker([startPoint.lat, startPoint.lon], {
      icon: this.createCustomIcon('🚗', '#10b981')
    }).addTo(this.markersLayer)
      .bindPopup(`<b>Початок</b><br>${startPoint.address || 'Початкова точка'}`);

    // Кінцевий маркер
    const endPoint = points[points.length - 1];
    const endMarker = L.marker([endPoint.lat, endPoint.lon], {
      icon: this.createCustomIcon('🏁', '#ef4444')
    }).addTo(this.markersLayer)
      .bindPopup(`<b>Кінець</b><br>${endPoint.address || 'Кінцева точка'}`);

    // Зарядні станції
    chargingStops.forEach((station, index) => {
      const loc = station.location;
      const stationMarker = L.marker([loc.lat, loc.lon], {
        icon: this.createCustomIcon('⚡', '#06b6d4')
      }).addTo(this.chargingStationsLayer)
        .bindPopup(`
          <div class="station-popup">
            <h4>Зарядна станція ${index + 1}</h4>
            <p><strong>ID:</strong> ${station.id}</p>
            <p><strong>Потужність:</strong> ${station.powerKw} кВт</p>
            <p><strong>Статус:</strong> ${station.availability}</p>
            <p><strong>Адреса:</strong> ${loc.address || 'Невідома'}</p>
          </div>
        `);
    });

    // ВИПРАВЛЕНО: Автоматичне масштабування з затримкою
    // Даємо Leaflet час відмалювати всі шари
    setTimeout(() => {
      this.fitRouteToView();
    }, 100);

    console.log('✅ Маршрут відображено на карті');
  }

  /**
   * НОВЕ: Відображення маршруту по дорогах (з OSRM)
   */
  renderRoadRoute(coordinates, stats) {
    // Конвертуємо [lon, lat] в [lat, lon] для Leaflet
    const latLngs = coordinates.map(coord => [coord[1], coord[0]]);

    const polyline = L.polyline(latLngs, {
      color: '#2563eb',
      weight: 5,
      opacity: 0.7,
      smoothFactor: 1,
      className: 'road-route'
    }).addTo(this.routeLayer);

    // Додаємо tooltip з інформацією
    if (stats) {
      polyline.bindTooltip(`
        <b>Маршрут по дорогах</b><br>
        Відстань: ${stats.distance.toFixed(1)} км<br>
        Час: ${this.formatDuration(stats.time)}
      `, { sticky: true });
    }

    // Додаємо стрілки напрямку
    // this.addDirectionArrows(latLngs);
  }

  /**
   * Відображення прямого маршруту (fallback)
   */
  renderStraightRoute(latLngs) {
    const polyline = L.polyline(latLngs, {
      color: '#64748b',
      weight: 4,
      opacity: 0.6,
      dashArray: '10, 10', // Пунктирна лінія
      smoothFactor: 1,
      className: 'straight-route'
    }).addTo(this.routeLayer);

    polyline.bindTooltip(
      '<b>Приблизний маршрут</b><br>(пряма лінія)', 
      { sticky: true }
    );
  }

  /**
   * НОВЕ: Додавання стрілок напрямку
   */
  addDirectionArrows(latLngs) {
    // Додаємо стрілку кожні N точок
    const step = Math.max(1, Math.floor(latLngs.length / 8)); // ~8 стрілок

    for (let i = step; i < latLngs.length; i += step) {
      const start = latLngs[i - 1];
      const end = latLngs[i];
      
      // Розрахунок кута
      const angle = Math.atan2(
        end[0] - start[0], 
        end[1] - start[1]
      ) * 180 / Math.PI;
      
      const arrowIcon = L.divIcon({
        className: 'route-arrow',
        html: `
          <div style="
            transform: rotate(${angle}deg);
            color: #2563eb;
            font-size: 16px;
            text-shadow: 0 0 3px white;
          ">▲</div>
        `,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
      
      L.marker(start, { 
        icon: arrowIcon, 
        interactive: false 
      }).addTo(this.routeLayer);
    }
  }

  /**
   * Форматування тривалості
   */
  formatDuration(hours) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    
    if (h > 0) {
      return `${h} год ${m} хв`;
    }
    return `${m} хв`;
  }

  /**
   * Автоматичне масштабування до маршруту
   */
  fitRouteToView() {
    try {
      let bounds = null;
      
      // Спроба 1: Використовуємо bounds routeLayer
      try {
        if (this.routeLayer && this.routeLayer.getLayers().length > 0) {
          bounds = this.routeLayer.getBounds();
          if (bounds && bounds.isValid()) {
            console.log('✅ Bounds з routeLayer');
          } else {
            bounds = null;
          }
        }
      } catch (e) {
        console.log('⚠️ routeLayer.getBounds() помилка:', e.message);
        bounds = null;
      }
      
      // Спроба 2: Використовуємо bounds markersLayer
      if (!bounds || !bounds.isValid()) {
        try {
          if (this.markersLayer && this.markersLayer.getLayers().length > 0) {
            bounds = this.markersLayer.getBounds();
            if (bounds && bounds.isValid()) {
              console.log('✅ Bounds з markersLayer');
            } else {
              bounds = null;
            }
          }
        } catch (e) {
          console.log('⚠️ markersLayer.getBounds() помилка:', e.message);
          bounds = null;
        }
      }
      
      // Спроба 3: Використовуємо bounds chargingStationsLayer
      if (!bounds || !bounds.isValid()) {
        try {
          if (this.chargingStationsLayer && this.chargingStationsLayer.getLayers().length > 0) {
            bounds = this.chargingStationsLayer.getBounds();
            if (bounds && bounds.isValid()) {
              console.log('✅ Bounds з chargingStationsLayer');
            } else {
              bounds = null;
            }
          }
        } catch (e) {
          console.log('⚠️ chargingStationsLayer.getBounds() помилка:', e.message);
          bounds = null;
        }
      }
      
      // Спроба 4: Створюємо вручну з усіх шарів
      if (!bounds || !bounds.isValid()) {
        console.log('⚠️ Всі getBounds() невалідні, створюємо вручну...');
        bounds = this.createBoundsFromAllLayers();
        if (bounds && bounds.isValid()) {
          console.log('✅ Bounds створено вручну');
        }
      }
      
      // Фінальна перевірка та застосування
      if (bounds && bounds.isValid()) {
        this.map.fitBounds(bounds, { 
          padding: [50, 50],
          maxZoom: 15 // Обмежуємо максимальний zoom
        });
        console.log('✅ Карту масштабовано до маршруту');
        return true;
      } else {
        console.warn('⚠️ Не вдалося створити валідні bounds для масштабування');
        return false;
      }
    } catch (error) {
      console.error('❌ Критична помилка масштабування:', error);
      return false;
    }
  }

  /**
   * НОВИЙ: Створення bounds вручну з усіх шарів
   */
  createBoundsFromAllLayers() {
    const allLatLngs = [];
    
    // Збираємо всі координати з усіх шарів
    this.routeLayer.eachLayer(layer => {
      if (layer.getLatLngs) {
        const latlngs = layer.getLatLngs();
        if (Array.isArray(latlngs)) {
          allLatLngs.push(...latlngs);
        }
      } else if (layer.getLatLng) {
        allLatLngs.push(layer.getLatLng());
      }
    });
    
    this.markersLayer.eachLayer(layer => {
      if (layer.getLatLng) {
        allLatLngs.push(layer.getLatLng());
      }
    });
    
    this.chargingStationsLayer.eachLayer(layer => {
      if (layer.getLatLng) {
        allLatLngs.push(layer.getLatLng());
      }
    });
    
    // Створюємо bounds якщо є координати
    if (allLatLngs.length > 0) {
      console.log(`📍 Створено bounds з ${allLatLngs.length} точок`);
      return L.latLngBounds(allLatLngs);
    }
    
    return null;
  }

  /**
   * Створення власної іконки маркера
   */
  createCustomIcon(emoji, color) {
    return L.divIcon({
      className: 'custom-marker',
      html: `
        <div style="
          background-color: ${color};
          width: 40px;
          height: 40px;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          display: flex;
          align-items: center;
          justify-content: center;
          border: 3px solid white;
          box-shadow: 0 4px 6px rgba(0,0,0,0.2);
        ">
          <span style="
            transform: rotate(45deg);
            font-size: 20px;
          ">${emoji}</span>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -40]
    });
  }

  /**
   * Очищення маршруту з карти
   */
  clearRoute() {
    if (this.routeLayer) this.routeLayer.clearLayers();
    if (this.markersLayer) this.markersLayer.clearLayers();
    if (this.chargingStationsLayer) this.chargingStationsLayer.clearLayers();
  }

  /**
   * Збільшення масштабу
   */
  zoomIn() {
    if (this.map) this.map.zoomIn();
  }

  /**
   * Зменшення масштабу
   */
  zoomOut() {
    if (this.map) this.map.zoomOut();
  }

  /**
   * Скидання виду до початкового
   */
  resetView() {
    if (this.map) {
      this.map.setView(this.defaultCenter, this.defaultZoom);
    }
  }

  /**
   * Встановлення центру карти
   */
  setView(lat, lon, zoom = 13) {
    if (this.map) {
      this.map.setView([lat, lon], zoom);
    }
  }
}

// Експорт
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MapRenderer;
}