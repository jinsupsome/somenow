/*
 * Somenow v0.3 — 새 탭 로직
 *
 * 1) 오늘 날짜로 도시 1개를 정한다. 같은 날이면 항상 같은 도시.
 * 2) 그 도시 사진 1장을 Unsplash에서 받아 chrome.storage.local 에 저장한다.
 *    같은 날 다시 새 탭을 열면 API를 호출하지 않고 저장된 것을 쓴다.
 * 3) 실패하거나 오프라인이면 마지막으로 성공한 사진을 쓴다. 그것도 없으면 단색 배경.
 * 4) 출발지는 브라우저 시간대로 추정하고 설정에서 바꿀 수 있다.
 */

(function () {
  "use strict";

  var CITIES_URL = "data/cities.json";
  var UTM = "?utm_source=somenow&utm_medium=referral";

  // 저장 키
  //  TODAY_KEY      : 오늘 것(날짜가 바뀌면 무효)
  //  LAST_KEY       : 마지막으로 성공한 사진 정보(오프라인 대비)
  //  LAST_BYTES_KEY : 그 사진의 실제 그림 데이터(오프라인 + 즉시 표시)
  var TODAY_KEY = "somenow_today";
  var LAST_KEY = "somenow_last_photo";
  var LAST_BYTES_KEY = "somenow_last_bytes";
  var OVERRIDE_KEY = "somenow_city_override";   // 셔플로 고른 도시(당일 한정)
  var LIMIT_KEY = "somenow_api_pause";          // Unsplash 요청 한도에 걸린 시각
  var PREFETCH_KEY = "somenow_prefetch_at";     // 마지막 미리받기 시각
  var ORIGIN_KEY = "somenow_origin";            // 출발 도시 코드
  var POOL_KEY = "somenow_pool";                // 지금 도시의 검색 결과 12장(같은 도시 다른 사진 순환용)

  // 사진 URL 폭은 정해진 값으로만 만든다. 창 크기가 조금 달라졌다고
  // 매번 새 주소가 되면 브라우저 캐시가 빗나가 사진을 다시 받는다.
  var WIDTH_STEPS = [1280, 1600, 1920, 2560];
  var OFFLINE_W_MAX = 1920;                     // 저장본 최대 폭(너무 크면 저장 용량을 넘는다)
  var OFFLINE_MAX_BYTES = 2 * 1024 * 1024;      // 이보다 크면 저장하지 않는다

  var FETCH_TIMEOUT_MS = 8000;

  /*
   * 출발 도시. 트립닷컴 도시 코드와 IANA 시간대를 함께 갖는다.
   * 처음 한 번 브라우저 시간대로 추정하고, 그 뒤로는 설정에서 고른 값을 쓴다.
   */
  var ORIGINS = [
    { code: "SEL", ko: "서울",         tzid: "Asia/Seoul", lat: 37.55, lon: 126.99 },
    { code: "PUS", ko: "부산",         tzid: "Asia/Seoul", lat: 35.18, lon: 129.08 },
    { code: "TYO", ko: "도쿄",         tzid: "Asia/Tokyo", lat: 35.68, lon: 139.76 },
    { code: "OSA", ko: "오사카",       tzid: "Asia/Tokyo", lat: 34.69, lon: 135.5 },
    { code: "TPE", ko: "타이베이",     tzid: "Asia/Taipei", lat: 25.03, lon: 121.57 },
    { code: "HKG", ko: "홍콩",         tzid: "Asia/Hong_Kong", lat: 22.32, lon: 114.17 },
    { code: "SIN", ko: "싱가포르",     tzid: "Asia/Singapore", lat: 1.35, lon: 103.82 },
    { code: "BKK", ko: "방콕",         tzid: "Asia/Bangkok", lat: 13.76, lon: 100.5 },
    { code: "SGN", ko: "호치민",       tzid: "Asia/Ho_Chi_Minh", lat: 10.82, lon: 106.63 },
    { code: "BJS", ko: "베이징",       tzid: "Asia/Shanghai", lat: 39.9, lon: 116.4 },
    { code: "SHA", ko: "상하이",       tzid: "Asia/Shanghai", lat: 31.23, lon: 121.47 },
    { code: "MNL", ko: "마닐라",       tzid: "Asia/Manila", lat: 14.6, lon: 120.98 },
    { code: "KUL", ko: "쿠알라룸푸르", tzid: "Asia/Kuala_Lumpur", lat: 3.14, lon: 101.69 },
    { code: "DEL", ko: "델리",         tzid: "Asia/Kolkata", lat: 28.61, lon: 77.21 },
    { code: "DXB", ko: "두바이",       tzid: "Asia/Dubai", lat: 25.2, lon: 55.27 },
    { code: "IST", ko: "이스탄불",     tzid: "Europe/Istanbul", lat: 41.01, lon: 28.98 },
    { code: "LON", ko: "런던",         tzid: "Europe/London", lat: 51.51, lon: -0.13 },
    { code: "PAR", ko: "파리",         tzid: "Europe/Paris", lat: 48.86, lon: 2.35 },
    { code: "FRA", ko: "프랑크푸르트", tzid: "Europe/Berlin", lat: 50.11, lon: 8.68 },
    { code: "AMS", ko: "암스테르담",   tzid: "Europe/Amsterdam", lat: 52.37, lon: 4.9 },
    { code: "MAD", ko: "마드리드",     tzid: "Europe/Madrid", lat: 40.42, lon: -3.7 },
    { code: "ROM", ko: "로마",         tzid: "Europe/Rome", lat: 41.9, lon: 12.5 },
    { code: "NYC", ko: "뉴욕",         tzid: "America/New_York", lat: 40.71, lon: -74.01 },
    { code: "CHI", ko: "시카고",       tzid: "America/Chicago", lat: 41.88, lon: -87.63 },
    { code: "LAX", ko: "로스앤젤레스", tzid: "America/Los_Angeles", lat: 34.05, lon: -118.24 },
    { code: "SFO", ko: "샌프란시스코", tzid: "America/Los_Angeles", lat: 37.77, lon: -122.42 },
    { code: "YTO", ko: "토론토",       tzid: "America/Toronto", lat: 43.65, lon: -79.38 },
    { code: "YVR", ko: "밴쿠버",       tzid: "America/Vancouver", lat: 49.28, lon: -123.12 },
    { code: "SYD", ko: "시드니",       tzid: "Australia/Sydney", lat: -33.87, lon: 151.21 },
    { code: "MEL", ko: "멜버른",       tzid: "Australia/Melbourne", lat: -37.81, lon: 144.96 },
    { code: "AKL", ko: "오클랜드",     tzid: "Pacific/Auckland", lat: -36.85, lon: 174.76 }
  ];
  var DEFAULT_ORIGIN = "SEL";

  var el = {
    photo: document.getElementById("photo"),
    photoB: document.getElementById("photoB"),
    place: document.querySelector(".place"),
    city: document.getElementById("city"),
    cityEn: document.getElementById("cityEn"),
    tagline: document.getElementById("tagline"),
    meta: document.getElementById("cityMeta"),
    btn: document.getElementById("flightBtn"),
    credit: document.getElementById("credit"),
    creditAuthor: document.getElementById("creditAuthor"),
    creditUnsplash: document.getElementById("creditUnsplash")
  };

  // 화면에 지금 떠 있는 도시와 전체 목록. 셔플·위시리스트가 함께 쓴다.
  var allCities = null;
  var curDate = null;
  var currentCity = null;
  var origin = DEFAULT_ORIGIN;
  var changeCbs = [];

  var shownSrc = null;        // 지금 화면에 그려져 있는 사진 주소
  var nextCity = null;        // 다음 셔플에서 보여줄 도시(미리 받아 둔다)
  var PREFETCH_MAX = 8;       // 오늘 받아 둔 사진이 이만큼 쌓이면 미리받기를 멈춘다
  var TEXT_WAIT_FIRST_MS = 800;   // 첫 화면: 이만큼 기다렸다가 안 오면 글자만 먼저
  var TEXT_WAIT_SWAP_MS = 6000;   // 도시를 바꿀 때: 사진이 준비될 때까지 이전 화면을 유지
  var PREFETCH_GAP_MS = 5 * 60 * 1000;   // 미리받기는 5분에 한 번까지만
  var ROTATE_MS = 40 * 1000;   // 탭을 열어둔 동안 같은 도시의 다른 사진으로 넘어가는 간격
  var ROTATE_MAX = 8;          // 한 탭에서 이만큼 돌면 멈춘다(방치된 탭이 전력을 계속 쓰지 않게)
  var COOLDOWN_MS = 30 * 60 * 1000;      // 요청 한도에 걸리면 30분 쉰다
  var DEFAULT_BG = "#14202b";     // 사진이 없을 때 배경색
  var layers = null;          // 겹쳐 쓰는 사진 두 장
  var active = 0;

  function notifyChange() {
    for (var i = 0; i < changeCbs.length; i++) {
      try { changeCbs[i](currentCity); } catch (e) { /* 구독자 오류는 무시 */ }
    }
  }

  /* ---------- 날짜 · 도시 선택 ---------- */

  // 로컬 기준 YYYY-MM-DD
  function todayKey(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  // 로컬 날짜를 하루 단위 정수로. 하루에 정확히 1씩 증가한다.
  function dayNumber(d) {
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  }

  // 순차 회전. 출발지와 같은 도시는 건너뛴다(도쿄에서 도쿄행을 권할 수는 없다).
  function pickCity(cities, d) {
    var n = ((dayNumber(d) % cities.length) + cities.length) % cities.length;
    for (var i = 0; i < cities.length; i++) {
      var c = cities[(n + i) % cities.length];
      if (c.iata !== origin) return c;
    }
    return cities[n];
  }

  function cityByIata(cities, iata) {
    for (var i = 0; i < cities.length; i++) {
      if (cities[i].iata === iata) return cities[i];
    }
    return null;
  }

  /* ---------- 출발지 ---------- */

  function originByCode(code) {
    for (var i = 0; i < ORIGINS.length; i++) {
      if (ORIGINS[i].code === code) return ORIGINS[i];
    }
    return null;
  }

  // 브라우저 시간대로 출발지를 추정한다. 모르면 서울.
  function guessOrigin() {
    var tzid = null;
    try { tzid = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { tzid = null; }
    if (!tzid) return DEFAULT_ORIGIN;
    for (var i = 0; i < ORIGINS.length; i++) {
      if (ORIGINS[i].tzid === tzid) return ORIGINS[i].code;
    }
    return DEFAULT_ORIGIN;
  }

  /* ---------- 시차 ---------- */

  /*
   * 어떤 시간대가 지금 UTC와 몇 분 차이인지 구한다.
   * 시간대 이름(Asia/Tokyo)으로 계산하므로 서머타임이 자동으로 반영된다.
   */
  function tzOffsetMinutes(tzid, date) {
    try {
      var dtf = new Intl.DateTimeFormat("en-US", {
        timeZone: tzid, hour12: false,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit"
      });
      var p = {};
      dtf.formatToParts(date).forEach(function (x) { p[x.type] = x.value; });
      var asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
      return Math.round((asUTC - date.getTime()) / 60000);
    } catch (e) { return null; }
  }

  /* ---------- 항공권 링크 ---------- */

  /*
   * 버튼 링크는 이 함수 한 곳에서만 만든다.
   * 나중에 제휴 링크(트립닷컴·스카이스캐너·아고다)로 바꿀 때 여기만 고치면 되고,
   * 호출부(renderCity)는 손대지 않는다.
   *
   * 트립닷컴 제휴 링크 (2026-08-28 적용).
   * Allianceid·SID 는 제휴 계정 식별자로, 링크에 노출되는 것이 정상 용도다.
   * cities.json 의 iata 는 트립닷컴 도시 코드(TYO·PAR·NYC 등)와 같은 체계다.
   *
   * 예) 구글 항공권으로 되돌릴 때:
   *   var q = "Flights to " + city.name_en + " from " + origin;
   *   return "https://www.google.com/travel/flights?q=" + encodeURIComponent(q);
   * 예) 스카이스캐너로 되돌릴 때(봇 검사가 떠서 지금은 쓰지 않는다):
   *   return "https://www.skyscanner.co.kr/transport/flights/"
   *        + origin.toLowerCase() + "/" + String(city.iata).toLowerCase() + "/";
   */
  function buildFlightUrl(city) {
    var from = originByCode(origin) || originByCode(DEFAULT_ORIGIN);
    var slug = from.code + "-to-" + String(city.name_en).replace(/\s+/g, "-");
    var code = String(city.iata).toUpperCase();
    return "https://kr.trip.com/flights/" + slug + "/tickets-" + from.code + "-" + code
      + "?flighttype=S&dcity=" + from.code + "&acity=" + code
      + "&Allianceid=10331252&SID=329754573&trip_sub1=&trip_sub3=D19549133";
  }

  /*
   * 호텔 검색 링크 (v0.5, 2026-08-31).
   * buildFlightUrl 과 같은 원칙 — 호텔 링크는 이 함수 한 곳에서만 만든다.
   * 파트너를 바꿀 때 여기 템플릿만 고치면 카드 안 모든 링크가 따라간다.
   *
   * 트립닷컴 숙소 검색은 도시 코드(IATA)가 아니라 자체 cityId 를 쓴다.
   * cities.json 의 trip_city_id 가 그것이고, 지역 이름은 searchWord 로 좁힌다
   * (searchWord 만 있고 cityId 가 없으면 직전 검색이 그대로 떠서 엉뚱한 도시가 나온다 — 실제 확인).
   *
   * 예) 아고다로 바꿀 때:
   *   return "https://www.agoda.com/ko-kr/search?city=" + city.agoda_city_id + "&cid=<제휴ID>";
   */
  function buildHotelUrl(city, area) {
    if (!city || !city.trip_city_id) return null;
    var u = "https://kr.trip.com/hotels/list?cityId=" + city.trip_city_id;
    var t = area && area.trip;
    if (t && t.id) {
      // 지역까지 걸린 검색. searchValue 가 없으면 필터가 체크되지 않는다(실제 확인).
      var sv = t.t === "Z"
        ? "8|" + t.id + "*8*" + t.id
        : "13|" + t.id + "*13*" + t.lat + "|" + t.lon + "|" + t.kw + "|" + t.id + "|1";
      u += "&searchType=" + t.t + "&optionId=" + t.id
         + "&searchValue=" + encodeURIComponent(sv);
    }
    // trip 정보가 없는 지역은 도시 전체 검색으로 떨어진다(엉뚱한 결과보다 낫다).
    return u + "&curr=KRW&locale=ko-KR"
             + "&allianceid=10331252&sid=329754573&trip_sub3=D19549133";
  }

  /* ---------- 도시 정보 한 줄 ---------- */

  // 분 -> "2시간 20분". 딱 떨어지면 "6시간".
  // 대권거리로 비행시간을 추정한다. 인천 외 출발지는 정확한 직항 데이터가 없어서
  // "비행 약 X시간"으로 보여준다(경유·바람에 따라 실제와 다를 수 있다).
  function haversineKm(lat1, lon1, lat2, lon2) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
          + Math.cos(lat1 * rad) * Math.cos(lat2 * rad)
          * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function estFlyText(o, city) {
    if (!o || typeof o.lat !== "number" || typeof city.lat !== "number") return null;
    var km = haversineKm(o.lat, o.lon, city.lat, city.lon);
    if (km < 80) return null;                      // 같은 생활권이면 표시하지 않는다
    var min = Math.round((km / 780) * 60 + 36);    // 순항 780km/h + 이착륙 여유
    min = Math.round(min / 10) * 10;               // 추정값이므로 10분 단위로 뭉갠다
    var h = Math.floor(min / 60), m = min % 60;
    return "비행 약 " + (m ? h + "시간 " + m + "분" : h + "시간");
  }

  function flyText(min) {
    if (typeof min !== "number" || min <= 0) return null;
    var h = Math.floor(min / 60);
    var m = min % 60;
    return "직항 " + (m ? h + "시간 " + m + "분" : h + "시간");
  }

  // 설정에서 고른 출발지와 목적지의 실제 시차. 서머타임까지 반영된다.
  // (예전에는 브라우저 시간대 기준이라 출발지를 바꿔도 시차가 안 바뀌었다.)
  function tzText(city) {
    if (!city.tzid) return null;
    var now = new Date();
    var there = tzOffsetMinutes(city.tzid, now);
    if (there === null) return null;
    var o = originByCode(origin);
    var here = (o && o.tzid) ? tzOffsetMinutes(o.tzid, now) : null;
    if (here === null) here = -now.getTimezoneOffset();
    var diff = there - here;
    if (diff === 0) return "시차 없음";
    var sign = diff > 0 ? "+" : "-";
    var abs = Math.abs(diff);
    var h = Math.floor(abs / 60);
    var m = abs % 60;
    return "시차 " + sign + (h ? h + "시간" : "") + (m ? (h ? " " : "") + m + "분" : "");
  }

  function renderMeta(city) {
    var parts = [];
    // 서울 출발은 정확한 인천 직항 데이터, 그 외 출발지는 대권거리 추정값.
    if (origin === "SEL") {
      var f = flyText(city.fly_min_icn);
      if (f) parts.push(f);
    } else {
      var ef = estFlyText(originByCode(origin), city);
      if (ef) {
        // 정기 직항이 확인된 노선(direct_from)만 "직항"으로 표기.
        // 목록에 없다고 직항이 없다고 단정하지는 않는다(중립 표기 "비행 약").
        var direct = city.direct_from && city.direct_from.indexOf(origin) !== -1;
        parts.push(direct ? ef.replace("비행 약", "직항 약") : ef);
      }
    }
    var t = tzText(city);
    if (t) parts.push(t);
    if (city.best) parts.push("여행 적기 " + city.best);

    if (!parts.length) { el.meta.hidden = true; el.meta.textContent = ""; return; }
    el.meta.textContent = parts.join("  ·  ");
    el.meta.hidden = false;
  }

  function renderCity(city) {
    el.city.textContent = city.name_ko;
    if (el.cityEn) el.cityEn.textContent = String(city.name_en || "").toUpperCase();
    el.tagline.textContent = city.tagline;
    renderMeta(city);
    el.btn.href = buildFlightUrl(city);
    document.title = city.name_ko + " · Somenow";
  }

  /* ---------- 사진 그리기 ---------- */

  // 필요한 폭보다 크거나 같은 첫 계단값. 그보다 크면 가장 큰 값.
  function stepWidth(px) {
    for (var i = 0; i < WIDTH_STEPS.length; i++) {
      if (px <= WIDTH_STEPS[i]) return WIDTH_STEPS[i];
    }
    return WIDTH_STEPS[WIDTH_STEPS.length - 1];
  }

  function neededWidth() {
    return stepWidth(Math.ceil(window.innerWidth * (window.devicePixelRatio || 1)));
  }

  function rawSrc(raw, w) {
    var sep = raw.indexOf("?") === -1 ? "?" : "&";
    return raw + sep + "auto=format&fit=crop&fm=jpg&q=80&w=" + w;
  }

  function photoSrc(photo) {
    if (!photo) return null;
    if (photo.dataUrl) return photo.dataUrl;          // 저장해 둔 그림
    if (photo.raw) return rawSrc(photo.raw, neededWidth());
    return photo.url || null;
  }

  /*
   * 사진 두 장을 겹쳐 두고 새 사진을 위에 띄운다.
   * 한 장만 쓰면 배경 교체가 순간 잘라내기가 되어 툭 끊겨 보인다.
   * 아래 장은 새 사진이 다 나타난 뒤에 내린다.
   */
  function paint(src, color, instant) {
    if (!layers) layers = [el.photo, el.photoB];
    var cur = layers[active];
    var next = layers[1 - active];

    if (color) next.style.backgroundColor = color;
    next.style.backgroundImage = src
      ? 'url("' + src + '")'
      : "linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(0,0,0,0.55) 100%)";
    next.style.zIndex = "2";
    cur.style.zIndex = "1";
    // 첫 화면의 저장본은 이미 손안에 있으므로 길게 페이드하지 않는다(새로고침 체감 지연의 주범).
    // 도시 전환 크로스페이드는 기존 520ms 그대로.
    next.classList.toggle("is-instant", !!instant);
    // 방금 넣은 배경이 적용된 뒤에 나타나게 한다(같은 프레임에 바꾸면 전환이 생략된다)
    void next.offsetWidth;
    next.classList.add("is-ready");
    active = 1 - active;

    // 아래 장은 새 사진이 다 나타난 뒤에 내린다.
    // 단, 그 사이 이 장이 다시 위로 올라왔다면(연달아 바뀐 경우) 건드리지 않는다.
    // 이 확인이 없으면 새로 띄운 사진을 스스로 지워버린다.
    window.setTimeout(function () {
      if (layers[active] !== cur) cur.classList.remove("is-ready");
    }, 620);

    if (src) shownSrc = src;
    return true;
  }

  // 같은 사진의 더 큰 판으로 조용히 갈아끼운다. 그림이 같으므로 전환 효과를 주면
  // 오히려 "사진이 또 바뀌었다"고 보인다.
  function replaceInPlace(src) {
    if (!layers) layers = [el.photo, el.photoB];
    layers[active].style.backgroundImage = 'url("' + src + '")';
    shownSrc = src;
  }

  // 이미지가 실제로 로드된 뒤에만 배경을 바꾼다.
  // same=true 면 이미 같은 사진이 떠 있는 것이므로 페이드 없이 바꾼다.
  function applyPhoto(photo, same) {
    var src = photoSrc(photo);
    if (!src) return Promise.resolve(false);

    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        if (same) replaceInPlace(src);
        else paint(src, photo && photo.color);
        renderCredit(photo);
        resolve(true);
      };
      img.onerror = function () { resolve(false); };
      img.src = src;
    });
  }

  // Unsplash 표기 요건: 사진작가 이름 + 작가 페이지 링크 + Unsplash 링크 (둘 다 utm 포함)
  function renderCredit(photo) {
    if (!photo || !photo.authorName) return;
    el.creditAuthor.textContent = photo.authorName;
    el.creditAuthor.href = photo.authorLink
      ? photo.authorLink + UTM
      : "https://unsplash.com/" + UTM;
    el.creditUnsplash.href = "https://unsplash.com/" + UTM;
    el.credit.hidden = false;
  }

  /* ---------- 저장소 ---------- */

  function hasStorage() {
    return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
  }

  function storageGet(keys) {
    if (!hasStorage()) return Promise.resolve({});
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get(keys, function (res) {
          if (chrome.runtime && chrome.runtime.lastError) return resolve({});
          resolve(res || {});
        });
      } catch (e) { resolve({}); }
    });
  }

  function storageSet(obj) {
    if (!hasStorage()) return Promise.resolve();
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.set(obj, function () {
          if (chrome.runtime && chrome.runtime.lastError) { /* 무시 */ }
          resolve();
        });
      } catch (e) { resolve(); }
    });
  }

  /* ---------- Unsplash ---------- */

  function accessKey() {
    if (typeof SOMENOW_CONFIG === "undefined") return null;   // config.js 없음
    var k = SOMENOW_CONFIG && SOMENOW_CONFIG.UNSPLASH_ACCESS_KEY;
    if (!k || k.indexOf("YOUR_UNSPLASH") === 0) return null;  // 자리표시자 그대로
    return k;
  }

  function toPhoto(p) {
    if (!p || !p.urls) return null;
    return {
      raw: p.urls.raw || null,
      url: p.urls.regular || p.urls.full || null,
      color: p.color || null,
      authorName: (p.user && p.user.name) || "Unsplash",
      authorLink: (p.user && p.user.links && p.user.links.html) || null,
      downloadLocation: (p.links && p.links.download_location) || null
    };
  }

  function askUnsplash(url, key) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, FETCH_TIMEOUT_MS);
    return fetch(url, {
      headers: {
        // 키는 헤더로 보낸다. 쿼리스트링에 넣으면 로그에 남는다.
        "Authorization": "Client-ID " + key,
        "Accept-Version": "v1"
      },
      signal: ctrl.signal
    })
      .then(function (res) {
        var left = res.headers.get("X-Ratelimit-Remaining");
        if (res.status === 403 || (left !== null && Number(left) <= 0)) {
          var o = {}; o[LIMIT_KEY] = Date.now();
          storageSet(o);
          console.warn("[Somenow] Unsplash 시간당 요청 한도에 걸렸다. 30분 뒤에 다시 시도한다.");
          throw new Error("요청 한도 초과");
        }
        if (!res.ok) throw new Error("Unsplash " + res.status);
        return res.json();
      })
      .finally(function () { clearTimeout(timer); });
  }

  /*
   * 검색 API의 관련도 상위 결과 중에서 고른다.
   * random API 는 검색어와 상관없는 사진이 섞여 나오는 일이 잦았다.
   * 상위 12장 안에서만 무작위로 골라 "그 도시 사진"에서 벗어나지 않게 한다.
   */
  function fetchPhoto(query, key) {
    var url = "https://api.unsplash.com/search/photos"
      + "?query=" + encodeURIComponent(query)
      + "&orientation=landscape"
      + "&content_filter=high"
      + "&order_by=relevant"
      + "&per_page=12";

    return askUnsplash(url, key).then(function (d) {
      var list = (d && d.results) || [];
      if (!list.length) throw new Error("검색 결과 없음: " + query);
      var pool = [];
      for (var i = 0; i < list.length; i++) {
        var t = toPhoto(list[i]);
        if (t) pool.push(t);
      }
      if (!pool.length) throw new Error("Unsplash: 사진 없음");
      var at = Math.floor(Math.random() * pool.length);
      var p = pool[at];
      p._pool = pool;                  // 같은 도시 다른 사진 순환용(저장 전에 떼어낸다)
      p._poolIdx = at;
      return p;
    });
  }

  // Unsplash 가이드라인: 배경으로 쓰는 것은 "다운로드"에 해당한다.
  // 하루에 사진을 새로 받을 때 한 번만 호출한다(새 탭마다가 아니다).
  function pingDownload(photo, key) {
    if (!photo || !photo.downloadLocation) return;
    try {
      fetch(photo.downloadLocation, {
        headers: { "Authorization": "Client-ID " + key }
      }).catch(function () {});
    } catch (e) { /* 표기와 무관하므로 실패해도 무시 */ }
  }

  /*
   * 사진을 주소가 아니라 그림 데이터 자체로 한 장 저장한다.
   * 쓰임 두 가지: ① 인터넷이 끊겨도 배경이 뜬다 ② 다음 새 탭에서 기다림 없이 바로 그린다.
   */
  function cacheBytes(photo, iata) {
    if (!photo || !photo.raw) return;
    var w = Math.min(OFFLINE_W_MAX, neededWidth());
    var src = rawSrc(photo.raw, w);
    try {
      fetch(src)
        .then(function (r) { if (!r.ok) throw new Error("bytes " + r.status); return r.blob(); })
        .then(function (blob) {
          if (blob.size > OFFLINE_MAX_BYTES) throw new Error("사진이 너무 큼");
          return new Promise(function (resolve, reject) {
            var fr = new FileReader();
            fr.onload = function () { resolve(fr.result); };
            fr.onerror = function () { reject(new Error("읽기 실패")); };
            fr.readAsDataURL(blob);
          });
        })
        .then(function (dataUrl) {
          var o = {};
          o[LAST_BYTES_KEY] = {
            iata: iata,
            w: w,
            dataUrl: dataUrl,
            color: photo.color || null,
            authorName: photo.authorName,
            authorLink: photo.authorLink
          };
          return storageSet(o);
        })
        .catch(function (e) {
          console.info("[Somenow] 사진 저장을 건너뛴다:", e && e.message);
        });
    } catch (e) { /* 화면과 무관하므로 무시 */ }
  }

  /* ---------- 진행 ---------- */

  function loadCities() {
    return fetch(CITIES_URL).then(function (r) {
      if (!r.ok) throw new Error("cities.json " + r.status);
      return r.json();
    });
  }

  /*
   * 도시 하나를 화면에 띄운다(글자·버튼·사진).
   * 사진은 "오늘 + 이 도시" 단위로 캐시한다. 셔플로 왔다 갔다 해도
   * 같은 날 같은 도시는 API를 다시 부르지 않는다.
   * 저장 형식: TODAY_KEY = { date, photos: { TYO: photo, PAR: photo, ... } }
   */
  function showCity(city, dateStr, store) {
    var pre = store ? Promise.resolve(store)
                    : storageGet([TODAY_KEY, LAST_KEY, LAST_BYTES_KEY, LIMIT_KEY, PREFETCH_KEY]);

    /*
     * 글자는 사진이 준비된 순간에 함께 바꾼다.
     *  - 첫 화면: 사진을 0.8초까지만 기다리고, 안 오면 글자와 배경색만 먼저 보여준다.
     *  - 도시를 바꿀 때: 새 사진이 준비될 때까지 이전 화면(사진+글자)을 그대로 둔다.
     *    글자만 먼저 바꾸면 "베이징인데 취리히 사진"처럼 도시와 사진이 어긋나 보인다.
     */
    var hadPhoto = !!shownSrc;
    var revealed = false;
    var painted = false;
    var timer = null;

    function reveal() {
      if (revealed) return;
      revealed = true;
      startRotation();                  // 머무는 탭에서만 같은 도시의 다른 사진으로 천천히 넘어간다
      if (timer) { window.clearTimeout(timer); timer = null; }
      renderCity(city);
      currentCity = city;
      notifyChange();
      if (el.place) {
        el.place.classList.remove("is-shown");
        void el.place.offsetWidth;          // 나타나는 동작을 다시 재생시킨다
        el.place.classList.add("is-shown");
      }
    }

    // 이 도시 사진을 끝내 못 구했을 때: 다른 도시 사진을 쓰지 않고 배경색으로 간다.
    function giveUp(color) {
      if (!painted) {
        paint(null, color || DEFAULT_BG);
        el.credit.hidden = true;            // 남의 사진 작가 표기가 남지 않게
        painted = true;
      }
      reveal();
    }

    if (!hadPhoto && el.place) el.place.classList.remove("is-shown");
    timer = window.setTimeout(function () {
      if (hadPhoto) giveUp(null);           // 오래 기다렸는데도 못 받았으면 정리한다
      else reveal();
    }, hadPhoto ? TEXT_WAIT_SWAP_MS : TEXT_WAIT_FIRST_MS);

    return pre.then(function (s) {
      var today = s[TODAY_KEY];
      var lastPhoto = s[LAST_KEY] || null;
      var lastBytes = s[LAST_BYTES_KEY] || null;
      var pausedAt = s[LIMIT_KEY] || 0;
      var photos = (today && today.date === dateStr && today.photos) ? today.photos : {};
      var mine = photos[city.iata] || null;

      // 0) 이 도시의 저장본이 있으면 기다릴 것 없이 사진과 글자를 함께 바꾼다
      var savedW = 0;
      if (lastBytes && lastBytes.iata === city.iata && lastBytes.dataUrl) {
        paint(lastBytes.dataUrl, lastBytes.color, !hadPhoto);
        renderCredit(lastBytes);
        painted = true;
        savedW = lastBytes.w || 1280;      // 폭을 기록하기 전에 저장된 것은 1280으로 본다
        reveal();
      }

      // 이 도시 것만 폴백으로 쓴다. 다른 도시 사진을 띄우면 도시명과 어긋난다.
      function fallback() {
        var same = (lastPhoto && lastPhoto.iata === city.iata) ? lastPhoto : null;
        var sameBytes = (lastBytes && lastBytes.iata === city.iata) ? lastBytes : null;
        return applyPhoto(same).then(function (ok) {
          if (ok) return true;
          return applyPhoto(sameBytes);
        }).then(function (ok) {
          if (!ok) giveUp((mine && mine.color) || null);
          else reveal();
          return ok;
        });
      }

      // 1) 오늘 이 도시 사진이 이미 있으면 그대로 쓴다(미리 받아 둔 것 포함)
      if (mine) {
        // 저장본이 이 화면에 충분히 크면 더 받지 않는다. 사진이 두 번 바뀌는 것처럼 보이지 않는다.
        if (painted && savedW >= neededWidth()) {
          planNext(photos, dateStr, s);
          return null;
        }
        return applyPhoto(mine, painted).then(function (ok) {
          if (!ok) return fallback();
          reveal();
          var key0 = accessKey();
          if (key0 && !mine.pinged) {          // 화면에 쓴 순간에만 다운로드 핑
            pingDownload(mine, key0);
            mine.pinged = true;
            photos[city.iata] = mine;
            var sv = {}; sv[TODAY_KEY] = { date: dateStr, photos: photos };
            storageSet(sv);
          }
          // 저장본이 없거나, 있어도 지금 화면보다 작으면 다시 저장한다
          if (!painted || savedW < neededWidth()) cacheBytes(mine, city.iata);
          planNext(photos, dateStr, s);
        });
      }

      // 2) 키가 없거나 요청 한도에 걸린 동안에는 부르지 않는다
      var key = accessKey();
      var paused = pausedAt && (Date.now() - pausedAt) < COOLDOWN_MS;
      if (!key || paused) {
        if (!key) console.info("[Somenow] config.js 가 없어 단색 배경으로 표시한다.");
        return fallback();
      }

      // 3) 새로 받는다.
      return fetchPhoto(city.unsplash_query, key)
        .then(function (photo) {
          photo.iata = city.iata;            // 어느 도시 사진인지 남긴다(폴백 판단용)
          return applyPhoto(photo, painted).then(function (ok) {
            if (!ok) throw new Error("이미지 로드 실패");
            reveal();
            pingDownload(photo, key);
            photo.pinged = true;
            cacheBytes(photo, city.iata);
            var save = {};
            if (photo._pool) {
              photo._pool[photo._poolIdx].pinged = true;
              save[POOL_KEY] = { date: dateStr, iata: city.iata,
                                 idx: photo._poolIdx, items: photo._pool };
              delete photo._pool;      // 오늘/마지막 기록까지 12장을 싣지 않는다
              delete photo._poolIdx;
            }
            photos[city.iata] = photo;
            save[TODAY_KEY] = { date: dateStr, photos: photos };
            save[LAST_KEY] = photo;
            return storageSet(save).then(function () { planNext(photos, dateStr, s); });
          });
        })
        .catch(function (err) {
          console.warn("[Somenow] 사진을 받지 못했다:", err && err.message);
          return fallback();
        });
    });
  }

  /*
   * 다음에 셔플로 보여줄 도시를 미리 정해 사진까지 받아 둔다.
   * 셔플을 누른 뒤에 받기 시작하면 사진이 한 박자 늦게 바뀌기 때문이다.
   * 새 탭 한 번에 최대 1개만, 오늘 받아 둔 사진이 PREFETCH_MAX 개가 되면 멈춘다
   * (Unsplash 무료 키는 시간당 50회 제한).
   */
  function planNext(photos, dateStr, store) {
    var cities = allCities || [];
    if (cities.length < 2 || !currentCity) return;

    var pick = currentCity;
    var guard = 0;
    while ((pick.iata === currentCity.iata || pick.iata === origin) && guard++ < 50) {
      pick = cities[Math.floor(Math.random() * cities.length)];
    }
    nextCity = pick;

    var have = photos[pick.iata];
    if (have) { warmImage(have); return; }          // 이미 있으면 브라우저 캐시만 데운다

    var key = accessKey();
    if (!key) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (Object.keys(photos).length >= PREFETCH_MAX) return;

    var s0 = store || {};
    var pausedAt = s0[LIMIT_KEY] || 0;
    if (pausedAt && (Date.now() - pausedAt) < COOLDOWN_MS) return;   // 요청 한도 대기 중
    var lastAt = s0[PREFETCH_KEY] || 0;
    if (Date.now() - lastAt < PREFETCH_GAP_MS) return;               // 5분에 한 번까지만

    var stamp = {}; stamp[PREFETCH_KEY] = Date.now();
    storageSet(stamp);

    fetchPhoto(pick.unsplash_query, key)
      .then(function (photo) {
        photo.pinged = false;                        // 화면에 쓸 때 핑을 보낸다
        photo.iata = pick.iata;
        photos[pick.iata] = photo;
        var save = {};
        save[TODAY_KEY] = { date: dateStr, photos: photos };
        return storageSet(save).then(function () { warmImage(photo); });
      })
      .catch(function (e) {
        console.info("[Somenow] 다음 도시 미리받기 실패:", e && e.message);
      });
  }

  // 사진을 미리 내려받아 브라우저 캐시에 넣어 둔다(화면에는 안 쓴다)
  function warmImage(photo) {
    var src = photoSrc(photo);
    if (!src) return;
    var img = new Image();
    img.src = src;
  }

  /*
   * ---------- 같은 도시, 다른 사진 ----------
   * 이 화면은 빨리 지나치는 사람이 아니라 머무는 사람을 위한 것이다.
   * 탭을 열어 둔 동안 40초마다 같은 도시의 다른 컷으로 천천히 넘어가고,
   * 마지막으로 보여준 컷을 저장해 다음 새로고침이 그 컷으로 즉시 뜨게 한다
   * (새로고침마다 다른 사진이 되는 효과).
   *  - 다운로드 핑은 컷마다 하루 한 번만(요청 한도 보호)
   *  - 백그라운드 탭에서는 멈추고, 돌아오면 다시 잰다
   *  - 풀이 없으면(미리받은 도시 등) 한 번만 새로 검색해 채운다
   */
  var rotTimer = null;
  var rotCount = 0;
  var poolAskedFor = null;              // 이 탭에서 풀 검색을 이미 시도한 도시

  function stopRotation() {
    if (rotTimer) { window.clearTimeout(rotTimer); rotTimer = null; }
  }

  function startRotation() {
    stopRotation();
    rotCount = 0;
    scheduleRotation();
  }

  function scheduleRotation() {
    stopRotation();
    if (document.hidden) return;        // 돌아오면 visibilitychange 가 다시 잰다
    if (rotCount >= ROTATE_MAX) return;
    rotTimer = window.setTimeout(rotateOnce, ROTATE_MS);
  }

  function rotateOnce() {
    rotTimer = null;
    if (document.hidden || !currentCity || !curDate) return;
    var cityNow = currentCity;
    storageGet([POOL_KEY, LIMIT_KEY]).then(function (s) {
      var pool = s[POOL_KEY];
      var paused = s[LIMIT_KEY] && (Date.now() - s[LIMIT_KEY]) < COOLDOWN_MS;
      var fresh = pool && pool.date === curDate && pool.iata === cityNow.iata
                  && pool.items && pool.items.length > 1;

      // 풀이 없으면 한 번만 새로 채운다(미리받기로 온 도시 등)
      if (!fresh) {
        var key = accessKey();
        if (!key || paused || poolAskedFor === cityNow.iata) return;
        poolAskedFor = cityNow.iata;
        return fetchPhoto(cityNow.unsplash_query, key).then(function (p) {
          if (!p._pool || currentCity !== cityNow) return;
          var o = {};
          o[POOL_KEY] = { date: curDate, iata: cityNow.iata,
                          idx: p._poolIdx, items: p._pool };
          return storageSet(o).then(scheduleRotation);
        }).catch(function () { /* 못 채우면 조용히 멈춘다 */ });
      }

      var idx = (pool.idx + 1) % pool.items.length;
      var ph = pool.items[idx];
      ph.iata = pool.iata;
      return applyPhoto(ph).then(function (ok) {
        if (!ok || currentCity !== cityNow) return;
        renderCredit(ph);
        var key2 = accessKey();
        if (key2 && !ph.pinged && !paused) {   // 컷마다 하루 한 번만 핑
          pingDownload(ph, key2);
          ph.pinged = true;
        }
        pool.idx = idx;
        var o2 = {}; o2[POOL_KEY] = pool;
        storageSet(o2);
        cacheBytes(ph, pool.iata);   // 다음 새로고침은 이 컷으로 즉시 뜬다
        rotCount++;
        scheduleRotation();
      });
    });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stopRotation();
    else scheduleRotation();
  });

  // 도시를 바꾸고 당일 동안 그 도시를 유지한다. 셔플과 위시리스트가 함께 쓴다.
  function goTo(city) {
    if (!city || !curDate) return;
    var o = {};
    o[OVERRIDE_KEY] = { date: curDate, iata: city.iata };
    storageSet(o);
    showCity(city, curDate);                 // 사진 두 장을 겹쳐 넘기므로 화면이 비지 않는다
  }

  // 다른 도시 보기: 무작위로 다른 도시를 고른다
  function setupShuffle() {
    var btn = document.getElementById("shuffleBtn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var cities = allCities || [];
      if (!currentCity || cities.length < 2) return;
      var next = null;
      if (nextCity && nextCity.iata !== currentCity.iata && nextCity.iata !== origin) {
        next = nextCity;                     // 사진을 미리 받아 둔 도시
      } else {
        next = currentCity;
        var guard = 0;
        while ((next.iata === currentCity.iata || next.iata === origin) && guard++ < 50) {
          next = cities[Math.floor(Math.random() * cities.length)];
        }
      }
      nextCity = null;
      goTo(next);
    });
  }

  // 설정 패널의 출발지 선택
  function setupOriginSelect() {
    var sel = document.getElementById("optOrigin");
    if (!sel) return;
    sel.textContent = "";
    ORIGINS.forEach(function (o) {
      var op = document.createElement("option");
      op.value = o.code;
      op.textContent = o.ko;
      sel.appendChild(op);
    });
    sel.value = origin;
    sel.addEventListener("change", function () {
      origin = sel.value;
      var o = {}; o[ORIGIN_KEY] = origin;
      storageSet(o);
      if (currentCity) {
        if (currentCity.iata === origin) {          // 출발지와 같은 도시면 다른 곳으로
          var next = pickCity(allCities || [], new Date());
          goTo(next);
        } else {
          renderCity(currentCity);                  // 링크·시차·직항 표시만 다시 그린다
        }
      }
    });
  }

  function start() {
    Promise.all([
      loadCities(),
      storageGet([OVERRIDE_KEY, ORIGIN_KEY, TODAY_KEY, LAST_KEY, LAST_BYTES_KEY,
                  LIMIT_KEY, PREFETCH_KEY])
    ])
      .then(function (r) {
        var cities = r[0];
        var st = r[1];
        if (!Array.isArray(cities) || cities.length === 0) throw new Error("도시 목록이 비어 있다");

        var now = new Date();
        var dateStr = todayKey(now);
        allCities = cities;
        curDate = dateStr;
        origin = (st[ORIGIN_KEY] && originByCode(st[ORIGIN_KEY])) ? st[ORIGIN_KEY] : guessOrigin();
        if (!st[ORIGIN_KEY]) {
          var o = {}; o[ORIGIN_KEY] = origin;
          storageSet(o);                             // 추정 결과를 한 번 저장해 둔다
        }

        var ov = st[OVERRIDE_KEY];
        var city = null;
        if (ov && ov.date === dateStr) city = cityByIata(cities, ov.iata);
        if (!city) city = pickCity(cities, now);

        setupShuffle();
        setupOriginSelect();
        return showCity(city, dateStr, st);
      })
      .catch(function (err) {
        // 여기까지 오면 도시 목록도 못 읽은 것. 글자만이라도 남긴다.
        console.error("[Somenow]", err);
        if (el.place) el.place.classList.add("is-shown");
      });
  }

  /*
   * 다른 IIFE(위시리스트)가 쓰는 최소 창구.
   * 이것 말고는 서로를 참조하지 않는다. 여기가 없으면 위시리스트만 조용히 꺼진다.
   */
  window.SomenowCity = {
    current: function () { return currentCity; },
    hotelUrl: buildHotelUrl,
    goTo: function (iata) {
      var c = cityByIata(allCities || [], iata);
      if (c) goTo(c);
      return !!c;
    },
    onChange: function (cb) {
      if (typeof cb !== "function") return;
      changeCbs.push(cb);
      if (currentCity) cb(currentCity);
    }
  };

  // 무슨 일이 있어도 글자는 2.5초 안에 나온다(사진 로직이 막혀도 화면이 비지 않게)
  window.setTimeout(function () {
    if (el.place && !el.place.classList.contains("is-shown")) el.place.classList.add("is-shown");
  }, 2500);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();


/*
 * ---------- v0.2 홈 기능 ----------
 * 시계 · 구글 검색창(렌즈/AI 모드) · 앱 런처 · 바로가기(자주 방문 + 직접 추가)
 * 위의 사진 로직과 독립적으로 동작한다. 여기가 죽어도 사진·버튼은 뜬다.
 */
(function () {
  "use strict";

  var MAX_TILES = 6;
  var KEY_CUSTOM = "somenow_shortcuts";    // [{name,url}] 직접 추가한 것
  var KEY_HIDDEN = "somenow_hidden_sites"; // [url] 숨긴 자주 방문 사이트

  function $(id) { return document.getElementById(id); }

  function sGet(keys) {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get(keys, function (res) { resolve(res || {}); });
      } catch (e) { resolve({}); }
    });
  }
  function sSet(obj) {
    return new Promise(function (resolve) {
      try { chrome.storage.local.set(obj, function () { resolve(); }); }
      catch (e) { resolve(); }
    });
  }

  /* ----- 시계 ----- */
  var DAYS = ["일", "월", "화", "수", "목", "금", "토"];
  function tick() {
    var n = new Date();
    $("clockTime").textContent =
      String(n.getHours()).padStart(2, "0") + ":" + String(n.getMinutes()).padStart(2, "0");
    $("clockDate").textContent =
      (n.getMonth() + 1) + "월 " + n.getDate() + "일 " + DAYS[n.getDay()] + "요일";
  }
  tick();
  setInterval(tick, 15000);

  /* ----- 검색 ----- */
  var input = $("searchInput");
  $("searchForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var q = input.value.trim();
    if (q) location.href = "https://www.google.com/search?q=" + encodeURIComponent(q);
  });
  // AI 모드: 입력한 검색어가 있으면 그대로 AI 모드로 검색
  $("aiBtn").addEventListener("click", function (e) {
    var q = input.value.trim();
    if (q) {
      e.preventDefault();
      location.href = "https://www.google.com/search?udm=50&q=" + encodeURIComponent(q);
    }
  });

  /* ----- 앱 런처 ----- */
  var appsBtn = $("appsBtn");
  var appsPanel = $("appsPanel");
  appsBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    appsPanel.hidden = !appsPanel.hidden;
  });
  document.addEventListener("click", function (e) {
    if (!appsPanel.hidden && !appsPanel.contains(e.target)) appsPanel.hidden = true;
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { appsPanel.hidden = true; }
  });

  /* ----- 바로가기 ----- */
  var wrap = $("topSites");
  var pop = $("addPop");

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return url; }
  }
  function faviconSrc(url) {
    return "/_favicon/?pageUrl=" + encodeURIComponent(url) + "&size=64";
  }

  function tileEl(item, isCustom, state) {
    var a = document.createElement("a");
    a.className = "tile";
    a.href = item.url;
    a.title = item.url;

    var ic = document.createElement("span");
    ic.className = "tile-ic";
    var img = document.createElement("img");
    img.src = faviconSrc(item.url);
    img.alt = "";
    img.addEventListener("error", function () {
      var m = document.createElement("span");
      m.className = "tile-mono";
      m.textContent = (item.name || hostOf(item.url)).charAt(0).toUpperCase();
      ic.replaceChild(m, img);
    });
    ic.appendChild(img);

    var nm = document.createElement("span");
    nm.className = "tile-name";
    nm.textContent = item.name || hostOf(item.url);

    var x = document.createElement("button");
    x.className = "tile-x";
    x.type = "button";
    x.title = "바로가기에서 제거";
    x.textContent = "\u00d7";
    x.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (isCustom) {
        state.custom = state.custom.filter(function (c) { return c.url !== item.url; });
      } else {
        state.hidden.push(item.url);
      }
      sSet((function () {
        var o = {}; o[KEY_CUSTOM] = state.custom; o[KEY_HIDDEN] = state.hidden; return o;
      })()).then(render);
    });

    a.appendChild(ic);
    a.appendChild(nm);
    a.appendChild(x);
    return a;
  }

  function addTileEl() {
    var b = document.createElement("button");
    b.className = "tile tile-add";
    b.type = "button";
    b.title = "바로가기 추가";
    var ic = document.createElement("span");
    ic.className = "tile-ic";
    ic.textContent = "+";
    var nm = document.createElement("span");
    nm.className = "tile-name";
    nm.textContent = "추가";
    b.appendChild(ic);
    b.appendChild(nm);
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      pop.hidden = !pop.hidden;
      if (!pop.hidden) $("addName").focus();
    });
    return b;
  }

  function topSitesGet() {
    return new Promise(function (resolve) {
      try {
        if (chrome.topSites && chrome.topSites.get) {
          chrome.topSites.get(function (sites) { resolve(sites || []); });
        } else resolve([]);
      } catch (e) { resolve([]); }
    });
  }

  function render() {
    Promise.all([sGet([KEY_CUSTOM, KEY_HIDDEN]), topSitesGet()]).then(function (r) {
      var custom = Array.isArray(r[0][KEY_CUSTOM]) ? r[0][KEY_CUSTOM] : [];
      var hidden = Array.isArray(r[0][KEY_HIDDEN]) ? r[0][KEY_HIDDEN] : [];
      var state = { custom: custom, hidden: hidden };

      var seen = {};
      custom.forEach(function (c) { seen[hostOf(c.url)] = true; });

      var tiles = custom.map(function (c) { return tileEl(c, true, state); });
      r[1].forEach(function (s) {
        if (tiles.length >= MAX_TILES) return;
        if (hidden.indexOf(s.url) !== -1) return;
        if (seen[hostOf(s.url)]) return;
        seen[hostOf(s.url)] = true;
        tiles.push(tileEl({ name: s.title, url: s.url }, false, state));
      });

      wrap.textContent = "";
      tiles.slice(0, MAX_TILES).forEach(function (t) { wrap.appendChild(t); });
      wrap.appendChild(addTileEl());
    });
  }

  function hideAdd() {
    pop.hidden = true;
    $("addName").value = "";
    $("addUrl").value = "";
  }

  $("addCancel").addEventListener("click", hideAdd);
  $("addSave").addEventListener("click", function () {
    var name = $("addName").value.trim();
    var url = $("addUrl").value.trim();
    if (!url) { $("addUrl").focus(); return; }
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    sGet([KEY_CUSTOM]).then(function (res) {
      var custom = Array.isArray(res[KEY_CUSTOM]) ? res[KEY_CUSTOM] : [];
      custom.push({ name: name || hostOf(url), url: url });
      var o = {}; o[KEY_CUSTOM] = custom;
      return sSet(o);
    }).then(function () { hideAdd(); render(); });
  });
  $("addUrl").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); $("addSave").click(); }
  });

  render();
})();


/* ---------- v0.2 설정 패널: 시계·검색창·바로가기 표시 여부 ---------- */
(function () {
  "use strict";

  var KEY = "somenow_settings";
  var DEFAULTS = { clock: true, search: true, sites: true };
  var OPTS = [
    { id: "optClock", key: "clock", cls: "hide-clock" },
    { id: "optSearch", key: "search", cls: "hide-search" },
    { id: "optSites", key: "sites", cls: "hide-sites" }
  ];

  function $(id) { return document.getElementById(id); }

  function load() {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get([KEY], function (res) {
          var s = (res && res[KEY]) || {};
          resolve({
            clock: s.clock !== false,
            search: s.search !== false,
            sites: s.sites !== false
          });
        });
      } catch (e) { resolve(DEFAULTS); }
    });
  }
  function save(s) {
    try { var o = {}; o[KEY] = s; chrome.storage.local.set(o); } catch (e) { /* 무시 */ }
  }
  function apply(s) {
    OPTS.forEach(function (opt) {
      document.body.classList.toggle(opt.cls, !s[opt.key]);
      $(opt.id).checked = !!s[opt.key];
    });
  }

  var btn = $("setBtn");
  var panel = $("setPanel");
  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
  });
  document.addEventListener("click", function (e) {
    if (!panel.hidden && !panel.contains(e.target)) panel.hidden = true;
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") panel.hidden = true;
  });

  load().then(function (s) {
    apply(s);
    OPTS.forEach(function (opt) {
      $(opt.id).addEventListener("change", function () {
        s[opt.key] = $(opt.id).checked;
        save(s);
        apply(s);
      });
    });
  });
})();


/*
 * ---------- v0.2 위시리스트 ----------
 * 마음에 든 도시를 하트로 담아 두고, 좌측 하단 목록에서 다시 꺼내 본다.
 * 사진 로직과는 window.SomenowCity 창구로만 연결된다.
 * 그 창구가 없으면(사진 로직이 죽었으면) 버튼을 아예 띄우지 않는다.
 */
(function () {
  "use strict";

  var KEY = "somenow_wishlist";   // [{ iata, name_ko }]
  var MAX = 50;

  function $(id) { return document.getElementById(id); }

  var api = window.SomenowCity;
  var heart = $("wishBtn");
  var listBtn = $("wishListBtn");
  var panel = $("wishPanel");
  var rows = $("wishRows");
  var countEl = $("wishCount");
  if (!api || !heart || !listBtn || !panel || !rows) return;

  heart.hidden = false;
  listBtn.hidden = false;

  function sGet() {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get([KEY], function (res) {
          var v = res && res[KEY];
          resolve(Array.isArray(v) ? v : []);
        });
      } catch (e) { resolve([]); }
    });
  }
  function sSet(list) {
    return new Promise(function (resolve) {
      try { var o = {}; o[KEY] = list; chrome.storage.local.set(o, function () { resolve(); }); }
      catch (e) { resolve(); }
    });
  }

  // "2026-12-24" -> "D-83". 지난 날짜면 아무것도 표시하지 않는다.
  function ddayText(dateStr) {
    if (!dateStr) return null;
    var t = new Date(dateStr + "T00:00:00");
    if (isNaN(t.getTime())) return null;
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var n = Math.round((t - today) / 86400000);
    if (n > 0) return "D-" + n;
    if (n === 0) return "오늘";
    return "지남";
  }

  function has(list, iata) {
    for (var i = 0; i < list.length; i++) if (list[i].iata === iata) return true;
    return false;
  }

  function paintHeart(list) {
    var c = api.current();
    var on = !!(c && has(list, c.iata));
    heart.classList.toggle("is-on", on);
    heart.setAttribute("aria-pressed", on ? "true" : "false");
    heart.title = on ? "위시리스트에서 빼기" : "위시리스트에 담기";
    heart.setAttribute("aria-label", heart.title);
  }

  function paintCount(list) {
    if (!countEl) return;
    countEl.textContent = String(list.length);
    countEl.hidden = list.length === 0;
  }

  function paintRows(list) {
    rows.textContent = "";
    if (!list.length) {
      var p = document.createElement("div");
      p.className = "wish-empty";
      p.textContent = "아직 담은 도시가 없습니다. 하트를 눌러 담아 두세요.";
      rows.appendChild(p);
      return;
    }
    list.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "wish-row";

      var go = document.createElement("button");
      go.type = "button";
      go.className = "wish-go";
      go.textContent = item.name_ko || item.iata;
      go.title = "이 도시 보기";
      go.addEventListener("click", function () {
        api.goTo(item.iata);
        panel.hidden = true;
      });

      // 목표 날짜(D-day). 눌러서 날짜를 넣으면 "D-83" 으로 바뀐다.
      var day = document.createElement("button");
      day.type = "button";
      day.className = "wish-day" + (item.date ? " is-set" : "");
      day.title = "가는 날 정하기";
      day.textContent = ddayText(item.date) || "날짜";
      day.addEventListener("click", function (e) {
        e.stopPropagation();
        var input = document.createElement("input");
        input.type = "date";
        input.className = "wish-date";
        if (item.date) input.value = item.date;
        row.replaceChild(input, day);
        input.focus();
        if (input.showPicker) { try { input.showPicker(); } catch (err) { /* 무시 */ } }
        function commit() {
          sGet().then(function (cur) {
            var next = cur.map(function (c) {
              if (c.iata !== item.iata) return c;
              var copy = { iata: c.iata, name_ko: c.name_ko };
              if (input.value) copy.date = input.value;
              return copy;
            });
            return sSet(next).then(function () { paintAll(next); });
          });
        }
        input.addEventListener("change", commit);
        input.addEventListener("blur", function () { window.setTimeout(commit, 120); });
      });

      var x = document.createElement("button");
      x.type = "button";
      x.className = "wish-x";
      x.title = "목록에서 빼기";
      x.textContent = "×";
      x.addEventListener("click", function () {
        sGet().then(function (cur) {
          var next = cur.filter(function (c) { return c.iata !== item.iata; });
          return sSet(next).then(function () { paintAll(next); });
        });
      });

      row.appendChild(go);
      row.appendChild(day);
      row.appendChild(x);
      rows.appendChild(row);
    });
  }

  function paintAll(list) {
    paintHeart(list);
    paintCount(list);
    paintRows(list);
  }

  heart.addEventListener("click", function () {
    var c = api.current();
    if (!c) return;
    sGet().then(function (list) {
      var next;
      if (has(list, c.iata)) {
        next = list.filter(function (x) { return x.iata !== c.iata; });
      } else {
        if (list.length >= MAX) return sSet(list).then(function () { paintAll(list); });
        next = list.concat([{ iata: c.iata, name_ko: c.name_ko }]);   // 날짜는 목록에서 따로 넣는다
      }
      return sSet(next).then(function () { paintAll(next); });
    });
  });

  // 설정 패널과 자리가 겹치므로 한 번에 하나만 열리게 한다
  var setPanel = $("setPanel");
  var setBtn = $("setBtn");
  if (setBtn) setBtn.addEventListener("click", function () { panel.hidden = true; });

  listBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (setPanel) setPanel.hidden = true;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) sGet().then(paintAll);
  });
  document.addEventListener("click", function (e) {
    if (!panel.hidden && !panel.contains(e.target)) panel.hidden = true;
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") panel.hidden = true;
  });

  // 도시가 바뀌면(첫 표시·셔플·목록 선택) 하트 상태를 다시 칠한다
  api.onChange(function () { sGet().then(paintHeart); });

  sGet().then(paintAll);
})();


/*
 * ---------- v0.4 도시 카드 ----------
 * "도시 정보" 버튼을 눌렀을 때만 올라온다. 평소 화면은 그대로 비워 둔다.
 * 현재 날씨는 Open-Meteo(가입·키 없이 무료, 출처 표기 필요)에서 받아 30분 캐시한다.
 * 사진 로직과는 window.SomenowCity 창구로만 연결된다.
 */
(function () {
  "use strict";

  var WKEY = "somenow_weather";        // { IATA: { t, code, at } }
  var WISH_KEY = "somenow_wishlist";
  var WEATHER_TTL = 30 * 60 * 1000;

  function $(id) { return document.getElementById(id); }

  var api = window.SomenowCity;
  var btn = $("cardBtn");
  var card = $("cityCard");
  if (!api || !btn || !card) return;

  btn.hidden = false;

  function sGet(keys) {
    return new Promise(function (resolve) {
      try { chrome.storage.local.get(keys, function (r) { resolve(r || {}); }); }
      catch (e) { resolve({}); }
    });
  }
  function sSet(o) {
    return new Promise(function (resolve) {
      try { chrome.storage.local.set(o, function () { resolve(); }); }
      catch (e) { resolve(); }
    });
  }

  /* ----- 날씨 ----- */

  // WMO 날씨 코드 → 한국어 (Open-Meteo 가 쓰는 표준 코드)
  function skyText(code) {
    if (code === 0) return "맑음";
    if (code === 1 || code === 2) return "구름 조금";
    if (code === 3) return "흐림";
    if (code === 45 || code === 48) return "안개";
    if (code >= 51 && code <= 57) return "이슬비";
    if (code >= 61 && code <= 67) return "비";
    if (code >= 71 && code <= 77) return "눈";
    if (code >= 80 && code <= 82) return "소나기";
    if (code === 85 || code === 86) return "눈";
    if (code >= 95) return "천둥번개";
    return "";
  }

  function fetchWeather(city) {
    var url = "https://api.open-meteo.com/v1/forecast"
      + "?latitude=" + encodeURIComponent(city.lat)
      + "&longitude=" + encodeURIComponent(city.lon)
      + "&current=temperature_2m,weather_code";
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 6000);
    return fetch(url, { signal: ctrl.signal })
      .then(function (r) { if (!r.ok) throw new Error("weather " + r.status); return r.json(); })
      .then(function (d) {
        var cur = d && d.current;
        if (!cur || typeof cur.temperature_2m !== "number") throw new Error("날씨 값 없음");
        return { t: Math.round(cur.temperature_2m), code: cur.weather_code, at: Date.now() };
      })
      .finally(function () { clearTimeout(timer); });
  }

  function showWeather(city) {
    var box = $("cardWeather");
    box.textContent = "…";
    sGet([WKEY]).then(function (s) {
      var all = s[WKEY] || {};
      var have = all[city.iata];
      if (have && (Date.now() - have.at) < WEATHER_TTL) return paintWeather(have);

      fetchWeather(city)
        .then(function (w) {
          all[city.iata] = w;
          var o = {}; o[WKEY] = all;
          sSet(o);
          paintWeather(w);
        })
        .catch(function (e) {
          console.info("[Somenow] 날씨를 받지 못했다:", e && e.message);
          if (have) paintWeather(have);          // 오래됐어도 없는 것보다 낫다
          else box.textContent = "날씨 정보 없음";
        });
    });

    function paintWeather(w) {
      var sky = skyText(w.code);
      box.textContent = "지금 " + w.t + "°C" + (sky ? " · " + sky : "");
    }
  }

  /* ----- 카드 내용 ----- */

  // 새 탭에서 여는 바깥 링크. 광고성 링크에는 sponsored 를 붙인다.
  function extLink(text, href, cls, sponsored) {
    var a = document.createElement("a");
    a.className = cls;
    a.href = href;
    a.target = "_blank";
    a.rel = sponsored ? "noopener nofollow sponsored" : "noopener noreferrer";
    a.textContent = text;
    return a;
  }

  /*
   * 어디에 묵을까 — 지역 2~3곳과 트레이드오프 한 줄, 지역명은 호텔 검색으로.
   * 링크는 window.SomenowCity.hotelUrl(=buildHotelUrl) 한 곳에서만 만든다.
   */
  function renderAreas(city) {
    var block = $("cardStayBlock");
    var wrap = $("cardAreas");
    if (!block || !wrap) return;
    wrap.textContent = "";
    var areas = (city && city.areas) || [];
    if (!areas.length) { block.hidden = true; return; }
    block.hidden = false;
    areas.forEach(function (area) {
      var row = document.createElement("div");
      row.className = "card-area";
      var url = typeof api.hotelUrl === "function" ? api.hotelUrl(city, area) : null;
      var head;
      if (url) {
        head = extLink(area.name_ko, url, "card-area-name", true);
      } else {
        head = document.createElement("span");
        head.className = "card-area-name";
        head.textContent = area.name_ko;
      }
      var desc = document.createElement("span");
      desc.className = "card-area-desc";
      desc.textContent = area.desc || "";
      row.appendChild(head);
      row.appendChild(desc);
      wrap.appendChild(row);
    });
  }

  function factRow(label, value) {
    if (!value) return null;
    var d = document.createElement("div");
    d.className = "card-fact";
    var b = document.createElement("b");
    b.textContent = label;
    var s = document.createElement("span");
    s.textContent = value;
    d.appendChild(b); d.appendChild(s);
    return d;
  }

  function dayDiff(dateStr) {
    var t = new Date(dateStr + "T00:00:00");
    if (isNaN(t.getTime())) return null;
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((t - today) / 86400000);
  }

  function render(city) {
    if (!city) return;
    $("cardCity").textContent = city.name_ko + " · " + city.name_en;
    $("cardBest").textContent = (city.best || "") + (city.climate ? "\n" + city.climate : "");
    $("cardBest").style.whiteSpace = "pre-line";
    // 가볼 곳 — 이름을 누르면 구글 지도, 아래 줄은 유튜브 영상 검색.
    // 3단계(심화 조사)로 넘어가는 문. 링크는 검색 URL 이라 API 도 키도 필요 없다.
    var sw = $("cardSights");
    sw.textContent = "";
    (city.sights || []).forEach(function (name) {
      sw.appendChild(extLink(
        name,
        "https://www.google.com/maps/search/" + encodeURIComponent(name + " " + city.name_en),
        "card-link"
      ));
    });
    if ((city.sights || []).length) {
      sw.appendChild(extLink(
        "영상으로 보기",
        "https://www.youtube.com/results?search_query=" + encodeURIComponent(city.name_ko + " 여행"),
        "card-link card-link-sub"
      ));
    }

    $("cardFoods").textContent = (city.foods || []).join("\n");
    $("cardFoods").style.whiteSpace = "pre-line";

    renderAreas(city);

    var facts = $("cardFacts");
    facts.textContent = "";
    [["통화", city.currency], ["언어", city.language], ["비자", city.visa],
     ["전기", city.plug], ["공항에서", city.transit]].forEach(function (p) {
      var row = factRow(p[0], p[1]);
      if (row) facts.appendChild(row);
    });

    // 위시리스트에 목표 날짜가 있으면 D-day
    var dd = $("cardDday");
    dd.hidden = true;
    sGet([WISH_KEY]).then(function (s) {
      var list = Array.isArray(s[WISH_KEY]) ? s[WISH_KEY] : [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].iata === city.iata && list[i].date) {
          var n = dayDiff(list[i].date);
          if (n === null) return;
          dd.textContent = n > 0 ? ("가는 날까지 D-" + n)
                        : n === 0 ? "오늘 떠난다" : ("다녀온 지 " + Math.abs(n) + "일");
          dd.hidden = false;
          return;
        }
      }
    });

    showWeather(city);
  }

  function open() {
    card.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    render(api.current());
  }
  function close() {
    card.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  }

  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (card.hidden) open(); else close();
  });
  document.addEventListener("click", function (e) {
    if (!card.hidden && !card.contains(e.target)) close();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") close();
  });

  // 카드가 열려 있는 동안 도시가 바뀌면 내용도 따라 바뀐다
  api.onChange(function (city) {
    if (!card.hidden) render(city);
  });
})();
