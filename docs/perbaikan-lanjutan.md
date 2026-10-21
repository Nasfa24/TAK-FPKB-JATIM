# Perbaikan Lanjutan Lebah Indrapura

Dokumen ini berisi dua langkah yang hanya bisa dijalankan dari akun pemilik
proyek Firebase dan akun Google pemilik Apps Script.

## 1. Publikasikan aturan Firestore

Berkas acuan: firestore.rules di repo ini.

Langkah:
1. Buka https://console.firebase.google.com/project/apps-tak-fpkb/firestore/rules
2. Hapus isi kotak editor.
3. Salin seluruh isi firestore.rules, tempel di editor.
4. Klik Publikasikan.

Efek: tidak ada lagi baca dan tulis tanpa login. Setiap akses wajib sesi
Firebase dengan email berdomain tak.fpkb.id.

Catatan: kalau ada anggota yang sesinya sudah lama, mereka akan diminta
masuk ulang sekali. Itu wajar.

## 2. Pasang pemeriksaan token di Apps Script

Client sudah mengirim token Firebase pada setiap panggilan ke Apps Script
lewat guard.js. Backend sekarang masih mengabaikan token itu. Setelah kode di
bawah dipasang, panggilan tanpa token akan ditolak.

Tambahkan fungsi ini di bagian atas berkas Apps Script:

    var WEB_API_KEY = 'ISI_DENGAN_apiKey_FIREBASE';

    function verifikasiToken(idToken) {
      if (!idToken) return { ok: false, pesan: 'token kosong' };
      var res = UrlFetchApp.fetch(
        'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + WEB_API_KEY,
        { method: 'post', contentType: 'application/json',
          payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) return { ok: false, pesan: 'token tidak sah' };
      var data = JSON.parse(res.getContentText());
      var user = data.users && data.users[0];
      var email = user && user.email;
      if (!email || email.indexOf('@tak.fpkb.id') < 0) {
        return { ok: false, pesan: 'domain email tidak sah' };
      }
      return { ok: true, email: email };
    }

Lalu di awal fungsi doPost, setelah body diurai, tambahkan:

    var cek = verifikasiToken(body.token);
    if (!cek.ok) {
      return ContentService.createTextOutput(
        JSON.stringify({ status: 'error', message: 'Akses ditolak: ' + cek.pesan }))
        .setMimeType(ContentService.MimeType.JSON);
    }

Nilai WEB_API_KEY ada di index.html pada baris apiKey.

## 3. Sisa risiko yang belum ditutup

Aturan Firestore belum bisa membedakan peran Koordinator, Bendahara, dan TAK
karena peran hanya tersimpan sebagai field dokumen, bukan klaim token.
Artinya anggota yang sudah login masih bisa mengubah dokumen lewat konsol
browser. Penutup permanennya adalah custom claims lewat Admin SDK, lalu aturan
dibaca dari request.auth.token.role.
