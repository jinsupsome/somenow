# 크롬 웹스토어 등록 문안 (v0.4 기준, 2026-08-29)

등록 화면에 그대로 붙여넣는 원문. 문구를 고치면 이 파일도 같이 고친다.

---

## 1. 이름 (manifest.json 의 name 이 그대로 쓰인다)

```
Somenow — Someday to Today
```

## 2. 짧은 설명 (132자 이내, manifest.json 의 description)

```
새 탭을 열 때마다 여행지 사진 한 장과 항공권 버튼. 언젠가 가야지 하던 곳에 오늘 날짜를 붙인다.
```

## 3. 자세한 설명 — 한국어

```
"언젠가 가야지."

그 언젠가는 잘 오지 않습니다. 가격도 날짜도 붙지 않은 채로 마음속에만 남습니다.
Somenow는 새 탭을 열 때마다 그 도시를 한 곳씩 꺼내 보여줍니다.

■ 새 탭을 열면
· 여행지 사진 한 장과 그 도시의 문장 한 줄
· 직항 소요시간 · 시차 · 여행 적기
· 항공권 보기 버튼 하나

■ 도시 정보 카드 (ⓘ 버튼)
· 그 도시의 지금 기온과 날씨
· 여행 적기의 기후
· 가볼 곳 3곳, 먹을 것 3가지
· 통화 · 언어 · 비자 · 콘센트 모양 · 공항에서 시내까지

■ 새 탭에 필요한 것들
· 시계와 구글 검색창 (렌즈, AI 모드)
· 자주 방문하는 사이트 바로가기 (직접 추가·삭제 가능)
· 구글 앱 바로가기
· 시계 · 검색창 · 바로가기는 설정에서 끌 수 있습니다

■ 담아 두기
마음에 드는 도시를 하트로 담고 가는 날을 정하면 "D-83"으로 남습니다.
Someday가 날짜를 갖는 순간입니다.

■ 출발지
브라우저 시간대로 출발 도시를 자동으로 잡고, 설정에서 31개 도시 중 바꿀 수 있습니다.
시차는 실제 시간대로 계산하므로 서머타임에도 맞습니다.

■ 도시 60곳
도쿄 · 오사카 · 후쿠오카 · 다낭 · 방콕 · 싱가포르 · 파리 · 로마 · 뉴욕 · 시드니 …
인천에서 직항으로 갈 수 있는 도시만 담았습니다.

■ 개인정보
서버가 없습니다. 위시리스트도 바로가기도 설정도 전부 내 브라우저 안에만 저장되며,
개발자는 그 내용을 볼 수 없습니다. 계정도 광고도 사용 기록 분석도 없습니다.
자주 방문한 사이트 목록은 바로가기를 그리는 데만 쓰이고 밖으로 나가지 않습니다.
개인정보 처리방침: https://jinsupsome.github.io/somenow/privacy.html

■ 알려드립니다
· 항공권 보기 버튼은 제휴 링크입니다. 이 링크로 예약이 이루어지면 개발자가 수수료를 받을 수 있습니다. 사용자가 내는 금액은 달라지지 않습니다.
· 사진은 Unsplash, 날씨는 Open-Meteo 를 사용하며 각각 출처를 표기합니다.
· 설치 후 크롬이 "새 탭 페이지가 변경되었습니다"라고 물으면 [유지]를 눌러 주세요. 그래야 Somenow 화면이 뜹니다.
```

## 4. 자세한 설명 — 영어

```
"Someday."

Someday rarely arrives. It stays in your head with no price and no date on it.
Somenow puts one of those cities in front of you every time you open a new tab.

■ Every new tab
· One photograph and one line about the place
· Non-stop flight time, time difference, best season to go
· One button to look up flights

■ City card (the ⓘ button)
· Current temperature and sky there, right now
· What the weather is like in the best season
· Three places to see, three things to eat
· Currency, language, visa, plug type, airport-to-city transfer

■ Still a working new tab
· Clock and Google search (Lens, AI mode)
· Shortcuts to your most visited sites — add or remove your own
· Google app launcher
· Clock, search and shortcuts can each be turned off

■ Keep one
Save a city with the heart and give it a date. It becomes "D-83".
That is the moment someday gets a number.

■ Where you fly from
The departure city is guessed from your browser's time zone and can be changed to any of 31 cities.
Time differences are computed from real time zones, so daylight saving is handled.

■ 60 cities
Tokyo · Osaka · Fukuoka · Da Nang · Bangkok · Singapore · Paris · Rome · New York · Sydney and more.

■ Privacy
There is no server. Your wishlist, shortcuts and settings stay in your own browser and the
developer cannot see them. No account, no ads, no analytics.
Your most-visited sites are read only to draw the shortcuts and never leave the browser.
Privacy policy: https://jinsupsome.github.io/somenow/privacy.html

■ Please note
· The flight button is an affiliate link. If a booking is made through it the developer may earn a commission. Your price does not change.
· Photos from Unsplash, weather from Open-Meteo, both credited on screen.
· After installing, if Chrome asks about the changed new tab page, choose "Keep it" so Somenow appears.
```

## 5. 단일 목적 설명 (Single purpose)

```
Somenow replaces the new tab page with one travel destination per day - a photograph, a short line, practical facts about the city, and a link to search flights there. Every feature on the page serves that single purpose: showing a destination and helping the user act on it.
```

## 6. 권한 사유 (각 항목마다 따로 적는다)

storage
```
Stores the extension's own state in the user's browser: which city and photo are shown today, one cached photo so the page works offline and opens instantly, the user's wishlist and target dates, shortcuts the user added or hid, display settings, the chosen departure city, and weather results cached for 30 minutes. Nothing is sent anywhere.
```

topSites
```
Reads Chrome's existing "most visited sites" list to render shortcut tiles on the new tab page, the same convenience Chrome's own new tab provides. The list is used only to draw those tiles and is never transmitted off the device.
```

favicon
```
Displays each shortcut's site icon next to its name on the new tab page. Without it the shortcut tiles would show only a letter.
```

원격 호스트 코드 사용
```
사용하지 않음 (No). 모든 코드는 확장 프로그램 패키지 안에 있다.
외부 호출은 데이터 요청뿐이다: Unsplash 사진 API, Open-Meteo 날씨 API.
```

## 7. 데이터 사용 공개 (Data usage)

수집 항목: 전부 "수집하지 않음"으로 표시한다. 개발자에게 전송되는 데이터가 없다.

세 가지 확인란은 모두 체크한다.
- 사용자 데이터를 승인된 용도 외로 판매하지 않는다
- 제3자에게 판매하지 않는다
- 신용도 판단 등 대출 목적으로 사용하지 않는다

## 8. 등록 시 체크리스트

- [ ] 개인정보 처리방침 URL 입력: https://jinsupsome.github.io/somenow/privacy.html
- [x] 카테고리: 라이프스타일 > 여행 (Travel) — 등록 시 실제 선택값. 구 분류의 '생산성'에서 변경
- [x] 언어: 한국어 (영문 설명은 추후 English 로케일 추가 시 사용)
- [x] 스크린샷 4장 (1280×800 PNG) docs/store/
- [x] 아이콘 128px (icons/icon128.png)
- [x] 등록비 $5 결제 완료
- [x] 제출 전 크롬에서 실제 동작 확인
- [x] 2026-08-29 제출 완료 (항목 ID ljnbgefidlnkegfkgmhgbllopgeoeokl, '검토 통과 후 자동 게시' 켬)

## 9. 스크린샷 찍는 법 (1280×800 PNG, 3장)

크롬 개발자 도구로 정확한 규격을 맞춘다. 캡처 도구로 찍어 자르면 크기가 어긋난다.

1. 새 탭을 연다
2. `F12` → `Ctrl+Shift+M` (기기 도구 모음 켜기)
3. 상단 크기 칸에 **1280 × 800**, 배율 100%
4. 오른쪽 위 **⋮** → **스크린샷 캡처**
5. 다운로드 폴더에 PNG 로 저장된다

찍을 화면 3장:
1. 기본 화면 — 사진이 잘 나온 도시로. 셔플(↻)을 눌러 마음에 드는 사진이 나올 때까지 고른다
2. 도시 정보 카드 — ⓘ 를 눌러 카드가 열린 상태
3. 위시리스트 — 도시 두세 곳을 담고 날짜를 넣어 D-day 가 보이는 상태

주의: Unsplash 무료 키는 시간당 50회 제한이라 사진이 안 뜰 수 있다. 그때는 30분 뒤에 찍는다.
스토어 등록 전에 Unsplash 앱을 Production 승인(시간당 5000회)으로 올려 두는 것이 좋다.

## 10. 등록 과정에서 실제로 걸린 것 (다음에 대비)

- **게시자 계정 2단계 인증 필수.** 켜지 않으면 zip 업로드가 "파일을 업로드하는 중에 문제가 발생했습니다"로 실패한다. 원인 표시가 작아 파일 문제로 오인하기 쉽다.
- **EEA 사업자 선언**: 제휴 수수료 수익이 있으므로 '판매자 계정'을 선택. 선택 후 Google 결제 프로필로 이름·주소·전화 인증이 필요하며, 이 정보는 스토어 페이지 하단에 공개 표시된다. 인증 대기 중에도 제출·심사는 진행된다.
- **연락처 이메일 확인** 없이는 항목 게시가 불가하다. 설정 화면 상단에서 먼저 처리한다.
- **홈페이지 URL** https://jinsupsome.github.io/somenow/ , **지원 URL** https://github.com/jinsupsome/somenow/issues 로 입력. '공식 URL'은 Search Console 소유 확인이 필요해 '없음'으로 둠.
- 프로모션 타일(440×280, 1400×560)은 선택 사항이라 비워도 제출된다.
