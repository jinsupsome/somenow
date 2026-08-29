# -*- coding: utf-8 -*-
"""
Somenow 소개 사이트 도시 페이지 생성기.

data/cities.json 을 읽어 city/<slug>.html 60개와 city/index.html(목록),
sitemap.xml 을 만든다. 확장 프로그램 패키지(zip)에 들어가는 파일은 건드리지 않는다.

실행:  python tools/build_pages.py
"""

import io
import json
import os
import re
import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "city")
SITE = "https://jinsupsome.github.io/somenow"

# 트립닷컴 제휴 링크. newtab.js 의 buildFlightUrl 과 같은 형식이며 출발지는 인천 고정
# (fly_min_icn 이 인천 기준이라 소개 사이트는 인천 출발로만 안내한다).
ALLIANCE_ID = "10331252"
SID = "329754573"
TRIP_SUB3 = "D19549133"
ORIGIN = "SEL"

# Travelpayouts 제휴 링크(2026-08-29 생성, Sub ID = site-guide). 소개 사이트 전용이며
# 확장 프로그램(zip)에는 넣지 않는다. 링크를 바꾸면 여기만 고친다.
PARTNERS = [
    ("eSIM 데이터", "도착 즉시 켜지는 현지 데이터. 출국 전에 설치해 둔다.",
     "https://yesim.tpx.li/dbeNJnX2"),
    ("공항 픽업", "밤 도착이나 짐이 많을 때. 요금을 미리 확정해 둔다.",
     "https://kiwitaxi.tpx.li/Ckvr4jd5"),
    ("입장권·투어", "줄 서는 곳은 미리 끊는 편이 시간을 아낀다.",
     "https://klook.tpx.li/I94mDUO8"),
    ("여행자 보험", "짧은 일정에도 분실·의료비는 대비해 두는 편이 낫다.",
     "https://ektatraveling.tpx.li/tzXPa0d2"),
]


def partner_block(title="여행 준비"):
    cards = "".join(
        '<a href="%s" target="_blank" rel="noopener nofollow sponsored">%s<span class="sub">%s</span></a>'
        % (url, esc(name), esc(desc)) for name, desc, url in PARTNERS)
    return ('<h2>%s</h2><div class="grid">%s</div>'
            '<p class="note">제휴 링크입니다. 이 링크로 결제가 이루어지면 운영자가 수수료를 받을 수 있으며, '
            '이용자가 내는 금액은 달라지지 않습니다.</p>') % (esc(title), cards)

# Travelpayouts 사이트 인증 스크립트. index.html 과 동일 — 지우면 인증이 풀린다.
TP_SCRIPT = """<script nowprocket data-noptimize="1" data-cfasync="false" data-wpfc-render="false" seraph-accel-crit="1" data-no-defer="1" data-cmp-ab="2">
  (function () {
    var script = document.createElement("script");
    script.async = 1;
    script.setAttribute("data-cmp-ab","2");
    script.src = 'https://tpembars.com/NTY3NzUz.js?t=567753';
    document.head.appendChild(script);
  })();
</script>"""


def slugify(name_en):
    s = name_en.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def esc(t):
    return (str(t).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def flight_url(city):
    slug = ORIGIN + "-to-" + str(city["name_en"]).replace(" ", "-")
    code = str(city["iata"]).upper()
    return ("https://kr.trip.com/flights/" + slug + "/tickets-" + ORIGIN + "-" + code
            + "?flighttype=S&dcity=" + ORIGIN + "&acity=" + code
            + "&Allianceid=" + ALLIANCE_ID + "&SID=" + SID
            + "&trip_sub1=&trip_sub3=" + TRIP_SUB3)


def fly_text(minutes):
    if not isinstance(minutes, int) or minutes <= 0:
        return None
    h, m = divmod(minutes, 60)
    return "직항 %d시간 %d분" % (h, m) if m else "직항 %d시간" % h


def bucket(minutes):
    if not isinstance(minutes, int) or minutes <= 0:
        return "기타"
    if minutes <= 180:
        return "3시간 이내"
    if minutes <= 360:
        return "3~6시간"
    if minutes <= 600:
        return "6~10시간"
    return "10시간 이상"


# 도시 이름에서 색을 정해 사진 없이도 페이지마다 다른 인상을 준다.
def hue(name):
    n = 0
    for ch in name:
        n = (n * 31 + ord(ch)) % 360
    return n


CSS = """
* { box-sizing: border-box; margin: 0; }
body { font-family: system-ui, -apple-system, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
  background: #10161c; color: #fff; line-height: 1.7; }
a { color: #8ec5ff; }
.wrap { max-width: 760px; margin: 0 auto; padding: 0 24px 64px; }
.top { padding: 18px 0; font-size: 13px; opacity: .6; }
.hero { padding: 56px 24px 48px; text-align: center;
  background: linear-gradient(140deg, hsl(var(--h) 45% 22%), hsl(calc(var(--h) + 40) 40% 12%)); }
.hero .en { font-size: 13px; letter-spacing: .28em; text-transform: uppercase; opacity: .65; }
.hero h1 { font-size: clamp(32px, 6vw, 52px); margin: 10px 0 6px; letter-spacing: -0.02em;
  word-break: keep-all; overflow-wrap: break-word; }
.hero .tagline { font-size: clamp(16px, 2.6vw, 20px); opacity: .85; word-break: keep-all; }
.meta { margin-top: 18px; font-size: 14px; opacity: .7; }
h2 { font-size: 20px; margin: 40px 0 12px; letter-spacing: -0.01em; }
p, li { word-break: keep-all; overflow-wrap: break-word; }
ul { margin: 0; padding-left: 20px; }
li { margin: 6px 0; }
.facts { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 15px; }
.facts th, .facts td { text-align: left; vertical-align: top; padding: 10px 0;
  border-bottom: 1px solid rgba(255,255,255,.1); }
.facts th { width: 128px; font-weight: 600; opacity: .6; }
.cta { display: inline-block; margin: 28px 0 8px; padding: 14px 26px; border-radius: 999px;
  background: rgba(255,255,255,.12); color: #fff; text-decoration: none; font-size: 15px; }
.cta:hover { background: rgba(255,255,255,.2); }
.note { font-size: 13px; opacity: .5; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
.grid a { display: block; padding: 12px 14px; border-radius: 12px; text-decoration: none;
  background: rgba(255,255,255,.07); color: #fff; }
.grid a:hover { background: rgba(255,255,255,.13); }
.grid .sub { display: block; font-size: 12px; opacity: .55; margin-top: 2px; }
footer { margin-top: 56px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,.1);
  font-size: 12px; opacity: .45; }
"""


def page(title, desc, canonical, body, h=210):
    return """<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%s</title>
<meta name="description" content="%s">
<link rel="canonical" href="%s">
<meta property="og:title" content="%s">
<meta property="og:description" content="%s">
<meta property="og:type" content="article">
%s
<style>:root { --h: %d; }%s%s</style>
</head>
<body>
%s
</body>
</html>
""" % (esc(title), esc(desc), canonical, esc(title), esc(desc), TP_SCRIPT, h, CSS, article_style(), body)


FOOT = """<footer>
Somenow — Someday → Today · <a href="%s/">확장 프로그램 소개</a> · <a href="%s/city/">도시 60곳</a> · <a href="%s/privacy.html">개인정보 처리방침</a><br>
항공권 링크는 트립닷컴 제휴 링크입니다. 이 링크로 예약이 이루어지면 운영자가 수수료를 받을 수 있으며, 이용자가 내는 금액은 달라지지 않습니다.<br>
Somenow is not affiliated with the airlines or travel agencies shown in search results.
</footer>""" % (SITE, SITE, SITE)


def city_page(city):
    name = city["name_ko"]
    en = city["name_en"]
    slug = slugify(en)
    fly = fly_text(city.get("fly_min_icn"))
    meta_bits = [b for b in [fly, "여행 적기 " + city["best"] if city.get("best") else None] if b]

    sights = "".join("<li>%s</li>" % esc(s) for s in city.get("sights", []))
    foods = "".join("<li>%s</li>" % esc(s) for s in city.get("foods", []))

    rows = [
        ("통화", city.get("currency")),
        ("언어", city.get("language")),
        ("비자", city.get("visa")),
        ("전기·플러그", city.get("plug")),
        ("공항에서 시내까지", city.get("transit")),
        ("인천 직항", fly),
    ]
    facts = "".join("<tr><th>%s</th><td>%s</td></tr>" % (esc(k), esc(v))
                    for k, v in rows if v)

    body = """<header class="hero">
  <div class="en">%s</div>
  <h1>%s 여행</h1>
  <div class="tagline">%s</div>
  <div class="meta">%s</div>
</header>
<div class="wrap">
  <div class="top"><a href="%s/">Somenow</a> › <a href="./">도시</a> › %s</div>

  <h2>가볼 곳</h2>
  <ul>%s</ul>

  <h2>먹을 것</h2>
  <ul>%s</ul>

  <h2>언제 가면 좋은가</h2>
  <p>%s %s</p>

  <h2>알아 둘 것</h2>
  <table class="facts">%s</table>

  <h2>지금 항공권</h2>
  <p>인천에서 %s까지 오늘 날짜의 가격을 확인합니다.</p>
  <a class="cta" href="%s" target="_blank" rel="noopener nofollow sponsored">인천 → %s 항공권 보기</a>
  <p class="note">트립닷컴 제휴 링크입니다. 예약이 이루어지면 운영자가 수수료를 받을 수 있고, 이용자가 내는 금액은 달라지지 않습니다.</p>

  %s

  <h2>다른 도시</h2>
  <div class="grid">%s</div>

  %s
</div>""" % (
        esc(en.upper()), esc(name), esc(city.get("tagline", "")),
        esc(" · ".join(meta_bits)),
        SITE, esc(name),
        sights, foods,
        esc("여행 적기는 %s입니다." % city["best"]) if city.get("best") else "",
        esc(city.get("climate", "")),
        facts,
        esc(name), flight_url(city), esc(name),
        partner_block(),
        "".join('<a href="%s">%s</a>' % (x, y) for x, y in
                [(('./%s.html' % slugify(c["name_en"])),
                  esc(c["name_ko"])) for c in nav_pool(city)]),
        FOOT,
    )
    title = "%s 여행 — 적기·가볼 곳·먹을 것·항공권 | Somenow" % name
    desc = "%s: %s. %s 가볼 곳과 먹을 것, 통화·비자·전기, 인천 직항 시간과 여행 적기를 한 장에 정리했습니다." % (
        name, city.get("tagline", ""), name)
    return slug, page(title, desc, "%s/city/%s.html" % (SITE, slug), body, hue(en))


ALL = []


def nav_pool(city):
    # 같은 비행시간대의 다른 도시 6곳을 골라 서로 연결한다(내부 링크).
    b = bucket(city.get("fly_min_icn"))
    same = [c for c in ALL if bucket(c.get("fly_min_icn")) == b and c["name_en"] != city["name_en"]]
    if len(same) < 6:
        same = same + [c for c in ALL if c["name_en"] != city["name_en"] and c not in same]
    return same[:6]


def index_page():
    order = ["3시간 이내", "3~6시간", "6~10시간", "10시간 이상", "기타"]
    groups = {}
    for c in ALL:
        groups.setdefault(bucket(c.get("fly_min_icn")), []).append(c)
    blocks = []
    for key in order:
        items = groups.get(key)
        if not items:
            continue
        items = sorted(items, key=lambda c: c.get("fly_min_icn") or 0)
        cards = "".join(
            '<a href="./%s.html">%s<span class="sub">%s</span></a>' % (
                slugify(c["name_en"]), esc(c["name_ko"]),
                esc(" · ".join([x for x in [fly_text(c.get("fly_min_icn")), c.get("best")] if x])))
            for c in items)
        blocks.append('<h2>%s <span class="note">(%d곳)</span></h2><div class="grid">%s</div>'
                      % (esc(key), len(items), cards))
    body = """<header class="hero">
  <div class="en">SOMEDAY &rarr; TODAY</div>
  <h1>인천 직항으로 갈 수 있는 도시 %d곳</h1>
  <div class="tagline">비행시간·여행 적기·가볼 곳·먹을 것·비자와 전기까지 도시마다 한 장에.</div>
</header>
<div class="wrap">
  <div class="top"><a href="%s/">Somenow</a> › 도시</div>
  <p>인천에서 갈아타지 않고 갈 수 있는 도시만 모았습니다. 비행시간이 짧은 순서입니다.\n  일정 짜는 법은 <a href="../guide/">여행 글</a>에 정리해 두었습니다.</p>
  %s
  %s
</div>""" % (len(ALL), SITE, "".join(blocks), FOOT)
    return page("인천 직항 여행지 %d곳 — 비행시간·적기·항공권 | Somenow" % len(ALL),
                "인천에서 직항으로 갈 수 있는 도시 %d곳의 비행시간, 여행 적기, 가볼 곳과 먹을 것, 비자·통화·전기 정보를 도시별로 정리했습니다." % len(ALL),
                "%s/city/" % SITE, body, 210)


def sitemap(slugs, article_slugs=None):
    today = datetime.date.today().isoformat()
    urls = ["%s/" % SITE, "%s/city/" % SITE] + ["%s/city/%s.html" % (SITE, s) for s in slugs]
    if article_slugs:
        urls += ["%s/guide/" % SITE] + ["%s/guide/%s.html" % (SITE, s) for s in article_slugs]
    items = "".join("<url><loc>%s</loc><lastmod>%s</lastmod></url>\n" % (u, today) for u in urls)
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n%s</urlset>\n' % items



# ---------- 글(가이드) ----------

GUIDE = os.path.join(ROOT, "guide")


def article_style():
    return """
.article { max-width: 720px; margin: 0 auto; padding: 0 24px 64px; }
.article h2 { margin-top: 44px; }
.article h3 { font-size: 17px; margin: 28px 0 8px; opacity: .95; }
.article p { margin: 12px 0; }
.article blockquote { margin: 20px 0; padding: 14px 18px; border-left: 3px solid rgba(255,255,255,.25);
  background: rgba(255,255,255,.05); border-radius: 0 12px 12px 0; }
.article .date { font-size: 13px; opacity: .5; }
"""


def load_articles():
    path = os.path.join(ROOT, "content", "articles.json")
    if not os.path.exists(path):
        return []
    with io.open(path, encoding="utf-8") as f:
        return json.load(f)


def article_page(a, others):
    with io.open(os.path.join(ROOT, "content", "articles", a["body"]), encoding="utf-8") as f:
        body_html = f.read()

    city_links = ""
    if a.get("cities"):
        city_links = '<h2>이 글에 나온 도시</h2><div class="grid">%s</div>' % "".join(
            '<a href="../city/%s.html">%s<span class="sub">도시 정보</span></a>' % (c, esc(t))
            for c, t in a["cities"])

    more = '<h2>다른 글</h2><div class="grid">%s</div>' % "".join(
        '<a href="./%s.html">%s<span class="sub">%s</span></a>' % (o["slug"], esc(o["title"]), esc(o["date"]))
        for o in others[:4]) if others else ""

    body = """<header class="hero">
  <div class="en">SOMENOW GUIDE</div>
  <h1>%s</h1>
  <div class="tagline">%s</div>
</header>
<div class="article">
  <div class="top" style="padding:18px 0;font-size:13px;opacity:.6"><a href="%s/">Somenow</a> › <a href="./">글</a></div>
  <p class="date">%s</p>
  %s
  %s
  %s
  %s
  %s
</div>""" % (esc(a["title"]), esc(a["lead"]), SITE, esc(a["date"]),
             body_html, partner_block("이 여행에 미리 준비할 것"), city_links, more, FOOT)
    return page(a["title"] + " | Somenow", a["desc"],
                "%s/guide/%s.html" % (SITE, a["slug"]), body, hue(a["slug"]))


def guide_index(articles):
    cards = "".join(
        '<a href="./%s.html">%s<span class="sub">%s · %s</span></a>' % (
            a["slug"], esc(a["title"]), esc(a["date"]), esc(a["lead"]))
        for a in articles)
    body = """<header class="hero">
  <div class="en">SOMENOW GUIDE</div>
  <h1>여행 글</h1>
  <div class="tagline">떠나기 전에 한 번 읽어 두면 덜 헤매는 것들.</div>
</header>
<div class="wrap">
  <div class="top"><a href="%s/">Somenow</a> › 글</div>
  <div class="grid" style="margin-top:20px">%s</div>
  %s
</div>""" % (SITE, cards, FOOT)
    return page("여행 글 — 코스·준비물·항공권 타이밍 | Somenow",
                "직접 겪고 정리한 여행 글. 도시별 동선, 준비물, 항공권을 언제 잡아야 하는지.",
                "%s/guide/" % SITE, body, 190)


def main():
    global ALL
    with io.open(os.path.join(ROOT, "data", "cities.json"), encoding="utf-8") as f:
        ALL = json.load(f)
    if not os.path.isdir(OUT):
        os.makedirs(OUT)
    slugs = []
    for c in ALL:
        slug, html = city_page(c)
        with io.open(os.path.join(OUT, slug + ".html"), "w", encoding="utf-8") as f:
            f.write(html)
        slugs.append(slug)
    with io.open(os.path.join(OUT, "index.html"), "w", encoding="utf-8") as f:
        f.write(index_page())
    articles = load_articles()
    if articles:
        if not os.path.isdir(GUIDE):
            os.makedirs(GUIDE)
        for a in articles:
            others = [o for o in articles if o["slug"] != a["slug"]]
            with io.open(os.path.join(GUIDE, a["slug"] + ".html"), "w", encoding="utf-8") as f:
                f.write(article_page(a, others))
        with io.open(os.path.join(GUIDE, "index.html"), "w", encoding="utf-8") as f:
            f.write(guide_index(articles))
    with io.open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(sitemap(slugs, [a["slug"] for a in articles]))
    print("도시 %d개 + 글 %d편 + 목록 + sitemap.xml 생성" % (len(slugs), len(articles)))


if __name__ == "__main__":
    main()
