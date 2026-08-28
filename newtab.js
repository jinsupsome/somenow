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

  var FETCH_TIMEOUT_MS = 8000;

  var el = {
    photo: document.getElementById("photo"),
    city: document.getElementById("city"),
    tagline: document.getElementById("tagline"),
    btn: document.getElementById("flightBtn"),
    credit: document.getElementById("credit"),
    creditAuthor: document.getElementById("creditAuthor"),
    creditUnsplash: document.getElementById("creditUnsplash")
  };

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

  function renderCity(city) {
    el.city.textContent = city.name_ko;
    el.tagline.textContent = city.tagline;
    el.btn.href = buildFlightUrl(city);
    document.title = city.name_ko + " · Somenow";
  }

  // 화면 크기에 맞춰 사진 URL을 만든다. raw 를 저장해 두면 해상도별로 다시 만들 수 있다.
  function photoSrc(photo) {
    if (!photo) return null;
    if (photo.raw) {
      var w = Math.min(2560, Math.ceil(window.innerWidth * (window.devicePixelRatio || 1)));
      var sep = photo.raw.indexOf("?") === -1 ? "?" : "&";
      return photo.raw + sep + "auto=format&fit=crop&fm=jpg&q=80&w=" + w;
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

  /* ---------- 진행 ---------- */

  function loadCities() {
    return fetch(CITIES_URL).then(function (r) {
      if (!r.ok) throw new Error("cities.json " + r.status);
      return r.json();
    });
  }

  function start() {
    loadCities()
      .then(function (cities) {
        if (!Array.isArray(cities) || cities.length === 0) throw new Error("도시 목록이 비어 있다");

        var now = new Date();
        var dateStr = todayKey(now);
        var city = pickCity(cities, now);

        renderCity(city);   // 사진과 무관하게 글자·버튼은 즉시 보인다

        return storageGet([TODAY_KEY, LAST_KEY]).then(function (store) {
          var today = store[TODAY_KEY];
          var lastPhoto = store[LAST_KEY] || null;

          // 1) 오늘 것이 이미 있으면 API를 부르지 않는다
          if (today && today.date === dateStr && today.iata === city.iata && today.photo) {
            return applyPhoto(today.photo).then(function (ok) {
              if (!ok && lastPhoto) return applyPhoto(lastPhoto);
            });
          }

          // 2) 키가 없으면 호출 자체를 건너뛴다 (마지막 사진 → 단색 배경)
          var key = accessKey();
          if (!key) {
            if (!lastPhoto) console.info("[Somenow] config.js 가 없어 단색 배경으로 표시한다.");
            return applyPhoto(lastPhoto);
          }

          // 3) 새로 받는다. 실패하면 마지막 사진.
          return fetchPhoto(city.unsplash_query, key)
            .then(function (photo) {
              return applyPhoto(photo).then(function (ok) {
                if (!ok) throw new Error("이미지 로드 실패");
                pingDownload(photo, key);
                var record = { date: dateStr, iata: city.iata, name_ko: city.name_ko, photo: photo };
                var save = {};
                save[TODAY_KEY] = record;
                save[LAST_KEY] = photo;   // 날짜와 무관한 오프라인 대비용
                return storageSet(save);
              });
            })
            .catch(function (err) {
              console.warn("[Somenow] 사진을 받지 못했다:", err && err.message);
              return applyPhoto(lastPhoto);   // 날짜가 달라도 마지막 사진을 그대로 쓴다
            });
        });
      })
      .catch(function (err) {
        // 여기까지 오면 도시 목록도 못 읽은 것. 글자만이라도 남긴다.
        console.error("[Somenow]", err);
      });
  }

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
    });
  }

  render();
})();
