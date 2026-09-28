// SPDX-License-Identifier: AGPL-3.0-or-later
// 翼掠惊鸿 - 主控层（状态 / 工具 / 弹窗 / Toast / 时间 / 存档 / 调试 / 启动页 / 初始化）

// ==================== 全局错误捕获 ====================

window.addEventListener('error', function (e) {
    try {
        var box = document.getElementById('fatal-error');
        if (!box) {
            box = document.createElement('div');
            box.id = 'fatal-error';
            box.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;' +
                'background:#dc2626;color:#fff;font-size:12px;padding:8px 14px;' +
                'font-family:monospace;word-break:break-all;line-height:1.5;';
            document.body.appendChild(box);
        }
        box.textContent = 'JS 错误: ' + (e.message || '') +
            ' @ ' + (e.filename || '').split('/').pop() + ':' + (e.lineno || '');
    } catch (err) {}
});

// ==================== 游戏状态 ====================

let gameState = {
    money: 1000000000,
    fleet: []
};

let overlayZCounter = 100;

// ==================== 工具函数 ====================

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

function pad2(n) { return String(n).padStart(2, '0'); }

function fmtMin(totalMin) {
    const h = Math.floor(totalMin / 60);
    const m = Math.round(totalMin % 60);
    if (h === 0) return m + 'min';
    if (m === 0) return h + 'h';
    return h + 'h ' + m + 'min';
}

function fmtTimeOfDay(totalMin) {
    const h = Math.floor(totalMin / 60) % 24;
    const m = Math.floor(totalMin % 60);
    return pad2(h) + ':' + pad2(m);
}

function formatMoneyShort(n) {
    if (n >= 100000000) return (n / 100000000).toFixed(2) + '亿';
    if (n >= 10000) return (n / 10000).toFixed(1) + '万';
    return String(Math.round(n));
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

// ==================== 页面交互 ====================

function bootGame(loadData) {
    bgAnimating = false;

    document.getElementById('start-page').style.display = 'none';
    document.getElementById('game-page').classList.add('active');

    if (loadData) {
        gameState.money = loadData.money;
        gameState.fleet = (loadData.fleet || []).map(function (p) {
            return {
                name: p.name,
                type: p.type,
                home: p.home,
                schedule: p.schedule || null,
                _marker: null,
                _state: null
            };
        });
    }

    updateMoneyDisplay();
    renderFleet();
    renderFlightList();

    setTimeout(function () {
        initGameMap();
        if (gameMap) gameMap.invalidateSize();

        if (loadData) {
            clearAllRoutes();
            (loadData.routes || []).forEach(function (r) {
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
        updatePlanesPosition();
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

// ==================== 时间系统 ====================

const GAME_START_MS = new Date(2027, 0, 1, 0, 0, 0).getTime();

let gameTimeMs = GAME_START_MS;
let gameSpeed = 1;
let gamePaused = true;

let lastTickReal = 0;
let timeLoopId = null;

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
        updatePlanesPosition();
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
            return {
                name: p.name,
                type: p.type,
                home: p.home,
                schedule: p.schedule || null
            };
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
    gameState.fleet = (data.fleet || []).map(function (p) {
        return {
            name: p.name,
            type: p.type,
            home: p.home,
            schedule: p.schedule || null,
            _marker: null,
            _state: null
        };
    });

    updateMoneyDisplay();
    renderFleet();

    clearAllRoutes();
    (data.routes || []).forEach(function (r) {
        const from = AIRPORT_GCJ.find(function (a) { return a.iata === r.from; });
        const to = AIRPORT_GCJ.find(function (a) { return a.iata === r.to; });
        if (from && to) drawRoute(from, to, true);
    });

    rebuildAllPlaneMarkers();

    startTimeSystem(data.gameTimeMs, data.gameSpeed, data.gamePaused);
    gameMap.setView([35.0, 105.0], 4);

    updatePlanesPosition();

    showToast('已读档');
}

// ==================== 管理员调试 ====================

const ADMIN_PASSWORD = '676767';
const ADMIN_CLICK_TARGET = 9;
const ADMIN_CLICK_INTERVAL_MS = 1000;

let adminClickCount = 0;
let adminLastClickMs = 0;

function initAdminTrigger() {
    const el = document.getElementById('money-value');
    if (!el) return;
    el.addEventListener('click', onMoneyValueClick);
}

function onMoneyValueClick() {
    const now = Date.now();

    if (adminLastClickMs && (now - adminLastClickMs) <= ADMIN_CLICK_INTERVAL_MS) {
        adminClickCount++;
    } else {
        adminClickCount = 1;
    }

    adminLastClickMs = now;

    if (adminClickCount >= ADMIN_CLICK_TARGET) {
        adminClickCount = 0;
        adminLastClickMs = 0;
        openAdminPass();
    }
}

function openAdminPass() {
    const input = document.getElementById('admin-pass-input');
    input.value = '';
    input.classList.remove('error');
    openOverlay('admin-pass-overlay');
    setTimeout(function () {
        input.focus();
    }, 100);
}

function closeAdminPass() {
    closeOverlay('admin-pass-overlay');
}

function submitAdminPass(btn) {
    if (btn.classList.contains('pressed')) return;
    btn.classList.add('pressed');

    setTimeout(function () {
        btn.classList.remove('pressed');

        const input = document.getElementById('admin-pass-input');
        const val = input.value.trim();

        if (val !== ADMIN_PASSWORD) {
            input.classList.add('error');
            input.focus();
            input.select();
            return;
        }

        closeAdminPass();
        openAdminMoney();
    }, 200);
}

function openAdminMoney() {
    const curYi = gameState.money / 100000000;
    document.getElementById('admin-current-money').textContent = curYi.toFixed(2);

    const input = document.getElementById('admin-money-input');
    input.value = curYi.toFixed(2);
    input.classList.remove('error');

    openOverlay('admin-money-overlay');
    setTimeout(function () {
        input.focus();
        input.select();
    }, 100);
}

function closeAdminMoney() {
    closeOverlay('admin-money-overlay');
}

function submitAdminMoney(btn) {
    if (btn.classList.contains('pressed')) return;
    btn.classList.add('pressed');

    setTimeout(function () {
        btn.classList.remove('pressed');

        const input = document.getElementById('admin-money-input');
        const val = parseFloat(input.value);

        if (isNaN(val) || val <= 0) {
            input.classList.add('error');
            input.focus();
            input.select();
            return;
        }

        gameState.money = Math.round(val * 100000000);
        updateMoneyDisplay();
        closeAdminMoney();
        showToast('资金已设置');
    }, 200);
}

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
