// SPDX-License-Identifier: AGPL-3.0-or-later
// 翼掠惊鸿 - 航线 & 地图（建航线 / 详情 / 弧线 / 游戏页地图）

// ==================== 状态 ====================

let routePending = null;
let routes = [];
let gameMap = null;

const arcCache = {};

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
