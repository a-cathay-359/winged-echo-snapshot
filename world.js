// SPDX-License-Identifier: AGPL-3.0-or-later
// 翼掠惊鸿 - 世界层（地图 / 机场 / 航线 / 机队 / 飞行 / 时刻表 / 动态栏）

// ==================== 状态 ====================

let pendingAirport = null;
let selectedAirport = null;
let routePending = null;
let routes = [];
let gameMap = null;

const arcCache = {};

let selectedHomeIata = null;
let homeDropdownOpen = false;

let editingSchedulePlaneIdx = -1;
let editingScheduleRouteKey = null;
let scheduleDropdownOpen = false;

let planeMarkers = [];
const flightEvents = [];
const FLIGHT_EVENT_MAX = 100;

// ==================== 弧线生成 ====================

function makeArc(a, b, segments) {
    segments = segments || 60;
    const dLat = b.lat - a.lat;
    const dLng = b.lng - a.lng;
    const dist = Math.sqrt(dLat * dLat + dLng * dLng) || 1;

    const perpLat = -dLng / dist;
    const perpLng = dLat / dist;
    const bulge = dist * 0.22;

    const ctrlLat = (a.lat + b.lat) / 2 + perpLat * bulge;
    const ctrlLng = (a.lng + b.lng) / 2 + perpLng * bulge;

    const pts = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const it = 1 - t;
        const lat = it * it * a.lat + 2 * it * t * ctrlLat + t * t * b.lat;
        const lng = it * it * a.lng + 2 * it * t * ctrlLng + t * t * b.lng;
        pts.push([lat, lng]);
    }
    return pts;
}

function getArcPoints(fromIata, toIata) {
    const key = fromIata + '-' + toIata;
    if (!arcCache[key]) {
        const a = AIRPORT_GCJ.find(function (x) { return x.iata === fromIata; });
        const b = AIRPORT_GCJ.find(function (x) { return x.iata === toIata; });
        if (!a || !b) return null;
        arcCache[key] = makeArc(a, b, 60);
    }
    return arcCache[key];
}

function interpolateArc(pts, t) {
    const last = pts.length - 1;
    const idx = t * last;
    const i0 = Math.floor(idx);
    const i1 = Math.min(i0 + 1, last);
    const frac = idx - i0;
    return {
        lat: pts[i0][0] + (pts[i1][0] - pts[i0][0]) * frac,
        lng: pts[i0][1] + (pts[i1][1] - pts[i0][1]) * frac
    };
}

function interpolateArcAngle(pts, t) {
    const last = pts.length - 1;
    const idx = t * last;
    const i0 = Math.floor(idx);
    const i1 = Math.min(i0 + 1, last);
    const dLat = pts[i1][0] - pts[i0][0];
    const dLng = pts[i1][1] - pts[i0][1];
    return Math.atan2(-dLat, dLng) * 180 / PI + 90;
}

// ==================== 飞机图标 ====================

const PLANE_SVG_PATH = "M12 1 L13.5 9 L21 14 L21 15.5 L13.5 13 L13 18 L15 20 L15 21 L12 20 L9 21 L9 20 L11 18 L10.5 13 L3 15.5 L3 14 L10.5 9 Z";
const PLANE_ICON_SIZE = 32;

function makePlaneIcon() {
    return L.divIcon({
        className: 'plane-marker',
        html: '<div class="plane-rot">' +
                '<svg viewBox="0 0 24 24" width="' + PLANE_ICON_SIZE + '" height="' + PLANE_ICON_SIZE + '">' +
                    '<path fill="#2563eb" d="' + PLANE_SVG_PATH + '"/>' +
                '</svg>' +
              '</div>',
        iconSize: [PLANE_ICON_SIZE, PLANE_ICON_SIZE],
        iconAnchor: [PLANE_ICON_SIZE / 2, PLANE_ICON_SIZE / 2]
    });
}

// ==================== 游戏页地图 ====================

function initGameMap() {
    if (gameMap) return gameMap;

    gameMap = L.map('map', {
        center: [35.0, 105.0],
        zoom: 4,
        minZoom: 3,
        maxZoom: 18,
        zoomControl: false,
        attributionControl: true,
        tap: true,
        touchZoom: true,
        worldCopyJump: false,
        maxBounds: [[-85, -180], [85, 180]],
        maxBoundsViscosity: 0.8
    });

    gameMap.createPane('routeHitPane');
    gameMap.getPane('routeHitPane').style.zIndex = 390;

    L.tileLayer(
        'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
        {
            subdomains: '1234',
            attribution: '&copy; 高德地图',
            minZoom: 3,
            maxZoom: 18,
            noWrap: true
        }
    ).addTo(gameMap);

    L.control.zoom({ position: 'bottomright' }).addTo(gameMap);

    renderAirports(gameMap);

    gameMap.on('click', function () {
        closeAllPopupsAndClearState();
    });

    return gameMap;
}

function closeAllPopupsAndClearState() {
    AIRPORT_GCJ.forEach(function (a) {
        if (a._hotzone) {
            try { a._hotzone.closePopup(); } catch (e) {}
        }
    });

    if (pendingAirport) {
        pendingAirport = null;
    }

    if (selectedAirport) {
        setAirportSelected(selectedAirport, false);
        selectedAirport = null;
    }
}

function renderAirports(map) {
    AIRPORT_GCJ.forEach(function (airport) {
        const latlng = [airport.lat, airport.lng];

        const dot = L.circleMarker(latlng, {
            radius: 5,
            fillColor: '#555555',
            color: '#ffffff',
            weight: 1.5,
            opacity: 1,
            fillOpacity: 1,
            interactive: false
        }).addTo(map);

        const hotzone = L.circleMarker(latlng, {
            radius: 16,
            fillColor: '#000000',
            fillOpacity: 0,
            stroke: false,
            interactive: true
        }).addTo(map);

        hotzone.bindPopup(
            '<div style="font-size:13px;line-height:1.5;">' +
                '<div style="font-weight:bold;margin-bottom:6px;">' +
                    '<b>' + airport.iata + '</b> · ' + airport.name +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:10px;">' +
                    '<span style="color:#666;">' + airport.city + '</span>' +
                    '<button class="ap-panel-btn" onclick="openAirportPanel(\'' + airport.iata + '\')">面板 &gt;</button>' +
                '</div>' +
            '</div>',
            {
                closeButton: false,
                autoClose: false,
                closeOnClick: false,
                offset: [0, -8],
                maxWidth: 260
            }
        );

        airport._dot = dot;
        airport._hotzone = hotzone;

        hotzone.on('click', function (e) {
            L.DomEvent.stopPropagation(e);
            handleAirportClick(airport);
        });
    });
}

// ==================== 机场点击交互 ====================

function handleAirportClick(airport) {

    if (!pendingAirport && !selectedAirport) {
        pendingAirport = airport;
        airport._hotzone.openPopup();
        showToast('再点一次建立航线');
        return;
    }

    if (pendingAirport && pendingAirport.iata === airport.iata) {
        pendingAirport = null;
        selectedAirport = airport;
        setAirportSelected(airport, true);
        showToast('起点：' + airport.iata + ' · ' + airport.name);
        return;
    }

    if (pendingAirport && pendingAirport.iata !== airport.iata) {
        pendingAirport._hotzone.closePopup();
        pendingAirport = airport;
        airport._hotzone.openPopup();
        showToast('再点一次建立航线');
        return;
    }

    if (selectedAirport && selectedAirport.iata === airport.iata) {
        setAirportSelected(selectedAirport, false);
        selectedAirport = null;
        showToast('已取消起点');
        return;
    }

    if (selectedAirport && selectedAirport.iata !== airport.iata) {

        if (routeExists(selectedAirport.iata, airport.iata)) {
            setAirportSelected(selectedAirport, false);
            selectedAirport = null;
            showToast('已有该航线！');
            return;
        }

        const distKm = calcDistanceKm(
            selectedAirport.lat, selectedAirport.lng,
            airport.lat, airport.lng
        );

        if (distKm <= 200) {
            setAirportSelected(selectedAirport, false);
            selectedAirport = null;
            airport._hotzone.closePopup();
            showToast('航线太短，无法创建');
            return;
        }

        routePending = { from: selectedAirport, to: airport };
        airport._hotzone.openPopup();

        document.getElementById('route-from-name').textContent = selectedAirport.name;
        document.getElementById('route-from-iata').textContent = selectedAirport.iata;
        document.getElementById('route-to-name').textContent = airport.name;
        document.getElementById('route-to-iata').textContent = airport.iata;

        const demand = calcRouteDemand(selectedAirport.iata, airport.iata);
        if (demand) {
            demand.from = selectedAirport.iata;
            demand.to = airport.iata;
        }
        document.getElementById('route-demand').innerHTML = buildRouteDemandHTML(demand);

        openOverlay('route-overlay');
        return;
    }
}

function setAirportSelected(airport, selected) {
    const dot = airport._dot;
    const hotzone = airport._hotzone;
    if (!dot || !hotzone) return;

    if (selected) {
        dot.setRadius(6.5);
        dot.setStyle({ weight: 2 });
        hotzone.openPopup();
    } else {
        dot.setRadius(5);
        dot.setStyle({ weight: 1.5 });
        hotzone.closePopup();
    }
}

// ==================== 机场面板 ====================

function getAltitudeType(airport) {
    if (airport.isHighPlateau) return '高高原';
    if (airport.isPlateau) return '高原';
    return '非高原';
}

function openAirportPanel(iata) {
    const airport = AIRPORT_GCJ.find(function (a) {
        return a.iata === iata;
    });

    if (!airport) return;

    if (airport._hotzone) airport._hotzone.closePopup();

    const throughputStr = airport.throughput.toLocaleString('en-US');
    const indexStr = airport.airportIndex.toFixed(1);
    const altitudeStr = getAltitudeType(airport);

    const body = document.getElementById('airport-panel-body');

    body.innerHTML =
        '<div class="ap-panel-header">' +
            '<div class="ap-panel-name">' + airport.name + '</div>' +
            '<div class="ap-panel-code">' + airport.iata + '</div>' +
        '</div>' +

        '<div class="ap-panel-grid">' +
            '<div class="ap-panel-item">' +
                '<div class="ap-panel-label">年旅客吞吐量</div>' +
                '<div class="ap-panel-value">' + throughputStr +
                    '<span class="unit">万人次</span>' +
                '</div>' +
            '</div>' +
            '<div class="ap-panel-item">' +
                '<div class="ap-panel-label">飞行区等级</div>' +
                '<div class="ap-panel-value">' + airport.grade + '</div>' +
            '</div>' +
            '<div class="ap-panel-item">' +
                '<div class="ap-panel-label">距市区</div>' +
                '<div class="ap-panel-value">' + airport.distance +
                    '<span class="unit">km</span>' +
                '</div>' +
            '</div>' +
            '<div class="ap-panel-item">' +
                '<div class="ap-panel-label">海拔类型</div>' +
                '<div class="ap-panel-value">' + altitudeStr + '</div>' +
            '</div>' +
        '</div>' +

        '<div class="ap-panel-index">' +
            '<div class="ap-panel-index-label">机场指数</div>' +
            '<div class="ap-panel-index-value">' + indexStr + '</div>' +
        '</div>';

    openOverlay('airport-panel-overlay');
}

function closeAirportPanel() {
    closeOverlay('airport-panel-overlay');
}

// ==================== 航线需求展示 ====================

function buildRouteDemandHTML(demand) {
    if (!demand) return '';

    const fare = calcBaseFare(demand.from, demand.to);

    return (
        '<div class="route-fare">' +
            '<div class="route-fare-label">基准票价</div>' +
            '<div class="route-fare-value">¥ ' + fare.toLocaleString('en-US') + '</div>' +
        '</div>' +
        '<div class="route-demand-grid">' +
            '<div class="rd-item">' +
                '<div class="rd-label">航距</div>' +
                '<div class="rd-value">' + Math.round(demand.distance) +
                    '<span class="unit">km</span>' +
                '</div>' +
            '</div>' +
            '<div class="rd-item">' +
                '<div class="rd-label">日均客流</div>' +
                '<div class="rd-value rd-highlight">' + Math.round(demand.total) +
                    '<span class="unit">人次</span>' +
                '</div>' +
            '</div>' +
            '<div class="rd-item">' +
                '<div class="rd-label">旅游客流</div>' +
                '<div class="rd-value">' + Math.round(demand.tourism) +
                    '<span class="unit">人次</span>' +
                '</div>' +
            '</div>' +
            '<div class="rd-item">' +
                '<div class="rd-label">商务客流</div>' +
                '<div class="rd-value">' + Math.round(demand.business) +
                    '<span class="unit">人次</span>' +
                '</div>' +
            '</div>' +
        '</div>'
    );
}

// ==================== 建航线 ====================

function drawRoute(from, to, silent) {
    const pts = makeArc(from, to, 60);

    const demand = calcRouteDemand(from.iata, to.iata);
    if (demand) {
        demand.from = from.iata;
        demand.to = to.iata;
    }

    const line = L.polyline(pts, {
        color: '#2563eb',
        weight: 2,
        opacity: 0.7,
        interactive: false
    }).addTo(gameMap);

    const hitLine = L.polyline(pts, {
        color: '#000000',
        weight: 18,
        opacity: 0,
        interactive: true,
        pane: 'routeHitPane'
    }).addTo(gameMap);

    const routeObj = {
        from: from.iata,
        to: to.iata,
        fromName: from.name,
        toName: to.name,
        line: line,
        hitLine: hitLine,
        demand: demand
    };

    routes.push(routeObj);

    hitLine.on('click', function (e) {
        L.DomEvent.stopPropagation(e);
        openRouteDetail(routeObj);
    });

    if (!silent) {
        showToast(from.iata + ' → ' + to.iata + ' 航线已建立');
    }
}

function clearAllRoutes() {
    routes.forEach(function (r) {
        if (r.line && gameMap) gameMap.removeLayer(r.line);
        if (r.hitLine && gameMap) gameMap.removeLayer(r.hitLine);
    });
    routes = [];
}

function closeRouteModal() {
    closeOverlay('route-overlay');

    if (selectedAirport) {
        setAirportSelected(selectedAirport, false);
    }
    selectedAirport = null;

    if (routePending && routePending.to) {
        routePending.to._hotzone.closePopup();
    }
    routePending = null;
}

function confirmRoute(btn) {
    if (btn.classList.contains('pressed')) return;
    btn.classList.add('pressed');

    setTimeout(function () {
        btn.classList.remove('pressed');

        if (!routePending) return;

        const from = routePending.from;
        const to = routePending.to;

        drawRoute(from, to);

        setAirportSelected(from, false);
        to._hotzone.closePopup();

        selectedAirport = null;
        routePending = null;

        closeOverlay('route-overlay');
    }, 200);
}

// ==================== 航线详情 ====================

function openRouteDetail(route) {
    document.getElementById('rd-from-name').textContent = route.fromName;
    document.getElementById('rd-from-iata').textContent = route.from;
    document.getElementById('rd-to-name').textContent = route.toName;
    document.getElementById('rd-to-iata').textContent = route.to;

    if (route.demand) {
        route.demand.from = route.from;
        route.demand.to = route.to;
    }
    document.getElementById('route-detail-demand').innerHTML =
        buildRouteDemandHTML(route.demand);

    openOverlay('route-detail-overlay');
}

function closeRouteDetail() {
    closeOverlay('route-detail-overlay');
}

// ==================== 机队列表 ====================

function renderFleet() {
    const list = document.getElementById('fleet-list');

    if (gameState.fleet.length === 0) {
        list.innerHTML = '<div class="fleet-empty">暂无飞机，点右上角采购</div>';
        return;
    }

    let html = '';
    gameState.fleet.forEach(function (plane, idx) {
        const data = Object.values(AIRCRAFT_DATA).find(function (d) {
            return d.shortName === plane.type;
        }) || AIRCRAFT_DATA.A320neo;

        const homeAirport = AIRPORT_GCJ.find(function (a) {
            return a.iata === plane.home;
        });
        const homeName = homeAirport ? homeAirport.name : '—';

        const hasSchedule = !!plane.schedule;
        const statusText = hasSchedule ? '运营中' : '闲置';
        const statusCls = hasSchedule ? 'fc-status active' : 'fc-status';

        html +=
            '<div class="fleet-card">' +
                '<div class="fc-top">' +
                    '<span class="fc-name">' + plane.name + '</span>' +
                    '<div class="fc-right">' +
                        '<span class="' + statusCls + '">' + statusText + '</span>' +
                        '<span class="fc-home">' + homeName + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="fc-info">' +
                    data.displayName + ' · ' + data.seatCapacity + ' 座' +
                '</div>' +
                '<div class="fc-actions">' +
                    '<button class="fleet-btn schedule" data-plane-idx="' + idx + '" onclick="fleetSchedule(this)">时刻表</button>' +
                    '<button class="fleet-btn sell" data-plane-idx="' + idx + '" onclick="fleetSell(this)">出售</button>' +
                '</div>' +
            '</div>';
    });
    list.innerHTML = html;
}

function fleetSchedule(btn) {
    if (btn.classList.contains('pressed')) return;
    btn.classList.add('pressed');
    setTimeout(function () {
        btn.classList.remove('pressed');
        const idx = parseInt(btn.getAttribute('data-plane-idx'), 10);
        openScheduleModal(idx);
    }, 200);
}

function fleetSell(btn) {
    if (btn.classList.contains('pressed')) return;
    btn.classList.add('pressed');
    setTimeout(function () {
        btn.classList.remove('pressed');
    }, 200);
}

// ==================== 购买飞机 ====================

function openBuyModal(btn) {
    if (btn.classList.contains('pressed')) return;
    btn.classList.add('pressed');

    setTimeout(function () {
        btn.classList.remove('pressed');

        const price = AIRCRAFT_DATA.A320neo.newPrice;
        const buyBtn = document.getElementById('pc-buy-btn');

        if (gameState.money < price) {
            buyBtn.disabled = true;
            buyBtn.textContent = '资金不足';
        } else {
            buyBtn.disabled = false;
            buyBtn.textContent = '购买';
        }

        openOverlay('buy-overlay');
    }, 200);
}

function closeBuyModal() {
    closeOverlay('buy-overlay');
}

function buyPlane(btn) {
    if (btn.disabled) return;

    const price = AIRCRAFT_DATA.A320neo.newPrice;

    if (gameState.money < price) {
        showToast('资金不足');
        return;
    }

    if (btn.classList.contains('pressed')) return;
    btn.classList.add('pressed');

    setTimeout(function () {
        btn.classList.remove('pressed');

        const type = AIRCRAFT_DATA.A320neo.shortName;
        const nextSeq = countFleetByType(type) + 1;
        const seq = String(nextSeq).padStart(4, '0');
        const defaultName = type + '-' + seq;

        const input = document.getElementById('naming-input');
        input.value = defaultName;

        openNamingModal();

        setTimeout(function () {
            input.focus();
            input.select();
        }, 100);
    }, 200);
}

function openNamingModal() {
    selectedHomeIata = null;
    homeDropdownOpen = false;

    const valEl = document.getElementById('home-select-value');
    valEl.textContent = '请选择机场';
    valEl.classList.add('cs-placeholder');

    closeHomeDropdown();
    updateNamingConfirmState();

    openOverlay('naming-overlay');
}

function closeNamingModal() {
    closeHomeDropdown();
    closeOverlay('naming-overlay');
}

function onNamingOverlayClick(event) {
    if (homeDropdownOpen) {
        closeHomeDropdown();
        return;
    }
    if (event.target.id === 'naming-overlay') {
        closeNamingModal();
    }
}

// ==================== 购机下拉 ====================

function toggleHomeDropdown(event) {
    if (event) event.stopPropagation();

    if (homeDropdownOpen) {
        closeHomeDropdown();
        return;
    }

    renderHomeList();
    document.getElementById('home-select-list').classList.add('open');
    const trigger = document.querySelector('#home-select .cs-trigger');
    if (trigger) trigger.classList.add('open');
    homeDropdownOpen = true;
}

function renderHomeList() {
    const list = document.getElementById('home-select-list');

    let html = '';
    AIRPORT_GCJ.forEach(function (a) {
        const cls = (a.iata === selectedHomeIata) ? ' cs-item-selected' : '';
        html +=
            '<div class="cs-item' + cls + '" onclick="selectHome(\'' + a.iata + '\', event)">' +
                '<span class="cs-item-name">' + a.name + '</span>' +
                '<span class="cs-item-iata">' + a.iata + '</span>' +
            '</div>';
    });
    list.innerHTML = html;
}

function selectHome(iata, event) {
    if (event) event.stopPropagation();

    const airport = AIRPORT_GCJ.find(function (a) { return a.iata === iata; });
    if (!airport) return;

    selectedHomeIata = iata;

    const valEl = document.getElementById('home-select-value');
    valEl.textContent = airport.name + ' ' + airport.iata;
    valEl.classList.remove('cs-placeholder');

    closeHomeDropdown();
    updateNamingConfirmState();
}

function closeHomeDropdown() {
    const list = document.getElementById('home-select-list');
    if (list) list.classList.remove('open');
    const trigger = document.querySelector('#home-select .cs-trigger');
    if (trigger) trigger.classList.remove('open');
    homeDropdownOpen = false;
}

function updateNamingConfirmState() {
    const btn = document.getElementById('naming-confirm-btn');
    if (!btn) return;
    btn.disabled = !selectedHomeIata;
}

// ==================== 确认购买 ====================

function confirmBuy(btn) {
    if (btn.disabled) return;
    if (!selectedHomeIata) return;
    if (btn.classList.contains('pressed')) return;
    btn.classList.add('pressed');

    setTimeout(function () {
        btn.classList.remove('pressed');

        const price = AIRCRAFT_DATA.A320neo.newPrice;

        if (gameState.money < price) {
            showToast('资金不足');
            closeNamingModal();
            return;
        }

        const type = AIRCRAFT_DATA.A320neo.shortName;
        const input = document.getElementById('naming-input');
        let finalName = input.value.trim();

        if (!finalName) {
            const nextSeq = countFleetByType(type) + 1;
            finalName = type + '-' + String(nextSeq).padStart(4, '0');
        }

        gameState.money -= price;

        const newPlane = {
            name: finalName,
            type: type,
            home: selectedHomeIata,
            schedule: null,
            _marker: null,
            _state: null
        };
        gameState.fleet.push(newPlane);

        updateMoneyDisplay();
        renderFleet();

        addPlaneMarker(newPlane);

        closeNamingModal();
        closeBuyModal();

        showToast('已购买 ' + finalName);
    }, 200);
}

// ==================== 机队地图标记 ====================

function addPlaneMarker(plane) {
    if (!gameMap) return;

    const home = AIRPORT_GCJ.find(function (a) {
        return a.iata === plane.home;
    });
    if (!home) return;

    const marker = L.marker([home.lat, home.lng], {
        icon: makePlaneIcon(),
        interactive: false
    }).addTo(gameMap);

    plane._marker = marker;
    planeMarkers.push(marker);

    updateSinglePlane(plane);
}

function clearAllPlaneMarkers() {
    planeMarkers.forEach(function (m) {
        if (gameMap) gameMap.removeLayer(m);
    });
    planeMarkers = [];

    gameState.fleet.forEach(function (p) {
        p._marker = null;
    });
}

function rebuildAllPlaneMarkers() {
    clearAllPlaneMarkers();
    gameState.fleet.forEach(function (p) {
        addPlaneMarker(p);
    });
}

function setPlaneRotation(marker, angle) {
    const el = marker.getElement();
    if (!el) return;
    const rot = el.querySelector('.plane-rot');
    if (rot) {
        rot.style.transform = 'rotate(' + angle + 'deg)';
    }
}

// ==================== 飞行位置 ====================

function updateSinglePlane(plane) {
    if (!plane._marker) return;

    if (!plane.schedule) {
        const home = AIRPORT_GCJ.find(function (a) { return a.iata === plane.home; });
        if (home) {
            plane._marker.setLatLng([home.lat, home.lng]);
            setPlaneRotation(plane._marker, 0);
        }
        return;
    }

    const sched = plane.schedule;
    const dur = calcFlightDuration(sched.from, sched.to);
    if (!dur) return;

    const a = AIRPORT_GCJ.find(function (x) { return x.iata === sched.from; });
    const b = AIRPORT_GCJ.find(function (x) { return x.iata === sched.to; });
    if (!a || !b) return;

    const d = new Date(gameTimeMs);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const elapsedMin = (gameTimeMs - dayStart) / 60000;

    const totalDayMin = sched.flightsPerDay * dur.roundMin;

    if (elapsedMin >= totalDayMin) {
        plane._marker.setLatLng([a.lat, a.lng]);
        setPlaneRotation(plane._marker, 0);
        handleSegAdvance(plane, sched.flightsPerDay * 4 + 100);
        return;
    }

    const roundIdx = Math.floor(elapsedMin / dur.roundMin);
    const roundElapsed = elapsedMin - roundIdx * dur.roundMin;

    let segLocal, lat, lng, angle;

    if (roundElapsed < dur.flightMin) {
        segLocal = 0;
        const t = roundElapsed / dur.flightMin;
        const arc = getArcPoints(sched.from, sched.to);
        if (arc) {
            const pt = interpolateArc(arc, t);
            lat = pt.lat; lng = pt.lng;
            angle = interpolateArcAngle(arc, t);
        } else {
            lat = a.lat; lng = a.lng; angle = 0;
        }
    } else if (roundElapsed < dur.flightMin + dur.turnTo) {
        segLocal = 1;
        lat = b.lat; lng = b.lng; angle = 0;
    } else if (roundElapsed < 2 * dur.flightMin + dur.turnTo) {
        segLocal = 2;
        const t = (roundElapsed - dur.flightMin - dur.turnTo) / dur.flightMin;
        const arc = getArcPoints(sched.to, sched.from);
        if (arc) {
            const pt = interpolateArc(arc, t);
            lat = pt.lat; lng = pt.lng;
            angle = interpolateArcAngle(arc, t);
        } else {
            lat = b.lat; lng = b.lng; angle = 0;
        }
    } else {
        segLocal = 3;
        lat = a.lat; lng = a.lng; angle = 0;
    }

    plane._marker.setLatLng([lat, lng]);
    setPlaneRotation(plane._marker, angle);

    const absSeg = roundIdx * 4 + segLocal;
    handleSegAdvance(plane, absSeg);
}

function updatePlanesPosition() {
    if (!gameMap) return;
    gameState.fleet.forEach(function (plane) {
        updateSinglePlane(plane);
    });
}

// ==================== 段推进 & 收入 ====================

function handleSegAdvance(plane, absSeg) {
    if (!plane._state) {
        plane._state = { lastAbsSeg: absSeg };
        return;
    }

    const last = plane._state.lastAbsSeg;

    if (absSeg === last) return;

    if (absSeg < last) {
        plane._state.lastAbsSeg = absSeg;
        return;
    }

    for (let s = last + 1; s <= absSeg; s++) {
        emitSegmentStart(plane, s);
    }
    plane._state.lastAbsSeg = absSeg;
}

function emitSegmentStart(plane, absSeg) {
    const sched = plane.schedule;
    if (!sched) return;

    const dur = calcFlightDuration(sched.from, sched.to);
    if (!dur) return;

    if (absSeg >= sched.flightsPerDay * 4 + 100) return;
    if (absSeg >= sched.flightsPerDay * 4) return;

    const local = absSeg % 4;
    const roundIdx = Math.floor(absSeg / 4);

    const d = new Date(gameTimeMs);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

    let segOffsetMin;
    if (local === 0) segOffsetMin = 0;
    else if (local === 1) segOffsetMin = dur.flightMin;
    else if (local === 2) segOffsetMin = dur.flightMin + dur.turnTo;
    else segOffsetMin = 2 * dur.flightMin + dur.turnTo;

    const evtMs = dayStart + (roundIdx * dur.roundMin + segOffsetMin) * 60000;
    const timeStr = fmtTimeFromMs(evtMs);

    if (local === 0) {
        pushFlightEvent({
            time: timeStr,
            plane: plane.name,
            from: sched.from,
            to: sched.to,
            type: 'dep'
        });

    } else if (local === 1) {
        const hasRoute = routeExists(sched.from, sched.to);
        let amount = 0;
        if (hasRoute) {
            const fare = calcBaseFare(sched.from, sched.to);
            amount = 180 * fare;
            gameState.money += amount;
            updateMoneyDisplay();
        }
        pushFlightEvent({
            time: timeStr,
            plane: plane.name,
            from: sched.from,
            to: sched.to,
            type: 'arr',
            amount: amount
        });

    } else if (local === 2) {
        const reverseExists = routeExists(sched.to, sched.from);
        pushFlightEvent({
            time: timeStr,
            plane: plane.name,
            from: sched.to,
            to: sched.from,
            type: 'dep',
            empty: !reverseExists
        });

    } else if (local === 3) {
        const reverseExists = routeExists(sched.to, sched.from);
        let amount = 0;
        if (reverseExists) {
            const fare = calcBaseFare(sched.to, sched.from);
            amount = 180 * fare;
            gameState.money += amount;
            updateMoneyDisplay();
        }
        pushFlightEvent({
            time: timeStr,
            plane: plane.name,
            from: sched.to,
            to: sched.from,
            type: 'arr',
            amount: amount,
            empty: !reverseExists
        });
    }
}

function fmtTimeFromMs(ms) {
    const d = new Date(ms);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

// ==================== 航班动态栏 ====================

function pushFlightEvent(evt) {
    flightEvents.push(evt);
    while (flightEvents.length > FLIGHT_EVENT_MAX) {
        flightEvents.shift();
    }
    renderFlightList();
}

function renderFlightList() {
    const list = document.getElementById('flight-list');
    if (!list) return;

    if (flightEvents.length === 0) {
        list.innerHTML = '<div class="fb-empty">暂无航班</div>';
        return;
    }

    let html = '';
    flightEvents.forEach(function (e) {
        const isDep = e.type === 'dep';
        const tagCls = isDep ? 'fb-dep' : 'fb-arr';
        const tagText = isDep ? '起飞' : '到达';

        let amountStr = '';
        if (e.amount && e.amount > 0) {
            amountStr = '<span class="fb-amount">+¥' + formatMoneyShort(e.amount) + '</span>';
        } else if (e.empty) {
            amountStr = '<span class="fb-empty-tag">空飞</span>';
        }

        html +=
            '<div class="fb-row">' +
                '<span class="fb-time">' + e.time + '</span>' +
                '<span class="fb-plane">' + e.plane + '</span>' +
                '<span class="fb-route">' + e.from + '→' + e.to + '</span>' +
                '<span class="fb-tag ' + tagCls + '">' + tagText + '</span>' +
                amountStr +
            '</div>';
    });
    list.innerHTML = html;
    list.scrollTop = list.scrollHeight;
}

// ==================== 时刻表弹窗 ====================

function openScheduleModal(planeIdx) {
    const plane = gameState.fleet[planeIdx];
    if (!plane) return;

    if (!isPlaneAtHome(plane)) {
        showToast('飞机不在基地，无法修改时刻表');
        return;
    }

    editingSchedulePlaneIdx = planeIdx;

    if (plane.schedule) {
        editingScheduleRouteKey = plane.schedule.from + '-' + plane.schedule.to;
    } else {
        editingScheduleRouteKey = null;
    }

    document.getElementById('sch-plane-name').textContent = plane.name;
    const data = AIRCRAFT_DATA.A320neo;
    document.getElementById('sch-plane-type').textContent =
        data.displayName + ' · ' + data.seatCapacity + ' 座';
    document.getElementById('sch-plane-loc').textContent = getPlaneLocationText(plane);

    scheduleDropdownOpen = false;
    closeScheduleDropdown();

    const valEl = document.getElementById('sch-route-value');
    if (editingScheduleRouteKey) {
        valEl.textContent = scheduleRouteLabel(editingScheduleRouteKey);
        valEl.classList.remove('cs-placeholder');
        document.getElementById('sch-flights-input').value =
            plane.schedule ? plane.schedule.flightsPerDay : 1;
    } else {
        valEl.textContent = '请选择航线';
        valEl.classList.add('cs-placeholder');
        document.getElementById('sch-flights-input').value = 1;
    }

    updateScheduleUI();
    openOverlay('schedule-overlay');
}

function closeScheduleModal() {
    closeScheduleDropdown();
    editingSchedulePlaneIdx = -1;
    editingScheduleRouteKey = null;
    closeOverlay('schedule-overlay');
}

function onScheduleOverlayClick(event) {
    if (scheduleDropdownOpen) {
        closeScheduleDropdown();
        return;
    }
    if (event.target.id === 'schedule-overlay') {
        closeScheduleModal();
    }
}

function isPlaneAtHome(plane) {
    if (!plane.schedule) return true;

    const sched = plane.schedule;
    const dur = calcFlightDuration(sched.from, sched.to);
    if (!dur) return true;

    const d = new Date(gameTimeMs);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const elapsedMin = (gameTimeMs - dayStart) / 60000;
    const totalDayMin = sched.flightsPerDay * dur.roundMin;

    if (elapsedMin >= totalDayMin) return true;

    const roundElapsed = elapsedMin - Math.floor(elapsedMin / dur.roundMin) * dur.roundMin;
    return roundElapsed >= 2 * dur.flightMin + dur.turnTo;
}

function getPlaneLocationText(plane) {
    if (!plane.schedule) {
        const home = AIRPORT_GCJ.find(function (a) { return a.iata === plane.home; });
        return home ? home.name + ' ' + home.iata : '—';
    }

    const sched = plane.schedule;
    const dur = calcFlightDuration(sched.from, sched.to);
    if (!dur) return '—';

    const a = AIRPORT_GCJ.find(function (x) { return x.iata === sched.from; });
    const b = AIRPORT_GCJ.find(function (x) { return x.iata === sched.to; });

    const d = new Date(gameTimeMs);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const elapsedMin = (gameTimeMs - dayStart) / 60000;
    const totalDayMin = sched.flightsPerDay * dur.roundMin;

    if (elapsedMin >= totalDayMin) {
        return a.name + ' ' + a.iata;
    }

    const roundElapsed = elapsedMin - Math.floor(elapsedMin / dur.roundMin) * dur.roundMin;

    if (roundElapsed < dur.flightMin) {
        return '执飞 ' + sched.from + ' → ' + sched.to;
    } else if (roundElapsed < dur.flightMin + dur.turnTo) {
        return b.name + ' ' + b.iata;
    } else if (roundElapsed < 2 * dur.flightMin + dur.turnTo) {
        return '执飞 ' + sched.to + ' → ' + sched.from;
    } else {
        return a.name + ' ' + a.iata;
    }
}

function toggleScheduleDropdown(event) {
    if (event) event.stopPropagation();

    if (scheduleDropdownOpen) {
        closeScheduleDropdown();
        return;
    }

    renderScheduleRouteList();
    document.getElementById('sch-route-list').classList.add('open');
    document.getElementById('sch-route-trigger').classList.add('open');
    scheduleDropdownOpen = true;
}

function renderScheduleRouteList() {
    const plane = gameState.fleet[editingSchedulePlaneIdx];
    if (!plane) return;

    const list = document.getElementById('sch-route-list');

    const available = routes.filter(function (r) {
        return r.from === plane.home;
    });

    if (available.length === 0) {
        list.innerHTML = '<div class="cs-empty">暂无可挂航线</div>';
        return;
    }

    let html = '';
    available.forEach(function (r) {
        const key = r.from + '-' + r.to;
        const cls = (key === editingScheduleRouteKey) ? ' selected' : '';
        html +=
            '<div class="cs-item' + cls + '" data-key="' + key + '">' +
                scheduleRouteLabel(key) +
            '</div>';
    });
    list.innerHTML = html;

    list.querySelectorAll('.cs-item').forEach(function (item) {
        item.onclick = function (e) {
            if (e) e.stopPropagation();
            selectScheduleRoute(this.getAttribute('data-key'), e);
        };
    });
}

function scheduleRouteLabel(key) {
    const parts = key.split('-');
    const a = AIRPORT_GCJ.find(function (x) { return x.iata === parts[0]; });
    const b = AIRPORT_GCJ.find(function (x) { return x.iata === parts[1]; });
    if (!a || !b) return key;
    return a.name + ' ' + a.iata + ' → ' + b.name + ' ' + b.iata;
}

function selectScheduleRoute(key, event) {
    if (event) event.stopPropagation();

    editingScheduleRouteKey = key;

    const valEl = document.getElementById('sch-route-value');
    valEl.textContent = scheduleRouteLabel(key);
    valEl.classList.remove('cs-placeholder');

    document.getElementById('sch-flights-input').value = 1;

    closeScheduleDropdown();
    updateScheduleUI();
}

function closeScheduleDropdown() {
    const list = document.getElementById('sch-route-list');
    const trigger = document.getElementById('sch-route-trigger');
    if (list) list.classList.remove('open');
    if (trigger) trigger.classList.remove('open');
    scheduleDropdownOpen = false;
}

function updateScheduleUI() {
    const input = document.getElementById('sch-flights-input');
    const hint = document.getElementById('sch-hint');
    const saveBtn = document.getElementById('sch-save-btn');
    const previewBox = document.getElementById('sch-preview');

    const flights = parseInt(input.value, 10) || 0;

    if (!editingScheduleRouteKey) {
        input.classList.remove('error');
        hint.classList.remove('error');
        hint.textContent = '请先选择航线';
        saveBtn.disabled = true;
        document.getElementById('sch-di-flight').textContent = '—';
        document.getElementById('sch-di-turn').textContent = '—';
        document.getElementById('sch-di-round').textContent = '—';
        previewBox.innerHTML = '<div class="pv-empty">暂无时刻</div>';
        return;
    }

    const parts = editingScheduleRouteKey.split('-');
    const dur = calcFlightDuration(parts[0], parts[1]);
    if (!dur) return;

    const maxF = Math.floor(24 * 60 / dur.roundMin);

    document.getElementById('sch-di-flight').textContent =
        fmtMin(dur.flightMin) + ' × 2';
    document.getElementById('sch-di-turn').textContent =
        fmtMin(dur.turnFrom) + ' + ' + fmtMin(dur.turnTo);
    document.getElementById('sch-di-round').textContent =
        fmtMin(dur.roundMin);

    const totalMin = flights * dur.roundMin;
    const overLimit = totalMin > 24 * 60;

    if (overLimit) {
        input.classList.add('error');
        hint.classList.add('error');
        hint.textContent = '超出 24 小时（需 ' + fmtMin(totalMin) +
                          '，最多 ' + maxF + ' 趟）';
        saveBtn.disabled = true;
    } else if (flights < 1) {
        input.classList.add('error');
        hint.classList.add('error');
        hint.textContent = '至少 1 趟';
        saveBtn.disabled = true;
    } else {
        input.classList.remove('error');
        hint.classList.remove('error');
        hint.textContent = '系统推荐：最多 ' + maxF + ' 趟';
        saveBtn.disabled = false;
    }

    renderSchedulePreview(editingScheduleRouteKey, flights);
}

function renderSchedulePreview(routeKey, flights) {
    const parts = routeKey.split('-');
    const from = parts[0];
    const to = parts[1];

    const dur = calcFlightDuration(from, to);
    if (!dur) return;

    const hasReverse = routeExists(to, from);

    const box = document.getElementById('sch-preview');
    let html = '';
    let t = 0;

    for (let i = 0; i < flights; i++) {
        html +=
            '<div class="pv-row">' +
                '<span class="pv-time">' + fmtTimeOfDay(t) + '</span>' +
                '<span class="pv-route">' + from + ' → ' + to +
                    '<span class="pv-tag paid">载客</span>' +
                '</span>' +
            '</div>';
        t += dur.flightMin + dur.turnTo;

        const tag = hasReverse
            ? '<span class="pv-tag paid">载客</span>'
            : '<span class="pv-tag empty">空飞</span>';
        html +=
            '<div class="pv-row">' +
                '<span class="pv-time">' + fmtTimeOfDay(t) + '</span>' +
                '<span class="pv-route">' + to + ' → ' + from + tag + '</span>' +
            '</div>';
        t += dur.flightMin + dur.turnFrom;
    }

    if (html === '') html = '<div class="pv-empty">暂无时刻</div>';
    box.innerHTML = html;
}

function saveSchedule(btn) {
    if (btn.disabled) return;
    if (!editingScheduleRouteKey) return;
    if (btn.classList.contains('pressed')) return;
    btn.classList.add('pressed');

    setTimeout(function () {
        btn.classList.remove('pressed');

        const plane = gameState.fleet[editingSchedulePlaneIdx];
        if (!plane) return;

        const flights = parseInt(document.getElementById('sch-flights-input').value, 10) || 0;
        if (flights < 1) return;

        const parts = editingScheduleRouteKey.split('-');

        plane.schedule = {
            from: parts[0],
            to: parts[1],
            flightsPerDay: flights
        };

        plane._state = null;

        closeScheduleModal();

        renderFleet();
        updateSinglePlane(plane);

        showToast('时刻表已保存');
    }, 200);
}

// ==================== 全局点击：关闭下拉 ====================

document.addEventListener('click', function (e) {
    if (homeDropdownOpen) {
        const trigger = document.querySelector('#home-select .cs-trigger');
        const list = document.getElementById('home-select-list');
        if (trigger && trigger.contains(e.target)) return;
        if (list && list.contains(e.target)) return;
        closeHomeDropdown();
    }
    if (scheduleDropdownOpen) {
        const trigger = document.getElementById('sch-route-trigger');
        const list = document.getElementById('sch-route-list');
        if (trigger && trigger.contains(e.target)) return;
        if (list && list.contains(e.target)) return;
        closeScheduleDropdown();
    }
});
