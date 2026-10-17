/* BeYourCoach – silhouette 3D interactive.
   Modèles : « Anatomy study 2.0 Basemesh Human Male Body » par zeroran et « female muscle human body » par mina (Sketchfab), licence CC BY 4.0,
   simplifié pour mobile ; zones musculaires calculées d'après la position sur le corps. */
(function () {
  var T = window.THREE;
  var NAMES = ['', 'Pectoraux', 'Épaules', 'Triceps', 'Dos', 'Trapèzes', 'Épaules arrière', 'Biceps', 'Avant-bras', 'Abdos', 'Lombaires', 'Quadriceps', 'Ischios', 'Fessiers', 'Adducteurs', 'Abducteurs', 'Mollets'];
  var NM = NAMES.length;
  function hex(c) { return new T.Color(c); }

  function Body(canvas, opts) {
    var self = this; opts = opts || {};
    this.canvas = canvas; this.states = {}; this.sel = []; this.onPick = opts.onPick || null; this.onFail = opts.onFail || null; this.ready = false;
    this.az = 0; this.el = 4; this.dist = 4.5; this.auto = false; this.dirty = true;
    this.base = hex(0xaeb2b8); this.sc = { ready: hex(0x3fbf72), recup: hex(0xe8a23a), fatigue: hex(0xe0584a), none: hex(0xaeb2b8) };
    this.selC = hex(0xe5402c);
    var r = this.r = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, preserveDrawingBuffer: !!opts.keep });
    r.setClearColor(0, 0); r.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
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
      if (self.dirty && self.ready) { self.dirty = false; try { self.draw(); } catch (e) { self.ready = false; if (self.onFail) self.onFail(e); } }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    this.resize(); window.addEventListener('resize', function () { self.resize(); });
  }
  Body.prototype.pd = function (pts) { var k = Object.keys(pts), a = pts[k[0]], b = pts[k[1]]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  Body.prototype.load = function (url) {
    var self = this; this.ready = false; this.url = url;
    var b64 = /\.txt$/.test(url);
    return fetch(url).then(function (r) { return b64 ? r.text().then(function (t) { var bin = atob(t), u = new Uint8Array(bin.length), i; for (i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }) : r.arrayBuffer(); }).then(function (buf) {
      var h = new Uint32Array(buf, 0, 2), nV = h[0], nF = h[1];
      var q = new Int16Array(buf, 8, nV * 3), pos = new Float32Array(nV * 3), i;
      for (i = 0; i < pos.length; i++) pos[i] = q[i] / 16384;
      var io = 8 + nV * 6, idx = new Uint16Array(buf, io, nF * 3), lo = io + nF * 6, lab = new Uint8Array(buf, lo, nV), lab2 = new Uint8Array(buf, lo + nV, nV), wt = new Uint8Array(buf, lo + nV * 2, nV);
      var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setIndex(new T.BufferAttribute(idx, 1)); g.computeVertexNormals();
      self.nV = nV; self.idx = idx; self.lab = lab; self.lab2 = lab2; self.wt = wt; self.col = new Float32Array(nV * 3); g.setAttribute('color', new T.BufferAttribute(self.col, 3));
      if (self.mesh) { self.scene.remove(self.mesh); self.geo.dispose(); }
      self.geo = g; self.mesh = new T.Mesh(g, self.mat); self.scene.add(self.mesh);
      self.W = 1; self.paint(); self.ready = true; self.dirty = true;
    });
  };
  Body.prototype.paint = function () {
    if (!this.W) return;
    var nV = this.nV, col = this.col, b = this.base, selSet = {}, tint = [[0, 0, 0, 0]], m, i;
    this.sel.forEach(function (n) { selSet[n] = 1; });
    for (m = 1; m < NM; m++) {
      var nm = NAMES[m], c, a;
      if (selSet[nm]) { c = this.selC; a = .95; }
      else { var st = this.states[nm] || 'none'; c = this.sc[st] || this.sc.none; a = st === 'none' ? 0 : .6; }
      tint.push([c.r - b.r, c.g - b.g, c.b - b.b, a]);
    }
    var l1 = this.lab, l2 = this.lab2, wt = this.wt;
    for (i = 0; i < nV; i++) {
      var w1 = wt[i] / 255, t1 = tint[l1[i]], t2 = tint[l2[i]], k1 = w1 * t1[3], k2 = (1 - w1) * t2[3];
      col[i * 3] = b.r + t1[0] * k1 + t2[0] * k2; col[i * 3 + 1] = b.g + t1[1] * k1 + t2[1] * k2; col[i * 3 + 2] = b.b + t1[2] * k1 + t2[2] * k2;
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
    var f = hit.face, best = 0, bm = 0, m, acc = new Float32Array(NM), vs = [f.a, f.b, f.c], i;
    for (i = 0; i < 3; i++) { var w1 = this.wt[vs[i]] / 255; acc[this.lab[vs[i]]] += w1; acc[this.lab2[vs[i]]] += 1 - w1; }
    for (m = 1; m < NM; m++) if (acc[m] > best) { best = acc[m]; bm = m; }
    if (bm && this.onPick) this.onPick(NAMES[bm]);
  };
  window.BYCBody = { Body: Body, NAMES: NAMES };
})();
