// ==========================================
// MESIN UTAMA - APPS TAK FPKB JATIM (MASTER SCRIPT)
// Versi aman: setiap panggilan doPost wajib membawa token Firebase.
// Tempel seluruh berkas ini menggantikan isi Code.gs, lalu Deploy > Kelola deployment > Edit > Versi baru.
// ==========================================

const NAMA_SHEET_USERS = "Users";
const WEB_API_KEY = "AIzaSyAeiiF06uIkuRJuEELSORGYriC4LZIWAzo";
const BATAS_UKURAN_FILE = 8 * 1024 * 1024;
const EKSTENSI_IZIN = ["pdf", "jpg", "jpeg", "png", "webp"];

// ==========================================
// 1. CORE WEB APP ROUTING (GET)
// ==========================================
function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const page = String(params.page || 'login');
    const username = params.u || null;

    if (!/^[A-Za-z0-9_-]+$/.test(page)) {
      throw new Error('Nama halaman tidak sah.');
    }

    let template;
    try {
      template = HtmlService.createTemplateFromFile(page);
    } catch (templateError) {
      throw new Error("Template file '" + page + ".html' tidak ditemukan di project.");
    }

    template.url = ScriptApp.getService().getUrl();
    template.userData = username ? getUserData(username) : null;

    return template.evaluate()
      .setTitle('Apps TAK FPKB Jatim')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  } catch (error) {
    Logger.log('[doGet Error]: ' + error.message);
    return HtmlService.createHtmlOutput(
      '<div style="font-family: sans-serif; padding: 20px; text-align: center;">' +
      '<h2 style="color: #d32f2f;">System Routing Error</h2>' +
      '<p style="color: #555;"></p>' +
      '<p style="font-size: 12px; color: #888;">Apps TAK FPKB Jatim - System Administrator</p>' +
      '</div>'
    ).setTitle('Error - Apps TAK FPKB Jatim');
  }
}

// ==========================================
// 2. VERIFIKASI TOKEN FIREBASE
// ==========================================
function verifikasiToken(idToken) {
  if (!idToken) { return { ok: false, pesan: 'token kosong' }; }
  if (String(idToken).length < 100) { return { ok: false, pesan: 'format token tidak sah' }; }

  var cache = CacheService.getScriptCache();
  var kunciCache = 'tok_' + idToken.slice(-40);
  var emailCache = cache.get(kunciCache);
  if (emailCache) { return { ok: true, email: emailCache }; }

  var res = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + WEB_API_KEY,
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ idToken: idToken }),
      muteHttpExceptions: true
    }
  );

  if (res.getResponseCode() !== 200) { return { ok: false, pesan: 'token tidak sah atau kedaluwarsa' }; }

  var data = JSON.parse(res.getContentText());
  var user = data.users && data.users[0];
  var email = user && user.email;

  if (!email || email.indexOf('@tak.fpkb.id') < 0) {
    return { ok: false, pesan: 'domain email tidak sah' };
  }
  if (user.disabled === true) { return { ok: false, pesan: 'akun dinonaktifkan' }; }

  cache.put(kunciCache, email, 300);
  return { ok: true, email: email, uid: user.localId };
}

function tolak(pesan) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'error', message: 'Akses ditolak: ' + pesan }))
    .setMimeType(ContentService.MimeType.JSON);
}

function balas(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// 3. CORE API ENDPOINT (POST)
// ==========================================
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput('OK');
    }

    let payload = JSON.parse(e.postData.contents);

    let cek = verifikasiToken(payload.token);
    if (!cek.ok) { return tolak(cek.pesan); }

    if (payload.action === "uploadLaporan") {
      let berkas = siapkanBerkas(payload, 'Laporan');
      let folderUtama = DriveApp.getFolderById("1RdbrOnpIERNA4pGC6ZfUmiDddej8eMlo");
      let folderBulan = folderAtauBuat(folderUtama, payload.bulanTahunNama);
      let namaFileBaru = berkas.noKontrak + "_" + teksAman(payload.namaLengkap).toUpperCase() + "_" +
        teksAman(payload.bulanTahunNama).toUpperCase() + "." + berkas.ekstensi;
      let blob = Utilities.newBlob(berkas.data, berkas.mimeType);
      blob.setName(namaFileBaru);
      let file = folderBulan.createFile(blob);
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) {}
      return balas({ status: "success", fileUrl: file.getUrl(), namaFile: namaFileBaru });
    }

    if (payload.action === "uploadIzin") {
      let berkas = siapkanBerkas(payload, 'Izin');
      let folderIzin = DriveApp.getFolderById("1-v7zQ_9PdpCITAF6TOw9TOzIrYstejBd");
      let tglStr = Utilities.formatDate(new Date(), "GMT+7", "dd-MM-yyyy");
      let namaFileBaru = "[IZIN " + tglStr + "] - " + teksAman(payload.namaLengkap).toUpperCase() +
        " - " + teksAman(payload.kegiatan).toUpperCase() + "." + berkas.ekstensi;
      let blob = Utilities.newBlob(berkas.data, berkas.mimeType);
      blob.setName(namaFileBaru);
      let file = folderIzin.createFile(blob);
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) {}
      return balas({ status: "success", fileUrl: file.getUrl(), namaFile: namaFileBaru });
    }

    if (payload.action === "buatJadwal") {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheetJadwal = ss.getSheetByName("Jadwal_Kegiatan");
      if (!sheetJadwal) { throw new Error("Sheet Jadwal_Kegiatan tidak ditemukan."); }

      let idKegiatan = String(payload.idKegiatan || '').trim();
      if (!idKegiatan) { throw new Error("idKegiatan kosong."); }
      if (/[\s,;]/.test(idKegiatan)) { throw new Error("idKegiatan tidak boleh berisi spasi atau pemisah."); }

      let dataJadwal = sheetJadwal.getDataRange().getValues();
      for (let i = 1; i < dataJadwal.length; i++) {
        if (String(dataJadwal[i][0]).trim() === idKegiatan) {
          return balas({ status: "success", message: "Jadwal sudah ada di GSheets, tidak digandakan." });
        }
      }

      let target = payload.targetPeserta || "ALL";
      sheetJadwal.appendRow([idKegiatan, payload.jenisKegiatan, payload.tanggal, payload.jam, payload.toleransi, target]);
      return balas({ status: "success", message: "Jadwal berhasil diarsipkan ke GSheets" });
    }

    if (payload.action === "updateUserSheet") {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheetUsers = ss.getSheetByName("Users");
      const data = sheetUsers.getDataRange().getValues();
      let rowToUpdate = -1;
      for (let i = 1; i < data.length; i++) {
        if (data[i][0].toString().trim() === payload.username) { rowToUpdate = i + 1; break; }
      }
      if (rowToUpdate === -1) { throw new Error("Username tidak ditemukan di GSheets"); }

      sheetUsers.getRange(rowToUpdate, 3).setValue(payload.namaLengkap);
      sheetUsers.getRange(rowToUpdate, 4).setValue(payload.namaDewan);
      sheetUsers.getRange(rowToUpdate, 5).setValue(payload.role);
      sheetUsers.getRange(rowToUpdate, 6).setValue(payload.poin);
      sheetUsers.getRange(rowToUpdate, 7).setValue(payload.noKontrak);
      return balas({ status: "success", message: "GSheets Berhasil Diupdate" });
    }

    if (payload.action === "uploadKas") {
      let berkas = siapkanBerkas(payload, 'Kas');
      let folderUtama = DriveApp.getFolderById("1659qqLjRgit6hMfPKpHySshO6Nri3WWb");
      let folderBulan = folderAtauBuat(folderUtama, payload.bulanTahunNama);
      let namaFileBaru = berkas.noKontrak + "_" + teksAman(payload.namaLengkap).toUpperCase() + "_KAS_" +
        teksAman(payload.bulanTahunNama).toUpperCase() + "." + berkas.ekstensi;
      let blob = Utilities.newBlob(berkas.data, berkas.mimeType);
      blob.setName(namaFileBaru);
      let file = folderBulan.createFile(blob);
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) {}
      return balas({ status: "success", fileUrl: file.getUrl(), namaFile: namaFileBaru });
    }

    if (payload.action === "getTransparansiKas") {
      let bulan = String(payload.bulanTahun || '').trim();
      if (!/^\d{2}-\d{4}$/.test(bulan)) { throw new Error("Format bulan harus MM-yyyy."); }
      return balas({ status: "success", data: getKasData(bulan) });
    }

    if (payload.action === "validasiKasLunas") {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheetKas = ss.getSheetByName("Kas_Bulanan");
      if (!sheetKas) { throw new Error("Sheet Kas_Bulanan tidak ditemukan."); }

      const dataKas = sheetKas.getDataRange().getValues();
      let rowToUpdate = -1;
      for (let i = 1; i < dataKas.length; i++) {
        let rawBln = dataKas[i][0];
        let blnStr = (rawBln instanceof Date) ? Utilities.formatDate(rawBln, "GMT+7", "MM-yyyy") : rawBln.toString().trim();
        if (blnStr === payload.bulanTahun && dataKas[i][1].toString().trim() === payload.username) {
          rowToUpdate = i + 1;
          break;
        }
      }
      if (rowToUpdate === -1) { throw new Error("Data tagihan tidak ditemukan di database GSheets."); }

      let statusLama = String(dataKas[rowToUpdate - 1][5] || '').toUpperCase();
      if (statusLama === "LUNAS") {
        return balas({ status: "success", message: "Tagihan sudah berstatus LUNAS, tidak diubah lagi." });
      }

      sheetKas.getRange(rowToUpdate, 6).setValue("LUNAS");
      return balas({ status: "success", message: "GSheets Berhasil Diupdate Lunas" });
    }

    if (payload.action === "buatTagihanMassal") {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheetKas = ss.getSheetByName("Kas_Bulanan");
      const sheetUsers = ss.getSheetByName("Users");
      if (!sheetKas || !sheetUsers) { throw new Error("Sheet Kas_Bulanan atau Users tidak ditemukan."); }

      let targetBulan = String(payload.bulanTahun || '').trim();
      if (!/^\d{2}-\d{4}$/.test(targetBulan)) { throw new Error("Format bulan harus MM-yyyy."); }

      let nominalDasar = parseInt(payload.nominalDasar, 10);
      if (!nominalDasar || nominalDasar < 1000) { nominalDasar = 50000; }

      let dataUsers = sheetUsers.getDataRange().getValues();
      let listTAK = [];
      for (let i = 1; i < dataUsers.length; i++) {
        let roleTak = (dataUsers[i][4] || "").toString().toLowerCase();
        if (roleTak.indexOf("tak") !== -1 || roleTak === "") { listTAK.push(dataUsers[i][0].toString().trim()); }
      }

      let dataKas = sheetKas.getDataRange().getValues();
      let existing = {};
      for (let i = 1; i < dataKas.length; i++) {
        let bln = dataKas[i][0] instanceof Date ? Utilities.formatDate(dataKas[i][0], "GMT+7", "MM-yyyy") : dataKas[i][0].toString().trim();
        existing[bln + "_" + dataKas[i][1].toString().trim()] = true;
      }

      let addedCount = 0;
      for (let i = 0; i < listTAK.length; i++) {
        let u = listTAK[i];
        if (!existing[targetBulan + "_" + u]) {
          let nextRow = sheetKas.getLastRow() + 1;
          let formulaDenda = "=IF(ISBLANK(B" + nextRow + "), 0, IF(VLOOKUP(B" + nextRow + ", Users!A:G, 6, FALSE) < 100, (100 - VLOOKUP(B" + nextRow + ", Users!A:G, 6, FALSE)) * 500, 0))";
          let formulaTotal = "=IF(ISBLANK(C" + nextRow + "), 0, C" + nextRow + " + D" + nextRow + ")";
          sheetKas.appendRow([targetBulan, u, nominalDasar, formulaDenda, formulaTotal, "Belum Lunas"]);
          addedCount++;
        }
      }
      return balas({ status: "success", message: "Berhasil! " + addedCount + " Tagihan baru untuk bulan " + targetBulan + " telah dibuat otomatis di GSheets." });
    }

    if (payload.action === "uploadBuktiTransaksi") {
      let berkas = siapkanBerkas(payload, 'Bukti');
      let folderBukti = DriveApp.getFolderById("1659qqLjRgit6hMfPKpHySshO6Nri3WWb");
      let ketBersih = String(payload.keterangan || "TANPA KETERANGAN").replace(/[^a-zA-Z0-9 ]/g, " ").toUpperCase().slice(0, 80);
      let tanggal = String(payload.tanggal || '').replace(/[^0-9\-\/]/g, '');
      let namaFileBaru = "[TRX BUKU KAS " + tanggal + "] - " + ketBersih + "." + berkas.ekstensi;
      let blob = Utilities.newBlob(berkas.data, berkas.mimeType);
      blob.setName(namaFileBaru);
      let file = folderBukti.createFile(blob);
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) {}
      return balas({ status: "success", fileUrl: file.getUrl(), namaFile: namaFileBaru });
    }

    if (payload.action === "catatBukuBesar") {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheetBuku = ss.getSheetByName("Buku_Kas_Besar");
      if (!sheetBuku) {
        sheetBuku = ss.insertSheet("Buku_Kas_Besar");
        sheetBuku.appendRow(["ID Transaksi", "Waktu Input", "Tanggal Transaksi", "Tipe", "Nominal", "Keterangan", "Diinput Oleh", "Link Bukti"]);
        sheetBuku.getRange("A1:H1").setFontWeight("bold").setBackground("#059669").setFontColor("white");
        sheetBuku.setFrozenRows(1);
      }

      let idTx = String(payload.idTx || '').trim();
      if (!idTx) { throw new Error("idTx kosong."); }

      let dataBuku = sheetBuku.getDataRange().getValues();
      for (let i = 1; i < dataBuku.length; i++) {
        if (String(dataBuku[i][0]).trim() === idTx) {
          return balas({ status: "success", message: "Transaksi sudah tercatat sebelumnya, tidak digandakan." });
        }
      }

      let waktuInput = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
      sheetBuku.appendRow([idTx, waktuInput, payload.tanggal, payload.tipe, payload.nominal, payload.keterangan, payload.diinput_oleh, payload.fileUrl || ""]);
      return balas({ status: "success", message: "Buku Kas Besar berhasil dicatat." });
    }

    return balas({ status: "error", message: "Action tidak dikenali." });

  } catch (error) {
    Logger.log('[doPost Fatal Error]: ' + error.stack);
    return balas({ status: "error", message: error.message || String(error) });
  }
}

// ==========================================
// 4. UTILITAS BERKAS
// ==========================================
function teksAman(nilai) {
  return String(nilai === undefined || nilai === null ? '' : nilai)
    .replace(/[^a-zA-Z0-9 _\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function siapkanBerkas(payload, label) {
  if (!payload.base64) { throw new Error("Berkas " + label + " kosong."); }
  if (!payload.fileName) { throw new Error("Nama berkas " + label + " kosong."); }

  let ekstensi = String(payload.fileName).split('.').pop().toLowerCase();
  if (EKSTENSI_IZIN.indexOf(ekstensi) === -1) {
    throw new Error("Ekstensi ." + ekstensi + " tidak diizinkan. Gunakan PDF atau gambar.");
  }

  let data;
  try {
    data = Utilities.base64Decode(String(payload.base64).replace(/^data:[^;]+;base64,/, ''));
  } catch (err) {
    throw new Error("Isi berkas " + label + " tidak sah.");
  }
  if (data.length > BATAS_UKURAN_FILE) { throw new Error("Ukuran berkas melebihi 8 MB."); }
  if (data.length === 0) { throw new Error("Berkas " + label + " kosong."); }

  let mimeType = payload.mimeType || 'application/octet-stream';
  let noKontrak = teksAman(payload.noKontrak) || 'TANPA-KONTRAK';

  return { data: data, ekstensi: ekstensi, mimeType: mimeType, noKontrak: noKontrak };
}

function folderAtauBuat(induk, nama) {
  let namaBersih = teksAman(nama);
  if (!namaBersih) { throw new Error("Nama folder bulan kosong."); }
  let iter = induk.getFoldersByName(namaBersih);
  return iter.hasNext() ? iter.next() : induk.createFolder(namaBersih);
}

// ==========================================
// 5. FUNGSI BACKEND LAMA (LOGIN & USER)
// ==========================================
function prosesLogin(username, password) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(NAMA_SHEET_USERS);
  if (!sheet) { return { status: "error", message: "Database Users tidak ditemukan!" }; }

  const data = sheet.getDataRange().getValues();
  const inputUser = (username || "").toString().trim();
  const inputPass = (password || "").toString().trim();

  for (let i = 1; i < data.length; i++) {
    let dbUsername = data[i][0].toString().trim();
    let dbPassword = data[i][1].toString().trim();

    if (dbUsername.toLowerCase() === inputUser.toLowerCase() && dbPassword === inputPass) {
      return {
        status: "success",
        message: "Login Berhasil!",
        user: {
          username: dbUsername,
          nama: data[i][2],
          dewan: data[i][3],
          role: data[i][4],
          poin: data[i][5] !== "" ? data[i][5] : 100
        }
      };
    }
  }
  return { status: "error", message: "Username atau Password salah!" };
}

function getUserData(username) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(NAMA_SHEET_USERS);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString().trim() === username) {
      return {
        username: username,
        nama: data[i][2],
        dewan: data[i][3],
        poin: data[i][5] !== "" ? data[i][5] : 100
      };
    }
  }
  return null;
}

// ==========================================
// 6. FUNGSI ABSENSI & KAS
// ==========================================
function prosesAbsensi(username, idKegiatan) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetJadwal = ss.getSheetByName("Jadwal_Kegiatan");
  const sheetAbsen = ss.getSheetByName("Absensi");
  const sheetUsers = ss.getSheetByName("Users");
  const sheetLog = ss.getSheetByName("Log_Poin");

  const dataJadwal = sheetJadwal.getDataRange().getValues();
  let jadwal = null;
  for (let i = 1; i < dataJadwal.length; i++) {
    if (dataJadwal[i][0].toString().trim() === idKegiatan.trim()) {
      jadwal = { id: dataJadwal[i][0], jenis: dataJadwal[i][1], tanggal: dataJadwal[i][2], jamMulai: dataJadwal[i][3] };
      break;
    }
  }

  if (!jadwal) return { status: "error", message: "QR Code tidak valid atau Kegiatan tidak ditemukan." };

  let tglStr = Utilities.formatDate(new Date(jadwal.tanggal), "GMT+7", "yyyy-MM-dd");
  let jamStr;
  if (jadwal.jamMulai instanceof Date) { jamStr = Utilities.formatDate(jadwal.jamMulai, "GMT+7", "HH:mm:ss"); }
  else { jamStr = jadwal.jamMulai.toString(); if (jamStr.length <= 5) jamStr += ":00"; }

  let waktuMulai = new Date(tglStr + "T" + jamStr + "+07:00");
  let now = new Date();
  let waktuBuka = new Date(waktuMulai.getTime() - 15 * 60000);
  let waktuTutup = new Date(waktuMulai.getTime() + 3 * 60 * 60000);

  if (now < waktuBuka) {
    return { status: "error", message: "Absensi belum dibuka! Silakan scan kembali pada pukul " + Utilities.formatDate(waktuBuka, "GMT+7", "HH:mm") + " WIB." };
  }
  if (now > waktuTutup) { return { status: "error", message: "Sesi absensi telah ditutup. Masa berlaku QR untuk kegiatan ini sudah habis." }; }

  const dataAbsen = sheetAbsen.getDataRange().getValues();
  for (let i = 1; i < dataAbsen.length; i++) {
    if (dataAbsen[i][1].toString().trim() === idKegiatan.trim() && dataAbsen[i][2].toString().trim() === username) {
      return { status: "warning", message: "Anda sudah melakukan absensi untuk kegiatan ini." };
    }
  }

  let toleransiMenit = 15;
  let batasAman = new Date(waktuMulai.getTime() + toleransiMenit * 60000);
  let poinDasar = (jadwal.jenis.toLowerCase().indexOf("upgrading") !== -1) ? 7 : 5;
  let dendaPoin = 0;
  let statusHadir = "Hadir (Tepat Waktu)";

  if (now > batasAman) {
    let selisihMenit = Math.ceil((now - batasAman) / 60000);
    dendaPoin = Math.ceil(selisihMenit / 15) * 2;
    statusHadir = "Hadir (Telat " + selisihMenit + " menit)";
  }

  let poinNet = poinDasar - dendaPoin;
  sheetAbsen.appendRow(["ABS-" + now.getTime(), idKegiatan, username, now, statusHadir, poinNet]);

  const dataUser = sheetUsers.getDataRange().getValues();
  let saldoBaru = 0;
  for (let i = 1; i < dataUser.length; i++) {
    if (dataUser[i][0].toString().trim() === username) {
      let saldoLama = parseInt(dataUser[i][5], 10) || 0;
      saldoBaru = saldoLama + poinNet;
      sheetUsers.getRange(i + 1, 6).setValue(saldoBaru);
      break;
    }
  }

  sheetLog.appendRow([now, username, "Scan Absen: " + jadwal.jenis + " (" + statusHadir + ")", poinNet, saldoBaru]);

  let msg = "Berhasil! Poin Dasar +" + poinDasar + ".";
  if (dendaPoin > 0) { msg += " Tapi Anda terkena penalti keterlambatan -" + dendaPoin + " poin. Total ditambahkan: " + poinNet + " Poin."; }
  return { status: "success", message: msg, poin: poinNet };
}

function getKasData(bulanTahun) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetKas = ss.getSheetByName("Kas_Bulanan");
  const dataKas = sheetKas.getDataRange().getValues();
  const sheetUser = ss.getSheetByName("Users");
  const dataUser = sheetUser.getDataRange().getValues();

  let userMap = {};
  for (let i = 1; i < dataUser.length; i++) {
    let uName = dataUser[i][0].toString().trim();
    userMap[uName] = { nama: dataUser[i][2], poin: dataUser[i][5] !== "" ? parseInt(dataUser[i][5], 10) : 100 };
  }

  let result = [];
  for (let i = 1; i < dataKas.length; i++) {
    let rawBln = dataKas[i][0];
    let blnStr = (rawBln instanceof Date) ? Utilities.formatDate(rawBln, "GMT+7", "MM-yyyy") : rawBln.toString().trim();
    if (blnStr === bulanTahun) {
      let usernameTak = dataKas[i][1].toString().trim();
      let userInfo = userMap[usernameTak] || { nama: usernameTak, poin: 100 };
      let tagihanDasar = parseInt(dataKas[i][2], 10) || 0;
      let dendaHitung = 0;
      if (userInfo.poin < 100) { dendaHitung = (100 - userInfo.poin) * 500; }
      let totalTagihanAkhir = tagihanDasar + dendaHitung;
      result.push({
        username: usernameTak,
        nama: userInfo.nama,
        tagihanDasar: tagihanDasar,
        denda: dendaHitung,
        total: totalTagihanAkhir,
        status: dataKas[i][5]
      });
    }
  }
  return result;
}

// ==========================================
// 7. INJEKSI USERS KE FIRESTORE
// Setelah aturan Firestore dikunci, API key saja tidak cukup.
// Fungsi ini memakai OAuth pemilik script, jadi scope datastore harus aktif.
// Kalau gagal karena scope, buka appsscript.json dan pastikan oauthScopes memuat
// https://www.googleapis.com/auth/datastore lalu jalankan ulang (setujui izin).
// ==========================================
function injeksiDataKeFirebase() {
  const PROJECT_ID = "apps-tak-fpkb";
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Users");
  const data = sheet.getDataRange().getValues();
  const tokenOauth = ScriptApp.getOAuthToken();

  Logger.log("Memulai Injeksi/Update " + (data.length - 1) + " Data TAK ke Firebase...");

  for (let i = 1; i < data.length; i++) {
    let username = data[i][0].toString().trim();
    if (username === "") continue;

    let password = data[i][1].toString().trim();
    let namaLengkap = data[i][2].toString().trim();
    let namaDewan = data[i][3].toString().trim();
    let role = data[i][4].toString().trim();
    let poin = data[i][5] !== "" ? data[i][5] : 100;
    let noKontrak = data[i][6] ? String(data[i][6]).trim() : "";
    let emailFirebase = username + "@tak.fpkb.id";

    if (password.length >= 6) {
      let authRes = UrlFetchApp.fetch(
        "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" + WEB_API_KEY,
        {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({ email: emailFirebase, password: password, returnSecureToken: false }),
          muteHttpExceptions: true
        }
      );
      let authData = JSON.parse(authRes.getContentText());
      if (authData.error) { Logger.log("Auth Skip (" + username + "): " + authData.error.message); }
      else { Logger.log("Akun Login Baru Dibuat: " + username); }
    }

    let fsPayload = {
      fields: {
        username: { stringValue: username },
        nama: { stringValue: namaLengkap },
        dewan: { stringValue: namaDewan },
        role: { stringValue: role },
        poin: { integerValue: String(poin) },
        no_kontrak: { stringValue: noKontrak }
      }
    };

    let fsRes = UrlFetchApp.fetch(
      "https://firestore.googleapis.com/v1/projects/" + PROJECT_ID + "/databases/(default)/documents/Users/" + encodeURIComponent(username),
      {
        method: 'patch',
        contentType: 'application/json',
        payload: JSON.stringify(fsPayload),
        headers: { Authorization: "Bearer " + tokenOauth },
        muteHttpExceptions: true
      }
    );
    if (fsRes.getResponseCode() >= 300) { Logger.log("Gagal Firestore (" + username + "): " + fsRes.getContentText()); }
    else { Logger.log("Database Profil Terupdate: " + username); }
  }
}
