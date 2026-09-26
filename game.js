// SPDX-License-Identifier: AGPL-3.0-or-later
// 翼掠惊鸿 - 逻辑层

// ==================== 游戏状态 ====================

let gameState = {
    money: 1000000000,
    fleet: []
};

let pendingAirport = null;
let selectedAirport = null;
let routePending = null;
let routes = [];
let overlayZCounter = 100;

let selectedHomeIata = null;
let homeDropdownOpen = false;

function updateMoneyDisplay() {
    const yi = gameState.money / 100000000;
    document.getElementById('money-value').textContent = yi.toFixed(2);
}

function countFleetByType(type) {
    return gameState.fleet.filter(function (p) {
        return p.type === type;
    }).length;
}

function routeExists(fromIata, toIata) {
    return routes.some(function (r) {
        return r.from === fromIata && r.to === toIata;
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

// ==================== 机队列表渲染 ====================

function renderFleet() {
    const list = document.getElementById('fleet-list');

    if (gameState.fleet.length === 0) {
        list.innerHTML = '<div class="fleet-empty">暂无飞机，点右上角采购</div>';
        return;
    }

    let html = '';
    gameState.fleet.forEach(function (plane) {
        const data = Object.values(AIRCRAFT_DATA).find(function (d) {
            return d.shortName === plane.type;
        }) || AIRCRAFT_DATA.A320neo;

        const homeAirport = AIRPORT_GCJ.find(function (a) {
            return a.iata === plane.home;
        });
        const homeName = homeAirport ? homeAirport.name : '—';

        html +=
            '<div class="fleet-card">' +
                '<div class="fc-top">' +
                    '<span class="fc-name">' + plane.name + '</span>' +
                    '<div class="fc-right">' +
                        '<span class="fc-status">闲置</span>' +
                        '<span class="fc-home">' + homeName + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="fc-info">' +
                    data.displayName + ' · ' + data.seatCapacity + ' 座' +
                '</div>' +
                '<div class="fc-actions">' +
                    '<button class="fleet-btn schedule" onclick="fleetSchedule(this)">时刻表</button>' +
                    '<button class="fleet-btn sell" onclick="fleetSell(this)">出售</button>' +
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
    }, 200);
}

function fleetSell(btn) {
    if (btn.classList.contains('pressed')) return;
    btn.classList.add('pressed');
    setTimeout(function () {
        btn.classList.remove('pressed');
    }, 200);
}

// ==================== 弹窗管理 ====================

function openOverlay(id) {
    const el = document.getElementById(id);
    el.style.zIndex = overlayZCounter++;
    el.classList.add('active');
    refreshOverlayDim();
}

function closeOverlay(id) {
    document.getElementById(id).classList.remove('active');
    refreshOverlayDim();
}

function refreshOverlayDim() {
    const actives = Array.prototype.slice.call(
        document.querySelectorAll('.overlay.active')
    );

    actives.sort(function (a, b) {
        return (parseInt(a.style.zIndex) || 0) - (parseInt(b.style.zIndex) || 0);
    });

    actives.forEach(function (el, idx) {
        if (idx === 0) {
            el.classList.remove('no-dim');
        } else {
            el.classList.add('no-dim');
        }
    });
}

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

// ==================== 机队地图标记 ====================

let planeMarkers = [];

function addPlaneMarker(plane) {
    if (!gameMap) return;

    const airport = AIRPORT_GCJ.find(function (a) {
        return a.iata === plane.home;
    });
    if (!airport) return;

    const marker = L.marker([airport.lat, airport.lng], {
        icon: makePlaneIcon(),
        interactive: false
    }).addTo(gameMap);

    plane._marker = marker;
    planeMarkers.push(marker);
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

// ==================== 启动页背景地图 ====================

let bgMap = null;
let bgAnimating = false;
let bgPlanes = [];
let bgShift = 0;

function initBackgroundMap() {
    const container = document.getElementById('bg-map');
    if (!container || bgMap) return;

    bgMap = L.map('bg-map', {
        center: [35.0, 105.0],
        zoom: 5,
        minZoom: 5,
        maxZoom: 5,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
        tap: false,
        worldCopyJump: false,
        maxBounds: [[-85, -180], [85, 180]],
        maxBoundsViscosity: 0.8
    });

    L.tileLayer(
        'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
        {
            subdomains: '1234',
            minZoom: 5,
            maxZoom: 5,
            noWrap: true
        }
    ).addTo(bgMap);

    bgMap.invalidateSize();

    AIRPORT_GCJ.forEach(function (a) {
        L.circleMarker([a.lat, a.lng], {
            radius: 3.5,
            fillColor: '#1a3a5c',
            color: '#ffffff',
            weight: 1,
            fillOpacity: 1,
            interactive: false
        }).addTo(bgMap);
    });

    DEMO_ROUTES.forEach(function (pair, idx) {
        const a = AIRPORT_GCJ[pair[0]];
        const b = AIRPORT_GCJ[pair[1]];
        const pts = makeArc(a, b, 60);

        L.polyline(pts, {
            color: '#2563eb',
            weight: 1.5,
            opacity: 0.55,
            interactive: false
        }).addTo(bgMap);

        const marker = L.marker(pts[0], {
            icon: makePlaneIcon(),
            interactive: false
        }).addTo(bgMap);

        bgPlanes.push({
            marker: marker,
            points: pts,
            progress: idx * 0.25,
            speed: 0.0015 + Math.random() * 0.0008,
            lastAngle: null
        });
    });

    bgAnimating = true;
    requestAnimationFrame(bgLoop);
}

function bgLoop() {
    if (!bgAnimating || !bgMap) return;

    bgShift += 0.0018;
    const RADIUS_LNG = 9;
    const RADIUS_LAT = 5;
    const lngOffset = Math.cos(bgShift) * RADIUS_LNG;
    const latOffset = Math.sin(bgShift) * RADIUS_LAT;
    bgMap.setView([35.0 + latOffset, 105.0 + lngOffset], 5, { animate: false });

    bgPlanes.forEach(function (p) {
        p.progress += p.speed;
        if (p.progress > 1) p.progress = 0;

        const idx = p.progress * (p.points.length - 1);
        const i0 = Math.floor(idx);
        const i1 = Math.min(i0 + 1, p.points.length - 1);
        const frac = idx - i0;

        const lat = p.points[i0][0] + (p.points[i1][0] - p.points[i0][0]) * frac;
        const lng = p.points[i0][1] + (p.points[i1][1] - p.points[i0][1]) * frac;

        p.marker.setLatLng([lat, lng]);

        const dLat = p.points[i1][0] - p.points[i0][0];
        const dLng = p.points[i1][1] - p.points[i0][1];

        let angle = Math.atan2(-dLat, dLng) * 180 / PI;
        angle += 90;

        if (p.lastAngle !== null) {
            while (angle - p.lastAngle > 180) angle -= 360;
            while (angle - p.lastAngle < -180) angle += 360;
        }
        p.lastAngle = angle;

        const el = p.marker.getElement();
        if (el) {
            const rot = el.querySelector('.plane-rot');
            if (rot) {
                rot.style.transform = 'rotate(' + angle + 'deg)';
            }
        }
    });

    requestAnimationFrame(bgLoop);
}

// ==================== 游戏页地图 ====================

let gameMap = null;

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

// ==================== 页面交互 ====================

function bootGame(loadData) {
    bgAnimating = false;

    document.getElementById('start-page').style.display = 'none';
    document.getElementById('game-page').classList.add('active');

    if (loadData) {
        gameState.money = loadData.money;
        gameState.fleet = loadData.fleet;
    }

    updateMoneyDisplay();
    renderFleet();

    setTimeout(function () {
        initGameMap();
        if (gameMap) gameMap.invalidateSize();

        if (loadData) {
            clearAllRoutes();
            loadData.routes.forEach(function (r) {
                const from = AIRPORT_GCJ.find(function (a) { return a.iata === r.from; });
                const to = AIRPORT_GCJ.find(function (a) { return a.iata === r.to; });
                if (from && to) drawRoute(from, to, true);
            });

            startTimeSystem(loadData.gameTimeMs, loadData.gameSpeed, loadData.gamePaused);
            gameMap.setView([35.0, 105.0], 4);
        } else {
            startTimeSystem();
        }

        rebuildAllPlaneMarkers();
    }, 100);
}

function enterGame(btn) {
    if (btn.classList.contains('pressed')) return;
    btn.classList.add('pressed');

    setTimeout(function () {
        btn.classList.remove('pressed');
        bootGame();
    }, 200);
}

function startPageLoad(btn) {
    if (btn.classList.contains('pressed')) return;
    btn.classList.add('pressed');

    setTimeout(function () {
        btn.classList.remove('pressed');

        const data = readSave();
        if (!data) {
            showStartToast('暂无存档');
            return;
        }
        bootGame(data);
    }, 200);
}

function openAbout(btn) {
    if (btn.classList.contains('pressed')) return;
    btn.classList.add('pressed');

    setTimeout(function () {
        btn.classList.remove('pressed');
        document.getElementById('about-page').classList.add('active');
    }, 200);
}

function closeAbout(btn) {
    if (btn.classList.contains('pressed')) return;
    btn.classList.add('pressed');

    setTimeout(function () {
        btn.classList.remove('pressed');
        document.getElementById('about-page').classList.remove('active');
    }, 200);
}

function switchTab(tabEl, contentId) {
    document.querySelectorAll('.right-panel .tab').forEach(function (t) {
        t.classList.remove('active');
    });
    tabEl.classList.add('active');

    document.querySelectorAll('.right-panel .panel-content').forEach(function (p) {
        p.classList.remove('active');
    });
    document.getElementById(contentId).classList.add('active');
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

// ==================== 自定义下拉 ====================

function toggleHomeDropdown(event) {
    if (event) event.stopPropagation();

    if (homeDropdownOpen) {
        closeHomeDropdown();
        return;
    }

    renderHomeList();
    document.getElementById('home-select-list').classList.add('open');
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
            home: selectedHomeIata
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

// ==================== Toast ====================

let toastTimer = null;
function showToast(text) {
    const toast = document.getElementById('toast');
    toast.textContent = text;
    toast.classList.add('show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
        toast.classList.remove('show');
    }, 2000);
}

let startToastTimer = null;
function showStartToast(text) {
    const toast = document.getElementById('start-toast');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');

    clearTimeout(startToastTimer);
    startToastTimer = setTimeout(function () {
        toast.classList.remove('show');
    }, 2000);
}

// ==================== 存档系统 ====================

const SAVE_KEY = 'wingedEcho.save.v1';
const SAVE_VERSION = 2;

function saveGame() {
    const data = {
        version: SAVE_VERSION,
        savedAt: Date.now(),
        gameTimeMs: gameTimeMs,
        money: gameState.money,
        fleet: gameState.fleet.map(function (p) {
            return { name: p.name, type: p.type, home: p.home };
        }),
        routes: routes.map(function (r) {
            return { from: r.from, to: r.to };
        }),
        gameSpeed: gameSpeed,
        gamePaused: gamePaused
    };

    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        showToast('已存档');
    } catch (e) {
        showToast('存档失败');
    }
}

function hasSave() {
    return !!localStorage.getItem(SAVE_KEY);
}

function readSave() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;

    try {
        const data = JSON.parse(raw);
        if (data.version !== SAVE_VERSION) return null;
        return data;
    } catch (e) {
        return null;
    }
}

function openLoadConfirm() {
    if (!hasSave()) {
        showToast('暂无存档');
        return;
    }
    openOverlay('load-confirm-overlay');
}

function closeLoadConfirm() {
    closeOverlay('load-confirm-overlay');
}

function confirmLoad() {
    closeLoadConfirm();

    const data = readSave();
    if (!data) {
        showToast('存档不兼容或读取失败');
        return;
    }

    if (!gameMap) return;

    gameState.money = data.money;
    gameState.fleet = data.fleet;
    updateMoneyDisplay();
    renderFleet();

    clearAllRoutes();
    data.routes.forEach(function (r) {
        const from = AIRPORT_GCJ.find(function (a) { return a.iata === r.from; });
        const to = AIRPORT_GCJ.find(function (a) { return a.iata === r.to; });
        if (from && to) drawRoute(from, to, true);
    });

    rebuildAllPlaneMarkers();

    startTimeSystem(data.gameTimeMs, data.gameSpeed, data.gamePaused);
    gameMap.setView([35.0, 105.0], 4);

    showToast('已读档');
}

// ==================== 时间系统 ====================

const GAME_START_MS = new Date(2027, 0, 1, 0, 0, 0).getTime();

let gameTimeMs = GAME_START_MS;
let gameSpeed = 1;
let gamePaused = true;

let lastTickReal = 0;
let timeLoopId = null;

function pad2(n) { return String(n).padStart(2, '0'); }

function formatGameTime(ms) {
    const d = new Date(ms);
    return d.getFullYear() + '年' +
           (d.getMonth() + 1) + '月' +
           d.getDate() + '日 ' +
           pad2(d.getHours()) + ':' +
           pad2(d.getMinutes());
}

function renderTimeDisplay() {
    const el = document.getElementById('time-display');
    if (el) el.textContent = formatGameTime(gameTimeMs);
}

function timeLoop(now) {
    if (!lastTickReal) lastTickReal = now;
    const realDelta = now - lastTickReal;
    lastTickReal = now;

    if (!gamePaused) {
        gameTimeMs += realDelta * gameSpeed;
        renderTimeDisplay();
    }

    timeLoopId = requestAnimationFrame(timeLoop);
}

function startTimeSystem(initMs, initSpeed, initPaused) {
    gameTimeMs = (initMs !== undefined) ? initMs : GAME_START_MS;
    gameSpeed = (initSpeed !== undefined) ? initSpeed : 1;
    gamePaused = (initPaused !== undefined) ? initPaused : true;

    lastTickReal = 0;
    renderTimeDisplay();
    updateSpeedButtons();

    if (timeLoopId) cancelAnimationFrame(timeLoopId);
    timeLoopId = requestAnimationFrame(timeLoop);
}

function setGameSpeed(speed) {
    gameSpeed = speed;
    if (gamePaused) gamePaused = false;
    updateSpeedButtons();
}

function togglePause() {
    gamePaused = !gamePaused;
    lastTickReal = 0;
    updateSpeedButtons();
}

function updateSpeedButtons() {
    document.querySelectorAll('.speed-seg[data-speed]').forEach(function (b) {
        const s = parseInt(b.dataset.speed, 10);
        b.classList.toggle('active', !gamePaused && s === gameSpeed);
    });

    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
        pauseBtn.textContent = gamePaused ? '▶ 开始' : '⏸ 暂停';
        pauseBtn.classList.toggle('active', gamePaused);
    }
}

// ==================== 初始化 ====================

function boot() {
    try {
        initBackgroundMap();
    } catch (e) {
        console.error('背景地图初始化失败:', e);
    }

    window.addEventListener('resize', function () {
        try {
            if (bgMap) bgMap.invalidateSize();
            if (gameMap) gameMap.invalidateSize();
        } catch (e) {}
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
        setTimeout(boot, 100);
    });
} else {
    setTimeout(boot, 100);
}
