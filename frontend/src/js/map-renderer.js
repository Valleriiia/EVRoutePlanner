/**
 * Map Renderer для відображення маршрутів на карті
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
      // Створення карти з Leaflet
      this.map = L.map(this.mapElementId).setView(this.defaultCenter, this.defaultZoom);

      // Додавання тайлів OpenStreetMap
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
        minZoom: 3
      }).addTo(this.map);

      // Створення шарів для маркерів
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
   * @param {Object} routeData - Дані маршруту
   */
  renderRoute(routeData) {
    this.clearRoute();

    if (!routeData || !routeData.points || routeData.points.length === 0) {
      console.error('Немає даних маршруту для відображення');
      return;
    }

    const points = routeData.points;
    const chargingStops = routeData.chargingStops || [];

    // Відображення лінії маршруту
    const latLngs = points.map(point => [point.lat, point.lon]);
    const polyline = L.polyline(latLngs, {
      color: '#2563eb',
      weight: 4,
      opacity: 0.8,
      smoothFactor: 1
    }).addTo(this.routeLayer);

    // Додавання стрілок напрямку
    this.addArrowsToPolyline(polyline);

    // Початковий маркер (зелений)
    const startPoint = points[0];
    L.marker([startPoint.lat, startPoint.lon], {
      icon: this.createCustomIcon('🚗', '#10b981')
    }).addTo(this.markersLayer)
      .bindPopup(`<b>Початок</b><br>${startPoint.address || 'Початкова точка'}`);

    // Кінцевий маркер (червоний)
    const endPoint = points[points.length - 1];
    L.marker([endPoint.lat, endPoint.lon], {
      icon: this.createCustomIcon('🏁', '#ef4444')
    }).addTo(this.markersLayer)
      .bindPopup(`<b>Кінець</b><br>${endPoint.address || 'Кінцева точка'}`);

    // Зарядні станції (блакитні)
    chargingStops.forEach((station, index) => {
      const loc = station.location;
      L.marker([loc.lat, loc.lon], {
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

    // Автоматичне масштабування карти до маршруту
    this.fitBounds(latLngs);

    console.log('✅ Маршрут відображено на карті');
  }

  /**
   * Створення власної іконки маркера
   * @param {string} emoji - Емодзі для іконки
   * @param {string} color - Колір фону
   * @returns {L.DivIcon}
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
   * Додавання стрілок напрямку до лінії
   * @param {L.Polyline} polyline
   */
  addArrowsToPolyline(polyline) {
    // Простіша реалізація без додаткових бібліотек
    // Додаємо маркери зі стрілками вздовж маршруту
    const latlngs = polyline.getLatLngs();
    
    // Додаємо стрілку на кожному 5-му сегменті
    for (let i = 5; i < latlngs.length; i += 5) {
      if (i >= latlngs.length - 1) break;
      
      const start = latlngs[i - 1];
      const end = latlngs[i];
      
      // Розрахунок кута
      const angle = Math.atan2(end.lat - start.lat, end.lng - start.lng) * 180 / Math.PI;
      
      // Створення маркера зі стрілкою
      const arrowIcon = L.divIcon({
        className: 'route-arrow',
        html: `<div style="transform: rotate(${angle + 90}deg); color: #2563eb; font-size: 20px;">▼</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });
      
      L.marker([start.lat, start.lng], { icon: arrowIcon, interactive: false })
        .addTo(this.routeLayer);
    }
  }

  /**
   * Відображення всіх доступних зарядних станцій
   * @param {Array} stations
   */
  showAllChargingStations(stations) {
    stations.forEach(station => {
      const loc = station.location;
      L.circleMarker([loc.lat, loc.lon], {
        radius: 6,
        fillColor: '#06b6d4',
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
      }).addTo(this.chargingStationsLayer)
        .bindPopup(`
          <div class="station-popup">
            <h4>Зарядна станція</h4>
            <p><strong>ID:</strong> ${station.id}</p>
            <p><strong>Потужність:</strong> ${station.powerKw} кВт</p>
            <p><strong>Адреса:</strong> ${loc.address}</p>
          </div>
        `);
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
   * Автоматичне масштабування до точок
   * @param {Array} latLngs - Масив координат
   */
  fitBounds(latLngs) {
    if (latLngs && latLngs.length > 0) {
      const bounds = L.latLngBounds(latLngs);
      this.map.fitBounds(bounds, { padding: [50, 50] });
    }
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
   * @param {number} lat
   * @param {number} lon
   * @param {number} zoom
   */
  setView(lat, lon, zoom = 13) {
    if (this.map) {
      this.map.setView([lat, lon], zoom);
    }
  }
}

// Експорт для використання
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MapRenderer;
}