(function () {
  var ROWS = [{"n":32,"r":"240","k":"現道","a":0.0,"b":70.6,"l":70.6,"m":142.71,"c":"その他"},{"n":33,"r":"241","k":"現道","a":0.0,"b":35.2,"l":35.2,"m":69.73,"c":"その他"},{"n":34,"r":"241","k":"現道","a":46.5,"b":48.5,"l":2.0,"m":4.5,"c":"その他"},{"n":35,"r":"243","k":"現道","a":26.3,"b":140.914,"l":114.614,"m":228.158,"c":"その他"},{"n":36,"r":"244","k":"現道","a":63.2,"b":143.452,"l":80.252,"m":158.124,"c":"その他"},{"n":37,"r":"272","k":"現道","a":0.0,"b":99.966,"l":99.966,"m":235.042,"c":"その他"},{"n":38,"r":"274","k":"現道","a":295.0,"b":308.3,"l":13.3,"m":24.43,"c":"その他"},{"n":39,"r":"274","k":"現道","a":326.3,"b":389.106,"l":62.806,"m":124.202,"c":"その他"},{"n":40,"r":"38","k":"新道","a":208.6,"b":275.0,"l":66.4,"m":98.49,"c":"その他"},{"n":41,"r":"38","k":"新道","a":285.0,"b":291.913,"l":6.913,"m":25.472,"c":"その他"},{"n":42,"r":"38","k":"現道","a":245.6,"b":288.0,"l":42.4,"m":103.42,"c":"その他"},{"n":43,"r":"38","k":"現道","a":288.0,"b":298.45,"l":10.45,"m":39.25,"c":"DID区間"},{"n":44,"r":"44","k":"現道","a":5.0,"b":122.0,"l":117.0,"m":243.14,"c":"その他"},{"n":45,"r":"44","k":"現道","a":0.0,"b":5.0,"l":5.0,"m":20.87,"c":"DID区間"},{"n":46,"r":"44","k":"現道","a":122.0,"b":123.993,"l":1.993,"m":7.892,"c":"DID区間"}];
  var LS = "gms3-progress", url = window.PROGRESS_URL || "";
  var secs = ROWS.map(function (r) { return { no: "車-" + r.n, road: r.r + "号", kind: r.k, a: r.a, b: r.b, len: r.l, meas: r.m, cls: r.c }; });
  var done = {}, edit = false, root, started = false, st, openSec = {}, typing = false;
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function c1(x) { return (Math.ceil(x * 10 - 1e-9) / 10).toFixed(1); }
  function r3(x) { return Math.round(x * 1000) / 1000; }
  function fk(x) { return String(r3(x)); }
  function load() { try { done = JSON.parse(localStorage.getItem(LS) || "{}") || {}; } catch (e) { done = {}; } }
  function save() { try { localStorage.setItem(LS, JSON.stringify(done)); } catch (e) {} }
  function setStatus(t) { if (st) st.textContent = t; }
  // 記録は「路線|開始kp|終了kp」というキーで保存する(共有側は従来のまま使える)
  function segsOf(no) {
    var out = [];
    Object.keys(done).forEach(function (k) {
      var p = k.split("|"); if (p.length !== 3 || p[0] !== no) return;
      var a = parseFloat(p[1]), b = parseFloat(p[2]); if (isFinite(a) && isFinite(b) && b > a) out.push({ k: k, a: a, b: b });
    });
    return out.sort(function (x, y) { return x.a - y.a || x.b - y.b; });
  }
  function merged(s) {
    var m = [];
    segsOf(s.no).forEach(function (g) {
      var a = Math.max(s.a, g.a), b = Math.min(s.b, g.b); if (b <= a) return;
      var l = m[m.length - 1]; if (l && a <= l.b + 1e-9) l.b = Math.max(l.b, b); else m.push({ a: a, b: b });
    });
    return m;
  }
  function doneKm(s) { return merged(s).reduce(function (t, g) { return t + (g.b - g.a); }, 0); }
  function pull() {
    if (!url) return;
    fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var m = {}; (j.done || []).forEach(function (k) { m[k] = 1; }); done = m; save(); if (!typing) render(); setStatus("共有データを更新しました");
    }).catch(function () { setStatus("共有データを読み込めません(この端末の記録を表示中)"); });
  }
  function push(k, v) {
    if (!url) return;
    fetch(url, { method: "POST", body: JSON.stringify({ key: k, v: v ? 1 : 0 }) })
      .then(function () { setStatus("保存しました"); }).catch(function () { setStatus("共有への保存に失敗しました。電波を確認してください"); });
  }
  function addSeg(s, a, b) {
    if (!isFinite(a) || !isFinite(b)) { setStatus("数字を入力してください"); return false; }
    if (a > b) { var t = a; a = b; b = t; }
    a = Math.max(a, s.a); b = Math.min(b, s.b);
    if (b - a < 0.0005) { setStatus("この路線(" + fk(s.a) + "〜" + fk(s.b) + "kp)の範囲内で入力してください"); return false; }
    var k = s.no + "|" + fk(a) + "|" + fk(b);
    done[k] = 1; save(); push(k, true); setStatus("追加しました"); return true;
  }
  function delSeg(k) { delete done[k]; save(); push(k, false); render(); }
  function bar(p, c) { var b = el("div", "pg-bar"), f = el("div", "pg-fill"); f.style.width = p + "%"; if (c) f.style.background = c; b.appendChild(f); return b; }
  function strip(s) {
    var b = el("div", "pg-bar pg-strip"); merged(s).forEach(function (g) {
      var f = el("div", "pg-seg"); f.style.left = (g.a - s.a) / s.len * 100 + "%"; f.style.width = Math.max(.6, (g.b - g.a) / s.len * 100) + "%"; b.appendChild(f);
    }); return b;
  }
  function prefixEnd(s) { var m = merged(s); return m.length && m[0].a <= s.a + 1e-9 ? m[0].b : s.a; }
  function suffixStart(s) { var m = merged(s); return m.length && m[m.length - 1].b >= s.b - 1e-9 ? m[m.length - 1].a : s.b; }
  function render() {
    typing = false; root.textContent = "";
    var total = 0, dk = 0;
    secs.forEach(function (s) { total += s.len; dk += Math.min(s.len, doneKm(s)); });
    var pct = total ? dk / total * 100 : 0;
    root.appendChild(el("h2", "p-h", "進捗状況"));
    var top = el("div", "pg-top");
    top.appendChild(el("div", "pg-big", pct.toFixed(1) + "%"));
    top.appendChild(bar(pct));
    top.appendChild(el("div", "pg-sub", "完了 " + c1(dk) + " km / 総延長 " + c1(total) + " km(実施計画書の路線延長で集計)"));
    root.appendChild(top);
    var tb = el("div", "k-bar");
    var eb = el("button", "k-btn", edit ? "編集を終わる" : "進捗を入力する"); eb.type = "button"; eb.setAttribute("aria-pressed", edit ? "true" : "false");
    eb.addEventListener("click", function () { edit = !edit; render(); });
    var rb = el("button", "k-btn", "最新に更新"); rb.type = "button"; rb.addEventListener("click", function () { pull(); });
    tb.appendChild(eb); if (url) tb.appendChild(rb);
    st = el("span", "k-status", url ? "全員で共有中" : "共有の設定前です(この端末のみに保存)");
    tb.appendChild(st); root.appendChild(tb);
    if (edit) root.appendChild(el("p", "k-note", "測定が終わった範囲を、開始kpと終了kpで入力して「追加」を押してください(起点側からでも終点側からでも、順番は問いません)。間違えた記録は「×」で消せます。"));
    var dt = el("details", "pg-tbl"); dt.appendChild(el("summary", null, "R8年度 釧路開発建設部 路線表(実施計画書 表1.2より)"));
    var tw = el("div", "pg-tw"), tbl = el("table"), th = el("tr");
    ["区間", "路線", "区分", "始点kp", "終点kp", "路線延長", "計測延長", "備考"].forEach(function (h) { th.appendChild(el("th", null, h)); });
    tbl.appendChild(th);
    var tl = 0, tm = 0;
    secs.forEach(function (s) {
      var tr = el("tr"); tl += s.len; tm += s.meas;
      [s.no.replace("車-", ""), s.road, s.kind, s.a.toFixed(3), s.b.toFixed(3), s.len.toFixed(3), s.meas.toFixed(3), s.cls].forEach(function (v) { tr.appendChild(el("td", null, v)); });
      tbl.appendChild(tr);
    });
    var ts = el("tr", "pg-sum"); ["合計", "", "", "", "", tl.toFixed(3), tm.toFixed(3), ""].forEach(function (v) { ts.appendChild(el("td", null, v)); });
    tbl.appendChild(ts); tw.appendChild(tbl); dt.appendChild(tw); root.appendChild(dt);
    secs.forEach(function (s) {
      var sd = Math.min(s.len, doneKm(s)), segs = segsOf(s.no);
      var box = el("div", "pg-sec"), hd = el("div", "pg-hd");
      hd.appendChild(el("b", null, s.road + "(" + s.no + ") " + s.kind));
      hd.appendChild(el("span", "pg-n", c1(sd) + " / " + c1(s.len) + " km"));
      box.appendChild(hd);
      box.appendChild(el("div", "pg-kp", c1(s.a) + "kp ~ " + c1(s.b) + "kp" + (s.cls === "DID区間" ? "(DID区間)" : "")));
      box.appendChild(strip(s));
      if (segs.length) {
        var lst = el("div", "pg-done");
        segs.forEach(function (g) {
          var chip = el("span", "pg-chip", fk(g.a) + " 〜 " + fk(g.b) + " kp");
          if (edit) { var x = el("button", "pg-x", "×"); x.type = "button"; x.setAttribute("aria-label", "この記録を消す"); x.addEventListener("click", function () { delSeg(g.k); }); chip.appendChild(x); }
          lst.appendChild(chip);
        });
        box.appendChild(lst);
      } else box.appendChild(el("div", "pg-none", "まだ記録がありません"));
      if (edit) {
        var f = el("div", "pg-form");
        var ia = el("input"), ib = el("input");
        [ia, ib].forEach(function (i) { i.type = "number"; i.step = "any"; i.inputMode = "decimal"; i.addEventListener("input", function () { typing = true; }); });
        ia.placeholder = "開始kp"; ib.placeholder = "終了kp";
        var go = el("button", "k-btn", "追加"); go.type = "button";
        go.addEventListener("click", function () { if (addSeg(s, parseFloat(ia.value), parseFloat(ib.value))) render(); });
        f.appendChild(ia); f.appendChild(el("span", null, "〜")); f.appendChild(ib); f.appendChild(go);
        box.appendChild(f);
        var q = el("div", "pg-quick");
        var p0 = prefixEnd(s), s0 = suffixStart(s);
        var fw = el("button", "k-btn", "起点側から続き"); fw.type = "button";
        fw.addEventListener("click", function () { ia.value = fk(p0); ib.value = fk(Math.min(s.b, Math.ceil(p0 + 9 - 1e-9))); typing = true; });
        var bw = el("button", "k-btn", "終点側から続き"); bw.type = "button";
        bw.addEventListener("click", function () { ib.value = fk(s0); ia.value = fk(Math.max(s.a, Math.floor(s0 - 9 + 1e-9))); typing = true; });
        var all = el("button", "k-btn", "全区間"); all.type = "button";
        all.addEventListener("click", function () { ia.value = fk(s.a); ib.value = fk(s.b); typing = true; });
        q.appendChild(fw); q.appendChild(bw); q.appendChild(all); box.appendChild(q);
        box.appendChild(el("div", "pg-hint", "「続き」は、記録済みの端から約9km先の整数kpまでを自動で入れます。数字は書き換えられます。"));
      }
      root.appendChild(box);
    });
  }
  window.initProgress = function (r) {
    root = r; load(); render();
    if (!started) { started = true; pull(); setInterval(function () { if (!r.hidden && !edit) pull(); }, 30000); }
  };
})();
