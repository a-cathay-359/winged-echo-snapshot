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

// ==================== 城市数据 ====================

const CITY_DATA = {
    "北京":     { gdp: 52073, tourismVisitors: 3.90,  tourismRevenue: 7159, perCapitaSpend: 1836, businessIndex: 1.00 },
    "上海":     { gdp: 56709, tourismVisitors: 4.16,  tourismRevenue: 5600, perCapitaSpend: 1346, businessIndex: 1.00 },
    "深圳":     { gdp: 38700, tourismVisitors: 2.00,  tourismRevenue: 3100, perCapitaSpend: 1550, businessIndex: 0.85 },
    "广州":     { gdp: 32000, tourismVisitors: 2.64,  tourismRevenue: 3768, perCapitaSpend: 1427, businessIndex: 0.80 },
    "成都":     { gdp: 24764, tourismVisitors: 3.20,  tourismRevenue: 4526, perCapitaSpend: 1414, businessIndex: 0.60 },
    "昆明":     { gdp:  8600, tourismVisitors: 3.58,  tourismRevenue: 4015, perCapitaSpend: 1121, businessIndex: 0.40 },
    "哈尔滨":   { gdp:  6200, tourismVisitors: 2.02,  tourismRevenue: 2818, perCapitaSpend: 1395, businessIndex: 0.35 },
    "乌鲁木齐": { gdp:  4500, tourismVisitors: 1.24,  tourismRevenue: 1300, perCapitaSpend: 1048, businessIndex: 0.30 },
    "拉萨":     { gdp:  1000, tourismVisitors: 0.505, tourismRevenue:  606, perCapitaSpend: 1200, businessIndex: 0.20 }
};

// ==================== 机场指数算法 ====================

const AIRPORT_CONSTANTS = {
    GRADE_FACTOR: {
        "4F": 1.00,
        "4E": 0.90,
        "4D": 0.78,
        "4C": 0.62
    },
    DISTANCE_DIVISOR: 110,
    PLATEAU_FACTOR: 0.90,
    HIGH_PLATEAU_FACTOR: 0.85
};

function calcAirportIndex(airport) {
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

// ==================== 航线人数算法 ====================

const ROUTE_CONSTANTS = {
    TOURISM_DECAY: 500,
    BUSINESS_DECAY: 900,
    TOURISM_FLOOR: 0.15,
    BUSINESS_FLOOR: 0.40,
    K_TOURISM: 0.226,
    K_BUSINESS: 0.0783
};

const EARTH_RADIUS_KM = 6371;

function calcDistanceKm(lat1, lng1, lat2, lng2) {
    const toRad = PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLng = (lng2 - lng1) * toRad;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function calcCityTourismAttraction(city) {
    return city.tourismRevenue * (city.perCapitaSpend / 1000);
}

function calcCityBusinessAttraction(city) {
    return city.gdp * city.businessIndex;
}

function calcRouteDemand(iataA, iataB) {
    const a = AIRPORT_GCJ.find(function (x) { return x.iata === iataA; });
    const b = AIRPORT_GCJ.find(function (x) { return x.iata === iataB; });

    if (!a || !b) return null;

    const cityA = CITY_DATA[a.city];
    const cityB = CITY_DATA[b.city];

    if (!cityA || !cityB) return null;

    const distance = calcDistanceKm(a.lat, a.lng, b.lat, b.lng);

    const tourismBase = Math.sqrt(
        calcCityTourismAttraction(cityA) * calcCityTourismAttraction(cityB)
    );
    const businessBase = Math.sqrt(
        calcCityBusinessAttraction(cityA) * calcCityBusinessAttraction(cityB)
    );

    const tourismDecay = Math.max(
        ROUTE_CONSTANTS.TOURISM_FLOOR,
        1 - Math.exp(-distance / ROUTE_CONSTANTS.TOURISM_DECAY)
    );
    const businessDecay = Math.max(
        ROUTE_CONSTANTS.BUSINESS_FLOOR,
        1 - Math.exp(-distance / ROUTE_CONSTANTS.BUSINESS_DECAY)
    );

    const tourism = tourismBase * tourismDecay * ROUTE_CONSTANTS.K_TOURISM;
    const business = businessBase * businessDecay * ROUTE_CONSTANTS.K_BUSINESS;

    return {
        distance: distance,
        tourism: tourism,
        business: business,
        total: tourism + business
    };
}

// ==================== 基准票价算法 ====================
//
// 依据：民航局 2014 年《关于进一步完善民航国内航空运输价格政策
// 有关问题的通知》
//
//   普通航线：基准票价 = LOG(150, 距离 × 0.6) × 距离 × 1.1
//   高原航线：基准票价 = LOG(150, 距离 × 0.6) × 距离 × 1.3
//
//   LOG(150, x) 是以 150 为底的对数
//   高原航线判定：起降机场中任一端海拔超过 2000 米
//   最小计价单位：10 元，四舍五入

const AIRFARE_CONSTANTS = {
    LOG_BASE: 150,
    DISTANCE_FACTOR: 0.6,
    NORMAL_COEFF: 1.1,
    HIGHLAND_COEFF: 1.3,
    ROUND_UNIT: 10
};

function calcBaseFare(iataA, iataB) {
    const a = AIRPORT_GCJ.find(function (x) { return x.iata === iataA; });
    const b = AIRPORT_GCJ.find(function (x) { return x.iata === iataB; });

    if (!a || !b) return 0;

    const distance = calcDistanceKm(a.lat, a.lng, b.lat, b.lng);

    const isHighlandRoute =
        a.isPlateau || a.isHighPlateau ||
        b.isPlateau || b.isHighPlateau;

    const coeff = isHighlandRoute
        ? AIRFARE_CONSTANTS.HIGHLAND_COEFF
        : AIRFARE_CONSTANTS.NORMAL_COEFF;

    const x = distance * AIRFARE_CONSTANTS.DISTANCE_FACTOR;
    const logVal = Math.log(x) / Math.log(AIRFARE_CONSTANTS.LOG_BASE);

    const fare = logVal * distance * coeff;

    return Math.round(fare / AIRFARE_CONSTANTS.ROUND_UNIT) * AIRFARE_CONSTANTS.ROUND_UNIT;
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
        airportIndex: calcAirportIndex(a)
    };
});

// ==================== 启动页背景航线 ====================

const DEMO_ROUTES = [
    [0, 1],
    [2, 3],
    [6, 5],
    [7, 8]
];
