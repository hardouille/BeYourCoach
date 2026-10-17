/* BeYourCoach – silhouette 3D interactive.
   Modèle : « Anatomy study 2.0 Basemesh Human Male Body » par zeroran (Sketchfab), licence CC BY 4.0,
   simplifié pour mobile ; zones musculaires calculées d'après la position sur le corps. */
(function () {
  var T = window.THREE;
  var NAMES = ['', 'Pectoraux', 'Épaules', 'Triceps', 'Dos', 'Trapèzes', 'Épaules arrière', 'Biceps', 'Avant-bras', 'Abdos', 'Lombaires', 'Quadriceps', 'Ischios', 'Fessiers', 'Adducteurs', 'Abducteurs', 'Mollets'];
  var NM = NAMES.length;
  function hex(c) { return new T.Color(c); }

  function Body(canvas, opts) {
    var self = this; opts = opts || {};
    this.canvas = canvas; this.states = {}; this.sel = []; this.onPick = opts.onPick || null; this.ready = false;
    this.az = 0; this.el = 4; this.dist = 4.5; this.auto = false; this.dirty = true;
    this.base = hex(0xaeb2b8); this.sc = { ready: hex(0x3fbf72), recup: hex(0xe8a23a), fatigue: hex(0xe0584a), none: hex(0xaeb2b8) };
    this.selC = hex(0xe5402c);
    var r = this.r = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, preserveDrawingBuffer: !!opts.keep });
    r.setClearColor(0, 0); r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    var s = this.scene = new T.Scene();
    s.add(new T.HemisphereLight(0xe6eaee, 0x4a4f55, .7));
    var k = new T.DirectionalLight(0xffffff, .95); k.position.set(2, 3.5, 3.5); s.add(k);
    var rim = new T.DirectionalLight(0xcfe0ff, .55); rim.position.set(-3, 2, -3); s.add(rim);
    this.cam = new T.PerspectiveCamera(28, 1, .1, 30);
    this.mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: .62, metalness: 0 });
    canvas.style.touchAction = 'none';
    var pts = {}, down = null, pinch = null;
    canvas.addEventListener('pointerdown', function (e) { canvas.setPointerCapture(e.pointerId); pts[e.pointerId] = { x: e.clientX, y: e.clientY }; down = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId }; self.auto = false; if (Object.keys(pts).length === 2) pinch = self.pd(pts); });
    canvas.addEventListener('pointermove', function (e) {
      var p = pts[e.pointerId]; if (!p) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (Object.keys(pts).length === 2) { var d = self.pd(pts); if (pinch) self.dist = Math.max(2.2, Math.min(6, self.dist * pinch / d)); pinch = d; self.dirty = true; if (down) down.moved = 99; return; }
      if (down && down.id === e.pointerId) down.moved += Math.abs(dx) + Math.abs(dy);
      self.az -= dx * .008; self.el = Math.max(-25, Math.min(60, self.el + dy * .25)); self.dirty = true;
    });
    var up = function (e) {
      var wasTap = down && down.id === e.pointerId && down.moved < 7 && Object.keys(pts).length === 1;
      delete pts[e.pointerId]; pinch = null;
      if (wasTap) self.tap(e.clientX, e.clientY); down = null;
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', function (e) { delete pts[e.pointerId]; down = null; pinch = null; });
    canvas.addEventListener('wheel', function (e) { e.preventDefault(); self.dist = Math.max(2.2, Math.min(6, self.dist * (1 + e.deltaY * .001))); self.dirty = true; }, { passive: false });
    var loop = function () {
      if (self.auto) { self.az += .006; self.dirty = true; }
      if (self.dirty && self.ready) { self.dirty = false; self.draw(); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    this.resize(); window.addEventListener('resize', function () { self.resize(); });
  }
  Body.prototype.pd = function (pts) { var k = Object.keys(pts), a = pts[k[0]], b = pts[k[1]]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  Body.prototype.load = function (url) {
    var self = this;
    var b64 = /\.txt$/.test(url);
    return fetch(url).then(function (r) { return b64 ? r.text().then(function (t) { var bin = atob(t), u = new Uint8Array(bin.length), i; for (i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }) : r.arrayBuffer(); }).then(function (buf) {
      var h = new Uint32Array(buf, 0, 2), nV = h[0], nF = h[1];
      var q = new Int16Array(buf, 8, nV * 3), pos = new Float32Array(nV * 3), i;
      for (i = 0; i < pos.length; i++) pos[i] = q[i] / 16384;
      var io = 8 + nV * 6, idx = new Uint16Array(buf, io, nF * 3), lab = new Uint8Array(buf, io + nF * 6, nV);
      var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setIndex(new T.BufferAttribute(idx, 1)); g.computeVertexNormals();
      self.nV = nV; self.idx = idx; self.lab = lab; self.col = new Float32Array(nV * 3); g.setAttribute('color', new T.BufferAttribute(self.col, 3));
      self.geo = g; self.mesh = new T.Mesh(g, self.mat); self.scene.add(self.mesh);
      self.soften(); self.paint(); self.ready = true; self.dirty = true;
    });
  };
  /* poids par muscle lissés sur le maillage pour des frontières douces */
  Body.prototype.soften = function () {
    var nV = this.nV, idx = this.idx, lab = this.lab, i, j, it;
    var deg = new Uint32Array(nV + 1);
    for (i = 0; i < idx.length; i++) deg[idx[i] + 1] += 2;
    for (i = 0; i < nV; i++) deg[i + 1] += deg[i];
    var fill = deg.slice(0, nV), adj = new Uint32Array(deg[nV]);
    for (i = 0; i < idx.length; i += 3) for (j = 0; j < 3; j++) { var a = idx[i + j], b = idx[i + (j + 1) % 3], c = idx[i + (j + 2) % 3]; adj[fill[a]++] = b; adj[fill[a]++] = c; }
    var W = new Float32Array(nV * NM), W2 = new Float32Array(nV * NM);
    for (i = 0; i < nV; i++) W[i * NM + lab[i]] = 1;
    for (it = 0; it < 7; it++) {
      for (i = 0; i < nV; i++) {
        var s = deg[i], e = deg[i + 1], n = e - s, o = i * NM, m;
        for (m = 0; m < NM; m++) W2[o + m] = 0;
        for (j = s; j < e; j++) { var p = adj[j] * NM; for (m = 0; m < NM; m++) W2[o + m] += W[p + m]; }
        for (m = 0; m < NM; m++) W2[o + m] = .4 * W[o + m] + .6 * (n ? W2[o + m] / n : 0);
      }
      var t = W; W = W2; W2 = t;
    }
    this.W = W;
  };
  Body.prototype.paint = function () {
    if (!this.W) return;
    var nV = this.nV, W = this.W, col = this.col, b = this.base, selSet = {}, tint = [], m, i;
    this.sel.forEach(function (n) { selSet[n] = 1; });
    for (m = 1; m < NM; m++) {
      var nm = NAMES[m], c, a;
      if (selSet[nm]) { c = this.selC; a = .95; }
      else { var st = this.states[nm] || 'none'; c = this.sc[st] || this.sc.none; a = st === "none" ? 0 : .6; }
      tint.push([c.r, c.g, c.b, a]);
    }
    for (i = 0; i < nV; i++) {
      var o = i * NM, r = b.r, g = b.g, bl = b.b, wsum = 0, rr = 0, gg = 0, bb = 0;
      for (m = 1; m < NM; m++) {
        var w = W[o + m]; if (w < .02) continue; var t = tint[m - 1], k = w * t[3];
        rr += (t[0] - b.r) * k; gg += (t[1] - b.g) * k; bb += (t[2] - b.b) * k;
      }
      col[i * 3] = r + rr; col[i * 3 + 1] = g + gg; col[i * 3 + 2] = bl + bb;
    }
    this.geo.attributes.color.needsUpdate = true; this.dirty = true;
  };
  Body.prototype.set = function (states, sel) { this.states = states || this.states; if (sel) this.sel = sel; this.paint(); };
  Body.prototype.setView = function (az, el) { this.az = az; if (el != null) this.el = el; this.dirty = true; };
  Body.prototype.resize = function () {
    var w = this.canvas.clientWidth || 300, h = this.canvas.clientHeight || 400;
    this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.dirty = true;
  };
  Body.prototype.draw = function () {
    var el = this.el * Math.PI / 180, ty = .9, d = this.dist;
    this.cam.position.set(d * Math.sin(this.az) * Math.cos(el), ty + d * Math.sin(el), d * Math.cos(this.az) * Math.cos(el));
    this.cam.lookAt(0, ty, 0); this.r.render(this.scene, this.cam);
  };
  Body.prototype.tap = function (cx, cy) {
    if (!this.ready) return;
    var rc = this.canvas.getBoundingClientRect(), ray = new T.Raycaster();
    ray.setFromCamera(new T.Vector2(((cx - rc.left) / rc.width) * 2 - 1, -((cy - rc.top) / rc.height) * 2 + 1), this.cam);
    var hit = ray.intersectObject(this.mesh)[0]; if (!hit) return;
    var f = hit.face, W = this.W, best = 0, bm = 0, m;
    var o = [f.a, f.b, f.c].reduce(function (acc, v) { return acc; }, 0);
    var acc = new Float32Array(NM), vs = [f.a, f.b, f.c], bc = hit.barycoord || null, i;
    for (i = 0; i < 3; i++) for (m = 1; m < NM; m++) acc[m] += W[vs[i] * NM + m];
    for (m = 1; m < NM; m++) if (acc[m] > best) { best = acc[m]; bm = m; }
    if (bm && this.onPick) this.onPick(NAMES[bm]);
  };
  window.BYCBody = { Body: Body, NAMES: NAMES };
})();
