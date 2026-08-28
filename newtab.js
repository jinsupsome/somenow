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
  var ORIGIN_KEY = "somenow_origin";            // 출발 도시 코드

  // 사진 URL 폭은 정해진 값으로만 만든다. 창 크기가 조금 달라졌다고
  // 매번 새 주소가 되면 브라우저 캐시가 빗나가 사진을 다시 받는다.
  var WIDTH_STEPS = [1280, 1600, 1920, 2560];
  var OFFLINE_W = 1280;                         // 즉시 표시·오프라인용으로 저장할 사진 폭
  var OFFLINE_MAX_BYTES = 2 * 1024 * 1024;      // 이보다 크면 저장하지 않는다

  var FETCH_TIMEOUT_MS = 8000;

  /*
   * 출발 도시. 트립닷컴 도시 코드와 IANA 시간대를 함께 갖는다.
   * 처음 한 번 브라우저 시간대로 추정하고, 그 뒤로는 설정에서 고른 값을 쓴다.
   */
  var ORIGINS = [
    { code: "SEL", ko: "서울",         tzid: "Asia/Seoul" },
    { code: "PUS", ko: "부산",         tzid: "Asia/Seoul" },
    { code: "TYO", ko: "도쿄",         tzid: "Asia/Tokyo" },
    { code: "OSA", ko: "오사카",       tzid: "Asia/Tokyo" },
    { code: "TPE", ko: "타이베이",     tzid: "Asia/Taipei" },
    { code: "HKG", ko: "홍콩",         tzid: "Asia/Hong_Kong" },
    { code: "SIN", ko: "싱가포르",     tzid: "Asia/Singapore" },
    { code: "BKK", ko: "방콕",         tzid: "Asia/Bangkok" },
    { code: "SGN", ko: "호치민",       tzid: "Asia/Ho_Chi_Minh" },
    { code: "BJS", ko: "베이징",       tzid: "Asia/Shanghai" },
    { code: "SHA", ko: "상하이",       tzid: "Asia/Shanghai" },
    { code: "MNL", ko: "마닐라",       tzid: "Asia/Manila" },
    { code: "KUL", ko: "쿠알라룸푸르", tzid: "Asia/Kuala_Lumpur" },
    { code: "DEL", ko: "델리",         tzid: "Asia/Kolkata" },
    { code: "DXB", ko: "두바이",       tzid: "Asia/Dubai" },
    { code: "IST", ko: "이스탄불",     tzid: "Europe/Istanbul" },
    { code: "LON", ko: "런던",         tzid: "Europe/London" },
    { code: "PAR", ko: "파리",         tzid: "Europe/Paris" },
    { code: "FRA", ko: "프랑크푸르트", tzid: "Europe/Berlin" },
    { code: "AMS", ko: "암스테르담",   tzid: "Europe/Amsterdam" },
    { code: "MAD", ko: "마드리드",     tzid: "Europe/Madrid" },
    { code: "ROM", ko: "로마",         tzid: "Europe/Rome" },
    { code: "NYC", ko: "뉴욕",         tzid: "America/New_York" },
    { code: "CHI", ko: "시카고",       tzid: "America/Chicago" },
    { code: "LAX", ko: "로스앤젤레스", tzid: "America/Los_Angeles" },
    { code: "SFO", ko: "샌프란시스코", tzid: "America/Los_Angeles" },
    { code: "YTO", ko: "토론토",       tzid: "America/Toronto" },
    { code: "YVR", ko: "밴쿠버",       tzid: "America/Vancouver" },
    { code: "SYD", ko: "시드니",       tzid: "Australia/Sydney" },
    { code: "MEL", ko: "멜버른",       tzid: "Australia/Melbourne" },
    { code: "AKL", ko: "오클랜드",     tzid: "Pacific/Auckland" }
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
  var TEXT_WAIT_MS = 800;     // 사진을 이만큼 기다렸다가 안 오면 글자만 먼저 바꾼다
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

  /* ---------- 도시 정보 한 줄 ---------- */

  // 분 -> "2시간 20분". 딱 떨어지면 "6시간".
  function flyText(min) {
    if (typeof min !== "number" || min <= 0) return null;
    var h = Math.floor(min / 60);
    var m = min % 60;
    return "직항 " + (m ? h + "시간 " + m + "분" : h + "시간");
  }

  // 지금 이 브라우저와 목적지의 실제 시차. 서머타임까지 반영된다.
  function tzText(city) {
    if (!city.tzid) return null;
    var now = new Date();
    var there = tzOffsetMinutes(city.tzid, now);
    if (there === null) return null;
    var here = -now.getTimezoneOffset();
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
    // 직항 소요시간은 인천 출발 기준으로만 갖고 있다. 다른 출발지에서는 숨긴다.
    if (origin === "SEL") {
      var f = flyText(city.fly_min_icn);
      if (f) parts.push(f);
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

  function rawSrc(raw, w) {
    var sep = raw.indexOf("?") === -1 ? "?" : "&";
    return raw + sep + "auto=format&fit=crop&fm=jpg&q=80&w=" + w;
  }

  function photoSrc(photo) {
    if (!photo) return null;
    if (photo.dataUrl) return photo.dataUrl;          // 저장해 둔 그림
    if (photo.raw) {
      var need = Math.ceil(window.innerWidth * (window.devicePixelRatio || 1));
      return rawSrc(photo.raw, stepWidth(need));
    }
    return photo.url || null;
  }

  /*
   * 사진 두 장을 겹쳐 두고 새 사진을 위에 띄운다.
   * 한 장만 쓰면 배경 교체가 순간 잘라내기가 되어 툭 끊겨 보인다.
   * 아래 장은 새 사진이 다 나타난 뒤에 내린다.
   */
  function paint(src, color) {
    if (!layers) layers = [el.photo, el.photoB];
    var cur = layers[active];
    var next = layers[1 - active];

    if (color) next.style.backgroundColor = color;
    next.style.backgroundImage = src ? 'url("' + src + '")' : "none";
    next.style.zIndex = "2";
    cur.style.zIndex = "1";
    // 방금 넣은 배경이 적용된 뒤에 나타나게 한다(같은 프레임에 바꾸면 전환이 생략된다)
    void next.offsetWidth;
    next.classList.add("is-ready");
    window.setTimeout(function () { cur.classList.remove("is-ready"); }, 620);

    active = 1 - active;
    if (src) shownSrc = src;
    return true;
  }

  // 이미지가 실제로 로드된 뒤에만 배경을 바꾼다.
  function applyPhoto(photo) {
    var src = photoSrc(photo);
    if (!src) return Promise.resolve(false);

    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        paint(src, photo && photo.color);
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
      var p = toPhoto(list[Math.floor(Math.random() * list.length)]);
      if (!p) throw new Error("Unsplash: 사진 없음");
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
    var src = rawSrc(photo.raw, OFFLINE_W);
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
    var pre = store ? Promise.resolve(store) : storageGet([TODAY_KEY, LAST_KEY, LAST_BYTES_KEY]);

    /*
     * 글자는 사진이 준비된 순간에 함께 바꾼다.
     * 글자를 먼저 바꾸면 사진이 한 박자 늦게 따라오는 것처럼 보인다.
     * 사진이 TEXT_WAIT_MS 안에 안 오면 글자만 먼저 보여준다(무한정 기다리지 않는다).
     */
    var revealed = false;
    var painted = false;
    var timer = null;

    function reveal() {
      if (revealed) return;
      revealed = true;
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

    if (el.place) el.place.classList.remove("is-shown");   // 바뀌는 동안 잠시 감춘다
    timer = window.setTimeout(reveal, TEXT_WAIT_MS);

    return pre.then(function (s) {
      var today = s[TODAY_KEY];
      var lastPhoto = s[LAST_KEY] || null;
      var lastBytes = s[LAST_BYTES_KEY] || null;
      var photos = (today && today.date === dateStr && today.photos) ? today.photos : {};
      var mine = photos[city.iata] || null;

      // 0) 이 도시의 저장본이 있으면 기다릴 것 없이 사진과 글자를 함께 바꾼다
      if (lastBytes && lastBytes.iata === city.iata && lastBytes.dataUrl) {
        paint(lastBytes.dataUrl, lastBytes.color);
        renderCredit(lastBytes);
        painted = true;
        reveal();
      }

      // 마지막 사진 주소 → 저장된 그림 순으로 물러난다
      function fallback() {
        return applyPhoto(lastPhoto).then(function (ok) {
          if (ok) return true;
          return applyPhoto(lastBytes);
        });
      }

      // 1) 오늘 이 도시 사진이 이미 있으면 그대로 쓴다(미리 받아 둔 것 포함)
      if (mine) {
        return applyPhoto(mine).then(function (ok) {
          if (!ok) {
            if (!painted) return fallback().then(reveal);
            reveal();
            return;
          }
          reveal();
          var key0 = accessKey();
          if (key0 && !mine.pinged) {          // 화면에 쓴 순간에만 다운로드 핑
            pingDownload(mine, key0);
            mine.pinged = true;
            photos[city.iata] = mine;
            var sv = {}; sv[TODAY_KEY] = { date: dateStr, photos: photos };
            storageSet(sv);
          }
          // 이 도시 저장본이 아직 없을 때만 저장한다(새 탭마다 다시 받지 않게)
          if (!lastBytes || lastBytes.iata !== city.iata) cacheBytes(mine, city.iata);
          planNext(photos, dateStr);
        });
      }

      // 2) 키가 없으면 호출을 건너뛴다
      var key = accessKey();
      if (!key) {
        if (!lastPhoto && !lastBytes) console.info("[Somenow] config.js 가 없어 단색 배경으로 표시한다.");
        if (painted) { reveal(); return null; }
        return fallback().then(reveal);
      }

      // 3) 새로 받는다. 실패하면 마지막 사진.
      return fetchPhoto(city.unsplash_query, key)
        .then(function (photo) {
          return applyPhoto(photo).then(function (ok) {
            if (!ok) throw new Error("이미지 로드 실패");
            reveal();
            pingDownload(photo, key);
            photo.pinged = true;
            cacheBytes(photo, city.iata);
            photos[city.iata] = photo;
            var save = {};
            save[TODAY_KEY] = { date: dateStr, photos: photos };
            save[LAST_KEY] = photo;
            return storageSet(save).then(function () { planNext(photos, dateStr); });
          });
        })
        .catch(function (err) {
          console.warn("[Somenow] 사진을 받지 못했다:", err && err.message);
          if (painted) { reveal(); return null; }
          return fallback().then(reveal);
        });
    });
  }

  /*
   * 다음에 셔플로 보여줄 도시를 미리 정해 사진까지 받아 둔다.
   * 셔플을 누른 뒤에 받기 시작하면 사진이 한 박자 늦게 바뀌기 때문이다.
   * 새 탭 한 번에 최대 1개만, 오늘 받아 둔 사진이 PREFETCH_MAX 개가 되면 멈춘다
   * (Unsplash 무료 키는 시간당 50회 제한).
   */
  function planNext(photos, dateStr) {
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

    fetchPhoto(pick.unsplash_query, key)
      .then(function (photo) {
        photo.pinged = false;                        // 화면에 쓸 때 핑을 보낸다
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
      storageGet([OVERRIDE_KEY, ORIGIN_KEY, TODAY_KEY, LAST_KEY, LAST_BYTES_KEY])
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
        next = list.concat([{ iata: c.iata, name_ko: c.name_ko }]);
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
