const GeneticAlgorithmService = require("./genetic-algorithm.service");
const ChargingStationService = require("./charging-station.service");
const OSRMRoutingService = require("./osrm-routing.service");
const Route = require("../models/Route");

class RoutePlannerService {
    constructor() {
        this.gaService = new GeneticAlgorithmService(50, 150, 0.15);
        this.stationService = new ChargingStationService();
        this.routingService = new OSRMRoutingService();
        this.useRoadRouting = process.env.USE_ROAD_ROUTING !== "false";
    }

    async buildRoute(userInput, vehicle, options = {}) {
        console.log("Побудова маршруту...");

        userInput.validate();

        const start = userInput.getStart();
        const end = userInput.getEnd();
        const batteryLevel = userInput.batteryLevel;

        const straightDistance = start.distanceTo(end);
        const maxRange = vehicle.getRemainingRange(batteryLevel);
        const safeRange = maxRange * 0.85;

        console.log(`Попередня оцінка:`);
        console.log(`   - Пряма відстань: ${straightDistance.toFixed(2)} км`);
        console.log(`   - Запас ходу: ${maxRange.toFixed(2)} км`);
        console.log(`   - Безпечний запас (85%): ${safeRange.toFixed(2)} км`);

        if (straightDistance <= safeRange) {
            if (this.useRoadRouting) {
                console.log("Перевірка відстані по дорогах...");

                try {
                    const roadDistance = await this.routingService.getDistance(
                        start,
                        end
                    );
                    console.log(
                        `   - Відстань по дорогах: ${roadDistance.toFixed(
                            2
                        )} км`
                    );

                    if (roadDistance <= safeRange) {
                        console.log("Маршрут досяжний без зарядки");
                        return await this.createDirectRouteWithOSRM(start, end);
                    } else {
                        console.log("По дорогах довше - потрібна зарядка");
                    }
                } catch (error) {
                    console.warn(
                        "Помилка OSRM, використовуємо оцінку по прямій"
                    );
                }
            } else {
                console.log("Маршрут досяжний без зарядки (оцінка по прямій)");
                return this.createDirectRoute(start, end);
            }
        }

        console.log("Потрібна зарядка, завантаження станцій...");

        const corridorWidth = Math.min(100, straightDistance * 0.2);
        console.log(`   Ширина коридору: ${corridorWidth.toFixed(0)} км`);

        let availableStations = await this.stationService.getStationsAlongRoute(
            start,
            end,
            corridorWidth
        );

        console.log(
            `Знайдено ${availableStations.length} станцій в базовому коридорі`
        );

        availableStations = availableStations.filter((station) => {
            const toStation = start.distanceTo(station.location);
            const fromStation = station.location.distanceTo(end);
            const directDist = straightDistance;

            const detour = toStation + fromStation - directDist;
            const maxDetour = Math.min(200, directDist * 0.3);

            return detour <= maxDetour;
        });

        console.log(
            `Після фільтрації об'їзду: ${availableStations.length} станцій`
        );

        if (availableStations.length === 0) {
            console.log("Жодної станції не знайдено в коридорі");
            return this.createWarningRoute(
                start,
                end,
                "Не знайдено зарядних станцій на маршруті. Спробуйте інший маршрут або збільште початковий заряд батареї."
            );
        }

        const reachAnalysis = this.analyzeReachability(
            availableStations,
            start,
            end,
            vehicle,
            batteryLevel
        );

        let effectiveStart = start;
        let effectiveBatteryLevel = batteryLevel;
        let addedNearbyStation = null;

        if (!reachAnalysis.canReachFirstStation) {
            console.log(
                "Жодна станція на маршруті не досяжна з поточним зарядом"
            );
            console.log("Автоматичний пошук станції поблизу старту...");

            const enhancedResult = await this.findAndAddNearbyStation(
                start,
                end,
                availableStations,
                vehicle,
                batteryLevel
            );

            if (!enhancedResult) {
                return this.createDetailedWarningRoute(
                    start,
                    end,
                    vehicle,
                    batteryLevel,
                    reachAnalysis
                );
            }

            availableStations = enhancedResult.stations;
            addedNearbyStation = enhancedResult.addedStation;

            effectiveStart = addedNearbyStation.location;
            effectiveBatteryLevel = 95;

            console.log(
                `   Ефективний старт змінено на станцію ${addedNearbyStation.id}`
            );
            console.log(`   Ефективний заряд: ${effectiveBatteryLevel}%`);
        }

        const reachableStations = this.buildStationChain(
            availableStations,
            effectiveStart,
            end,
            vehicle,
            effectiveBatteryLevel
        );

        if (reachableStations.length === 0) {
            console.log("Не вдалося побудувати ланцюжок станцій");
            return this.createDetailedWarningRoute(
                start,
                end,
                vehicle,
                batteryLevel,
                reachAnalysis
            );
        }

        let finalStations = reachableStations;
        if (addedNearbyStation) {
            if (
                !reachableStations.find((s) => s.id === addedNearbyStation.id)
            ) {
                finalStations = [addedNearbyStation, ...reachableStations];
            }
        }

        console.log(`Побудовано ланцюжок з ${finalStations.length} станцій`);

        console.log("Запуск генетичного алгоритму...");

        const initialRoute = new Route();
        initialRoute.addPoint(start);
        initialRoute.addPoint(end);

        const optimizedRoute = this.gaService.optimize(
            initialRoute,
            finalStations,
            vehicle,
            batteryLevel
        );

        if (this.useRoadRouting) {
            console.log("Розрахунок фінального маршруту по дорогах...");
            await optimizedRoute.calculateStatsWithRouting(this.routingService);
        } else {
            optimizedRoute.calculateStats();
        }

        const validation = this.validateRouteStrict(
            optimizedRoute,
            vehicle,
            batteryLevel
        );

        if (!validation.isValid) {
            console.log(`Маршрут не пройшов валідацію: ${validation.reason}`);

            if (addedNearbyStation && !validation.critical) {
                optimizedRoute.warning =
                    `ℹ️ Маршрут включає зупинку на зарядку поблизу старту:\n` +
                    `${addedNearbyStation.location.address} (${start
                        .distanceTo(addedNearbyStation.location)
                        .toFixed(1)} км)\n\n` +
                    validation.reason;
            } else {
                optimizedRoute.warning = validation.reason;
            }

            if (validation.critical) {
                return this.createWarningRoute(start, end, validation.reason);
            }
        } else {
            console.log(
                `Валідація пройдена. Залишковий заряд: ${validation.finalBattery.toFixed(
                    1
                )}%`
            );

            if (addedNearbyStation) {
                optimizedRoute.warning =
                    `ℹ️ Початкового заряду недостатньо для прямого маршруту.\n\n` +
                    `Маршрут автоматично побудовано через станцію поблизу:\n` +
                    `${addedNearbyStation.location.address} (${start
                        .distanceTo(addedNearbyStation.location)
                        .toFixed(1)} км від старту)`;
            }
        }

        const lastPoint =
            optimizedRoute.points[optimizedRoute.points.length - 1];
        const distanceToEnd = lastPoint.distanceTo(end);

        if (distanceToEnd > 1) {
            console.log("Кінцева точка відсутня, додаємо...");
            optimizedRoute.addPoint(end);

            if (this.useRoadRouting) {
                await optimizedRoute.calculateStatsWithRouting(
                    this.routingService
                );
            } else {
                optimizedRoute.calculateStats();
            }
        }

        console.log(`Маршрут побудовано успішно`);
        console.log(
            `   - Загальна відстань: ${optimizedRoute.totalDistance.toFixed(
                2
            )} км`
        );
        console.log(
            `   - Зупинок на зарядку: ${optimizedRoute.chargingStops.length}`
        );

        return optimizedRoute;
    }

    async findAndAddNearbyStation(
        start,
        end,
        existingStations,
        vehicle,
        batteryLevel
    ) {
        const searchRadius = 50;
        const currentRange = vehicle.getRemainingRange(batteryLevel) * 0.95;

        console.log(
            `🔍 Пошук станцій в радіусі ${searchRadius} км від старту...`
        );

        try {
            const nearbyStations = await this.stationService.getStationsNearby(
                start,
                searchRadius
            );

            console.log(`   Знайдено ${nearbyStations.length} станцій поблизу`);

            if (nearbyStations.length === 0) {
                console.log("   Немає станцій поблизу старту");
                return null;
            }

            const reachableNearby = nearbyStations.filter((station) => {
                const dist = start.distanceTo(station.location);
                return dist <= currentRange;
            });

            if (reachableNearby.length === 0) {
                console.log("   Жодна станція поблизу не досяжна");
                return null;
            }

            const bestStation = this.selectBestNearbyStation(
                reachableNearby,
                start,
                end,
                vehicle
            );

            console.log(
                `   Обрано станцію: ${bestStation.id} (${start
                    .distanceTo(bestStation.location)
                    .toFixed(1)} км)`
            );
            console.log(`   Адреса: ${bestStation.location.address}`);

            const combined = [bestStation, ...existingStations];
            const unique = this.removeDuplicateStations(combined, 5);

            console.log(`   Розширений список: ${unique.length} станцій`);

            return {
                stations: unique,
                addedStation: bestStation,
            };
        } catch (error) {
            console.error("   Помилка пошуку станцій поблизу:", error.message);
            return null;
        }
    }

    selectBestNearbyStation(stations, start, end, vehicle) {
        const directDistance = start.distanceTo(end);
        const maxRangeAfterCharge = vehicle.getRemainingRange(100) * 0.75;

        const scored = stations.map((station) => {
            const distToStation = start.distanceTo(station.location);
            const distToEnd = station.location.distanceTo(end);

            const closenessScore = 100 / (distToStation + 1);
            const progressScore = (directDistance - distToEnd) * 2;
            const reachabilityScore =
                distToEnd <= maxRangeAfterCharge ? 100 : 0;
            const powerScore = station.powerKw / 2;

            const totalScore =
                closenessScore + progressScore + reachabilityScore + powerScore;

            return {
                station,
                score: totalScore,
                distToStation,
                distToEnd,
            };
        });

        scored.sort((a, b) => b.score - a.score);

        console.log(`   Топ станцій поблизу:`);
        scored.slice(0, 3).forEach((item, i) => {
            console.log(
                `      ${i + 1}. ${item.station.id}: ${item.score.toFixed(
                    0
                )} балів (${item.distToStation.toFixed(1)} км)`
            );
        });

        return scored[0].station;
    }

    analyzeReachability(stations, start, end, vehicle, batteryLevel) {
        const currentRange = vehicle.getRemainingRange(batteryLevel) * 0.95;
        const maxRangeAfterCharge = vehicle.getRemainingRange(100) * 0.75;

        const sortedStations = [...stations].sort(
            (a, b) =>
                start.distanceTo(a.location) - start.distanceTo(b.location)
        );

        const firstReachable = sortedStations.find((station) => {
            const dist = start.distanceTo(station.location);
            return dist <= currentRange;
        });

        const analysis = {
            canReachFirstStation: !!firstReachable,
            currentRange,
            maxRangeAfterCharge,
            nearestStation: sortedStations[0],
            nearestDistance: sortedStations[0]
                ? start.distanceTo(sortedStations[0].location)
                : Infinity,
            firstReachable,
        };

        console.log(`Аналіз досяжності:`);
        console.log(`   - Поточний запас: ${currentRange.toFixed(0)} км`);
        console.log(
            `   - Найближча станція: ${analysis.nearestDistance.toFixed(0)} км`
        );
        console.log(
            `   - Перша досяжна: ${
                firstReachable ? firstReachable.id : "НЕМАЄ"
            }`
        );

        return analysis;
    }

    removeDuplicateStations(stations, minDistanceKm = 5) {
        const result = [];
        const processed = new Set();

        const sorted = [...stations].sort((a, b) => b.powerKw - a.powerKw);

        for (const station of sorted) {
            if (processed.has(station.id)) continue;

            const hasDuplicate = result.some((existing) => {
                const distance = existing.location.distanceTo(station.location);
                return distance < minDistanceKm;
            });

            if (!hasDuplicate) {
                result.push(station);
                processed.add(station.id);
            } else {
                processed.add(station.id);
            }
        }

        return result;
    }

    createDetailedWarningRoute(
        start,
        end,
        vehicle,
        batteryLevel,
        reachAnalysis
    ) {
        const straightDistance = start.distanceTo(end);
        const maxRange = vehicle.getRemainingRange(batteryLevel);
        const maxRangeAfterCharge = vehicle.getRemainingRange(100);

        const requiredBatteryPercent = Math.ceil(
            (reachAnalysis.nearestDistance / maxRangeAfterCharge) * 100
        );

        const recommendedCapacity = Math.ceil(
            reachAnalysis.nearestDistance * vehicle.consumptionPerKm * 1.2
        );

        const warningMessage =
            `❌ Неможливо побудувати маршрут\n\n` +
            `Проблема: Найближча зарядна станція знаходиться на відстані ${reachAnalysis.nearestDistance.toFixed(
                0
            )} км, ` +
            `що перевищує ваш поточний запас ходу.\n\n` +
            `Рекомендації:\n\n` +
            `Збільшити початковий заряд:\n` +
            (requiredBatteryPercent <= 100 && batteryLevel <= 95
                ? `   • Мінімум до ${requiredBatteryPercent}%\n`
                : "") +
            `   • Рекомендовано: 95-100%\n\n` +
            ` Вибрати автомобіль з більшою батареєю:\n` +
            `   • Поточна ємність: ${vehicle.batteryCapacity} кВт·год\n` +
            `   • Рекомендована: ${
                recommendedCapacity > vehicle.batteryCapacity
                    ? recommendedCapacity
                    : vehicle.batteryCapacity + 1
            }+ кВт·год\n` +
            `   • Або зменшити споживання (наприклад, з ${vehicle.consumptionPerKm} до 0.18 кВт·год/км)\n\n` +
            `Почати подорож з іншого місця:\n` +
            `   • Наприклад, з локації де є зарядна станція поблизу\n\n`;

        return this.createWarningRoute(start, end, warningMessage);
    }

    removeDuplicateStations(stations, minDistanceKm = 5) {
        const result = [];
        const processed = new Set();

        const sorted = [...stations].sort((a, b) => b.powerKw - a.powerKw);

        for (const station of sorted) {
            if (processed.has(station.id)) continue;

            const hasDuplicate = result.some((existing) => {
                const distance = existing.location.distanceTo(station.location);
                return distance < minDistanceKm;
            });

            if (!hasDuplicate) {
                result.push(station);
                processed.add(station.id);
            } else {
                processed.add(station.id);
            }
        }

        return result;
    }

    buildStationChain(stations, start, end, vehicle, batteryLevel) {
        const maxRangePerCharge = vehicle.getRemainingRange(100) * 0.75;
        const minRangePerCharge = 50;

        console.log(`   НОВИЙ алгоритм побудови ланцюжка...`);
        console.log(
            `   Старт: заряд ${batteryLevel}%, запас ${vehicle
                .getRemainingRange(batteryLevel)
                .toFixed(0)} км`
        );
        console.log(
            `   Безпечний діапазон на заряд: ${minRangePerCharge}-${maxRangePerCharge.toFixed(
                0
            )} км`
        );

        const chain = [];
        let currentPos = start;
        let currentRange = vehicle.getRemainingRange(batteryLevel);
        const directDistance = start.distanceTo(end);

        const estimatedStops = Math.max(
            1,
            Math.ceil(directDistance / maxRangePerCharge)
        );
        console.log(
            `   Оцінка станцій: ${estimatedStops} (відстань ${directDistance.toFixed(
                0
            )} км)`
        );

        let iteration = 0;
        const maxIterations = estimatedStops * 3;

        while (iteration < maxIterations) {
            iteration++;

            const distToEnd = currentPos.distanceTo(end);

            if (distToEnd <= currentRange * 0.9) {
                console.log(
                    `   Можна доїхати до кінця (${distToEnd.toFixed(0)} км)`
                );
                break;
            }

            let bestStation = null;
            let bestScore = -Infinity;

            for (const station of stations) {
                if (chain.some((s) => s.id === station.id)) continue;

                const distToStation = currentPos.distanceTo(station.location);
                const stationToEnd = station.location.distanceTo(end);

                if (distToStation > currentRange * 0.95) continue;

                const progress = distToEnd - stationToEnd;
                if (progress <= 0) continue;

                if (distToStation < minRangePerCharge && chain.length > 0)
                    continue;

                const distanceToLine = this.distanceToRouteLine(
                    start,
                    end,
                    station.location
                );
                const maxDeviation = Math.max(150, directDistance * 0.25);
                if (distanceToLine > maxDeviation) continue;

                const canReachEnd = stationToEnd <= maxRangePerCharge * 0.9;
                const hasNextStation = stations.some(
                    (s) =>
                        s.id !== station.id &&
                        !chain.some((c) => c.id === s.id) &&
                        station.location.distanceTo(s.location) <=
                            maxRangePerCharge * 0.9 &&
                        s.location.distanceTo(end) < stationToEnd
                );

                if (!canReachEnd && !hasNextStation) continue;

                const progressScore = progress * 3;
                const distanceScore = 500 / (distToStation + 1);
                const lineScore = 1000 / (distanceToLine + 1);
                const efficiencyScore = (progress / distToStation) * 200;
                const powerScore = station.powerKw / 2;

                const score =
                    progressScore +
                    distanceScore +
                    lineScore +
                    efficiencyScore +
                    powerScore;

                if (score > bestScore) {
                    bestScore = score;
                    bestStation = station;
                }
            }

            if (!bestStation) {
                console.log(
                    `   Не знайдено придатної станції на ітерації ${iteration}`
                );
                console.log(
                    `   Поточна позиція: відстань до кінця ${distToEnd.toFixed(
                        0
                    )} км, запас ${currentRange.toFixed(0)} км`
                );

                if (chain.length === 0 || distToEnd > currentRange) {
                    console.log(`   КРИТИЧНО: Маршрут неможливий`);
                    return [];
                }

                break;
            }

            const distToStation = currentPos.distanceTo(bestStation.location);
            const distToLine = this.distanceToRouteLine(
                start,
                end,
                bestStation.location
            );
            const progress = distToEnd - bestStation.location.distanceTo(end);

            chain.push(bestStation);
            console.log(
                `   ${chain.length}. ${bestStation.id}: +${progress.toFixed(
                    0
                )}км прогресу, ${distToStation.toFixed(
                    0
                )}км від поточної, ${distToLine.toFixed(0)}км від лінії`
            );

            currentPos = bestStation.location;
            currentRange = maxRangePerCharge;

            if (chain.length > estimatedStops + 3) {
                console.log(`   Забагато станцій (${chain.length}), зупинка`);
                break;
            }
        }

        if (chain.length === 0) {
            console.log(`   Не вдалося побудувати ланцюжок`);
            return [];
        }

        const lastPos = chain[chain.length - 1].location;
        const finalDist = lastPos.distanceTo(end);
        console.log(`   Побудовано ланцюжок: ${chain.length} станцій`);
        console.log(
            `   Залишилось до кінця: ${finalDist.toFixed(
                0
            )} км (запас ${maxRangePerCharge.toFixed(0)} км)`
        );

        if (finalDist > maxRangePerCharge * 0.9) {
            console.log(`   ПРОБЛЕМА: Останній сегмент недосяжний!`);
            return [];
        }

        return chain;
    }

    distanceToRouteLine(start, end, point) {
        const A = point.lat - start.lat;
        const B = point.lon - start.lon;
        const C = end.lat - start.lat;
        const D = end.lon - start.lon;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx, yy;

        if (param < 0) {
            xx = start.lat;
            yy = start.lon;
        } else if (param > 1) {
            xx = end.lat;
            yy = end.lon;
        } else {
            xx = start.lat + param * C;
            yy = start.lon + param * D;
        }

        const dx = point.lat - xx;
        const dy = point.lon - yy;

        return Math.sqrt(dx * dx + dy * dy) * 111;
    }

    validateRouteStrict(route, vehicle, startBatteryLevel) {
        let currentBattery = startBatteryLevel;
        const points = route.points;
        const minSafeBattery = 15;
        const warningBattery = 20;

        console.log("Строга валідація маршруту...");

        for (let i = 0; i < points.length - 1; i++) {
            const distance = points[i].distanceTo(points[i + 1]);
            const requiredCharge = vehicle.getRequiredCharge(distance);
            const batteryUsage =
                (requiredCharge / vehicle.batteryCapacity) * 100;

            console.log(
                `   Сегмент ${i + 1}: ${distance.toFixed(
                    1
                )} км, потрібно ${batteryUsage.toFixed(
                    1
                )}%, є ${currentBattery.toFixed(1)}%`
            );

            if (currentBattery < batteryUsage) {
                return {
                    isValid: false,
                    critical: true,
                    reason:
                        `Критична помилка: Недостатньо заряду для сегмента ${
                            i + 1
                        }. ` +
                        `Потрібно ${batteryUsage.toFixed(
                            1
                        )}%, доступно ${currentBattery.toFixed(1)}%.`,
                    segmentIndex: i,
                };
            }

            currentBattery -= batteryUsage;

            if (currentBattery < minSafeBattery) {
                console.log(
                    `   КРИТИЧНО: Заряд ${currentBattery.toFixed(
                        1
                    )}% < ${minSafeBattery}%`
                );

                const nextStation = route.chargingStops.find(
                    (station) =>
                        Math.abs(station.location.lat - points[i + 1].lat) <
                            0.001 &&
                        Math.abs(station.location.lon - points[i + 1].lon) <
                            0.001
                );

                if (!nextStation) {
                    return {
                        isValid: false,
                        critical: true,
                        reason: `Критична помилка: Заряд ${currentBattery.toFixed(
                            1
                        )}% після сегмента ${i + 1}.`,
                        segmentIndex: i,
                    };
                }
            }

            const nextStation = route.chargingStops.find(
                (station) =>
                    Math.abs(station.location.lat - points[i + 1].lat) <
                        0.001 &&
                    Math.abs(station.location.lon - points[i + 1].lon) < 0.001
            );

            if (nextStation) {
                console.log(`   Зарядка на станції ${nextStation.id}`);
                currentBattery = 95;
            }
        }

        if (currentBattery < minSafeBattery) {
            return {
                isValid: false,
                critical: true,
                reason:
                    `Критична помилка: Залишковий заряд (${currentBattery.toFixed(
                        1
                    )}%) нижче безпечного мінімуму ${minSafeBattery}%. ` +
                    `Додайте ще одну зупинку на зарядку або збільште початковий заряд.`,
                finalBattery: currentBattery,
            };
        } else if (currentBattery < warningBattery) {
            console.log(
                `   Низький залишковий заряд: ${currentBattery.toFixed(1)}%`
            );
        }

        return {
            isValid: true,
            finalBattery: currentBattery,
        };
    }

    async createDirectRouteWithOSRM(start, end) {
        const route = new Route();
        route.addPoint(start);
        route.addPoint(end);

        if (this.useRoadRouting) {
            await route.calculateStatsWithRouting(this.routingService);
        } else {
            route.calculateStats();
        }

        return route;
    }

    createDirectRoute(start, end) {
        const route = new Route();
        route.addPoint(start);
        route.addPoint(end);
        route.calculateStats();
        return route;
    }

    createWarningRoute(start, end, warningMessage) {
        const route = new Route();
        route.addPoint(start);
        route.addPoint(end);
        route.calculateStats();
        route.warning = warningMessage;
        return route;
    }

    validateRoute(route, vehicle, startBatteryLevel) {
        return this.validateRouteStrict(route, vehicle, startBatteryLevel);
    }

    setUseRealStations(useReal) {
        this.stationService.setUseRealData(useReal);
    }

    setUseRoadRouting(useRoad) {
        this.useRoadRouting = useRoad;
        console.log(
            `Режим маршрутизації: ${
                useRoad ? "ПО ДОРОГАХ (OSRM)" : "ПРЯМІ ЛІНІЇ"
            }`
        );
    }

    clearCache() {
        this.stationService.clearCache();
        this.routingService.clearCache();
    }
}

module.exports = RoutePlannerService;
