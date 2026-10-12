(function () {
  var ROWS = [{"n":32,"r":"240","k":"現道","a":0.0,"b":70.6,"l":70.6,"m":142.71,"c":"その他"},{"n":33,"r":"241","k":"現道","a":0.0,"b":35.2,"l":35.2,"m":69.73,"c":"その他"},{"n":34,"r":"241","k":"現道","a":46.5,"b":48.5,"l":2.0,"m":4.5,"c":"その他"},{"n":35,"r":"243","k":"現道","a":26.3,"b":140.914,"l":114.614,"m":228.158,"c":"その他"},{"n":36,"r":"244","k":"現道","a":63.2,"b":143.452,"l":80.252,"m":158.124,"c":"その他"},{"n":37,"r":"272","k":"現道","a":0.0,"b":99.966,"l":99.966,"m":235.042,"c":"その他"},{"n":38,"r":"274","k":"現道","a":295.0,"b":308.3,"l":13.3,"m":24.43,"c":"その他"},{"n":39,"r":"274","k":"現道","a":326.3,"b":389.106,"l":62.806,"m":124.202,"c":"その他"},{"n":40,"r":"38","k":"新道","a":208.6,"b":275.0,"l":66.4,"m":98.49,"c":"その他"},{"n":41,"r":"38","k":"新道","a":285.0,"b":291.913,"l":6.913,"m":25.472,"c":"その他"},{"n":42,"r":"38","k":"現道","a":245.6,"b":288.0,"l":42.4,"m":103.42,"c":"その他"},{"n":43,"r":"38","k":"現道","a":288.0,"b":298.45,"l":10.45,"m":39.25,"c":"DID区間"},{"n":44,"r":"44","k":"現道","a":5.0,"b":122.0,"l":117.0,"m":243.14,"c":"その他"},{"n":45,"r":"44","k":"現道","a":0.0,"b":5.0,"l":5.0,"m":20.87,"c":"DID区間"},{"n":46,"r":"44","k":"現道","a":122.0,"b":123.993,"l":1.993,"m":7.892,"c":"DID区間"}];
  var BLOCK = 9, LS = "gms3-progress", url = window.PROGRESS_URL || "";
  var secs = ROWS.map(function (r) { return { no: "車-" + r.n, road: r.r + "号", kind: r.k, a: r.a, b: r.b, len: r.l, meas: r.m, cls: r.c }; }), done = {}, edit = false, root, started = false, st;
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function blocks(s) { var n = Math.ceil(s.len / BLOCK - 1e-9), a = []; for (var i = 0; i < n; i++) a.push({ k: s.no + ":" + i, i: i, km: Math.min(BLOCK, s.len - i * BLOCK), a: s.a + i * BLOCK, b: Math.min(s.b, s.a + (i + 1) * BLOCK) }); return a; }
  function fk(x) { return (Math.round(x * 10) / 10).toString(); }
  function load() { try { done = JSON.parse(localStorage.getItem(LS) || "{}") || {}; } catch (e) { done = {}; } }
  function save() { try { localStorage.setItem(LS, JSON.stringify(done)); } catch (e) {} }
  function setStatus(t) { st.textContent = t; }
  function pull() {
    if (!url) return;
    fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var m = {}; (j.done || []).forEach(function (k) { m[k] = 1; }); done = m; save(); render(); setStatus("共有データを更新しました");
    }).catch(function () { setStatus("共有データを読み込めません(この端末の記録を表示中)"); });
  }
  function push(k, v) {
    if (!url) return;
    fetch(url, { method: "POST", body: JSON.stringify({ key: k, v: v ? 1 : 0 }) })
      .then(function () { setStatus("保存しました"); }).catch(function () { setStatus("共有への保存に失敗しました。電波を確認してください"); });
  }
  function toggle(k) { if (done[k]) delete done[k]; else done[k] = 1; save(); push(k, !!done[k]); render(); }
  function bar(p, c) { var b = el("div", "pg-bar"), f = el("div", "pg-fill"); f.style.width = p + "%"; if (c) f.style.background = c; b.appendChild(f); return b; }
  function render() {
    root.textContent = "";
    var total = 0, dk = 0;
    secs.forEach(function (s) { blocks(s).forEach(function (b) { total += b.km; if (done[b.k]) dk += b.km; }); });
    var pct = total ? dk / total * 100 : 0;
    root.appendChild(el("h2", "p-h", "進捗状況"));
    var top = el("div", "pg-top");
    top.appendChild(el("div", "pg-big", pct.toFixed(1) + "%"));
    top.appendChild(bar(pct));
    top.appendChild(el("div", "pg-sub", "完了 " + dk.toFixed(1) + " km / 全体 " + total.toFixed(1) + " km(路線延長で集計・" + BLOCK + "kmごとの区間)"));
    root.appendChild(top);
    var tb = el("div", "k-bar");
    var eb = el("button", "k-btn", edit ? "編集を終わる" : "進捗を入力する"); eb.type = "button"; eb.setAttribute("aria-pressed", edit ? "true" : "false");
    eb.addEventListener("click", function () { edit = !edit; render(); });
    var rb = el("button", "k-btn", "最新に更新"); rb.type = "button"; rb.addEventListener("click", function () { pull(); });
    tb.appendChild(eb); if (url) tb.appendChild(rb);
    st = el("span", "k-status", url ? "全員で共有中" : "共有の設定前です(この端末のみに保存)");
    tb.appendChild(st); root.appendChild(tb);
    if (edit) root.appendChild(el("p", "k-note", "終わった区間をタップすると完了になります。もう一度タップすると未完了に戻ります。"));
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
      var bl = blocks(s), sd = 0; bl.forEach(function (b) { if (done[b.k]) sd += b.km; });
      var box = el("div", "pg-sec"), hd = el("div", "pg-hd");
      hd.appendChild(el("b", null, s.road + "(" + s.no + ") " + s.kind));
      hd.appendChild(el("span", "pg-n", sd.toFixed(1) + " / " + s.len.toFixed(1) + " km"));
      box.appendChild(hd); box.appendChild(el("div", "pg-kp", "kp " + fk(s.a) + " 〜 " + fk(s.b) + (s.cls === "DID区間" ? "(DID区間)" : ""))); box.appendChild(bar(s.len ? sd / s.len * 100 : 0));
      if (edit) {
        var g = el("div", "pg-blocks");
        bl.forEach(function (b) {
          var c = el("button", "pg-blk", fk(b.a) + "〜" + fk(b.b));
          c.type = "button"; c.setAttribute("aria-pressed", done[b.k] ? "true" : "false");
          c.addEventListener("click", function () { toggle(b.k); }); g.appendChild(c);
        });
        box.appendChild(g);
      }
      root.appendChild(box);
    });
  }
  window.initProgress = function (r) {
    root = r; load(); render();
    if (!started) { started = true; pull(); setInterval(function () { if (!r.hidden && !edit) pull(); }, 30000); }
  };
})();
