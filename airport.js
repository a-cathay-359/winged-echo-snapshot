// SPDX-License-Identifier: AGPL-3.0-or-later
// 翼掠惊鸿 - 机场 & 机队（点击三态 / 机场面板 / 购机 / 命名）

// ==================== 状态 ====================

let pendingAirport = null;
let selectedAirport = null;

let selectedHomeIata = null;
let homeDropdownOpen = false;

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

// ==================== 全局点击：关闭购机下拉 ====================

document.addEventListener('click', function (e) {
    if (homeDropdownOpen) {
        const trigger = document.querySelector('#home-select .cs-trigger');
        const list = document.getElementById('home-select-list');
        if (trigger && trigger.contains(e.target)) return;
        if (list && list.contains(e.target)) return;
        closeHomeDropdown();
    }
});
