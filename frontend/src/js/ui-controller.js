class UIController {
    constructor(apiClient, mapRenderer) {
        this.apiClient = apiClient;
        this.mapRenderer = mapRenderer;

        this.form = document.getElementById("routeForm");
        this.startInput = document.getElementById("startPoint");
        this.endInput = document.getElementById("endPoint");
        this.batterySlider = document.getElementById("batteryLevel");
        this.batteryValue = document.getElementById("batteryValue");
        this.batteryBar = document.getElementById("batteryBar");
        this.batteryCapacity = document.getElementById("batteryCapacity");
        this.consumption = document.getElementById("consumption");
        this.buildBtn = document.getElementById("buildRouteBtn");
        this.resetBtn = document.getElementById("resetBtn");
        this.statusMessage = document.getElementById("statusMessage");
        this.routeInfo = document.getElementById("routeInfo");
        this.mapLoader = document.getElementById("mapLoader");

        this.startCoords = null;
        this.endCoords = null;

        this.initEventListeners();
        this.checkAPIHealth();
    }

    initEventListeners() {
        this.form.addEventListener("submit", (e) => this.handleFormSubmit(e));
        this.resetBtn.addEventListener("click", () => this.handleReset());

        this.startAutocomplete = new AddressAutocomplete(
            this.startInput,
            document.getElementById("startSuggestions"),
            this.apiClient,
            (result) => this.handleStartSelect(result)
        );

        this.endAutocomplete = new AddressAutocomplete(
            this.endInput,
            document.getElementById("endSuggestions"),
            this.apiClient,
            (result) => this.handleEndSelect(result)
        );

        this.batterySlider.addEventListener("input", (e) => {
            const value = e.target.value;
            this.batteryValue.textContent = `${value}%`;
        });

        document.getElementById("zoomIn")?.addEventListener("click", () => {
            this.mapRenderer.zoomIn();
        });

        document.getElementById("zoomOut")?.addEventListener("click", () => {
            this.mapRenderer.zoomOut();
        });

        document.getElementById("resetView")?.addEventListener("click", () => {
            this.mapRenderer.resetView();
        });
    }

    handleStartSelect(result) {
        this.startCoords = result;
        document.getElementById(
            "startCoords"
        ).textContent = `${result.lat.toFixed(4)}, ${result.lon.toFixed(4)}`;

        this.mapRenderer.setView(result.lat, result.lon, 13);

        console.log("Початкову точку обрано:", result);
    }

    handleEndSelect(result) {
        this.endCoords = result;
        document.getElementById(
            "endCoords"
        ).textContent = `${result.lat.toFixed(4)}, ${result.lon.toFixed(4)}`;

        this.mapRenderer.setView(result.lat, result.lon, 13);

        console.log("Кінцеву точку обрано:", result);
    }

    async geocodeStart() {
        const address = this.startInput.value.trim();
        if (!address || this.startCoords) return;

        try {
            this.showStatus("Пошук адреси...", "loading");
            const result = await this.apiClient.geocodeAddress(address);
            this.handleStartSelect(result);
            this.hideStatus();
        } catch (error) {
            this.showStatus(`Помилка: ${error.message}`, "error");
            console.error("Помилка геокодування:", error);
        }
    }

    async geocodeEnd() {
        const address = this.endInput.value.trim();
        if (!address || this.endCoords) return;

        try {
            this.showStatus("Пошук адреси...", "loading");
            const result = await this.apiClient.geocodeAddress(address);
            this.handleEndSelect(result);
            this.hideStatus();
        } catch (error) {
            this.showStatus(`Помилка: ${error.message}`, "error");
            console.error("Помилка геокодування:", error);
        }
    }

    async handleFormSubmit(e) {
        e.preventDefault();

        if (!this.startCoords) {
            await this.geocodeStart();
        }
        if (!this.endCoords) {
            await this.geocodeEnd();
        }

        if (!this.startCoords || !this.endCoords) {
            this.showStatus("Будь ласка, введіть коректні адреси", "error");
            return;
        }

        await this.requestRoute();
    }

    async requestRoute() {
        try {
            this.showLoader();
            this.showStatus("Побудова маршруту...", "loading");
            this.buildBtn.disabled = true;

            const routeData = {
                startPoint: {
                    lat: this.startCoords.lat,
                    lon: this.startCoords.lon,
                    address: this.startInput.value,
                },
                endPoint: {
                    lat: this.endCoords.lat,
                    lon: this.endCoords.lon,
                    address: this.endInput.value,
                },
                batteryLevel: parseFloat(this.batterySlider.value),
                vehicle: {
                    batteryCapacity: parseFloat(this.batteryCapacity.value),
                    consumptionPerKm: parseFloat(this.consumption.value),
                },
            };

            console.log("Відправка запиту:", routeData);

            const response = await this.apiClient.buildRoute(routeData);

            console.log("Отримано відповідь:", response);

            const hasWarning = response.route?.warning;
            const isCriticalWarning =
                hasWarning && response.route.warning.startsWith("❌");
            const isInfoWarning =
                hasWarning && response.route.warning.startsWith("ℹ️");

            if (
                isCriticalWarning ||
                (response.hasWarning && response.message?.startsWith("❌"))
            ) {
                const warningMessage =
                    response.route?.warning || response.message;
                const routeWithWarning = {
                    ...response.route,
                    warning: warningMessage,
                };

                console.log(
                    "КРИТИЧНЕ: Показуємо попередження про неможливість маршруту"
                );

                this.showRouteWarning(routeWithWarning);
                this.showStatus("Маршрут неможливо побудувати", "warning");
            } else if (isInfoWarning) {
                console.log(
                    "ІНФО: Маршрут побудовано з інформаційним повідомленням"
                );

                this.displayRoute(response.route);
                this.showInfoNotification(response.route.warning);
                this.showStatus(
                    `Маршрут побудовано за ${response.executionTime}ms`,
                    "success"
                );
            } else {
                this.displayRoute(response.route);
                this.showStatus(
                    `Маршрут побудовано за ${response.executionTime}ms`,
                    "success"
                );
            }
        } catch (error) {
            console.error("Помилка:", error);
            this.showStatus(`Помилка: ${error.message}`, "error");
            this.mapRenderer.clearRoute();
            this.routeInfo.style.display = "none";
        } finally {
            this.hideLoader();
            this.buildBtn.disabled = false;
        }
    }

    showRouteWarning(route) {
        this.mapRenderer.clearRoute();

        this.removeAllInfoNotifications();

        if (route.points && route.points.length >= 2) {
            this.mapRenderer.renderRoute(route);

            setTimeout(() => {
                if (this.mapRenderer.forceZoomToContent) {
                    this.mapRenderer.forceZoomToContent();
                }
            }, 300);
        }

        this.routeInfo.style.display = "block";

        const warningText = route.warning || "Маршрут неможливо побудувати";
        const lines = warningText.split("\n");

        const title = lines[0].replace("❌", "").trim();

        const content = lines.slice(1).join("\n").trim();

        const warningHtml = `
      <div class="route-warning">
        <h3 class="route-warning__title">
          ${title}
        </h3>
        <div class="route-warning__message">${content}</div>
      </div>
    `;

        this.routeInfo.innerHTML = `
      <h3 class="route-info__title">Результат побудови маршруту</h3>
      ${warningHtml}
    `;

        const statsHtml = `
      <div style="opacity: 0.5; margin-bottom: 1rem;">
        <h4 style="font-size: 0.875rem; color: #6b7280; margin-bottom: 0.75rem;">
          Орієнтовна статистика (маршрут неможливий):
        </h4>
        <div class="route-stats">
          <div class="stat" style="opacity: 0.6;">
            <span class="stat__label">Відстань:</span>
            <span class="stat__value">${
                route.stats?.distance?.toFixed(2) || "?"
            } км</span>
          </div>
          <div class="stat" style="opacity: 0.6;">
            <span class="stat__label">Орієнтовний час:</span>
            <span class="stat__value">${
                route.stats?.time ? this.formatTime(route.stats.time) : "?"
            }</span>
          </div>
        </div>
      </div>
    `;

        const errorStationsHtml = `
      <div class="stations-error">
        Маршрут не може бути побудований з поточними параметрами
      </div>
    `;

        this.routeInfo.innerHTML = `
      <h3 class="route-info__title">Результат побудови маршруту</h3>
      ${warningHtml}
      ${statsHtml}
      <div class="stations-list">
        <h4 class="stations-list__title">Зупинки на зарядку:</h4>
        ${errorStationsHtml}
      </div>
    `;

        this.routeInfo.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    ensureRouteInfoStructure() {
        if (!document.getElementById("totalDistance")) {
            this.routeInfo.innerHTML = `
        <h3 class="route-info__title">Характеристики маршруту</h3>
        <div class="route-stats">
          <div class="stat">
            <span class="stat__label">Відстань:</span>
            <span class="stat__value" id="totalDistance">-</span>
          </div>
          <div class="stat">
            <span class="stat__label">Час в дорозі:</span>
            <span class="stat__value" id="travelTime">-</span>
          </div>
          <div class="stat">
            <span class="stat__label">Час зарядки:</span>
            <span class="stat__value" id="chargingTime">-</span>
          </div>
          <div class="stat">
            <span class="stat__label">Зупинок на зарядку:</span>
            <span class="stat__value" id="chargingStops">-</span>
          </div>
        </div>
        <div id="stationsList" class="stations-list"></div>
      `;
        }
    }

    removeAllInfoNotifications() {
        const selectors = [".route-notification", "[data-info-notification]"];

        selectors.forEach((selector) => {
            const elements = this.routeInfo.querySelectorAll(selector);
            elements.forEach((el) => {
                console.log("Видаляємо старе інфо-повідомлення");
                el.remove();
            });
        });
    }

    showInfoNotification(message) {
        this.removeAllInfoNotifications();
        message = message.replace("ℹ️", "").trim();
        const routeInfoTitle =
            this.routeInfo.querySelector(".route-info__title");

        if (routeInfoTitle) {
            const infoBox = document.createElement("div");

            infoBox.setAttribute("data-info-notification", "true");
            infoBox.className = "route-notification";

            infoBox.innerHTML = `
          <div class="route-notification__message">${message}</div>
      `;

            routeInfoTitle.after(infoBox);

            console.log("Показано інфо-повідомлення");
        }
    }

    displayRoute(route) {
        this.mapRenderer.renderRoute(route);

        this.routeInfo.style.display = "block";

        this.ensureRouteInfoStructure();

        this.removeAllInfoNotifications();

        const stats = route.stats;
        const distanceEl = document.getElementById("totalDistance");
        const timeEl = document.getElementById("travelTime");
        const chargingTimeEl = document.getElementById("chargingTime");
        const stopsEl = document.getElementById("chargingStops");

        if (distanceEl)
            distanceEl.textContent = `${stats.distance.toFixed(2)} км`;
        if (timeEl) timeEl.textContent = `${this.formatTime(stats.time)}`;
        if (chargingTimeEl)
            chargingTimeEl.textContent = `${this.formatTime(
                stats.chargingTime
            )}`;
        if (stopsEl) stopsEl.textContent = `${stats.chargingStops}`;

        const statsElements = document.querySelectorAll(".route-stats .stat");
        statsElements.forEach((el) => (el.style.opacity = "1"));

        this.displayChargingStations(route.chargingStops);

        setTimeout(() => {
            if (this.mapRenderer.forceZoomToContent) {
                this.mapRenderer.forceZoomToContent();
            }
        }, 300);

        this.routeInfo.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    displayChargingStations(stations) {
        const stationsList = document.getElementById("stationsList");

        if (!stationsList) {
            console.warn("Елемент stationsList не знайдено");
            return;
        }

        if (!stations || stations.length === 0) {
            stationsList.innerHTML = `
        <div class="stations-success">
          Зарядка не потрібна - автомобіль доїде до пункту призначення
        </div>
      `;
            return;
        }

        let html = '<h4 class="stations-list__title">Зупинки на зарядку:</h4>';

        stations.forEach((station, index) => {
            html += `
        <div class="station-item">
          <div class="station-item__name">
            Станція ${index + 1}: ${station.id}
          </div>
          <div class="station-item__details">
            ${station.location.address || "Адреса невідома"}<br>
            Потужність: ${station.powerKw} кВт<br>
            Статус: ${station.availability}
          </div>
        </div>
      `;
        });

        stationsList.innerHTML = html;
    }

    formatTime(hours) {
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);

        if (h > 0) {
            return `${h} год ${m} хв`;
        }
        return `${m} хв`;
    }

    handleReset() {
        this.form.reset();
        this.startCoords = null;
        this.endCoords = null;

        if (this.startAutocomplete) this.startAutocomplete.clear();
        if (this.endAutocomplete) this.endAutocomplete.clear();

        document.getElementById("startCoords").textContent = "-";
        document.getElementById("endCoords").textContent = "-";
        this.batteryValue.textContent = "80%";
        this.batteryBar.style.width = "80%";
        this.batteryBar.style.background =
            "linear-gradient(90deg, #10b981, #34d399)";
        this.mapRenderer.clearRoute();

        this.removeAllInfoNotifications();

        this.ensureRouteInfoStructure();
        this.routeInfo.style.display = "none";
        this.hideStatus();

        console.log("Форму скинуто");
    }

    showStatus(message, type = "info") {
        this.statusMessage.textContent = message;
        this.statusMessage.className = `status-message status-message--${type}`;
        this.statusMessage.style.display = "block";

        if (type === "warning" || type === "error") {
        } else if (type === "success") {
            this.hideStatus();
        }
    }

    hideStatus() {
        setTimeout(() => {
            if (
                this.statusMessage.classList.contains(
                    "status-message--loading"
                ) ||
                this.statusMessage.classList.contains("status-message--success")
            ) {
                this.statusMessage.style.display = "none";
            }
        }, 3000);
    }

    showLoader() {
        this.mapLoader.style.display = "flex";
    }

    hideLoader() {
        this.mapLoader.style.display = "none";
    }

    async checkAPIHealth() {
        try {
            const isHealthy = await this.apiClient.checkHealth();
            if (!isHealthy) {
                this.showStatus(
                    "Backend API недоступний. Перевірте з'єднання.",
                    "warning"
                );
            } else {
                console.log("Backend API доступний");
            }
        } catch (error) {
            console.warn("Не вдалося перевірити backend:", error);
        }
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = UIController;
}
