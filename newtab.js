/*
 * Somenow v0.1 — 새 탭 로직
 *
 * 1) 오늘 날짜로 도시 1개를 정한다. 같은 날이면 항상 같은 도시.
 * 2) 그 도시 사진 1장을 Unsplash에서 받아 chrome.storage.local 에 저장한다.
 *    같은 날 다시 새 탭을 열면 API를 호출하지 않고 저장된 것을 쓴다.
 * 3) 실패하거나 오프라인이면 마지막으로 성공한 사진을 쓴다. 그것도 없으면 단색 배경.
 */

(function () {
  "use strict";

  var CITIES_URL = "data/cities.json";
  var UTM = "?utm_source=somenow&utm_medium=referral";

  // 저장 키를 두 개로 나눈다.
  //  TODAY_KEY : 오늘 것(날짜가 바뀌면 무효)
  //  LAST_KEY  : 마지막으로 성공한 사진(날짜와 무관하게 살아남는 오프라인 대비용)
  var TODAY_KEY = "somenow_today";
  var LAST_KEY = "somenow_last_photo";
  var OVERRIDE_KEY = "somenow_city_override";   // 셔플로 고른 도시(당일 한정)
  var LAST_BYTES_KEY = "somenow_last_bytes";    // 마지막 사진의 실제 그림 데이터(오프라인 전용)

  // 사진 URL 폭은 정해진 값으로만 만든다. 창 크기가 조금 달라졌다고
  // 매번 새 주소가 되면 브라우저 캐시가 빗나가 사진을 다시 받는다.
  var WIDTH_STEPS = [1280, 1600, 1920, 2560];
  var OFFLINE_W = 1280;                         // 오프라인용으로 저장할 사진 폭
  var OFFLINE_MAX_BYTES = 2 * 1024 * 1024;      // 이보다 크면 저장하지 않는다

  var FETCH_TIMEOUT_MS = 8000;

  var el = {
    photo: document.getElementById("photo"),
    city: document.getElementById("city"),
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
  var changeCbs = [];

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

  // 순차 회전. 도시 수가 몇 개든 전부 한 바퀴 돈다.
  function pickCity(cities, d) {
    var n = ((dayNumber(d) % cities.length) + cities.length) % cities.length;
    return cities[n];
  }

  /* ---------- 항공권 링크 ---------- */

  /*
   * 버튼 링크는 이 함수 한 곳에서만 만든다.
   * 나중에 제휴 링크(트립닷컴·스카이스캐너·아고다)로 바꿀 때 여기만 고치면 되고,
   * 호출부(renderCity)는 손대지 않는다.
   *
   * city 객체를 통째로 받으므로 name_en 을 쓰든 iata 를 쓰든 시그니처가 그대로다.
   * 지금은 name_en 만 쓰지만 cities.json 의 iata 는 제휴 전환용으로 남겨둔다.
   *
   * 예) 스카이스캐너로 되돌릴 때:
   *   return "https://www.skyscanner.co.kr/transport/flights/icn/"
   *        + encodeURIComponent(String(city.iata).toLowerCase()) + "/";
   */
  /*
   * 트립닷컴 제휴 링크 (2026-08-28 적용).
   * Allianceid·SID 는 제휴 계정 식별자로, 링크에 노출되는 것이 정상 용도다.
   * cities.json 의 iata 는 트립닷컴 도시 코드(TYO·PAR·NYC 등)와 같은 체계다.
   *
   * 예) 구글 항공권으로 되돌릴 때:
   *   var q = "Flights to " + city.name_en + " from Incheon";
   *   return "https://www.google.com/travel/flights?q=" + encodeURIComponent(q);
   */
  function buildFlightUrl(city) {
    var slug = "Seoul-to-" + String(city.name_en).replace(/\s+/g, "-");
    var code = String(city.iata).toUpperCase();
    return "https://kr.trip.com/flights/" + slug + "/tickets-SEL-" + code
      + "?flighttype=S&dcity=SEL&acity=" + code
      + "&Allianceid=10331252&SID=329754573&trip_sub1=&trip_sub3=D19549133";
  }

  /* ---------- 화면 ---------- */

  /* ---------- 도시 정보 한 줄 ---------- */

  // 분 -> "2시간 20분". 딱 떨어지면 "6시간".
  function flyText(min) {
    if (typeof min !== "number" || min <= 0) return null;
    var h = Math.floor(min / 60);
    var m = min % 60;
    return "직항 " + (m ? h + "시간 " + m + "분" : h + "시간");
  }

  // 서울 기준 시차. cities.json 의 tz 는 표준시 기준이므로
  // 유럽·미주의 서머타임 기간에는 실제 시차가 1시간 줄어든다(표기는 표준시로 통일).
  function tzText(tz) {
    if (typeof tz !== "number") return null;
    if (tz === 0) return "시차 없음";
    return "시차 " + (tz > 0 ? "+" : "-") + Math.abs(tz) + "시간";
  }

  function renderMeta(city) {
    var parts = [];
    var f = flyText(city.fly_min);
    var t = tzText(city.tz);
    if (f) parts.push(f);
    if (t) parts.push(t);
    if (city.best) parts.push("여행 적기 " + city.best);

    if (!parts.length) { el.meta.hidden = true; el.meta.textContent = ""; return; }
    el.meta.textContent = parts.join(" \u00b7 ");
    el.meta.hidden = false;
  }

  function renderCity(city) {
    el.city.textContent = city.name_ko;
    el.tagline.textContent = city.tagline;
    renderMeta(city);
    el.btn.href = buildFlightUrl(city);
    document.title = city.name_ko + " \u00b7 Somenow";
  }

  // 화면 크기에 맞춰 사진 URL을 만든다. raw 를 저장해 두면 해상도별로 다시 만들 수 있다.
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
    if (photo.dataUrl) return photo.dataUrl;          // 오프라인 저장본
    if (photo.raw) {
      var need = Math.ceil(window.innerWidth * (window.devicePixelRatio || 1));
      return rawSrc(photo.raw, stepWidth(need));
    }
    return photo.url || null;
  }

  // 이미지가 실제로 로드된 뒤에만 배경을 바꾼다.
  // (오프라인에서 깨진 이미지가 잠깐 보이는 것을 막는다)
  function applyPhoto(photo) {
    var src = photoSrc(photo);
    if (!src) return Promise.resolve(false);

    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        el.photo.style.backgroundImage = 'url("' + src + '")';
        el.photo.classList.add("is-ready");
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

  function fetchPhoto(query, key) {
    var url = "https://api.unsplash.com/photos/random"
      + "?query=" + encodeURIComponent(query)
      + "&orientation=landscape"
      + "&content_filter=high";

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
      .then(function (d) {
        var p = Array.isArray(d) ? d[0] : d;
        if (!p || !p.urls) throw new Error("Unsplash: 사진 없음");
        return {
          raw: p.urls.raw || null,
          url: p.urls.regular || p.urls.full || null,
          authorName: (p.user && p.user.name) || "Unsplash",
          authorLink: (p.user && p.user.links && p.user.links.html) || null,
          downloadLocation: (p.links && p.links.download_location) || null
        };
      })
      .finally(function () { clearTimeout(timer); });
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
   * 오프라인 대비: 사진을 주소가 아니라 그림 데이터 자체로 저장한다.
   * 주소만 저장하면 인터넷이 끊긴 새 탭에서는 결국 아무것도 못 띄운다.
   * 하루에 사진을 새로 받을 때 한 번만, 작은 폭(1280)으로 1장만 저장한다.
   */
  function cacheBytes(photo) {
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
            dataUrl: dataUrl,
            authorName: photo.authorName,
            authorLink: photo.authorLink
          };
          return storageSet(o);
        })
        .catch(function (e) {
          console.info("[Somenow] 오프라인용 사진 저장을 건너뛴다:", e && e.message);
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

  function cityByIata(cities, iata) {
    for (var i = 0; i < cities.length; i++) {
      if (cities[i].iata === iata) return cities[i];
    }
    return null;
  }

  /*
   * 도시 하나를 화면에 띄운다(글자·버튼·사진).
   * 사진은 "오늘 + 이 도시" 단위로 캐시한다. 셔플로 왔다 갔다 해도
   * 같은 날 같은 도시는 API를 다시 부르지 않는다.
   * 저장 형식: TODAY_KEY = { date, photos: { TYO: photo, PAR: photo, ... } }
   * (구버전 { date, iata, photo } 는 캐시 없음으로 취급되어 자연히 대체된다)
   */
  function showCity(city, dateStr) {
    renderCity(city);
    currentCity = city;
    notifyChange();

    return storageGet([TODAY_KEY, LAST_KEY, LAST_BYTES_KEY]).then(function (store) {
      var today = store[TODAY_KEY];
      var lastPhoto = store[LAST_KEY] || null;
      var lastBytes = store[LAST_BYTES_KEY] || null;
      var photos = (today && today.date === dateStr && today.photos) ? today.photos : {};

      // 마지막 사진(주소) → 저장해 둔 그림 데이터 → 단색 배경 순으로 물러난다
      function fallback() {
        return applyPhoto(lastPhoto).then(function (ok) {
          if (ok) return true;
          return applyPhoto(lastBytes);
        });
      }

      // 1) 오늘 이 도시 사진이 이미 있으면 그대로 쓴다
      if (photos[city.iata]) {
        return applyPhoto(photos[city.iata]).then(function (ok) {
          if (!ok) return fallback();
        });
      }

      // 2) 키가 없으면 호출을 건너뛴다 (마지막 사진 → 단색 배경)
      var key = accessKey();
      if (!key) {
        if (!lastPhoto && !lastBytes) console.info("[Somenow] config.js 가 없어 단색 배경으로 표시한다.");
        return fallback();
      }

      // 3) 새로 받는다. 실패하면 마지막 사진.
      return fetchPhoto(city.unsplash_query, key)
        .then(function (photo) {
          return applyPhoto(photo).then(function (ok) {
            if (!ok) throw new Error("이미지 로드 실패");
            pingDownload(photo, key);
            cacheBytes(photo);        // 오프라인 대비 그림 데이터 저장
            photos[city.iata] = photo;
            var save = {};
            save[TODAY_KEY] = { date: dateStr, photos: photos };
            save[LAST_KEY] = photo;   // 날짜와 무관한 오프라인 대비용
            return storageSet(save);
          });
        })
        .catch(function (err) {
          console.warn("[Somenow] 사진을 받지 못했다:", err && err.message);
          return fallback();
        });
    });
  }

  // 도시를 바꾸고 당일 동안 그 도시를 유지한다. 셔플과 위시리스트가 함께 쓴다.
  function goTo(city) {
    if (!city || !curDate) return;
    var o = {};
    o[OVERRIDE_KEY] = { date: curDate, iata: city.iata };
    storageSet(o);
    el.photo.classList.remove("is-ready");   // 페이드 아웃 → 새 사진 페이드 인
    showCity(city, curDate);
  }

  // 다른 도시 보기: 무작위로 다른 도시를 고른다
  function setupShuffle() {
    var btn = document.getElementById("shuffleBtn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var cities = allCities || [];
      if (!currentCity || cities.length < 2) return;
      var next = currentCity;
      while (next.iata === currentCity.iata) {
        next = cities[Math.floor(Math.random() * cities.length)];
      }
      goTo(next);
    });
  }

  function start() {
    loadCities()
      .then(function (cities) {
        if (!Array.isArray(cities) || cities.length === 0) throw new Error("도시 목록이 비어 있다");

        var now = new Date();
        var dateStr = todayKey(now);
        allCities = cities;
        curDate = dateStr;

        return storageGet([OVERRIDE_KEY]).then(function (st) {
          var ov = st[OVERRIDE_KEY];
          var city = null;
          if (ov && ov.date === dateStr) city = cityByIata(cities, ov.iata);
          if (!city) city = pickCity(cities, now);

          setupShuffle();
          return showCity(city, dateStr);
        });
      })
      .catch(function (err) {
        // 여기까지 오면 도시 목록도 못 읽은 것. 글자만이라도 남긴다.
        console.error("[Somenow]", err);
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
