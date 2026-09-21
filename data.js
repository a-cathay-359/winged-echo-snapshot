// SPDX-License-Identifier: AGPL-3.0-or-later
// 翼掠惊鸿 - 数据层

// ==================== 坐标转换 ====================

const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

function outOfChina(lng, lat) {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x, y) {
    let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
    return ret;
}

function transformLng(x, y) {
    let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
    return ret;
}

function wgs84ToGcj02(lng, lat) {
    if (outOfChina(lng, lat)) return [lng, lat];
    let dLat = transformLat(lng - 105.0, lat - 35.0);
    let dLng = transformLng(lng - 105.0, lat - 35.0);
    const radLat = lat / 180.0 * PI;
    let magic = Math.sin(radLat);
    magic = 1 - EE * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
    dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);
    return [lng + dLng, lat + dLat];
}

// ==================== 飞机数据 ====================

const AIRCRAFT_DATA = {
    A320neo: {
        name: "空客 A320neo (LEAP-1A)",
        shortName: "A320neo",
        displayName: "空客 A320neo",
        seatCapacity: 180,
        cruiseSpeed: 850,
        range: 6200,
        mtow: 79000,
        maxPayload: 17,
        fuelCapacity: 26000,
        cruiseFuelBurn: 2.94,
        newPrice: 430000000
    }
};

// ==================== 机场数据 ====================

const AIRPORT_DATA = [
    { iata: "PEK", name: "北京首都", city: "北京", lat: 40.0801, lng: 116.5846,
      throughput: 7076, grade: "4F", distance: 25,   isPlateau: false, isHighPlateau: false },

    { iata: "PVG", name: "上海浦东", city: "上海", lat: 31.1443, lng: 121.8083,
      throughput: 8499, grade: "4F", distance: 30,   isPlateau: false, isHighPlateau: false },

    { iata: "CAN", name: "广州白云", city: "广州", lat: 23.3924, lng: 113.2988,
      throughput: 8359, grade: "4F", distance: 28,   isPlateau: false, isHighPlateau: false },

    { iata: "CTU", name: "成都双流", city: "成都", lat: 30.5785, lng: 103.9471,
      throughput: 3352, grade: "4F", distance: 16,   isPlateau: false, isHighPlateau: false },

    { iata: "TFU", name: "成都天府", city: "成都", lat: 30.3125, lng: 104.4417,
      throughput: 5669, grade: "4F", distance: 50,   isPlateau: false, isHighPlateau: false },

    { iata: "URC", name: "乌鲁木齐天山", city: "乌鲁木齐", lat: 43.9071, lng: 87.4742,
      throughput: 2918, grade: "4F", distance: 16.8, isPlateau: false, isHighPlateau: false },

    { iata: "SZX", name: "深圳宝安", city: "深圳", lat: 22.6393, lng: 113.8106,
      throughput: 6649, grade: "4F", distance: 32,   isPlateau: false, isHighPlateau: false },

    { iata: "KMG", name: "昆明长水", city: "昆明", lat: 25.1019, lng: 102.9292,
      throughput: 4969, grade: "4F", distance: 24.5, isPlateau: true,  isHighPlateau: false },

    { iata: "HRB", name: "哈尔滨太平", city: "哈尔滨", lat: 45.6234, lng: 126.2500,
      throughput: 2465, grade: "4E", distance: 33,   isPlateau: false, isHighPlateau: false },

    { iata: "LXA", name: "拉萨贡嘎", city: "拉萨", lat: 29.2978, lng: 90.9119,
      throughput: 628, grade: "4E", distance: 60,   isPlateau: true,  isHighPlateau: true }
];

// ==================== 乘客指数算法 ====================

const AIRPORT_CONSTANTS = {
    GRADE_FACTOR: {
        "4F": 1.00,
        "4E": 0.90,
        "4D": 0.78,
        "4C": 0.62
    },
    DISTANCE_DIVISOR: 250,
    PLATEAU_FACTOR: 0.90,
    HIGH_PLATEAU_FACTOR: 0.85
};

function calcPassengerIndex(airport) {
    const gradeFactor = AIRPORT_CONSTANTS.GRADE_FACTOR[airport.grade] || 0.62;
    const distanceFactor = Math.max(0, 1 - airport.distance / AIRPORT_CONSTANTS.DISTANCE_DIVISOR);

    let altitudeFactor = 1.00;
    if (airport.isHighPlateau) {
        altitudeFactor = AIRPORT_CONSTANTS.HIGH_PLATEAU_FACTOR;
    } else if (airport.isPlateau) {
        altitudeFactor = AIRPORT_CONSTANTS.PLATEAU_FACTOR;
    }

    return Math.sqrt(airport.throughput) * gradeFactor * distanceFactor * altitudeFactor;
}

// ==================== 处理后的机场数据 ====================

const AIRPORT_GCJ = AIRPORT_DATA.map(function (a) {
    const g = wgs84ToGcj02(a.lng, a.lat);
    return {
        iata: a.iata,
        name: a.name,
        city: a.city,
        lat: g[1],
        lng: g[0],
        throughput: a.throughput,
        grade: a.grade,
        distance: a.distance,
        isPlateau: a.isPlateau,
        isHighPlateau: a.isHighPlateau,
        passengerIndex: calcPassengerIndex(a)
    };
});

// ==================== 启动页背景航线 ====================

const DEMO_ROUTES = [
    [0, 1],
    [2, 3],
    [6, 5],
    [7, 8]
];
