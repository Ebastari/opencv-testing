/**
 * GOOGLE APPS SCRIPT: MONITORING TANAMAN CERDAS (V5 CLEAN)
 *
 * Fitur utama:
 * - API GET: list data / analisis ringkas
 * - API POST: simpan data / hapus data
 * - Auto header default sesuai format monitoring
 * - Auto normalisasi koordinat (koma/titik)
 * - Auto status duplikat (UNIK/DUPLIKAT)
 * - Auto nomor pohon untuk baris UNIK
 * - Simpan foto Base64 ke Google Drive (opsional)
 * - Utilitas export KML, refresh status, dan galeri link
 */

const SHEET_NAME = 'Data Monitoring';
const FOLDER_NAME = 'Montana V2_Images';

const DEFAULT_HEADERS = [
  'ID',
  'Tanggal',
  'Lokasi',
  'Pekerjaan',
  'Tinggi',
  'Koordinat',
  'Y',
  'X',
  'Tanaman',
  'Tahun Tanam',
  'Pengawas',
  'Vendor',
  'Link Drive',
  'No Pohon',
  'Kesehatan',
  'poop',
  'Status_Duplikat',
];

function doGet(e) {
  try {
    const action = getParam_(e, 'action', 'list').toLowerCase();
    const sheet = ensureMonitoringSheet_();

    if (action === 'analysis') {
      return jsonResponse_(buildAnalysis_(sheet));
    }

    const limit = Math.max(0, Number(getParam_(e, 'limit', '0')) || 0);
    const offset = Math.max(0, Number(getParam_(e, 'offset', '0')) || 0);
    const order = String(getParam_(e, 'order', 'desc')).toLowerCase() === 'asc' ? 'asc' : 'desc';

    if (limit > 0) {
      return jsonResponse_(readSheetAsObjectsPaged_(sheet, limit, offset, order));
    }

    const data = readSheetAsObjects_(sheet);
    return jsonResponse_({
      status: 'success',
      data: data,
      total: data.length,
      limit: 0,
      offset: 0,
      order: 'asc',
    });
  } catch (error) {
    return jsonResponse_({ status: 'error', message: String(error) });
  }
}

function doPost(e) {
  try {
    const body = parsePostBody_(e);
    const action = String(body.action || 'save').toLowerCase();
    const sheet = ensureMonitoringSheet_();

    if (action === 'delete') {
      const target = String(body.pohonId || body.id || '').trim();
      if (!target) {
        return jsonResponse_({ status: 'error', message: 'Parameter pohonId/id wajib diisi untuk hapus.' });
      }

      const deleted = deleteByIdOrTreeNo_(sheet, target);
      return jsonResponse_(
        deleted
          ? { status: 'success', message: 'Data dihapus.', deletedId: target }
          : { status: 'error', message: 'ID/No Pohon tidak ditemukan.' },
      );
    }

    if (action === 'rebuild') {
      const result = refreshDuplicateAndTreeNumber_(sheet);
      return jsonResponse_({ status: 'success', message: 'Rebuild selesai.', ...result });
    }

    const saved = appendMonitoringRow_(sheet, body);
    return jsonResponse_({
      status: 'success',
      message: 'Data tersimpan.',
      id: saved.id,
      statusDuplikat: saved.statusDuplikat,
      noPohon: saved.noPohon,
      url: saved.linkDrive,
    });
  } catch (error) {
    return jsonResponse_({ status: 'error', message: String(error) });
  }
}

function ensureMonitoringSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  const lastCol = sheet.getLastColumn();
  if (sheet.getLastRow() === 0 || lastCol === 0) {
    sheet.getRange(1, 1, 1, DEFAULT_HEADERS.length).setValues([DEFAULT_HEADERS]);
    styleHeader_(sheet, DEFAULT_HEADERS.length);
    return sheet;
  }

  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const normalized = existing.map((h) => String(h || '').trim());

  // Pastikan semua kolom default tersedia. Jika belum ada, tambahkan di akhir.
  DEFAULT_HEADERS.forEach((header) => {
    if (normalized.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      normalized.push(header);
    }
  });

  styleHeader_(sheet, sheet.getLastColumn());
  return sheet;
}

function styleHeader_(sheet, width) {
  sheet
    .getRange(1, 1, 1, width)
    .setFontWeight('bold')
    .setBackground('#f3f3f3');
}

function parsePostBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }
  const raw = e.postData.contents;
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

function readSheetAsObjects_(sheet) {
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) {
    return [];
  }

  const headers = rows[0].map((h) => String(h || '').trim());
  return rows.slice(1).map((row) => {
    const obj = {};
    for (var i = 0; i < headers.length; i++) {
      var value = row[i];
      if (value instanceof Date) {
        value = Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
      }
      obj[headers[i]] = value;
    }
    return obj;
  });
}

function readSheetAsObjectsPaged_(sheet, limit, offset, order) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow <= 1 || lastCol <= 0) {
    return {
      status: 'success',
      data: [],
      total: 0,
      limit: limit,
      offset: offset,
      order: order,
    };
  }

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map((h) => String(h || '').trim());
  const totalDataRows = lastRow - 1;

  let startRow = 2;
  let endRow = 1;

  if (order === 'desc') {
    endRow = lastRow - offset;
    startRow = Math.max(2, endRow - limit + 1);
  } else {
    startRow = 2 + offset;
    endRow = Math.min(lastRow, startRow + limit - 1);
  }

  if (endRow < startRow || endRow < 2 || startRow > lastRow) {
    return {
      status: 'success',
      data: [],
      total: totalDataRows,
      limit: limit,
      offset: offset,
      order: order,
    };
  }

  const rowCount = endRow - startRow + 1;
  const rows = sheet.getRange(startRow, 1, rowCount, lastCol).getValues();
  if (order === 'desc') {
    rows.reverse();
  }

  const data = rows.map(function (row) {
    const obj = {};
    for (var i = 0; i < headers.length; i++) {
      var value = row[i];
      if (value instanceof Date) {
        value = Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
      }
      obj[headers[i]] = value;
    }
    return obj;
  });

  return {
    status: 'success',
    data: data,
    total: totalDataRows,
    limit: limit,
    offset: offset,
    order: order,
  };
}

function appendMonitoringRow_(sheet, payload) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((h) => String(h || '').trim());
  const headerIndex = buildHeaderIndex_(headers);

  const id = String(payload.ID || payload.id || generateId_()).trim();
  const tanggal = String(payload.Tanggal || payload.tanggal || new Date().toLocaleString('id-ID')).trim();
  const pekerjaan = String(payload.Pekerjaan || payload.pekerjaan || '').trim();
  const tinggi = toNumberOrBlank_(payload.Tinggi ?? payload.tinggi);
  const tanaman = String(payload.Tanaman || payload.tanaman || 'Unknown').trim();
  const tahunTanam = String(payload['Tahun Tanam'] || payload.tahunTanam || '').trim();
  const pengawas = String(payload.Pengawas || payload.pengawas || '').trim();
  const vendor = String(payload.Vendor || payload.vendor || '').trim();
  const kesehatan = normalizeHealth_(payload.Kesehatan || payload.kesehatan || 'Sehat');

  const coords = resolveCoordinates_(payload);
  const lokasiRaw = String(payload.Lokasi || payload.lokasi || coords.text).trim();
  const koordinatRaw = String(payload.Koordinat || payload.koordinat || coords.text).trim();
  const lokasi = lokasiRaw.toLowerCase().includes('nan') ? coords.text : lokasiRaw;
  const koordinat = koordinatRaw.toLowerCase().includes('nan') ? coords.text : koordinatRaw;

  // Y dipertahankan sebagai longitude, X sebagai latitude agar kompatibel data lama aplikasi.
  const y = payload.Y !== undefined ? payload.Y : coords.lon;
  const x = payload.X !== undefined ? payload.X : coords.lat;

  const linkDrive = saveImageAndReturnUrl_(payload, id) || String(payload['Link Drive'] || payload.linkDrive || '').trim();
  const poop = String(payload.poop || buildPoopHtml_(linkDrive)).trim();

  const statusDuplikat = String(payload.Status_Duplikat || payload.statusDuplikat || '').trim() ||
    detectDuplicateStatus_(sheet, id, tanggal, koordinat);

  let noPohon = String(payload['No Pohon'] || payload.noPohon || '').trim();
  if (!noPohon && statusDuplikat === 'UNIK') {
    noPohon = String(getNextTreeNumber_(sheet));
  }

  const row = new Array(headers.length).fill('');
  setByHeader_(row, headerIndex, 'ID', id);
  setByHeader_(row, headerIndex, 'Tanggal', tanggal);
  setByHeader_(row, headerIndex, 'Lokasi', lokasi);
  setByHeader_(row, headerIndex, 'Pekerjaan', pekerjaan);
  setByHeader_(row, headerIndex, 'Tinggi', tinggi);
  setByHeader_(row, headerIndex, 'Koordinat', koordinat);
  setByHeader_(row, headerIndex, 'Y', normalizeCoordText_(y));
  setByHeader_(row, headerIndex, 'X', normalizeCoordText_(x));
  setByHeader_(row, headerIndex, 'Tanaman', tanaman);
  setByHeader_(row, headerIndex, 'Tahun Tanam', tahunTanam);
  setByHeader_(row, headerIndex, 'Pengawas', pengawas);
  setByHeader_(row, headerIndex, 'Vendor', vendor);
  setByHeader_(row, headerIndex, 'Link Drive', linkDrive);
  setByHeader_(row, headerIndex, 'No Pohon', noPohon);
  setByHeader_(row, headerIndex, 'Kesehatan', kesehatan);
  setByHeader_(row, headerIndex, 'poop', poop);
  setByHeader_(row, headerIndex, 'Status_Duplikat', statusDuplikat);

  sheet.appendRow(row);

  return {
    id: id,
    noPohon: noPohon,
    statusDuplikat: statusDuplikat,
    linkDrive: linkDrive,
  };
}

function deleteByIdOrTreeNo_(sheet, target) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return false;
  }

  const headers = values[0].map((h) => String(h || '').trim());
  const idxId = headers.indexOf('ID');
  const idxNo = headers.indexOf('No Pohon');

  for (var r = values.length - 1; r >= 1; r--) {
    const vId = idxId >= 0 ? String(values[r][idxId] || '').trim() : '';
    const vNo = idxNo >= 0 ? String(values[r][idxNo] || '').trim() : '';
    if (vId === target || vNo === target) {
      sheet.deleteRow(r + 1);
      return true;
    }
  }

  return false;
}

function buildAnalysis_(sheet) {
  const rows = readSheetAsObjects_(sheet);
  const total = rows.length;

  const counts = {
    Sehat: 0,
    Merana: 0,
    Mati: 0,
  };

  const jenisCount = {};
  const pengawasCount = {};
  let tinggiSum = 0;
  let tinggiN = 0;
  let duplikat = 0;
  let unik = 0;

  rows.forEach(function (row) {
    const health = normalizeHealth_(row['Kesehatan']);
    counts[health] = (counts[health] || 0) + 1;

    const jenis = String(row['Tanaman'] || 'Unknown').trim() || 'Unknown';
    jenisCount[jenis] = (jenisCount[jenis] || 0) + 1;

    const supervisor = String(row['Pengawas'] || 'N/A').trim() || 'N/A';
    pengawasCount[supervisor] = (pengawasCount[supervisor] || 0) + 1;

    const t = toNumberOrBlank_(row['Tinggi']);
    if (t !== '') {
      tinggiSum += Number(t);
      tinggiN += 1;
    }

    const status = String(row['Status_Duplikat'] || '').trim().toUpperCase();
    if (status === 'DUPLIKAT') {
      duplikat += 1;
    } else {
      unik += 1;
    }
  });

  const jenisTop = objectToSortedArray_(jenisCount, 'name', 'count', 5);
  const pengawasTop = objectToSortedArray_(pengawasCount, 'name', 'count', 5);

  const sehat = counts.Sehat || 0;
  const merana = counts.Merana || 0;
  const mati = counts.Mati || 0;

  const metrics = {
    total: total,
    sehat: sehat,
    merana: merana,
    mati: mati,
    persenSehat: total > 0 ? round_((sehat / total) * 100, 1) : 0,
    rataTinggi: tinggiN > 0 ? round_(tinggiSum / tinggiN, 1) : 0,
    jenisTop: jenisTop,
    pengawasTop: pengawasTop,
    unik: unik,
    duplikat: duplikat,
  };

  return {
    status: 'success',
    metrics: metrics,
    generatedAt: new Date().toISOString(),
    sheetName: SHEET_NAME,
  };
}

function refreshDuplicateAndTreeNumber_() {
  const sheet = ensureMonitoringSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return { processed: 0, unik: 0, duplikat: 0 };
  }

  const headers = values[0].map((h) => String(h || '').trim());
  const idx = buildHeaderIndex_(headers);

  const idxId = idx['ID'];
  const idxTanggal = idx['Tanggal'];
  const idxKoordinat = idx['Koordinat'];
  const idxStatus = idx['Status_Duplikat'];
  const idxNo = idx['No Pohon'];

  const keySeen = {};
  let counter = 1;
  let unik = 0;
  let duplikat = 0;

  for (var i = 1; i < values.length; i++) {
    const id = idxId >= 0 ? String(values[i][idxId] || '').trim() : '';
    const tanggal = idxTanggal >= 0 ? String(values[i][idxTanggal] || '').trim() : '';
    const koordinat = idxKoordinat >= 0 ? String(values[i][idxKoordinat] || '').trim() : '';
    const key = [id, tanggal, koordinat].join('|');

    const isDuplicate = Boolean(keySeen[key]);
    keySeen[key] = true;

    if (idxStatus >= 0) {
      values[i][idxStatus] = isDuplicate ? 'DUPLIKAT' : 'UNIK';
    }

    if (idxNo >= 0) {
      if (!isDuplicate) {
        values[i][idxNo] = counter;
        counter += 1;
        unik += 1;
      } else {
        values[i][idxNo] = '';
        duplikat += 1;
      }
    }
  }

  sheet.getRange(2, 1, values.length - 1, headers.length).setValues(values.slice(1));

  return {
    processed: values.length - 1,
    unik: unik,
    duplikat: duplikat,
  };
}

function exportToKML() {
  const sheet = ensureMonitoringSheet_();
  const rows = readSheetAsObjects_(sheet);

  let kml = '';
  kml += '<?xml version="1.0" encoding="UTF-8"?>\n';
  kml += '<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n';
  kml += '<name>Monitoring Montana</name>\n';

  rows.forEach(function (rec) {
    const fixed = getFixedLatLon_(rec['X'], rec['Y'], rec['Koordinat']);
    if (!fixed) {
      return;
    }

    const name = String(rec['No Pohon'] || rec['ID'] || 'Pohon').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const desc = [
      'ID: ' + String(rec['ID'] || ''),
      'Tanggal: ' + String(rec['Tanggal'] || ''),
      'Tanaman: ' + String(rec['Tanaman'] || ''),
      'Tinggi: ' + String(rec['Tinggi'] || ''),
      'Kesehatan: ' + String(rec['Kesehatan'] || ''),
      'Pengawas: ' + String(rec['Pengawas'] || ''),
      'Link Drive: ' + String(rec['Link Drive'] || ''),
    ].join('\\n').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    kml += '<Placemark>\n';
    kml += '<name>' + name + '</name>\n';
    kml += '<description><![CDATA[' + desc + ']]></description>\n';
    kml += '<Point><coordinates>' + fixed.lon + ',' + fixed.lat + ',0</coordinates></Point>\n';
    kml += '</Placemark>\n';
  });

  kml += '</Document>\n</kml>';
  const file = DriveApp.createFile('Monitoring_Montana_' + Date.now() + '.kml', kml, 'application/vnd.google-earth.kml+xml');
  SpreadsheetApp.getUi().alert('KML berhasil dibuat: ' + file.getName());
}

function pindahkanLinkSaja() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const source = ensureMonitoringSheet_();
  const targetName = 'GALERI_LINK';

  let target = ss.getSheetByName(targetName);
  if (!target) {
    target = ss.insertSheet(targetName);
  } else {
    target.clear();
  }

  target.getRange(1, 1).setValue('Link Drive');

  const rows = readSheetAsObjects_(source);
  const output = [];
  rows.forEach(function (row) {
    if (String(row['Status_Duplikat'] || '').trim().toUpperCase() === 'DUPLIKAT') {
      return;
    }
    const link = String(row['Link Drive'] || '').trim();
    if (link) {
      output.push([link]);
    }
  });

  if (output.length > 0) {
    target.getRange(2, 1, output.length, 1).setValues(output);
  }

  SpreadsheetApp.getUi().alert('Link berhasil dipindahkan: ' + output.length + ' baris.');
}

function detectDuplicateStatus_(sheet, id, tanggal, koordinat) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return 'UNIK';
  }

  const headers = values[0].map((h) => String(h || '').trim());
  const idx = buildHeaderIndex_(headers);
  const idxId = idx['ID'];
  const idxTanggal = idx['Tanggal'];
  const idxKoordinat = idx['Koordinat'];

  const keyTarget = [id, tanggal, koordinat].join('|');
  for (var i = 1; i < values.length; i++) {
    const key = [
      idxId >= 0 ? String(values[i][idxId] || '').trim() : '',
      idxTanggal >= 0 ? String(values[i][idxTanggal] || '').trim() : '',
      idxKoordinat >= 0 ? String(values[i][idxKoordinat] || '').trim() : '',
    ].join('|');

    if (key === keyTarget) {
      return 'DUPLIKAT';
    }
  }

  return 'UNIK';
}

function getNextTreeNumber_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return 1;
  }

  const headers = values[0].map((h) => String(h || '').trim());
  const idxNo = headers.indexOf('No Pohon');
  const idxStatus = headers.indexOf('Status_Duplikat');

  let maxNo = 0;
  for (var i = 1; i < values.length; i++) {
    const status = idxStatus >= 0 ? String(values[i][idxStatus] || '').trim().toUpperCase() : 'UNIK';
    if (status === 'DUPLIKAT') {
      continue;
    }
    const val = Number(String(idxNo >= 0 ? values[i][idxNo] : '').replace(',', '.'));
    if (Number.isFinite(val) && val > maxNo) {
      maxNo = val;
    }
  }

  return maxNo + 1;
}

function resolveCoordinates_(payload) {
  const xRaw = payload.X !== undefined ? payload.X : payload.x;
  const yRaw = payload.Y !== undefined ? payload.Y : payload.y;

  let lat = toNumber_(xRaw);
  let lon = toNumber_(yRaw);

  // Fallback dari string koordinat jika X/Y tidak valid.
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    const pair = parseCoordinatePair_(payload.Koordinat || payload.koordinat || payload.Lokasi || payload.lokasi);
    if (pair) {
      lat = pair.lat;
      lon = pair.lon;
    }
  }

  if (!Number.isFinite(lat)) {
    lat = 0;
  }
  if (!Number.isFinite(lon)) {
    lon = 0;
  }

  return {
    lat: lat,
    lon: lon,
    text: lat.toFixed(6) + ',' + lon.toFixed(6),
  };
}

function getFixedLatLon_(xRaw, yRaw, coordinateText) {
  let x = toNumber_(xRaw);
  let y = toNumber_(yRaw);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    const pair = parseCoordinatePair_(coordinateText);
    if (!pair) {
      return null;
    }
    x = pair.lat;
    y = pair.lon;
  }

  // Data monitoring lama: X cenderung latitude (negatif), Y cenderung longitude (100+).
  let lat = x;
  let lon = y;

  if (x > 100 && y < 0) {
    // Jika terbalik, perbaiki.
    lat = y;
    lon = x;
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return { lat: lat, lon: lon };
}

function parseCoordinatePair_(raw) {
  const text = String(raw || '').trim();
  if (!text) {
    return null;
  }

  const cleaned = text.replace(';', ',');
  const parts = cleaned.split(',').map((p) => p.trim()).filter((p) => p !== '');
  if (parts.length >= 2) {
    const a = toNumber_(parts[0]);
    const b = toNumber_(parts[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return { lat: a, lon: b };
    }
  }

  const nums = text.match(/-?\d+(?:[.,]\d+)?/g);
  if (nums && nums.length >= 2) {
    const first = toNumber_(nums[0]);
    const second = toNumber_(nums[1]);
    if (Number.isFinite(first) && Number.isFinite(second)) {
      return { lat: first, lon: second };
    }
  }

  return null;
}

function saveImageAndReturnUrl_(payload, id) {
  const rawBase64 = payload.RawBase64 || payload.Base64 || extractRawBase64_(payload.Gambar);
  if (!rawBase64) {
    return '';
  }

  const folder = getOrCreateFolder_(FOLDER_NAME);
  const fileName = 'Montana_' + id + '.jpg';
  const blob = Utilities.newBlob(Utilities.base64Decode(rawBase64), 'image/jpeg', fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function extractRawBase64_(dataUrl) {
  const text = String(dataUrl || '').trim();
  if (!text) {
    return '';
  }
  if (text.indexOf('base64,') >= 0) {
    return text.split('base64,')[1] || '';
  }
  return text;
}

function getOrCreateFolder_(folderName) {
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(folderName);
}

function buildPoopHtml_(linkDrive) {
  const url = String(linkDrive || '').trim();
  if (!url) {
    return '';
  }

  const fileId = extractDriveFileId_(url);
  if (!fileId) {
    return '';
  }

  return '<img src="https://drive.google.com/uc?id=' + fileId + '" width="300">';
}

function extractDriveFileId_(url) {
  const match1 = String(url).match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match1 && match1[1]) {
    return match1[1];
  }
  const match2 = String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match2 && match2[1]) {
    return match2[1];
  }
  return '';
}

function normalizeHealth_(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'mati' || raw.indexOf('mati') >= 0) {
    return 'Mati';
  }
  if (raw === 'merana' || raw.indexOf('merana') >= 0) {
    return 'Merana';
  }
  return 'Sehat';
}

function objectToSortedArray_(obj, keyLabel, valueLabel, maxItems) {
  const out = [];
  for (var k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      const item = {};
      item[keyLabel] = k;
      item[valueLabel] = obj[k];
      out.push(item);
    }
  }

  out.sort(function (a, b) {
    return b[valueLabel] - a[valueLabel];
  });

  return out.slice(0, maxItems || 10);
}

function buildHeaderIndex_(headers) {
  const map = {};
  headers.forEach(function (h, i) {
    map[String(h || '').trim()] = i;
  });
  return map;
}

function setByHeader_(row, headerIndex, name, value) {
  const idx = headerIndex[name];
  if (idx === undefined || idx < 0) {
    return;
  }
  row[idx] = value;
}

function getParam_(e, name, fallbackValue) {
  if (!e || !e.parameter || e.parameter[name] === undefined) {
    return fallbackValue;
  }
  return String(e.parameter[name]);
}

function toNumber_(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const raw = String(value || '').trim();
  if (!raw) {
    return NaN;
  }
  const normalized = raw.replace(',', '.').replace(/[^0-9.\-]+/g, '');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : NaN;
}

function toNumberOrBlank_(value) {
  const num = toNumber_(value);
  return Number.isFinite(num) ? num : '';
}

function normalizeCoordText_(value) {
  const num = toNumber_(value);
  return Number.isFinite(num) ? num : String(value || '').trim();
}

function round_(value, decimals) {
  const p = Math.pow(10, decimals || 0);
  return Math.round(value * p) / p;
}

function generateId_() {
  const now = new Date();
  const pad = function (n, len) {
    return String(n).padStart(len, '0');
  };
  return (
    now.getFullYear() +
    pad(now.getMonth() + 1, 2) +
    pad(now.getDate(), 2) +
    '-' +
    pad(now.getHours(), 2) +
    pad(now.getMinutes(), 2) +
    pad(now.getSeconds(), 2) +
    pad(now.getMilliseconds(), 3)
  );
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
