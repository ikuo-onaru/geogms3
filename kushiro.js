/* 釧路ルート: 地図表示 + 現在地 */
(function () {
  var D = window.KUSHIRO;
  var TYPES = [
    ["本線", "#0288d1", 4], ["右折レーン", "#ff5252", 5], ["左折レーン", "#fbc02d", 5],
    ["側道", "#7cb342", 4], ["ランプ", "#7cb342", 4], ["登坂車線", "#9c27b0", 5]
  ];
  var OFFLEN = {"車-32":70.6,"車-33":35.2,"車-34":2.0,"車-35":114.614,"車-36":80.252,"車-37":99.966,"車-38":13.3,"車-39":62.806,"車-40":66.4,"車-41":6.913,"車-42":42.4,"車-43":10.45,"車-44":117.0,"車-45":5.0,"車-46":1.993}; // 実施計画書 表1.2 路線延長(km)
  function c1(x) { return (Math.ceil(parseFloat(x) * 10 - 1e-9) / 10).toFixed(1); } // 小数第2位以下は切り上げ
  function kpR(t) { return c1(t) + "kp"; }
  var SEC_COLORS = ["#1565c0", "#e64a19", "#00897b", "#00b0ff", "#6d4c41", "#c2185b", "#2e7d32", "#455a64", "#0097a7", "#ef6c00", "#1a237e", "#827717", "#ad1457", "#00695c", "#3949ab"];
  var secColor = {}; D.sections.forEach(function (x, i) { secColor[x.no] = SEC_COLORS[i % SEC_COLORS.length]; });
  var endsLayer, pinsBySec = {}, banner, map, secLayers = {}, ITEMS = [], drawList = [], routeGrid = null, extraOn = true, user = null, watchId = null, follow = true, started = false;
  var on = {}; TYPES.forEach(function (t) { on[t[0]] = true; });
  var mapNote, sel = {}, ghost = false, selCount = 0;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function ll(c) { return c.map(function (p) { return [p[1], p[0]]; }); }

  /* 路線の描画(タイル) */
  function itemStyle(it) {
    if (it.kind === "extra") return extraOn ? { color: it.color, w: it.base, op: 1, order: 20 } : null;
    if (!on[it.t]) return null;
    if (it.kind === "done") return (!selCount || sel[it.s]) ? { color: "#9e9e9e", w: it.base + 1, op: 1, order: 30 } : null;
    var isSel = !selCount || sel[it.s], rank = it.t === "本線" ? 1 : 2;
    if (isSel) return { color: it.t === "本線" && selCount ? secColor[it.s] : it.color, w: selCount ? it.base + 1 : it.base, op: .95, order: (selCount ? 10 : 0) + rank };
    if (ghost) return { color: it.color, w: Math.max(2, it.base - 2), op: .18, order: 0 };
    return null;
  }
  function refreshRoutes() {
    drawList = [];
    ITEMS.forEach(function (it) { var st = itemStyle(it); if (st) { st.it = it; drawList.push(st); } });
    drawList.sort(function (a, b) { return a.order - b.order; });
    if (routeGrid) routeGrid.redraw();
  }
  function projItem(it, z) {
    var c = it.pz[z]; if (c) return c;
    var n = it.latlngs.length, a = new Float64Array(n * 2), minx = 1e15, miny = 1e15, maxx = -1e15, maxy = -1e15;
    for (var i = 0; i < n; i++) {
      var q = map.project(L.latLng(it.latlngs[i][0], it.latlngs[i][1]), z);
      a[i * 2] = q.x; a[i * 2 + 1] = q.y;
      if (q.x < minx) minx = q.x; if (q.x > maxx) maxx = q.x; if (q.y < miny) miny = q.y; if (q.y > maxy) maxy = q.y;
    }
    return (it.pz[z] = { a: a, minx: minx, miny: miny, maxx: maxx, maxy: maxy });
  }
  var RouteGrid = L.GridLayer.extend({
    createTile: function (coords) {
      var size = this.getTileSize(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      var c = document.createElement("canvas"); c.width = size.x * dpr; c.height = size.y * dpr;
      var ctx = c.getContext("2d"); ctx.scale(dpr, dpr);
      var x0 = coords.x * size.x, y0 = coords.y * size.y, z = coords.z, m = 14;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      drawList.forEach(function (d) {
        var pz = projItem(d.it, z);
        if (pz.maxx < x0 - m || pz.minx > x0 + size.x + m || pz.maxy < y0 - m || pz.miny > y0 + size.y + m) return;
        ctx.globalAlpha = d.op; ctx.strokeStyle = d.color; ctx.lineWidth = d.w; ctx.setLineDash(d.it.dash || []);
        ctx.beginPath();
        var a = pz.a;
        for (var i = 0; i < a.length; i += 2) { if (i === 0) ctx.moveTo(a[0] - x0, a[1] - y0); else ctx.lineTo(a[i] - x0, a[i + 1] - y0); }
        ctx.stroke();
      });
      return c;
    }
  });
  function segDist(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  }
  function routeClick(ev) {
    var best = null, tol = 14;
    drawList.forEach(function (d) {
      if (d.op < .5 || d.it.kind === "done") return;
      var prev = null, md = 1e9;
      d.it.latlngs.forEach(function (p) {
        var q = map.latLngToContainerPoint(p);
        if (prev) { var dd = segDist(ev.containerPoint, prev, q); if (dd < md) md = dd; }
        prev = q;
      });
      if (md <= tol && (!best || d.order > best.d.order || (d.order === best.d.order && md < best.md))) best = { d: d, md: md };
    });
    if (!best) return;
    var it = best.d.it, h;
    if (it.kind === "extra") h = "<b>" + it.name + "</b>";
    else {
      var sc = D.sections.filter(function (x) { return x.no === it.s; })[0], sp = SECPATH[it.s], f = it.f;
      h = "<b>" + sc.road + "(" + it.s + ")</b><br>" + f.t + "<br>" + kpR(f.a) + " ~ " + kpR(f.b) + "<br>" + (f.t === "本線" ? "総延長 " + c1(OFFLEN[it.s]) : "延長 " + c1(f.l)) + " km";
      var cnt = {};
      D.feats.forEach(function (x) { if (x.s === it.s) cnt[x.t] = (cnt[x.t] || 0) + 1; });
      var parts = [["右折レーン", "右折"], ["左折レーン", "左折"], ["ランプ", "ランプ"], ["登坂車線", "登坂車線"], ["側道", "側道"]].filter(function (k) { return cnt[k[0]] > 0; })
        .map(function (k) { return k[1] + "×" + cnt[k[0]] + "箇所"; });
      if (parts.length) h += "<br>" + parts.join(" ");
    }
    L.popup().setLatLng(ev.latlng).setContent(h).openOn(map);
  }

  function buildMap(box) {
    map = L.map(box, { zoomControl: true, preferCanvas: false, rotate: true, touchRotate: true, bearing: 0, rotateControl: false });
    window.KUSHIRO_MAP = map;
    var osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" });
    var std = L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "地図: 国土地理院" });
    var photo = L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg", { maxZoom: 18, attribution: "写真: 国土地理院" });
    osm.addTo(map);
    // OpenStreetMapが読み込めない(アクセス制限など)ときは、自動で地理院地図に切り替える
    var okTiles = 0, badTiles = 0;
    osm.on("tileload", function () { okTiles++; });
    osm.on("tileerror", function () {
      badTiles++;
      if (okTiles === 0 && badTiles >= 3 && map.hasLayer(osm)) {
        map.removeLayer(osm); std.addTo(map);
        if (mapNote) mapNote.textContent = "店舗つき地図を読み込めなかったため、地理院地図に切り替えました。右上のボタンで別の地図を選べます。";
      }
    });
    var base = { "標準地図(店舗・建物つき)": osm, "地理院地図": std, "航空写真": photo };
    L.control.layers(base, null, { position: "topright" }).addTo(map);
    /* 全画面・全体表示ボタン */
    var FullCtl = L.Control.extend({
      options: { position: "topleft" },
      onAdd: function () {
        var box = L.DomUtil.create("div", "leaflet-bar k-ctl");
        var fit = L.DomUtil.create("a", "k-ctl-b", box); fit.href = "#"; fit.title = "全路線が入るように地図を戻す"; fit.setAttribute("role", "button"); fit.setAttribute("aria-label", "全路線を表示"); fit.textContent = "全体";
        var nb = L.DomUtil.create("a", "k-ctl-b k-ctl-n", box); nb.href = "#"; nb.title = "地図の向きを北が上に戻す(二本指で回すと向きを変えられます)"; nb.setAttribute("role", "button"); nb.setAttribute("aria-label", "北を上に戻す"); nb.textContent = "北上";
        var self = this; map.on("rotate", function () { var b = map.getBearing ? map.getBearing() : 0; nb.classList.toggle("k-ctl-on", Math.abs(b) > .5); });
        L.DomEvent.on(nb, "click", function (e) { L.DomEvent.preventDefault(e); map.setBearing(0); });
        var fs = L.DomUtil.create("a", "k-ctl-b k-ctl-fs", box); fs.href = "#"; fs.title = "地図を画面いっぱいに表示"; fs.setAttribute("role", "button"); fs.setAttribute("aria-label", "地図を全画面で表示"); fs.textContent = "全画面";
        L.DomEvent.disableClickPropagation(box);
        L.DomEvent.on(fit, "click", function (e) { L.DomEvent.preventDefault(e); fitAll(); });
        L.DomEvent.on(fs, "click", function (e) { L.DomEvent.preventDefault(e); setFull(!full); });
        fsBtn = fs; return box;
      }
    });
    new FullCtl().addTo(map);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && full) setFull(false); });
    L.control.scale({ imperial: false, metric: true, maxWidth: 140, position: "bottomleft" }).addTo(map);
    map.createPane("base", map._rotatePane); map.getPane("base").style.zIndex = 410;
    map.createPane("lanes", map._rotatePane); map.getPane("lanes").style.zIndex = 420;
    map.createPane("warn", map._rotatePane); map.getPane("warn").style.zIndex = 430;
    map.createPane("kp", map._norotatePane); map.getPane("kp").style.zIndex = 580;
    map.createPane("poi", map._norotatePane); map.getPane("poi").style.zIndex = 590;
    map.createPane("pins", map._norotatePane); map.getPane("pins").style.zIndex = 600;
    map.createPane("me", map._rotatePane); map.getPane("me").style.zIndex = 650;
    var secById = {}; D.sections.forEach(function (s) { secById[s.no] = s; });
    map.createPane("routes", map._rotatePane); map.getPane("routes").style.zIndex = 410;
    map.createPane("mepin", map._norotatePane); map.getPane("mepin").style.zIndex = 650;
    /* 路線は地図と同じ「タイル」として描く。拡大・縮小・回転のとき、地図の画像と同じ動きになる */
    D.feats.forEach(function (f) {
      var t = TYPES.filter(function (x) { return x[0] === f.t; })[0]; if (!t) return;
      var lls = ll(f.c), pl = L.polyline(lls);
      var it = { kind: "feat", t: f.t, s: f.s, latlngs: lls, color: t[1], base: t[2], f: f, pz: {} };
      pl._kt = f.t; pl._item = it; it.pl = pl;
      (secLayers[f.s] = secLayers[f.s] || []).push(pl); ITEMS.push(it);
    });
    D.extra.forEach(function (e) {
      var ng = e.g === "工事につき取得不可箇所";
      ITEMS.push({ kind: "extra", t: "extra", s: null, latlngs: ll(e.c), color: ng ? "#d32f2f" : "#757575", base: 6, dash: ng ? [2, 8] : [10, 6], name: e.t.replace("\u3000", " "), pz: {} });
    });
    routeGrid = new RouteGrid({ pane: "routes", tileSize: 256, updateWhenIdle: false, updateWhenZooming: true, keepBuffer: 2 }).addTo(map);
    refreshRoutes();
    map.on("click", routeClick);
      POIS.forEach(function (p) { poiLayer[p.id] = L.layerGroup().addTo(map); });
    map.on("moveend", function () { poiSchedule(false); kpDraw(); });
    kpLayer = L.layerGroup().addTo(map);
    endsLayer = L.layerGroup().addTo(map);
    (D.ends || []).forEach(function (e) {
      var st = e.t === "起点", num = e.s.split("-")[1];
      var icon = L.divIcon({ className: "", iconSize: [34, 20], iconAnchor: [17, 10],
        html: '<div class="k-pin ' + (st ? "k-pin-s" : "k-pin-e") + '">' + num + (st ? "起" : "終") + "</div>" });
      var road = (D.sections.filter(function (x) { return x.no === e.s; })[0] || {}).road || "";
      var mk = L.marker([e.c[1], e.c[0]], { icon: icon, pane: "pins", keyboard: false })
        .bindPopup("<b>" + road + "(" + e.s + ")</b><br>" + e.t + ": " + e.kp + (e.kp.indexOf("kp") < 0 ? "kp" : "")).addTo(endsLayer);
      (pinsBySec[e.s] = pinsBySec[e.s] || []).push(mk);
    });
    var all = []; D.feats.forEach(function (f) { if (f.t === "本線") all = all.concat(ll(f.c)); });
    map.fitBounds(L.latLngBounds(all), { padding: [20, 20] });
  }

  function buildPanel(side) {
    side.appendChild(el("h3", "k-h", "表示する種別"));
    var chips = el("div", "k-chips");
    TYPES.forEach(function (t) {
      var b = el("button", "k-chip"); b.type = "button"; b.setAttribute("aria-pressed", "true");
      var sw = el("span", "k-sw"); sw.style.background = t[1]; b.appendChild(sw); b.appendChild(document.createTextNode(t[0]));
      b.addEventListener("click", function () {
        on[t[0]] = !on[t[0]]; b.setAttribute("aria-pressed", String(on[t[0]]));
        refreshRoutes();
      });
      chips.appendChild(b);
    });
    var bx = el("button", "k-chip"); bx.type = "button"; bx.setAttribute("aria-pressed", "true");
    var sx = el("span", "k-sw k-sw-dash"); bx.appendChild(sx); bx.appendChild(document.createTextNode("追加測線・取得不可"));
    bx.addEventListener("click", function () {
      var v = bx.getAttribute("aria-pressed") !== "true"; bx.setAttribute("aria-pressed", String(v));
      extraOn = v; refreshRoutes();
    });
    chips.appendChild(bx);
    var be = el("button", "k-chip"); be.type = "button"; be.setAttribute("aria-pressed", "true");
    var se = el("span", "k-sw k-sw-pin"); be.appendChild(se); be.appendChild(document.createTextNode("起点・終点"));
    be.addEventListener("click", function () {
      var v = be.getAttribute("aria-pressed") !== "true"; be.setAttribute("aria-pressed", String(v));
      if (v) endsLayer.addTo(map); else map.removeLayer(endsLayer);
    });
    chips.appendChild(be);
    var gn = el("span", "k-chip k-chip-info"); var gs = el("span", "k-sw"); gs.style.background = "#9e9e9e"; gn.appendChild(gs); gn.appendChild(document.createTextNode("灰色 = 測定済み(進捗の記録)")); chips.appendChild(gn);
    side.appendChild(chips);

    side.appendChild(el("h3", "k-h", "周辺の施設(拡大すると表示)"));
    var pc = el("div", "k-chips");
    POIS.forEach(function (p) {
      var b = el("button", "k-chip"); b.type = "button"; b.setAttribute("aria-pressed", "false");
      var sw = el("span", "k-dot"); sw.style.background = p.color; sw.textContent = p.ch; b.appendChild(sw); b.appendChild(document.createTextNode(p.label));
      b.addEventListener("click", function () {
        poiOn[p.id] = !poiOn[p.id]; b.setAttribute("aria-pressed", String(poiOn[p.id]));
        if (!poiOn[p.id]) poiLayer[p.id].clearLayers();
        poiLoad(true);
      });
      pc.appendChild(b);
    });
    side.appendChild(pc);
    poiNote = el("p", "k-note"); side.appendChild(poiNote);

    var hd = el("div", "k-hd"); hd.appendChild(el("h3", "k-h", "調査区間(複数選択可)"));
    var ba = el("button", "k-mini", "すべて選択"); ba.type = "button";
    ba.addEventListener("click", function () { D.sections.forEach(function (x) { sel[x.no] = true; }); applySel(true); });
    var bn = el("button", "k-mini", "解除"); bn.type = "button";
    bn.addEventListener("click", function () { sel = {}; applySel(true); });
    hd.appendChild(ba); hd.appendChild(bn); side.appendChild(hd);
    var list = el("div", "k-list");
    D.sections.forEach(function (s) {
      var mains = D.feats.filter(function (f) { return f.s === s.no && f.t === "本線"; });
      var km = Math.max.apply(null, mains.map(function (f) { return parseFloat(f.l); }));
      var b = el("button", "k-sec"); b.type = "button"; b.dataset.no = s.no; b.style.setProperty("--c", secColor[s.no]);
      var ttl = el("span", "k-ttl"); ttl.appendChild(el("b", null, s.road));
      var stt = el("span", "k-st k-st-0", "未調査"); stt.dataset.st = s.no; ttl.appendChild(stt);
      b.appendChild(ttl);
      var nol = el("span", "k-no"); var sw2 = el("span", "k-swatch"); nol.appendChild(sw2); nol.appendChild(document.createTextNode(s.no)); b.appendChild(nol);
      var kpn = "";
      var sub = el("span", "k-sub");
      sub.appendChild(document.createTextNode(kpR(mains[0].a) + " ~ " + kpR(mains[0].b) + (s.kind === "新道" ? "(新道)" : "")));
      sub.appendChild(document.createElement("br"));
      sub.appendChild(document.createTextNode("総延長 " + c1(OFFLEN[s.no]) + " km"));
      b.appendChild(sub);
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () { sel[s.no] = !sel[s.no]; applySel(true); });
      list.appendChild(b);
    });
    side.appendChild(list);
  }

  /* 周辺の施設(OpenStreetMapの情報) */
  var POIS = [
    { id: "conv", label: "コンビニ", q: '["shop"="convenience"]', color: "#e65100", ch: "コ" },
    { id: "fuel", label: "ガソリンスタンド", q: '["amenity"="fuel"]', color: "#6a1b9a", ch: "G" },
    { id: "food", label: "飲食店", q: '["amenity"~"^(restaurant|fast_food|cafe)$"]', color: "#00838f", ch: "食" }
  ];
  var ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
  var poiOn = {}, poiLayer = {}, poiTimer = null, poiBounds = null, poiNote;
  var POI_MINZOOM = 13;
  function poiActive() { return POIS.filter(function (p) { return poiOn[p.id]; }); }
  function poiNoteSet(t) { if (poiNote) poiNote.textContent = t; }
  function poiLoad(force) {
    var act = poiActive();
    if (!act.length) { poiNoteSet(""); return; }
    if (map.getZoom() < POI_MINZOOM) { poiNoteSet("もう少し拡大すると表示されます(現在の拡大では非表示)。"); return; }
    var b = map.getBounds();
    if (!force && poiBounds && poiBounds.contains(b)) { poiNoteSet(""); return; }
    var big = b.pad(.3), bb = [big.getSouth(), big.getWest(), big.getNorth(), big.getEast()].map(function (v) { return v.toFixed(5); }).join(",");
    var parts = act.map(function (p) { return 'nwr' + p.q + '(' + bb + ');'; }).join("");
    var q = "[out:json][timeout:25];(" + parts + ");out center 400;";
    poiNoteSet("周辺の施設を読み込み中…");
    var tryNo = 0;
    (function next() {
      fetch(ENDPOINTS[tryNo] + "?data=" + encodeURIComponent(q))
        .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
        .then(function (j) { poiBounds = big; poiDraw(j.elements || [], act); })
        .catch(function () { tryNo++; if (tryNo < ENDPOINTS.length) next(); else poiNoteSet("施設の情報を読み込めませんでした(電波の状態を確認してください)。"); });
    })();
  }
  function poiDraw(els, act) {
    POIS.forEach(function (p) { poiLayer[p.id].clearLayers(); });
    var n = 0;
    els.forEach(function (e) {
      var lat = e.lat != null ? e.lat : e.center && e.center.lat, lon = e.lon != null ? e.lon : e.center && e.center.lon;
      if (lat == null) return;
      var t = e.tags || {}, kind = null;
      POIS.forEach(function (p) {
        if (!poiOn[p.id]) return;
        if ((p.id === "conv" && t.shop === "convenience") || (p.id === "fuel" && t.amenity === "fuel") || (p.id === "food" && /^(restaurant|fast_food|cafe)$/.test(t.amenity || ""))) kind = p;
      });
      if (!kind) return;
      var icon = L.divIcon({ className: "", iconSize: [22, 22], iconAnchor: [11, 11],
        html: '<div class="k-poi" style="background:' + kind.color + '">' + kind.ch + "</div>" });
      var name = t["name"] || t["brand"] || kind.label;
      var m = L.marker([lat, lon], { icon: icon, pane: "poi", keyboard: false });
      var pop = document.createElement("div");
      var strong = document.createElement("b"); strong.textContent = name; pop.appendChild(strong);
      pop.appendChild(document.createElement("br")); pop.appendChild(document.createTextNode(kind.label + (t["opening_hours"] ? " / " + t["opening_hours"] : "")));
      m.bindPopup(pop); m.addTo(poiLayer[kind.id]); n++;
    });
    poiNoteSet(n + "件を表示中(地図データ: OpenStreetMap。実際の営業状況と異なる場合があります)");
  }
  function poiSchedule(force) { clearTimeout(poiTimer); poiTimer = setTimeout(function () { poiLoad(force); }, 700); }

  /* キロポスト(目安): 本線の形状に沿って起点〜終点のキロポストを等間隔で割り当てる */
  var SECPATH = {}, kpLayer = null, kpOn = false;
  function kmDist(a, b) { var kx = 111.32 * Math.cos(a[0] * Math.PI / 180); return Math.hypot((a[1] - b[1]) * kx, (a[0] - b[0]) * 110.54); }
  function kpNum(t) { return parseFloat(String(t).replace("kp", "")); }
  function buildKp() {
    D.sections.forEach(function (sc) {
      var mains = D.feats.filter(function (f) { return f.s === sc.no && f.t === "本線"; });
      var st = D.ends.filter(function (e) { return e.s === sc.no && e.t === "起点"; })[0];
      var en = D.ends.filter(function (e) { return e.s === sc.no && e.t === "終点"; })[0];
      if (!mains.length || !st || !en) return;
      var best = null;
      mains.forEach(function (f) {
        var pts = f.c.map(function (p) { return [p[1], p[0]]; }), len = 0;
        for (var i = 1; i < pts.length; i++) len += kmDist(pts[i - 1], pts[i]);
        if (!best || len > best.len) best = { pts: pts, len: len };
      });
      var sp = [st.c[1], st.c[0]];
      if (kmDist(best.pts[0], sp) > kmDist(best.pts[best.pts.length - 1], sp)) best.pts.reverse();
      var cum = [0];
      for (var i = 1; i < best.pts.length; i++) cum.push(cum[i - 1] + kmDist(best.pts[i - 1], best.pts[i]));
      var k0 = kpNum(st.kp), k1 = kpNum(en.kp), span = Math.abs(k1 - k0), ratio = span ? cum[cum.length - 1] / span : 0;
      SECPATH[sc.no] = { pts: best.pts, cum: cum, k0: k0, k1: k1, len: cum[cum.length - 1], ok: ratio > .95 && ratio < 1.05, approx: ratio > .85 && ratio <= .95 };
    });
  }
  function kpPos(sp, kp) {
    var t = (kp - sp.k0) / (sp.k1 - sp.k0) * sp.len, c = sp.cum, lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (c[m] <= t) lo = m; else hi = m; }
    var f = c[hi] === c[lo] ? 0 : (t - c[lo]) / (c[hi] - c[lo]);
    return [sp.pts[lo][0] + (sp.pts[hi][0] - sp.pts[lo][0]) * f, sp.pts[lo][1] + (sp.pts[hi][1] - sp.pts[lo][1]) * f];
  }
  function kpNearest(sp, ll) {
    ll = Array.isArray(ll) ? { lat: ll[0], lng: ll[1] } : ll;
    var bi = 0, bd = 1e9;
    for (var i = 0; i < sp.pts.length; i++) { var d = kmDist([ll.lat, ll.lng], sp.pts[i]); if (d < bd) { bd = d; bi = i; } }
    return sp.k0 + sp.cum[bi] / sp.len * (sp.k1 - sp.k0);
  }
  /* 進捗タブで記録した「測定が終わった範囲」を、地図の上で灰色に塗る */
  function rebuildDone() {
    if (!map || !window.GMS_PROGRESS) return;
    ITEMS = ITEMS.filter(function (it) { return it.kind !== "done"; });
    var rg = window.GMS_PROGRESS.ranges();
    Object.keys(rg).forEach(function (no) {
      var sp = SECPATH[no]; if (!sp || !rg[no].length) return;
      ITEMS.forEach(function (it) {
        if (it.kind !== "feat" || it.s !== no) return;
        if (!it.kv) it.kv = it.latlngs.map(function (p) { return kpNearest(sp, { lat: p[0], lng: p[1] }); });
        var cur = [];
        function flush() { if (cur.length > 1) ITEMS.push({ kind: "done", t: it.t, s: no, latlngs: cur, base: it.base, pz: {} }); cur = []; }
        for (var i = 0; i < it.latlngs.length; i++) {
          var k = it.kv[i], inn = rg[no].some(function (g) { return k >= g[0] - 1e-6 && k <= g[1] + 1e-6; });
          if (inn) cur.push(it.latlngs[i]); else flush();
        }
        flush();
      });
    });
    refreshRoutes();
  }
  function updateStatus() {
    if (!window.GMS_PROGRESS || !window.GMS_PROGRESS.status) return;
    document.querySelectorAll(".k-st").forEach(function (e) {
      var v = window.GMS_PROGRESS.status(e.dataset.st), t = v === 2 ? "調査済" : v === 1 ? "調査中" : "未調査";
      e.textContent = t; e.className = "k-st k-st-" + v;
    });
  }
  function kpStep() { return 1; }
  function fmtKp(v) { return String(Math.round(v)); }
  function kpDraw() {
    if (!kpLayer) return;
    kpLayer.clearLayers();
    var keys = D.sections.map(function (x) { return x.no; }).filter(function (k) { return sel[k]; });
    if (!kpOn || !keys.length || map.getZoom() < 11) return;
    var step = kpStep(), bnd = map.getBounds().pad(.1);
    keys.forEach(function (k) {
      var sp = SECPATH[k]; if (!sp || !(sp.ok || sp.approx)) return;
      var lo = Math.min(sp.k0, sp.k1), hi = Math.max(sp.k0, sp.k1);
      for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
        var p = kpPos(sp, v); if (!bnd.contains(p)) continue;
        var lab = fmtKp(v), icon = L.divIcon({ className: "", iconSize: [0, 0],
          html: '<div class="k-kp" style="border-color:' + secColor[k] + '">' + lab + "</div>" });
        L.marker(p, { icon: icon, pane: "kp", interactive: false, keyboard: false }).addTo(kpLayer);
      }
    });
  }

  var full = false, fsBtn = null;
  function fitAll() {
    var all = []; D.feats.forEach(function (f) { if (f.t === "本線") all = all.concat(ll(f.c)); });
    follow = false; syncFollow();
    map.fitBounds(L.latLngBounds(all), { padding: [20, 20], animate: false });
  }
  function setFull(on) {
    full = on;
    var box = map.getContainer();
    box.classList.toggle("k-full", on);
    document.body.classList.toggle("k-fs", on);
    if (fsBtn) { fsBtn.textContent = on ? "元に戻す" : "全画面"; fsBtn.title = on ? "全画面を終了" : "地図を画面いっぱいに表示"; fsBtn.setAttribute("aria-label", on ? "全画面を終了" : "地図を全画面で表示"); }
    setTimeout(function () { map.invalidateSize(); kpDraw(); }, 50);
  }

  function fitSec(k) {
    var pts = [];
    (secLayers[k] || []).forEach(function (pl) { pts = pts.concat(pl.getLatLngs()); });
    if (!pts.length) return;
    follow = false; syncFollow();
    map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], animate: false });
    var box = map.getContainer(); if (box.scrollIntoView) box.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function applySel(fit) {
    var keys = D.sections.map(function (x) { return x.no; }).filter(function (k) { return sel[k]; });
    selCount = keys.length;
    Array.prototype.forEach.call(document.querySelectorAll(".k-sec"), function (b) { b.setAttribute("aria-pressed", sel[b.dataset.no] ? "true" : "false"); });
    // 線: 選択中はその路線だけ(「他の路線も薄く表示」がオンなら薄く残す)
    refreshRoutes();
    // 起点・終点: 選択中の路線のものだけ
    Object.keys(pinsBySec).forEach(function (k) {
      pinsBySec[k].forEach(function (m) {
        var show = !selCount || sel[k];
        if (show) { if (!endsLayer.hasLayer(m)) endsLayer.addLayer(m); m.setZIndexOffset(selCount ? 1000 : 0); }
        else if (endsLayer.hasLayer(m)) endsLayer.removeLayer(m);
      });
    });
    // 選択路線の表示(現在地ボタンの右)
    banner.textContent = "";
    banner.appendChild(el("span", "k-now-l", "選択路線:"));
    if (selCount) {
      keys.forEach(function (k) {
        var sc = D.sections.filter(function (x) { return x.no === k; })[0];
        var tag = el("button", "k-tag"); tag.type = "button"; tag.title = "タップでこの路線全体を表示"; tag.addEventListener("click", function () { fitSec(k); }); var dot = el("span", "k-tag-dot"); dot.style.background = secColor[k];
        tag.appendChild(dot); tag.appendChild(document.createTextNode("国道" + sc.road + "(" + k + ")")); banner.appendChild(tag);
      });
      var gl = el("label", "k-ghost"); var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = ghost;
      cb.addEventListener("change", function () { ghost = cb.checked; applySel(false); });
      gl.appendChild(cb); gl.appendChild(document.createTextNode(" 他の路線も薄く表示"));
      var x = el("button", "k-mini", "すべて解除"); x.type = "button";
      x.addEventListener("click", function () { sel = {}; applySel(true); });
      banner.appendChild(x); banner.appendChild(gl);
    } else banner.appendChild(el("span", "k-none", "なし(全路線を表示中)"));
    kpDraw();
    if (!fit) return;
    var pts = [];
    (selCount ? keys : Object.keys(secLayers).filter(function (k) { return true; })).forEach(function (k) {
      (secLayers[k] || []).forEach(function (pl) { if (selCount || pl._kt === "本線") pts = pts.concat(pl.getLatLngs()); });
    });
    if (pts.length) { follow = false; syncFollow(); map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], animate: false }); }
  }

  /* 現在地 */
  var locBtn, followBtn, status;
  function syncFollow() { if (followBtn) { followBtn.setAttribute("aria-pressed", String(follow)); followBtn.textContent = "現在地に追従: " + (follow ? "オン" : "オフ"); } }
  function setStatus(t) { status.textContent = t; }
  function onPos(pos) {
    var p = [pos.coords.latitude, pos.coords.longitude], acc = pos.coords.accuracy;
    if (!user) {
      user = {
        circle: L.circle(p, { radius: acc, color: "#1a73e8", weight: 1, fillColor: "#1a73e8", fillOpacity: .15, pane: "me", interactive: false }).addTo(map),
        dot: L.marker(p, { icon: L.divIcon({ className: "", iconSize: [22, 22], iconAnchor: [11, 11], html: '<div class="k-me"></div>' }), pane: "mepin", interactive: false, keyboard: false }).addTo(map)
      };
      map.setView(p, Math.max(map.getZoom(), 14));
    } else { user.circle.setLatLng(p).setRadius(acc); user.dot.setLatLng(p); if (follow) map.panTo(p); }
    setStatus("現在地を表示中(誤差 約" + Math.round(acc) + "m)");
  }
  function onErr(e) {
    var m = e.code === 1 ? "位置情報の使用が許可されていません。ブラウザの設定で許可してください。" : e.code === 3 ? "現在地の取得がタイムアウトしました。" : "現在地を取得できません。";
    setStatus(m); stopWatch();
  }
  function stopWatch() {
    if (watchId != null) navigator.geolocation.clearWatch(watchId); watchId = null;
    if (user) { map.removeLayer(user.circle); map.removeLayer(user.dot); user = null; }
    locBtn.setAttribute("aria-pressed", "false"); locBtn.textContent = "現在地を表示";
  }
  function toggleLoc() {
    if (!navigator.geolocation) { setStatus("この端末では位置情報を使えません。"); return; }
    if (watchId != null) { stopWatch(); setStatus(""); return; }
    follow = true; syncFollow();
    locBtn.setAttribute("aria-pressed", "true"); locBtn.textContent = "現在地を消す"; setStatus("現在地を取得中…");
    watchId = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }

  window.initKushiro = function (root) {
    if (started) { setTimeout(function () { map.invalidateSize(); }, 50); return; }
    started = true;
    var bar = el("div", "k-bar");
    locBtn = el("button", "k-btn", "現在地を表示"); locBtn.type = "button"; locBtn.setAttribute("aria-pressed", "false");
    locBtn.addEventListener("click", toggleLoc);
    followBtn = el("button", "k-btn"); followBtn.type = "button";
    followBtn.addEventListener("click", function () { follow = !follow; syncFollow(); if (follow && user) map.panTo(user.dot.getLatLng()); });
    status = el("span", "k-status"); status.setAttribute("aria-live", "polite");
    bar.appendChild(locBtn); bar.appendChild(followBtn);
    var body = el("div", "k-body"), box = el("div", "k-map"), side = el("div", "k-side");
    body.appendChild(box); body.appendChild(side);
    banner = el("div", "k-now");
    mapNote = el("p", "k-note k-mapnote"); mapNote.setAttribute("aria-live", "polite");
    bar.appendChild(banner); bar.appendChild(status);
    root.appendChild(bar); root.appendChild(mapNote); root.appendChild(body);
    syncFollow();
    buildKp(); buildMap(box); buildPanel(side); applySel(false);
    window.addEventListener("gms-progress", function () { rebuildDone(); updateStatus(); }); rebuildDone(); updateStatus();
    side.appendChild(el("p", "k-ver", "表示バージョン: r31(" + "tile" + ")"));
    map.on("dragstart", function () { if (follow) { follow = false; syncFollow(); } });
  };
})();
