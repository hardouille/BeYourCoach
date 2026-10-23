/* BeYourCoach : compte + synchronisation entre appareils (Firebase Auth + Firestore).
   Hors ligne d'abord : tout reste dans localStorage, le cloud n'est qu'une copie partagée.
   Le SDK Firebase n'est chargé que si tu te connectes. */
(function () {
'use strict';
var CFG = {
  apiKey: 'AIzaSyBi9gdQebTNBxbWtKo_KmTpbt2cDgJspdU',
  authDomain: 'beyourcoach-936d6.firebaseapp.com',
  projectId: 'beyourcoach-936d6',
  storageBucket: 'beyourcoach-936d6.firebasestorage.app',
  messagingSenderId: '665931259732',
  appId: '1:665931259732:web:38cd5b80f526e7d15bf2c1'
};
var GCID = '665931259732-0l70gi1r1gu6bjhgtvmhek6kuc06re0f.apps.googleusercontent.com'; /* identifiant client Web de Google (Firebase > Authentication > Google) */
var VER = '10.14.1', CHUNK = 300000;
var SKIP = { 'cds.nav': 1, 'cds.tab': 1, 'cds.active': 1, 'cds.ai': 1, 'cds.chat': 1, 'cds.lastbackup': 1,
  'cds.theme': 1, 'cds.snd': 1, 'cds.inst': 1, 'cds.legal': 1, 'cds.updated': 1, 'cds.autobk': 1 };
var K_META = 'cds.sync.meta', K_BASE = 'cds.sync.base', K_USER = 'cds.sync.user', K_LAST = 'cds.sync.last';
var rawSet = Storage.prototype.setItem, rawRem = Storage.prototype.removeItem, rawGet = Storage.prototype.getItem;
var ST = { status: 'off', msg: '', user: null, last: 0, busy: false, confirmDel: false, ready: false, loading: false };
var FORM = { mail: '', pw: '' };
var fb = null, auth = null, db = null, applying = false, timer = null, again = false;
var DBG = [];
function dbg(m) { DBG.push(new Date().toLocaleTimeString('fr-FR') + ' ' + m); if (DBG.length > 14) DBG.shift(); }
var API = { state: ST, onchange: null, isBusy: function () { return false; } };

function get(k) { try { return rawGet.call(localStorage, k); } catch (e) { return null; } }
function put(k, v) { try { rawSet.call(localStorage, k, v); return true; } catch (e) { return false; } }
function del(k) { try { rawRem.call(localStorage, k); } catch (e) {} }
function jget(k) { try { var o = JSON.parse(get(k) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
function syncable(k) { return typeof k === 'string' && k.indexOf('cds.') === 0 && k.indexOf('cds.sync.') !== 0 && !SKIP[k]; }
function hash(s) { var h = 5381, i; for (i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) | 0; return s.length + ':' + (h >>> 0); }
function note() { try { if (API.onchange) API.onchange(); } catch (e) {} }
function set(status, msg) { dbg(status + (msg ? ' : ' + msg : '')); ST.status = status; ST.msg = msg || ''; note(); }
ST.last = +get(K_LAST) || 0;

/* ---------- suivi des modifications locales ---------- */
function touch(k, removed) {
  if (applying || !syncable(k)) return;
  var meta = jget(K_META), base = jget(K_BASE);
  if (removed) {
    if (!base[k]) { delete meta[k]; } else meta[k] = { t: Date.now(), del: 1 };
  } else {
    var v = get(k), b = base[k];
    if (b && v !== null && b.h === hash(v)) delete meta[k]; else meta[k] = { t: Date.now() };
  }
  put(K_META, JSON.stringify(meta));
  plan();
}
Storage.prototype.setItem = function (k, v) {
  var r = rawSet.apply(this, arguments);
  try { if (this === window.localStorage) touch(String(k), false); } catch (e) {}
  return r;
};
Storage.prototype.removeItem = function (k) {
  var r = rawRem.apply(this, arguments);
  try { if (this === window.localStorage) touch(String(k), true); } catch (e) {}
  return r;
};
function plan() {
  if (!ST.user) return;
  clearTimeout(timer);
  timer = setTimeout(function () { sync(); }, 4000);
}

/* ---------- chargement du SDK ---------- */
function loadScript(src) {
  return new Promise(function (ok, ko) {
    var s = document.createElement('script'); s.src = src; s.async = false;
    s.onload = ok; s.onerror = function () { ko(new Error('net')); };
    document.head.appendChild(s);
  });
}
function init() {
  if (fb) return Promise.resolve();
  if (ST.loading) return ST.loading;
  var base = 'https://www.gstatic.com/firebasejs/' + VER + '/firebase-';
  ST.loading = (window.firebase ? Promise.resolve() :
    loadScript(base + 'app-compat.js').then(function () { return loadScript(base + 'auth-compat.js'); }).then(function () { return loadScript(base + 'firestore-compat.js'); }))
    .then(function () {
      fb = window.firebase; dbg('SDK chargé');
      if (!fb.apps.length) fb.initializeApp(CFG);
      auth = fb.auth(); db = fb.firestore();
      try { if (auth.getRedirectResult) auth.getRedirectResult().then(function (r) { if (!r || !r.user) { if (jget(K_USER).pending) del(K_USER); } }, function (e) { del(K_USER); set('err', errText(e)); }); } catch (e) {}
      ST.ready = true; ST.loading = false;
      auth.onAuthStateChanged(function (u) { onUser(u); });
    }, function (e) { ST.loading = false; dbg('SDK erreur ' + ((e && e.message) || e)); throw e; });
  return ST.loading;
}
function onUser(u) {
        dbg('utilisateur ' + (u ? u.email : 'aucun'));
        if (u) {
          ST.user = { uid: u.uid, email: u.email || '' };
          var prev = jget(K_USER);
          if (prev.uid && prev.uid !== u.uid) { del(K_BASE); del(K_META); }
          put(K_USER, JSON.stringify({ uid: u.uid, email: u.email || '' }));
          set('idle', 'Connecté : ' + (u.email || 'compte Google') + '. Synchronisation…');
          sync();
        } else { ST.user = null; if (ST.status === 'err' || ST.status === 'syncing') note(); else set('off', ST.msg); }
}

/* ---------- messages d'erreur ---------- */
function errText(e) {
  var c = (e && (e.code || e.message)) || '';
  var m = {
    'auth/invalid-email': 'Adresse e-mail invalide.',
    'auth/missing-email': 'Saisis ton adresse e-mail.',
    'auth/missing-password': 'Saisis ton mot de passe.',
    'auth/user-not-found': 'Aucun compte avec cet e-mail.',
    'auth/wrong-password': 'Mot de passe incorrect.',
    'auth/invalid-credential': 'E-mail ou mot de passe incorrect.',
    'auth/invalid-login-credentials': 'E-mail ou mot de passe incorrect.',
    'auth/email-already-in-use': 'Un compte existe déjà avec cet e-mail : connecte-toi.',
    'auth/weak-password': 'Mot de passe trop court (6 caractères minimum).',
    'auth/network-request-failed': 'Pas de connexion internet.',
    'auth/too-many-requests': 'Trop d\'essais. Réessaie dans quelques minutes.',
    'auth/popup-closed-by-user': 'Connexion annulée.',
    'auth/cancelled-popup-request': 'Connexion annulée.',
    'auth/popup-blocked': 'Le navigateur a bloqué la fenêtre Google. Utilise l\'e-mail.',
    'auth/operation-not-allowed': 'Ce mode de connexion n\'est pas activé dans Firebase.',
    'auth/unauthorized-domain': 'Ce site n\'est pas autorisé dans Firebase (Authentication, Domaines autorisés).',
    'auth/requires-recent-login': 'Reconnecte-toi puis recommence.',
    'permission-denied': 'Accès refusé par Firestore : vérifie les règles de sécurité de la base.',
    'unavailable': 'Serveur injoignable pour l\'instant. Réessaie plus tard.',
    'net': 'Pas de connexion internet.'
  };
  if (m[c]) return m[c];
  if (/Missing or insufficient permissions/i.test(String(c))) return m['permission-denied'];
  if (/network|offline|Failed to fetch/i.test(String(c))) return m['net'];
  return 'Erreur : ' + String(c).slice(0, 120);
}

/* ---------- fusion ---------- */
function mergeLog(a, b) {
  var out = [], seen = {};
  function add(x) { if (!x) return; var id = x.id != null ? String(x.id) : JSON.stringify(x); if (seen[id]) return; seen[id] = 1; out.push(x); }
  try { (JSON.parse(a) || []).forEach(add); } catch (e) {}
  try { (JSON.parse(b) || []).forEach(add); } catch (e) {}
  out.sort(function (x, y) { return (+x.t0 || +x.start || 0) - (+y.t0 || +y.start || 0); });
  return JSON.stringify(out);
}
function readRemote() {
  var col = db.collection('users').doc(ST.user.uid).collection('kv');
  return col.get().then(function (snap) {
    var raw = {}, out = {};
    snap.forEach(function (d) { raw[d.id] = d.data() || {}; });
    Object.keys(raw).forEach(function (id) {
      if (id.indexOf('~') >= 0) return;
      var d = raw[id], n = d.n || 1, v = d.v || '', i;
      for (i = 1; i < n; i++) v += (raw[id + '~' + i] && raw[id + '~' + i].v) || '';
      out[id] = { t: +d.t || 0, del: !!d.del, v: v, n: n };
    });
    return out;
  });
}
function localKeys() {
  var a = [], i, k;
  try { for (i = 0; i < localStorage.length; i++) { k = localStorage.key(i); if (syncable(k)) a.push(k); } } catch (e) {}
  return a;
}

function sync(force) {
  if (!ST.user || !db) return Promise.resolve();
  if (ST.busy) { again = true; return Promise.resolve(); }
  if (navigator.onLine === false) { set('err', 'Hors ligne : la synchro reprendra avec le réseau.'); return Promise.resolve(); }
  ST.busy = true; set('syncing');
  clearTimeout(timer);
  return readRemote().then(function (remote) {
    var meta = jget(K_META), base = jget(K_BASE), keys = {}, pulls = [], pushes = [], busy = false;
    try { busy = !!API.isBusy(); } catch (e) {}
    localKeys().forEach(function (k) { keys[k] = 1; });
    Object.keys(meta).forEach(function (k) { if (syncable(k)) keys[k] = 1; });
    Object.keys(remote).forEach(function (k) { if (syncable(k)) keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      var L = get(k), R = remote[k], b = base[k], m = meta[k];
      var lChg = !!m || (!b && L !== null);
      if (!R) { if (L !== null) pushes.push({ k: k, v: L, t: m ? m.t : Date.now() }); return; }
      var rChg = !b || b.t !== R.t;
      if (!rChg && !lChg) return;
      if (!R.del && L !== null && L === R.v) { base[k] = { t: R.t, h: hash(L) }; delete meta[k]; return; }
      if (R.del && L === null) { base[k] = { t: R.t, h: '' }; delete meta[k]; return; }
      if (rChg && !lChg) { pulls.push({ k: k, r: R }); return; }
      if (!rChg && lChg) { pushes.push(m && m.del ? { k: k, del: 1, t: m.t } : { k: k, v: L, t: m ? m.t : Date.now() }); return; }
      /* modifié des deux côtés */
      if (k === 'cds.log' && L !== null && !R.del) { if (busy) return; var mg = mergeLog(L, R.v); pulls.push({ k: k, r: { t: R.t, v: mg, del: false, n: 1 }, merged: true }); pushes.push({ k: k, v: mg, t: Date.now() }); return; }
      var lt = m ? m.t : 0;
      if (R.t >= lt) pulls.push({ k: k, r: R }); else pushes.push(m && m.del ? { k: k, del: 1, t: lt } : { k: k, v: L, t: lt });
    });
    /* pendant une séance en cours, on ne remplace rien sur l'appareil */
    var applied = 0;
    if (!busy) {
      applying = true;
      try {
        pulls.forEach(function (p) {
          if (p.merged) { put(p.k, p.r.v); applied++; return; }
          if (p.r.del) { del(p.k); base[p.k] = { t: p.r.t, h: '' }; }
          else { put(p.k, p.r.v); base[p.k] = { t: p.r.t, h: hash(p.r.v) }; }
          delete meta[p.k]; applied++;
        });
      } finally { applying = false; }
    }
    put(K_META, JSON.stringify(meta)); put(K_BASE, JSON.stringify(base));
    return writeAll(pushes, remote).then(function (done) {
      done.forEach(function (p) { base[p.k] = { t: p.t, h: p.del ? '' : hash(p.v) }; });
      var m2 = jget(K_META); done.forEach(function (p) { if (m2[p.k] && m2[p.k].t <= p.t + 5) delete m2[p.k]; });
      put(K_META, JSON.stringify(m2)); put(K_BASE, JSON.stringify(base));
      ST.last = Date.now(); put(K_LAST, String(ST.last));
      ST.busy = false;
      set('ok', busy && pulls.length ? 'Séance en cours : les données reçues seront appliquées après.' : 'Connecté et synchronisé.');
      if (applied && !busy) {
        set('ok', 'Données mises à jour depuis ton compte…');
        setTimeout(function () { location.reload(); }, 700);
      }
      if (again) { again = false; plan(); }
    });
  }).catch(function (e) {
    ST.busy = false; set('err', errText(e));
  });
}

function writeAll(list, remote) {
  var uid = ST.user.uid, col = db.collection('users').doc(uid).collection('kv'), ops = [], done = [];
  list.forEach(function (p) {
    if (p.del) { ops.push({ id: p.k, data: { t: p.t, del: true, n: 1, v: '' } }); var o2 = remote[p.k] ? remote[p.k].n : 1, q; for (q = 1; q < o2; q++) ops.push({ id: p.k + '~' + q, rm: true }); done.push(p); return; }
    var n = Math.max(1, Math.ceil(p.v.length / CHUNK)), i, old = remote[p.k] ? remote[p.k].n : 1;
    for (i = 0; i < n; i++) ops.push({ id: i ? p.k + '~' + i : p.k, data: i ? { v: p.v.slice(i * CHUNK, (i + 1) * CHUNK) } : { t: p.t, n: n, v: p.v.slice(0, CHUNK) } });
    for (i = n; i < old; i++) ops.push({ id: p.k + '~' + i, rm: true });
    done.push(p);
  });
  if (!ops.length) return Promise.resolve(done);
  var chain = Promise.resolve(), j;
  function step(slice) { return function () { var b = db.batch(); slice.forEach(function (o) { var r = col.doc(o.id); if (o.rm) b.delete(r); else b.set(r, o.data); }); return b.commit(); }; }
  for (j = 0; j < ops.length; j += 400) chain = chain.then(step(ops.slice(j, j + 400)));
  return chain.then(function () { return done; });
}

/* ---------- actions ---------- */
function run(fn) {
  set('syncing', 'Connexion en cours…');
  return init().then(fn).catch(function (e) { set('err', errText(e)); });
}
API.signIn = function (mail, pw) { return run(function () { return auth.signInWithEmailAndPassword(mail, pw); }); };
API.signUp = function (mail, pw) { return run(function () { return auth.createUserWithEmailAndPassword(mail, pw); }); };
API.reset = function (mail) {
  if (!mail) { set('err', 'Saisis d\'abord ton adresse e-mail.'); return Promise.resolve(); }
  return run(function () { return auth.sendPasswordResetEmail(mail).then(function () { set(ST.user ? 'ok' : 'off', 'E-mail de réinitialisation envoyé à ' + mail + ' (regarde aussi les spams).'); }); });
};
API.google = function () {
  return run(function () {
    var pr = new fb.auth.GoogleAuthProvider();
    set('syncing', 'Ouverture de Google… Choisis ton compte dans la fenêtre qui s\'ouvre.');
    dbg('popup Google');
    return auth.signInWithPopup(pr).then(function (r) { dbg('popup ok ' + (r && r.user ? r.user.email : 'sans utilisateur')); if (r && r.user && !ST.user) onUser(r.user); }).catch(function (e) {
      dbg('popup erreur ' + (e && (e.code || e.message)));
      if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) { put(K_USER, '{"pending":1}'); return auth.signInWithRedirect(pr); }
      throw e;
    });
  });
};
API.signOut = function () {
  if (!auth) return Promise.resolve();
  return sync().then(function () { return auth.signOut(); }).then(function () { del(K_USER); del(K_BASE); del(K_META); ST.confirmDel = false; set('off'); });
};
var gsiReady = false;
API.mount = function () {
  var el = document.getElementById('sy-gbtn'); if (!el || !GCID) return;
  function draw() {
    try {
      if (!gsiReady) {
        google.accounts.id.initialize({ client_id: GCID, ux_mode: 'popup', callback: function (r) {
          dbg('Google : identifiant reçu');
          run(function () { return auth.signInWithCredential(fb.auth.GoogleAuthProvider.credential(r.credential)); });
        } });
        gsiReady = true;
      }
      el.innerHTML = '';
      google.accounts.id.renderButton(el, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', locale: 'fr', width: Math.min(360, Math.max(200, el.clientWidth || 300)) });
    } catch (e) { dbg('Google bouton erreur ' + (e && e.message)); }
  }
  init().catch(function () {});
  if (window.google && window.google.accounts) draw();
  else loadScript('https://accounts.google.com/gsi/client').then(draw, function () { dbg('Google indisponible'); el.innerHTML = '<div class="legend">Connexion Google indisponible hors ligne.</div>'; });
};
API.dbg = dbg;
API.syncNow = function () { return run(function () { return sync(true); }); };
API.deleteAccount = function () {
  if (!ST.user) return Promise.resolve();
  if (!ST.confirmDel) { ST.confirmDel = true; note(); return Promise.resolve(); }
  ST.confirmDel = false; set('syncing');
  var col = db.collection('users').doc(ST.user.uid).collection('kv');
  return col.get().then(function (snap) {
    var docs = []; snap.forEach(function (d) { docs.push(d.ref); });
    var chain = Promise.resolve(), j;
    function step(sl) { return function () { var b = db.batch(); sl.forEach(function (r) { b.delete(r); }); return b.commit(); }; }
    for (j = 0; j < docs.length; j += 400) chain = chain.then(step(docs.slice(j, j + 400)));
    return chain;
  }).then(function () {
    del(K_BASE); del(K_META);
    return auth.currentUser.delete().then(function () { del(K_USER); set('off', 'Compte et données en ligne supprimés. Tes données restent sur cet appareil.'); },
      function (e) { set('err', 'Données en ligne supprimées, mais le compte demande une reconnexion pour être supprimé. ' + errText(e)); });
  }).catch(function (e) { set('err', errText(e)); });
};
API.cancelDel = function () { ST.confirmDel = false; note(); };

function ago(t) {
  if (!t) return 'jamais';
  var s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'à l\'instant';
  if (s < 3600) return 'il y a ' + Math.round(s / 60) + ' min';
  if (s < 86400) return 'il y a ' + Math.round(s / 3600) + ' h';
  return 'il y a ' + Math.round(s / 86400) + ' j';
}
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function standalone() { try { return !!(navigator.standalone || window.matchMedia('(display-mode: standalone)').matches); } catch (e) { return false; } }

API.card = function () {
  var h = '<section class="sec"><div class="lab">Compte et synchronisation</div><div class="drop">';
  var msg = ST.msg ? '<div class="msg' + (ST.status === 'err' ? ' err' : '') + '">' + esc(ST.msg) + '</div>' : '';
  if (ST.user) {
    h += '<div class="ename">Connecté</div><div class="legend">' + esc(ST.user.email) + '<br>' +
      (ST.status === 'syncing' ? 'Synchronisation en cours…' : 'Dernière synchro : ' + ago(ST.last)) + '</div>' + msg +
      '<div class="row" style="flex-wrap:wrap"><button class="btn primary" data-act="sy-now"' + (ST.status === 'syncing' ? ' disabled' : '') + '>Synchroniser maintenant</button><button class="btn" data-act="sy-out">Se déconnecter</button></div>' +
      '<div class="legend">Tes séances, profil, poids, repas et réglages sont copiés sur ton compte et récupérés sur tes autres appareils. Si tu effaces des données ici, elles sont aussi effacées en ligne.</div>' +
      (ST.confirmDel ? '<div class="msg err">Supprimer ton compte et toutes les données en ligne ? Les données de cet appareil restent.<div class="row"><button class="btn" data-act="sy-del">Oui, supprimer</button><button class="btn" data-act="sy-delno">Annuler</button></div></div>'
        : '<div class="row" style="flex-wrap:wrap"><button class="btn" data-act="sy-del">Supprimer mon compte en ligne</button></div>');
  } else {
    h += '<div class="ename">Retrouve tes données sur tous tes appareils</div><div class="legend">Crée un compte (e-mail et mot de passe) ou connecte-toi. Tes données restent d\'abord sur cet appareil, puis une copie est gardée en ligne. Sur un nouvel appareil, connecte-toi pour tout récupérer.</div>' + msg +
      (GCID ? '<div id="sy-gbtn" style="display:flex;justify-content:center;min-height:44px"></div>' : '<div class="row"><button class="btn big" data-act="sy-g" style="flex:1;justify-content:center"' + (ST.status === 'syncing' ? ' disabled' : '') + '><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" style="vertical-align:-3px;margin-right:8px"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.400-5.700c-2.100 1.400-4.800 2.300-8.500 2.300-6.300 0-11.600-4.100-13.500-9.800l-7.900 6.100C6.500 42.600 14.600 48 24 48z"/></svg>Continuer avec Google</button></div>') +
      '<div class="legend" style="text-align:center">ou avec ton e-mail</div>' +
      '<div class="row"><input class="fin" id="sy-mail" type="email" autocomplete="username" inputmode="email" value="' + esc(FORM.mail) + '" placeholder="E-mail" aria-label="E-mail" style="flex:1;min-width:0"></div>' +
      '<div class="row"><input class="fin" id="sy-pw" type="password" autocomplete="current-password" placeholder="Mot de passe (6 car. min.)" aria-label="Mot de passe" style="flex:1;min-width:0"></div>' +
      '<div class="row" style="flex-wrap:wrap"><button class="btn primary" data-act="sy-in"' + (ST.status === 'syncing' ? ' disabled' : '') + '>Se connecter</button><button class="btn" data-act="sy-up">Créer un compte</button><button class="btn" data-act="sy-rst">Mot de passe oublié</button></div>';
  }
  return h + '<details class="lg"><summary>Diagnostic</summary><pre class="why" style="white-space:pre-wrap;font-size:11px">' + esc(DBG.join('\n') || '(vide)') + '</pre></details></div></section>';
};
API.form = function () {
  var m = document.getElementById('sy-mail'), p = document.getElementById('sy-pw');
  if (m) FORM.mail = m.value.trim(); if (p) FORM.pw = p.value;
  return { mail: FORM.mail, pw: FORM.pw };
};
API.formFocused = function () { var a = document.activeElement; return !!(a && (a.id === 'sy-mail' || a.id === 'sy-pw')); };

/* ---------- démarrage et déclencheurs ---------- */
if (get(K_USER)) { ST.user = null; setTimeout(function () { init().catch(function () { set('err', 'Pas de connexion : la synchro reprendra plus tard.'); }); }, 1200); }
window.addEventListener('online', function () { if (ST.user) sync(); });
document.addEventListener('visibilitychange', function () { if (!document.hidden && ST.user && Date.now() - ST.last > 60000) sync(); });
setInterval(function () { if (ST.user && !document.hidden && !ST.busy) sync(); }, 120000);
window.addEventListener('pagehide', function () { /* les modifs en attente repartent au prochain lancement */ });
window.BYCSync = API;
})();
