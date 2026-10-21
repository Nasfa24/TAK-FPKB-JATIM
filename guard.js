// guard.js - Penjaga sesi Firebase dan hak akses peran.
// Dipasang di setiap halaman terlindungi. Peran dibaca dari Firestore, bukan localStorage.
(function () {
  var skrip = document.currentScript;
  var daftarPeran = ((skrip && skrip.dataset && skrip.dataset.roles) || "TAK,Koordinator,Bendahara").split(",");


  // Setiap panggilan ke Apps Script disisipi token Firebase.
  // Backend boleh mengabaikannya sampai pemeriksaan token dipasang.
  var fetchAsli = window.fetch;
  window.fetch = function (url, opsi) {
    var target = (typeof url === 'string') ? url : (url && url.url) || '';
    if (target.indexOf('script.google.com/macros/s/') === -1) {
      return fetchAsli.apply(this, arguments);
    }
    var user = firebase.auth().currentUser;
    if (!user) { return fetchAsli.apply(this, arguments); }
    return user.getIdToken().then(function (token) {
      var opts = opsi ? Object.assign({}, opsi) : {};
      var body = opts.body;
      if (typeof body === 'string') {
        try {
          var obj = JSON.parse(body);
          obj.token = token;
          opts.body = JSON.stringify(obj);
        } catch (e) { /* body bukan JSON, biarkan */ }
      }
      return fetchAsli.call(window, url, opts);
    });
  };

  function tolak(pesan) {
    localStorage.removeItem('tak_username');
    localStorage.removeItem('tak_role');
    localStorage.removeItem('tak_nama');
    var body = document.getElementById('mainBody');
    if (body) { body.classList.add('hidden'); }
    try { firebase.auth().signOut(); } catch (e) { /* diabaikan */ }
    alert(pesan || 'Sesi tidak sah. Silakan masuk kembali.');
    window.location.replace('index.html');
  }

  function cocok(peran, daftar) {
    var p = String(peran || '').toLowerCase().trim();
    if (!p) { return false; }
    for (var i = 0; i < daftar.length; i++) {
      var d = String(daftar[i] || '').toLowerCase().trim();
      if (d && (p === d || p.indexOf(d) >= 0)) { return true; }
    }
    return false;
  }

  function mulai() {
    if (typeof firebase === 'undefined' || !firebase.auth) {
      tolak('Pustaka Firebase gagal dimuat. Periksa koneksi.');
      return;
    }
    firebase.auth().onAuthStateChanged(function (user) {
      if (!user || !user.email) {
        tolak('Sesi berakhir. Silakan masuk kembali.');
        return;
      }
      var username = user.email.split('@')[0];
      var lokal = localStorage.getItem('tak_username');
      if (lokal && lokal.toLowerCase() !== username.toLowerCase()) {
        tolak('Sesi perangkat ini tidak cocok dengan akun yang masuk.');
        return;
      }
      firebase.firestore().collection('Users').doc(username).get().then(function (doc) {
        if (!doc.exists) {
          tolak('Akun ini tidak terdaftar di basis data pengguna.');
          return;
        }
        var data = doc.data() || {};
        if (!cocok(data.role, daftarPeran)) {
          tolak('Peran akun Anda tidak berhak membuka halaman ini.');
          return;
        }
        localStorage.setItem('tak_username', username);
        localStorage.setItem('tak_role', data.role);
        localStorage.setItem('tak_nama', data.nama || username);
        window.__takSiap = true;
      }).catch(function (err) {
        tolak('Gagal memeriksa hak akses: ' + err.message);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mulai);
  } else {
    mulai();
  }
})();
