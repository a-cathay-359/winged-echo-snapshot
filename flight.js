// SPDX-License-Identifier: AGPL-3.0-or-later
// 翼掠惊鸿 - 飞行（时刻表 / 飞机图标 / 位置 / 航班动态）

// ==================== 状态 ====================

let editingSchedulePlaneIdx = -1;
let editingScheduleRouteKey = null;
let scheduleDropdownOpen = false;

const flightEvents = [];
const FLIGHT_EVENT_MAX = 100;

let planeMarkers = [];

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

// ==================== 200段推进 & 收入 =================);
===

function handleSegAdvance(}

plane, absSeg) {
    if (!plane._//state) {
        plane._state = { last =AbsSeg: absSeg };
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
    }, =================== 全局点击：关闭时刻表下拉 ====================

document.addEventListener('click', function (e) {
    if (scheduleDropdownOpen) {
        const trigger = document.getElementById('sch-route-trigger');
        const list = document.getElementById('sch-route-list');
        if (trigger && trigger.contains(e.target)) return;
        if (list && list.contains(e.target)) return;
        closeScheduleDropdown();
    }
});

// ==================== 初始化 ====================

function boot() {
    try {
        initBackgroundMap();
    } catch (e) {
        console.error('背景地图初始化失败:', e);
    }

    try {
        initAdminTrigger();
    } catch (e) {
        console.error('调试触发器初始化失败:', e);
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
