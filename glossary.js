(function () {
  var root, q = "", editing = null, adding = false, confirmKey = null, typing = false, mode = false;
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function items() {
    var out = [];
    (window.GMS_STORE ? window.GMS_STORE.keys() : []).forEach(function (k) {
      if (k.indexOf("g|") !== 0) return;
      try { var a = JSON.parse(decodeURIComponent(k.slice(2))); if (a && a[0]) out.push({ k: k, t: String(a[0]), r: String(a[1] || ""), d: String(a[2] || "") }); } catch (e) {}
    });
    return out.sort(function (x, y) { return (x.r || x.t).localeCompare(y.r || y.t, "ja"); });
  }
  function keyOf(t, r, d) { return "g|" + encodeURIComponent(JSON.stringify([t, r, d])); }
  function form(it) {
    var f = el("div", "g-form");
    var t = el("input"); t.placeholder = "用語(例:ドップラー)"; t.value = it ? it.t : "";
    var r = el("input"); r.placeholder = "よみ(例:どっぷらー)※並び順に使います"; r.value = it ? it.r : "";
    var d = el("textarea"); d.placeholder = "説明"; d.value = it ? it.d : "";
    var msg = el("div", "g-note");
    var row = el("div", "g-act");
    var ok = el("button", "g-btn pri", "保存"); ok.type = "button";
    var cn = el("button", "g-btn", "やめる"); cn.type = "button";
    ok.addEventListener("click", function () {
      var tv = t.value.trim(); if (!tv) { msg.textContent = "用語を入力してください"; return; }
      var nk = keyOf(tv, r.value.trim(), d.value.trim());
      if (it && it.k !== nk) window.GMS_STORE.set(it.k, false);
      window.GMS_STORE.set(nk, true); editing = null; adding = false; typing = false; render();
    });
    cn.addEventListener("click", function () { editing = null; adding = false; typing = false; render(); });
    [t, r, d].forEach(function (x) { x.addEventListener("focus", function () { typing = true; }); });
    row.appendChild(ok); row.appendChild(cn);
    f.appendChild(t); f.appendChild(r); f.appendChild(d); f.appendChild(msg); f.appendChild(row);
    return f;
  }
  function render() {
    if (!root) return;
    root.textContent = "";
    root.appendChild(el("h2", "p-h", "用語集"));
    var bar = el("div", "g-bar");
    var s = el("input"); s.type = "search"; s.placeholder = "用語をさがす"; s.value = q;
    s.addEventListener("input", function () { q = s.value; typing = true; list(); });
    s.addEventListener("blur", function () { typing = false; });
    var ad = el("button", "g-btn pri", "＋ 追加"); ad.type = "button";
    ad.addEventListener("click", function () { adding = true; editing = null; render(); });
    bar.appendChild(s); bar.appendChild(ad); root.appendChild(bar);
    if (window.GMS_STORE && !window.GMS_STORE.shared) root.appendChild(el("p", "g-note", "※共有設定がないため、この端末だけに保存されます。"));
    if (adding) root.appendChild(form(null));
    var box = el("div"); box.id = "g-list"; root.appendChild(box); list();
  }
  function list() {
    var box = document.getElementById("g-list"); if (!box) return;
    box.textContent = "";
    var all = items(), n = q.trim().toLowerCase();
    var sh = all.filter(function (i) { return !n || (i.t + i.r + i.d).toLowerCase().indexOf(n) >= 0; });
    if (!sh.length) box.appendChild(el("p", "g-note", all.length ? "該当する用語がありません。" : "まだ用語がありません。「＋ 追加」から登録できます。"));
    sh.forEach(function (i) {
      if (editing === i.k) { box.appendChild(form(i)); return; }
      var c = el("div", "g-item"), h = el("h3", null, i.t);
      if (i.r) h.appendChild(el("small", null, i.r));
      c.appendChild(h);
      if (i.d) c.appendChild(el("p", null, i.d));
      var a = el("div", "g-act");
      var eb = el("button", "g-btn", "編集"); eb.type = "button";
      eb.addEventListener("click", function () { editing = i.k; adding = false; render(); });
      var db = el("button", "g-btn del", confirmKey === i.k ? "本当に削除する" : "削除"); db.type = "button";
      db.addEventListener("click", function () {
        if (confirmKey === i.k) { confirmKey = null; window.GMS_STORE.set(i.k, false); render(); }
        else { confirmKey = i.k; list(); }
      });
      a.appendChild(eb); a.appendChild(db); c.appendChild(a); box.appendChild(c);
    });
  }
  window.addEventListener("gms-progress", function () { if (root && !root.hidden && !typing && !editing && !adding) list(); });
  window.initGlossary = function (r) { root = r; render(); };
})();
