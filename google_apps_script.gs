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
const ECO_SUMMARY_SHEET_NAME = 'Eco Summary';
const FOLDER_NAME = 'Montana V2_Images';
const IDEAL_DENSITY_PER_HA = 625;
const IDEAL_SPACING_M = 4;

const DEFAULT_HEADERS = [
  'ID',
  'Tanggal',
  'Lokasi',
  'Pekerjaan',
  'Tinggi',
  'Koordinat',
  'Koordinat_Asli',
  'Koordinat_Revisi',
  'Y',
  'X',
  'Tanaman',
  'Tahun Tanam',
  'Pengawas',
  'Vendor',
  'Link Drive',
  'No Pohon',
  'Kesehatan',
  'AI_Kesehatan',
  'AI_Confidence',
  'AI_Deskripsi',
  'HCV_Input',
  'poop',
  'Status_Duplikat',
  'Eco_BiomassaKg',
  'Eco_KarbonKgC',
  ];

function doGet(e) {
  try {
    const action = getParam_(e, 'action', 'list').toLowerCase();
    const sheet = ensureMonitoringSheet_();

    if (action === 'analysis') {
      return jsonResponse_(buildAnalysis_(sheet));
    }

    if (action === 'analysis_ecology' || action === 'ecology') {
      return jsonResponse_(buildEcologyAnalysis_(sheet));
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

    if (action === 'rebuild_ecology') {
      const result = rebuildEcologyColumns_(sheet);
      return jsonResponse_({ status: 'success', message: 'Rebuild ekologi selesai.', ...result });
    }

    if (action === 'rebuild_ecology_empty') {
      const result = rebuildEmptyEcologyColumns_(sheet);
      return jsonResponse_({ status: 'success', message: 'Isi ekologi kosong selesai.', ...result });
    }

    const saved = appendMonitoringRow_(sheet, body);
    return jsonResponse_({
      status: 'success',
      message: saved.updated ? 'Data diperbarui (ID sudah ada).' : 'Data tersimpan.',
      id: saved.id,
      statusDuplikat: saved.statusDuplikat,
      noPohon: saved.noPohon,
      url: saved.linkDrive,
      updated: Boolean(saved.updated),
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

  // Bersihkan header duplikat agar kolom tidak berulang-ulang.
  const duplicateCols = getDuplicateColumnIndexes_(normalized);
  if (duplicateCols.length > 0) {
    duplicateCols
      .sort(function (a, b) {
        return b - a;
      })
      .forEach(function (colIdx1Based) {
        sheet.deleteColumn(colIdx1Based);
      });
  }

  const refreshedLastCol = sheet.getLastColumn();
  const refreshed = sheet.getRange(1, 1, 1, refreshedLastCol).getValues()[0];
  const refreshedNormalized = refreshed.map((h) => String(h || '').trim());

  // Pastikan semua kolom default tersedia. Jika belum ada, tambahkan di akhir.
  DEFAULT_HEADERS.forEach((header) => {
    if (refreshedNormalized.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      refreshedNormalized.push(header);
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
  const tanggal = normalizeTanggal_(payload.Tanggal || payload.tanggal);
  const pekerjaan = String(payload.Pekerjaan || payload.pekerjaan || '').trim();
  const tinggi = toNumberOrBlank_(payload.Tinggi ?? payload.tinggi);
  const tanaman = String(payload.Tanaman || payload.tanaman || 'Unknown').trim();
  const tahunTanam = String(payload['Tahun Tanam'] || payload.tahunTanam || '').trim();
  const pengawas = String(payload.Pengawas || payload.pengawas || '').trim();
  const vendor = String(payload.Vendor || payload.vendor || '').trim();
  const kesehatan = normalizeHealth_(payload.Kesehatan || payload.kesehatan || 'Sehat');
  const aiKesehatanRaw = String(payload.AI_Kesehatan || payload.aiKesehatan || '').trim();
  const aiKesehatan = aiKesehatanRaw ? normalizeHealth_(aiKesehatanRaw) : '';
  const aiConfidence = toNumberOrBlank_(payload.AI_Confidence ?? payload.aiConfidence);
  const aiDeskripsiRaw = String(payload.AI_Deskripsi || payload.aiDeskripsi || '').trim();
  const hcvInputRaw = toNumberOrBlank_(payload.HCV_Input ?? payload.hcvInput);

  // Server-side fallback: hitung HCV jika klien tidak mengirim
  const hcvInput = (hcvInputRaw !== '' && hcvInputRaw !== null && hcvInputRaw !== undefined)
    ? hcvInputRaw
    : computeHcvInput_(kesehatan, aiKesehatan, aiConfidence);

  // Server-side fallback: generate deskripsi jika klien tidak mengirim
  const aiDeskripsi = aiDeskripsiRaw
    ? aiDeskripsiRaw
    : generateHealthDescription_(kesehatan, aiKesehatan, aiConfidence, hcvInput);

  const coords = resolveCoordinates_(payload);
  const lokasiRaw = String(payload.Lokasi || payload.lokasi || coords.text).trim();
  const koordinatRaw = String(payload.Koordinat || payload.koordinat || payload.Koordinat_Revisi || payload.koordinatRevisi || coords.text).trim();
  const koordinatAsliRaw = String(payload.Koordinat_Asli || payload.koordinatAsli || payload.rawKoordinat || '').trim();
  const koordinatRevisiRaw = String(payload.Koordinat_Revisi || payload.koordinatRevisi || '').trim();
  const snappedToGrid = toBoolean_(payload.Snapped_To_Grid !== undefined ? payload.Snapped_To_Grid : payload.snappedToGrid);
  const lokasi = lokasiRaw.toLowerCase().includes('nan') ? coords.text : lokasiRaw;
  const koordinatUser = koordinatRaw.toLowerCase().includes('nan') ? coords.text : koordinatRaw;

  const originalFixedFromPayload = getFixedLatLon_(
    payload.X_Asli !== undefined ? payload.X_Asli : payload.xAsli,
    payload.Y_Asli !== undefined ? payload.Y_Asli : payload.yAsli,
    koordinatAsliRaw,
  );
  const originalFixedFallback = getFixedLatLon_(
    payload.X !== undefined ? payload.X : coords.lat,
    payload.Y !== undefined ? payload.Y : coords.lon,
    koordinatAsliRaw || koordinatUser || lokasi,
  );
  const originalFixed = originalFixedFromPayload || originalFixedFallback;

  // Prioritas revisi: X/Y revisi eksplisit -> string koordinat revisi -> hitung otomatis.
  const revisedFixedFromPayload = snappedToGrid
    ? getFixedLatLon_(
        payload.X_Revisi !== undefined ? payload.X_Revisi : payload.xRevisi,
        payload.Y_Revisi !== undefined ? payload.Y_Revisi : payload.yRevisi,
        koordinatRevisiRaw,
      )
    : null;
  const revisedFixedFromText = snappedToGrid && koordinatRevisiRaw
    ? getFixedLatLon_('', '', koordinatRevisiRaw)
    : null;
  const revisedFixed = snappedToGrid
    ? (revisedFixedFromPayload || revisedFixedFromText || computeRevisedCoordinate_(sheet, headerIndex, originalFixed) || originalFixed)
    : null;

  const koordinatAsli = originalFixed
    ? toCoordinateText_(originalFixed.lat, originalFixed.lon)
    : (koordinatAsliRaw || koordinatUser);
  const koordinatRevisi = snappedToGrid
    ? (revisedFixed
      ? toCoordinateText_(revisedFixed.lat, revisedFixed.lon)
      : (koordinatRevisiRaw || ''))
    : '';
  const koordinat = koordinatRevisi || koordinatAsli || koordinatUser;

  // Y dipertahankan sebagai longitude, X sebagai latitude agar kompatibel data lama aplikasi.
  const y = revisedFixed
    ? revisedFixed.lon
    : originalFixed
      ? originalFixed.lon
      : (Number.isFinite(coords.lon) ? coords.lon : '');
  const x = revisedFixed
    ? revisedFixed.lat
    : originalFixed
      ? originalFixed.lat
      : (Number.isFinite(coords.lat) ? coords.lat : '');

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
  setByHeader_(row, headerIndex, 'Koordinat_Asli', koordinatAsli);
  setByHeader_(row, headerIndex, 'Koordinat_Revisi', koordinatRevisi);
  setByHeader_(row, headerIndex, 'Y', normalizeCoordText_(y));
  setByHeader_(row, headerIndex, 'X', normalizeCoordText_(x));
  setByHeader_(row, headerIndex, 'Tanaman', tanaman);
  setByHeader_(row, headerIndex, 'Tahun Tanam', tahunTanam);
  setByHeader_(row, headerIndex, 'Pengawas', pengawas);
  setByHeader_(row, headerIndex, 'Vendor', vendor);
  setByHeader_(row, headerIndex, 'Link Drive', linkDrive);
  setByHeader_(row, headerIndex, 'No Pohon', noPohon);
  setByHeader_(row, headerIndex, 'Kesehatan', kesehatan);
  setByHeader_(row, headerIndex, 'AI_Kesehatan', aiKesehatan);
  setByHeader_(row, headerIndex, 'AI_Confidence', aiConfidence);
  setByHeader_(row, headerIndex, 'AI_Deskripsi', aiDeskripsi);
  setByHeader_(row, headerIndex, 'HCV_Input', hcvInput);
  setByHeader_(row, headerIndex, 'poop', poop);
  setByHeader_(row, headerIndex, 'Status_Duplikat', statusDuplikat);

  const tinggiNum = toNumber_(tinggi);
  const biomassaKg = estimateBiomassFromHeightCm_(tinggiNum);
  const karbonKg = estimateCarbonFromBiomass_(biomassaKg);
  setByHeader_(row, headerIndex, 'Eco_BiomassaKg', biomassaKg);
  setByHeader_(row, headerIndex, 'Eco_KarbonKgC', karbonKg);
  setByHeader_(row, headerIndex, 'Eco_UpdatedAt', new Date().toISOString());

  const existingRowNumber = findRowById_(sheet, headerIndex, id);
  if (existingRowNumber > 1) {
    sheet.getRange(existingRowNumber, 1, 1, headers.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }

  return {
    id: id,
    noPohon: noPohon,
    statusDuplikat: statusDuplikat,
    linkDrive: linkDrive,
    updated: existingRowNumber > 1,
  };
}

function findRowById_(sheet, headerIndex, id) {
  const idxId = headerIndex['ID'];
  if (idxId === undefined || idxId < 0) {
    return -1;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return -1;
  }

  const values = sheet.getRange(2, idxId + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === id) {
      return i + 2;
    }
  }
  return -1;
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

function buildEcologyAnalysis_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return {
      status: 'success',
      summary: {
        totalTrees: 0,
        healthyTrees: 0,
        unhealthyTrees: 0,
        density: 0,
        cci: 0,
        cciGrade: 'Buruk',
        spacingMean: 0,
        spacingStd: 0,
        spacingConformity: 0,
        gpsAccuracy: 0,
        areaHa: 0.01,
        totalBiomass: 0,
        totalCarbon: 0,
      },
      perTree: [],
      generatedAt: new Date().toISOString(),
      sheetName: SHEET_NAME,
    };
  }

  const headers = values[0].map((h) => String(h || '').trim());
  const dataRows = values.slice(1);
  const ecology = computeEcologyFromRows_(headers, dataRows);

  return {
    status: 'success',
    summary: ecology.summary,
    perTree: ecology.perTree,
    generatedAt: new Date().toISOString(),
    sheetName: SHEET_NAME,
  };
}

function rebuildEcologyColumns_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return { processed: 0, updated: 0 };
  }

  const headers = values[0].map((h) => String(h || '').trim());
  const headerIndex = buildHeaderIndex_(headers);
  const dataRows = values.slice(1);
  const ecology = computeEcologyFromRows_(headers, dataRows);

  const perTreeByRow = {};
  ecology.perTree.forEach(function (item) {
    perTreeByRow[item.rowNumber] = item;
  });

  let updated = 0;
  for (var i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2;
    const row = dataRows[i];
    const detail = perTreeByRow[rowNumber];
    if (!detail) {
      continue;
    }

    setByHeader_(row, headerIndex, 'Eco_BiomassaKg', detail.biomassKg);
    setByHeader_(row, headerIndex, 'Eco_KarbonKgC', detail.carbonKg);
    // Fokus analisis disederhanakan: non-spasial saja.
    setByHeader_(row, headerIndex, 'Eco_JarakTerdekatM', '');
    setByHeader_(row, headerIndex, 'Eco_SesuaiJarak', '');
    setByHeader_(row, headerIndex, 'Eco_KepadatanHa', '');
    setByHeader_(row, headerIndex, 'Eco_CCI', '');
    setByHeader_(row, headerIndex, 'Eco_CCI_Grade', '');
    setByHeader_(row, headerIndex, 'Eco_AreaHa', '');
    setByHeader_(row, headerIndex, 'Eco_JarakRata2M', '');
    setByHeader_(row, headerIndex, 'Eco_JarakStdM', '');
    setByHeader_(row, headerIndex, 'Eco_KesesuaianJarakPct', '');
    setByHeader_(row, headerIndex, 'Eco_GpsMedianM', '');
    setByHeader_(row, headerIndex, 'Eco_UpdatedAt', new Date().toISOString());
    updated += 1;
  }

  sheet.getRange(2, 1, dataRows.length, headers.length).setValues(dataRows);
  writeEcologySummarySheet_(ecology.summary);
  return {
    processed: dataRows.length,
    updated: updated,
    summary: ecology.summary,
  };
}

function rebuildEmptyEcologyColumns_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return { processed: 0, updated: 0, skipped: 0 };
  }

  const headers = values[0].map((h) => String(h || '').trim());
  const headerIndex = buildHeaderIndex_(headers);
  const dataRows = values.slice(1);
  const ecology = computeEcologyFromRows_(headers, dataRows);

  const perTreeByRow = {};
  ecology.perTree.forEach(function (item) {
    perTreeByRow[item.rowNumber] = item;
  });

  let updated = 0;
  let skipped = 0;

  for (var i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2;
    const row = dataRows[i];
    const detail = perTreeByRow[rowNumber];
    if (!detail) {
      skipped += 1;
      continue;
    }

    if (!isEcologyRowEmpty_(row, headerIndex)) {
      skipped += 1;
      continue;
    }

    setByHeader_(row, headerIndex, 'Eco_BiomassaKg', detail.biomassKg);
    setByHeader_(row, headerIndex, 'Eco_KarbonKgC', detail.carbonKg);
    setByHeader_(row, headerIndex, 'Eco_JarakTerdekatM', '');
    setByHeader_(row, headerIndex, 'Eco_SesuaiJarak', '');
    setByHeader_(row, headerIndex, 'Eco_KepadatanHa', '');
    setByHeader_(row, headerIndex, 'Eco_CCI', '');
    setByHeader_(row, headerIndex, 'Eco_CCI_Grade', '');
    setByHeader_(row, headerIndex, 'Eco_AreaHa', '');
    setByHeader_(row, headerIndex, 'Eco_JarakRata2M', '');
    setByHeader_(row, headerIndex, 'Eco_JarakStdM', '');
    setByHeader_(row, headerIndex, 'Eco_KesesuaianJarakPct', '');
    setByHeader_(row, headerIndex, 'Eco_GpsMedianM', '');
    setByHeader_(row, headerIndex, 'Eco_UpdatedAt', new Date().toISOString());
    updated += 1;
  }

  sheet.getRange(2, 1, dataRows.length, headers.length).setValues(dataRows);
  writeEcologySummarySheet_(ecology.summary);
  return {
    processed: dataRows.length,
    updated: updated,
    skipped: skipped,
    summary: ecology.summary,
  };
}

function isEcologyRowEmpty_(row, headerIndex) {
  const fields = [
    'Eco_BiomassaKg',
    'Eco_KarbonKgC',
    'Eco_JarakTerdekatM',
    'Eco_SesuaiJarak',
    'Eco_KepadatanHa',
    'Eco_CCI',
    'Eco_CCI_Grade',
    'Eco_AreaHa',
    'Eco_JarakRata2M',
    'Eco_JarakStdM',
    'Eco_KesesuaianJarakPct',
    'Eco_GpsMedianM',
    'Eco_UpdatedAt',
  ];

  for (var i = 0; i < fields.length; i++) {
    const idx = headerIndex[fields[i]];
    if (idx === undefined || idx < 0) {
      continue;
    }
    const value = row[idx];
    if (String(value || '').trim() !== '') {
      return false;
    }
  }

  return true;
}

/**
 * Jalankan fungsi ini langsung dari Apps Script editor untuk mengisi
 * hanya baris yang kolom ekologinya masih kosong.
 */
function isiEkologiKosongSaja() {
  const sheet = ensureMonitoringSheet_();
  const result = rebuildEmptyEcologyColumns_(sheet);
  Logger.log(JSON.stringify(result));
  SpreadsheetApp.getUi().alert(
    'Isi ekologi kosong selesai. Diproses: ' + result.processed + ', Diupdate: ' + result.updated + ', Dilewati: ' + result.skipped,
  );
}

/**
 * Jalankan ini untuk menulis ringkasan ekologi sederhana ke sheet baru.
 */
function tulisRingkasanEkologi() {
  const sheet = ensureMonitoringSheet_();
  const values = sheet.getDataRange().getValues();
  const headers = values.length > 0 ? values[0].map((h) => String(h || '').trim()) : [];
  const dataRows = values.length > 1 ? values.slice(1) : [];
  const ecology = computeEcologyFromRows_(headers, dataRows);
  writeEcologySummarySheet_(ecology.summary);
  SpreadsheetApp.getUi().alert('Ringkasan ekologi ditulis ke sheet: ' + ECO_SUMMARY_SHEET_NAME);
}

/**
 * Audit cepat untuk mengecek baris yang koordinatnya invalid sehingga
 * berpotensi merusak hitungan area, jarak, dan kepadatan.
 */
function cekKoordinatEkologi() {
  const sheet = ensureMonitoringSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    SpreadsheetApp.getUi().alert('Tidak ada data untuk diaudit.');
    return;
  }

  const headers = values[0].map((h) => String(h || '').trim());
  const idx = buildHeaderIndex_(headers);
  const issues = [];

  for (var i = 1; i < values.length; i++) {
    const rowNumber = i + 1;
    const row = values[i];
    const id = idx['ID'] >= 0 ? String(row[idx['ID']] || '').trim() : '';
    const x = idx['X'] >= 0 ? row[idx['X']] : '';
    const y = idx['Y'] >= 0 ? row[idx['Y']] : '';
    const koordinat = idx['Koordinat'] >= 0 ? row[idx['Koordinat']] : '';
    const lokasi = idx['Lokasi'] >= 0 ? row[idx['Lokasi']] : '';
    const fixed = getFixedLatLon_(x, y, koordinat || lokasi);

    if (!fixed) {
      issues.push({
        row: rowNumber,
        id: id,
        x: x,
        y: y,
        koordinat: koordinat || lokasi,
        reason: 'INVALID_OR_ZERO_COORDINATE',
      });
    }
  }

  Logger.log(JSON.stringify({ totalRows: values.length - 1, invalidRows: issues.length, issues: issues }));
  SpreadsheetApp.getUi().alert('Audit koordinat selesai. Total baris: ' + (values.length - 1) + ', bermasalah: ' + issues.length + '. Cek Logger.');
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
    const rowId = idxId >= 0 ? String(values[i][idxId] || '').trim() : '';
    if (rowId && rowId === id) {
      continue;
    }

    const key = [
      rowId,
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

function computeEcologyFromRows_(headers, dataRows) {
  const idx = buildHeaderIndex_(headers);
  const treeRows = dataRows.map(function (row, index) {
    const rowNumber = index + 2;
    const id = idx['ID'] >= 0 ? String(row[idx['ID']] || '').trim() : '';
    const noPohon = idx['No Pohon'] >= 0 ? String(row[idx['No Pohon']] || '').trim() : '';
    const tanaman = idx['Tanaman'] >= 0 ? String(row[idx['Tanaman']] || '').trim() : '';
    const kesehatan = normalizeHealth_(idx['Kesehatan'] >= 0 ? row[idx['Kesehatan']] : 'Sehat');
    const tinggiCm = toNumber_(idx['Tinggi'] >= 0 ? row[idx['Tinggi']] : '');
    const x = idx['X'] >= 0 ? row[idx['X']] : '';
    const y = idx['Y'] >= 0 ? row[idx['Y']] : '';
    const koordinatRevisi = idx['Koordinat_Revisi'] >= 0 ? row[idx['Koordinat_Revisi']] : '';
    const koordinat = idx['Koordinat'] >= 0 ? row[idx['Koordinat']] : '';
    const lokasi = idx['Lokasi'] >= 0 ? row[idx['Lokasi']] : '';
    const fixed = getFixedLatLon_(x, y, koordinatRevisi || koordinat || lokasi);
    const gpsAccuracy = toNumber_(idx['GPS_Accuracy_M'] >= 0 ? row[idx['GPS_Accuracy_M']] : '');
    const hcvInput = toNumber_(idx['HCV_Input'] >= 0 ? row[idx['HCV_Input']] : '');

    return {
      rowNumber: rowNumber,
      id: id,
      noPohon: noPohon,
      tanaman: tanaman,
      kesehatan: kesehatan,
      tinggiCm: Number.isFinite(tinggiCm) ? tinggiCm : 0,
      lat: fixed ? fixed.lat : NaN,
      lon: fixed ? fixed.lon : NaN,
      accuracy: Number.isFinite(gpsAccuracy) ? gpsAccuracy : NaN,
      hcvInput: Number.isFinite(hcvInput) ? hcvInput : NaN,
    };
  });

  const totalTrees = treeRows.length;
  const healthyTrees = treeRows.filter(function (tree) {
    return String(tree.kesehatan || '').toLowerCase() === 'sehat';
  }).length;
  const unhealthyTrees = Math.max(0, totalTrees - healthyTrees);

  const heightsCm = treeRows
    .map(function (tree) {
      return Number.isFinite(tree.tinggiCm) && tree.tinggiCm > 0 ? tree.tinggiCm : NaN;
    })
    .filter(function (v) {
      return Number.isFinite(v);
    });

  const perTree = treeRows.map(function (tree) {
    const biomassKg = estimateBiomassFromHeightCm_(tree.tinggiCm);
    const carbonKg = estimateCarbonFromBiomass_(biomassKg);

    return {
      rowNumber: tree.rowNumber,
      id: tree.id,
      noPohon: tree.noPohon,
      tanaman: tree.tanaman,
      kesehatan: tree.kesehatan,
      tinggiCm: round_(tree.tinggiCm, 2),
      koordinat: Number.isFinite(tree.lat) && Number.isFinite(tree.lon)
        ? round_(tree.lat, 6) + ',' + round_(tree.lon, 6)
        : '',
      biomassKg: biomassKg,
      carbonKg: carbonKg,
      nearestTreeDistanceM: 0,
      spacingConform: false,
      gpsAccuracyM: Number.isFinite(tree.accuracy) ? round_(tree.accuracy, 2) : 0,
    };
  });

  const totalBiomass = round_(
    perTree.reduce(function (acc, item) {
      return acc + (Number(item.biomassKg) || 0);
    }, 0),
    3,
  );

  const totalVolumeM3 = round_(
    treeRows.reduce(function (acc, tree) {
      return acc + estimateVolumeFromHeightCm_(tree.tinggiCm);
    }, 0),
    3,
  );

  const avgHeightCm = heightsCm.length > 0
    ? round_(
        heightsCm.reduce(function (acc, cur) {
          return acc + cur;
        }, 0) / heightsCm.length,
        2,
      )
    : 0;

  const medianHeightCm = median_(heightsCm);
  const maxHeightCm = heightsCm.length > 0 ? round_(Math.max.apply(null, heightsCm), 2) : 0;
  const canopyCoverPct = estimateCanopyCoverPct_(heightsCm, totalTrees);
  const hcvHealthIndex = computeHcvHealthIndex_(treeRows);

  return {
    summary: {
      totalTrees: treeRows.length,
      healthyTrees: healthyTrees,
      unhealthyTrees: unhealthyTrees,
      density: 0,
      densityMethod: 'disabled',
      densityBbox: 0,
      densitySpacing: 0,
      cci: 0,
      cciGrade: 'N/A',
      spacingMean: 0,
      spacingStd: 0,
      spacingConformity: 0,
      gpsAccuracy: 0,
      areaHa: 0,
      totalBiomass: totalBiomass,
      totalCarbon: round_(estimateCarbonFromBiomass_(totalBiomass), 3),
      canopyCoverPct: canopyCoverPct,
      hcvHealthIndex: hcvHealthIndex,
      totalVolumeM3: totalVolumeM3,
      avgHeightCm: avgHeightCm,
      medianHeightCm: medianHeightCm,
      tallestHeightCm: maxHeightCm,
    },
    perTree: perTree,
  };
}

function estimateVolumeFromHeightCm_(heightCm) {
  const safeHeightCm = Number.isFinite(heightCm) && heightCm > 0 ? heightCm : 0;
  if (safeHeightCm === 0) {
    return 0;
  }

  const h = safeHeightCm / 100;
  const dCm = h <= 1.3 ? Math.max(0.5, h * 0.85) : Math.max(1, 0.85 * Math.pow(h, 1.2));
  const dM = dCm / 100;
  const formFactor = 0.45;
  const volume = Math.PI * Math.pow(dM / 2, 2) * h * formFactor;
  return round_(Math.max(0, volume), 4);
}

function estimateCanopyCoverPct_(heightsCm, totalTrees) {
  if (!heightsCm || heightsCm.length === 0 || !Number.isFinite(totalTrees) || totalTrees <= 0) {
    return 0;
  }

  const canopyAreaM2 = heightsCm.reduce(function (acc, hCm) {
    const hM = hCm / 100;
    const crownDiameterM = Math.max(0.5, hM * 0.4);
    const area = Math.PI * Math.pow(crownDiameterM / 2, 2);
    return acc + area;
  }, 0);

  // Asumsi plot mengikuti desain 4x4 meter per pohon.
  const plotAreaM2 = Math.max(1, totalTrees * IDEAL_SPACING_M * IDEAL_SPACING_M);
  return round_(Math.max(0, Math.min(100, (canopyAreaM2 / plotAreaM2) * 100)), 2);
}

function computeHcvHealthIndex_(treeRows) {
  if (!treeRows || treeRows.length === 0) {
    return 0;
  }

  const explicitScores = treeRows
    .map(function (tree) {
      return Number(tree.hcvInput);
    })
    .filter(function (value) {
      return Number.isFinite(value);
    });

  // Jika operator sudah mengirim HCV otomatis dari aplikasi, pakai itu sebagai sumber utama.
  if (explicitScores.length > 0) {
    const avg = explicitScores.reduce(function (acc, cur) {
      return acc + cur;
    }, 0) / explicitScores.length;
    return round_(Math.max(0, Math.min(100, avg)), 2);
  }

  let score = 0;
  treeRows.forEach(function (tree) {
    const h = String(tree.kesehatan || '').toLowerCase();
    if (h === 'sehat') {
      score += 1;
    } else if (h === 'merana') {
      score += 0.5;
    }
  });

  return round_((score / treeRows.length) * 100, 2);
}

function median_(values) {
  const arr = (values || [])
    .filter(function (v) {
      return Number.isFinite(v);
    })
    .slice()
    .sort(function (a, b) {
      return a - b;
    });

  if (arr.length === 0) {
    return 0;
  }

  const mid = Math.floor(arr.length / 2);
  const med = arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
  return round_(med, 2);
}

function estimateAreaHaFromTrees_(trees) {
  if (!trees || trees.length < 2) {
    return 1;
  }

  const lats = trees.map(function (tree) {
    return tree.lat;
  });
  const lons = trees.map(function (tree) {
    return tree.lon;
  });

  const minLat = Math.min.apply(null, lats);
  const maxLat = Math.max.apply(null, lats);
  const minLon = Math.min.apply(null, lons);
  const maxLon = Math.max.apply(null, lons);

  const latMeters = (maxLat - minLat) * 111320;
  const midLatRad = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const lonMeters = (maxLon - minLon) * 111320 * Math.cos(midLatRad);
  const areaM2 = Math.max(1, Math.abs(latMeters * lonMeters));

  return Math.max(0.01, areaM2 / 10000);
}

function calculateTreeDensityFromRows_(trees, areaHa, spacingMean) {
  const safeAreaHa = Number.isFinite(areaHa) && areaHa > 0 ? areaHa : 1;
  const totalTrees = trees.length;
  const healthyTrees = trees.filter(function (tree) {
    return String(tree.kesehatan || '').toLowerCase() === 'sehat';
  }).length;
  const unhealthyTrees = Math.max(0, totalTrees - healthyTrees);

  const bboxDensityRaw = healthyTrees / safeAreaHa;
  const bboxDensity = round_(bboxDensityRaw, 2);

  const safeSpacing = Number.isFinite(spacingMean) && spacingMean > 0 ? spacingMean : NaN;
  const spacingForDensity = Number.isFinite(safeSpacing) ? Math.max(safeSpacing, IDEAL_SPACING_M) : NaN;
  const healthyRatio = totalTrees > 0 ? healthyTrees / totalTrees : 0;
  const spacingDensityRaw = Number.isFinite(spacingForDensity)
    ? (10000 / Math.pow(spacingForDensity, 2)) * healthyRatio
    : NaN;
  const spacingDensity = Number.isFinite(spacingDensityRaw) ? round_(spacingDensityRaw, 2) : 0;

  let selected = bboxDensity;
  let method = 'bbox';

  const spacingUsable = Number.isFinite(spacingDensityRaw) && spacingDensityRaw > 0;
  if (spacingUsable) {
    const sampleIsSmall = totalTrees <= 25;
    const bboxLooksTooLow = bboxDensityRaw < spacingDensityRaw * 0.35;
    const bboxLooksTooHigh = bboxDensityRaw > spacingDensityRaw * 2.5;

    if (sampleIsSmall || bboxLooksTooLow || bboxLooksTooHigh) {
      selected = spacingDensity;
      method = 'spacing';
    }
  }

  // Untuk skenario desain 4x4, kepadatan efektif dibatasi ke kapasitas ideal 625/ha.
  const selectedCapped = Math.max(0, Math.min(IDEAL_DENSITY_PER_HA, selected));

  return {
    treesPerHa: round_(selectedCapped, 2),
    healthyTrees: healthyTrees,
    unhealthyTrees: unhealthyTrees,
    method: method,
    bboxDensity: bboxDensity,
    spacingDensity: spacingDensity,
  };
}

function calculateCCIFromDensity_(density, idealDensity) {
  const safeDensity = Number.isFinite(density) && density > 0 ? density : 0;
  const safeIdeal = Number.isFinite(idealDensity) && idealDensity > 0 ? idealDensity : 1;
  const rawCapacity = (safeDensity / safeIdeal) * 100;
  const efficiencyPercent = Math.max(0, Math.min(100, rawCapacity));
  let grade = 'Buruk';
  if (efficiencyPercent >= 80) {
    grade = 'Optimal';
  } else if (efficiencyPercent >= 60) {
    grade = 'Baik';
  } else if (efficiencyPercent >= 40) {
    grade = 'Cukup';
  }

  return {
    capacity: round_(rawCapacity, 2),
    efficiencyPercent: round_(efficiencyPercent, 2),
    grade: grade,
  };
}

function calculateSpacingAndNearest_(trees, idealSpacing) {
  if (!trees || trees.length < 2) {
    return {
      meanDistance: 0,
      medianDistance: 0,
      stdDeviation: 0,
      conformityPercent: 0,
      nearestByRow: {},
    };
  }

  const nearestByRow = {};
  trees.forEach(function (tree) {
    nearestByRow[String(tree.rowNumber)] = Number.POSITIVE_INFINITY;
  });

  const safeIdeal = Number.isFinite(idealSpacing) && idealSpacing > 0 ? idealSpacing : 4;
  const minIdeal = safeIdeal * 0.75;
  const maxIdeal = safeIdeal * 1.25;

  for (var i = 0; i < trees.length - 1; i++) {
    for (var j = i + 1; j < trees.length; j++) {
      const d = haversineMeters_(trees[i].lat, trees[i].lon, trees[j].lat, trees[j].lon);
      if (!Number.isFinite(d)) {
        continue;
      }

      const keyA = String(trees[i].rowNumber);
      const keyB = String(trees[j].rowNumber);
      nearestByRow[keyA] = Math.min(nearestByRow[keyA], d);
      nearestByRow[keyB] = Math.min(nearestByRow[keyB], d);
    }
  }

  const nearestDistances = [];
  Object.keys(nearestByRow).forEach(function (key) {
    const value = nearestByRow[key];
    if (Number.isFinite(value) && value > 0) {
      nearestDistances.push(value);
    } else {
      nearestByRow[key] = 0;
    }
  });

  if (nearestDistances.length === 0) {
    return {
      meanDistance: 0,
      medianDistance: 0,
      stdDeviation: 0,
      conformityPercent: 0,
      nearestByRow: nearestByRow,
    };
  }

  const mean = nearestDistances.reduce(function (acc, cur) {
    return acc + cur;
  }, 0) / nearestDistances.length;
  const variance = nearestDistances.reduce(function (acc, cur) {
    return acc + Math.pow(cur - mean, 2);
  }, 0) / nearestDistances.length;
  const std = Math.sqrt(variance);
  const sorted = nearestDistances.slice().sort(function (a, b) {
    return a - b;
  });
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const conformed = nearestDistances.filter(function (d) {
    return d >= minIdeal && d <= maxIdeal;
  }).length;

  return {
    meanDistance: round_(mean, 2),
    medianDistance: round_(median, 2),
    stdDeviation: round_(std, 2),
    conformityPercent: round_((conformed / nearestDistances.length) * 100, 2),
    nearestByRow: nearestByRow,
  };
}

function filterSpatialTreesForEcology_(treeRows) {
  const valid = (treeRows || []).filter(function (tree) {
    return Number.isFinite(tree.lat) && Number.isFinite(tree.lon);
  });

  if (valid.length <= 2) {
    return valid;
  }

  let base = valid;

  // Filter 1: IQR pada sumbu lat/lon, efektif untuk dataset menengah-besar.
  if (valid.length >= 4) {
    const lats = valid.map(function (tree) {
      return tree.lat;
    });
    const lons = valid.map(function (tree) {
      return tree.lon;
    });

    const latBounds = iqrBounds_(lats);
    const lonBounds = iqrBounds_(lons);

    const iqrFiltered = valid.filter(function (tree) {
      return (
        tree.lat >= latBounds.min &&
        tree.lat <= latBounds.max &&
        tree.lon >= lonBounds.min &&
        tree.lon <= lonBounds.max
      );
    });

    if (iqrFiltered.length >= 2) {
      base = iqrFiltered;
    }
  }

  // Filter 2: nearest-neighbor distance, efektif juga untuk dataset kecil (3+ titik).
  const nearestValues = computeNearestNeighborDistances_(base);
  if (nearestValues.length === 0) {
    return base;
  }

  const sortedNearest = nearestValues
    .slice()
    .sort(function (a, b) {
      return a - b;
    });
  const medianNearest = sortedNearest[Math.floor((sortedNearest.length - 1) * 0.5)] || 0;
  const q3Nearest = sortedNearest[Math.floor((sortedNearest.length - 1) * 0.75)] || medianNearest;
  const upperByIqr = q3Nearest + 1.5 * Math.max(0, q3Nearest - (sortedNearest[Math.floor((sortedNearest.length - 1) * 0.25)] || q3Nearest));

  // Ambang adaptif: cukup longgar untuk data lapangan, tapi tetap buang titik nyasar ekstrem.
  const dynamicUpper = Math.max(50, medianNearest * 10, upperByIqr);
  const nnFiltered = base.filter(function (tree, idx) {
    return nearestValues[idx] <= dynamicUpper;
  });

  return nnFiltered.length >= 2 ? nnFiltered : base;
}

function computeNearestNeighborDistances_(trees) {
  if (!trees || trees.length < 2) {
    return [];
  }

  const out = new Array(trees.length).fill(Number.POSITIVE_INFINITY);
  for (var i = 0; i < trees.length - 1; i++) {
    for (var j = i + 1; j < trees.length; j++) {
      const d = haversineMeters_(trees[i].lat, trees[i].lon, trees[j].lat, trees[j].lon);
      if (!Number.isFinite(d)) {
        continue;
      }
      out[i] = Math.min(out[i], d);
      out[j] = Math.min(out[j], d);
    }
  }

  return out.map(function (d) {
    return Number.isFinite(d) ? d : 0;
  });
}

function iqrBounds_(values) {
  const sorted = (values || [])
    .filter(function (v) {
      return Number.isFinite(v);
    })
    .sort(function (a, b) {
      return a - b;
    });

  if (sorted.length === 0) {
    return { min: -Infinity, max: Infinity };
  }

  const q1 = sorted[Math.floor((sorted.length - 1) * 0.25)];
  const q3 = sorted[Math.floor((sorted.length - 1) * 0.75)];
  const iqr = Math.max(0, q3 - q1);

  return {
    min: q1 - 1.5 * iqr,
    max: q3 + 1.5 * iqr,
  };
}

function writeEcologySummarySheet_(summary) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let target = ss.getSheetByName(ECO_SUMMARY_SHEET_NAME);
  if (!target) {
    target = ss.insertSheet(ECO_SUMMARY_SHEET_NAME);
  }

  target.clear();
  const rows = [
    ['Metric', 'Value'],
    ['GeneratedAt', new Date().toISOString()],
    ['TotalTrees', summary.totalTrees || 0],
    ['HealthyTrees', summary.healthyTrees || 0],
    ['UnhealthyTrees', summary.unhealthyTrees || 0],
    ['TotalBiomassKg', summary.totalBiomass || 0],
    ['TotalCarbonKgC', summary.totalCarbon || 0],
    ['CanopyCoverPct', summary.canopyCoverPct || 0],
    ['HcvHealthIndex', summary.hcvHealthIndex || 0],
    ['TotalVolumeM3', summary.totalVolumeM3 || 0],
    ['AvgHeightCm', summary.avgHeightCm || 0],
    ['MedianHeightCm', summary.medianHeightCm || 0],
    ['TallestHeightCm', summary.tallestHeightCm || 0],
  ];

  target.getRange(1, 1, rows.length, 2).setValues(rows);
  target.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#f3f3f3');
  target.autoResizeColumns(1, 2);
}

function getDuplicateColumnIndexes_(headers) {
  const seen = {};
  const duplicates = [];

  for (var i = 0; i < headers.length; i++) {
    const key = String(headers[i] || '').trim();
    if (!key) {
      continue;
    }
    if (seen[key]) {
      duplicates.push(i + 1);
    } else {
      seen[key] = true;
    }
  }

  return duplicates;
}

function computeRevisedCoordinate_(sheet, headerIndex, userFixed) {
  if (!userFixed || !Number.isFinite(userFixed.lat) || !Number.isFinite(userFixed.lon)) {
    return null;
  }

  const prev = getLastRevisedCoordinate_(sheet, headerIndex);
  if (!prev) {
    return userFixed;
  }

  const stepMeters = IDEAL_SPACING_M;
  const distToUser = haversineMeters_(prev.lat, prev.lon, userFixed.lat, userFixed.lon);
  if (!Number.isFinite(distToUser) || distToUser <= 0.05) {
    // Jika titik user hampir sama dengan titik sebelumnya, geser default ke timur sejauh 4m.
    return destinationPointMeters_(prev.lat, prev.lon, 90, stepMeters);
  }

  // Gerak 4m dari titik revisi sebelumnya menuju arah titik asli user.
  const bearing = bearingDegrees_(prev.lat, prev.lon, userFixed.lat, userFixed.lon);
  const candidate = destinationPointMeters_(prev.lat, prev.lon, bearing, stepMeters);
  if (!candidate) {
    return userFixed;
  }

  // Jika candidate terlalu jauh dari titik asli user, tarik ke arah user agar tetap relevan.
  const candidateToUser = haversineMeters_(candidate.lat, candidate.lon, userFixed.lat, userFixed.lon);
  if (Number.isFinite(candidateToUser) && candidateToUser > 8) {
    const pullBearing = bearingDegrees_(candidate.lat, candidate.lon, userFixed.lat, userFixed.lon);
    const pullMeters = Math.min(candidateToUser, 4);
    const pulled = destinationPointMeters_(candidate.lat, candidate.lon, pullBearing, pullMeters);
    return pulled || candidate;
  }

  return candidate;
}

function getLastRevisedCoordinate_(sheet, headerIndex) {
  const idxRevisi = headerIndex['Koordinat_Revisi'];
  const idxKoordinat = headerIndex['Koordinat'];
  const idxX = headerIndex['X'];
  const idxY = headerIndex['Y'];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return null;
  }

  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    const text = idxRevisi >= 0
      ? String(row[idxRevisi] || '').trim()
      : idxKoordinat >= 0
        ? String(row[idxKoordinat] || '').trim()
        : '';
    const x = idxX >= 0 ? row[idxX] : '';
    const y = idxY >= 0 ? row[idxY] : '';
    const fixed = getFixedLatLon_(x, y, text);
    if (fixed) {
      return fixed;
    }
  }

  return null;
}

function bearingDegrees_(lat1, lon1, lat2, lon2) {
  const toRad = function (deg) {
    return (deg * Math.PI) / 180;
  };
  const toDeg = function (rad) {
    return (rad * 180) / Math.PI;
  };

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaLon = toRad(lon2 - lon1);

  const y = Math.sin(deltaLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLon);
  const theta = Math.atan2(y, x);
  return (toDeg(theta) + 360) % 360;
}

function destinationPointMeters_(lat, lon, bearingDeg, distanceM) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(bearingDeg) || !Number.isFinite(distanceM) || distanceM <= 0) {
    return null;
  }

  const earthRadius = 6371000;
  const toRad = function (deg) {
    return (deg * Math.PI) / 180;
  };
  const toDeg = function (rad) {
    return (rad * 180) / Math.PI;
  };

  const brng = toRad(bearingDeg);
  const angDist = distanceM / earthRadius;
  const lat1 = toRad(lat);
  const lon1 = toRad(lon);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angDist) + Math.cos(lat1) * Math.sin(angDist) * Math.cos(brng),
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(brng) * Math.sin(angDist) * Math.cos(lat1),
    Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2),
  );

  const out = {
    lat: toDeg(lat2),
    lon: ((toDeg(lon2) + 540) % 360) - 180,
  };

  return isValidLatLon_(out.lat, out.lon) ? out : null;
}

function toCoordinateText_(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return '';
  }
  return round_(lat, 6) + ',' + round_(lon, 6);
}

function analyzeGpsAccuracyFromRows_(trees) {
  const sorted = trees
    .map(function (tree) {
      return tree.accuracy;
    })
    .filter(function (value) {
      return Number.isFinite(value) && value >= 0;
    })
    .sort(function (a, b) {
      return a - b;
    });

  if (sorted.length === 0) {
    return {
      medianAccuracy: 0,
      p90Accuracy: 0,
      sampleCount: 0,
      quality: 'Rendah',
    };
  }

  const q1 = sorted[Math.floor((sorted.length - 1) * 0.25)];
  const q3 = sorted[Math.floor((sorted.length - 1) * 0.75)];
  const iqr = Math.max(0, q3 - q1);
  const upperBound = q3 + 1.5 * iqr;
  const filtered = sorted.filter(function (value) {
    return value <= upperBound;
  });
  const source = filtered.length > 0 ? filtered : sorted;

  const mid = Math.floor(source.length / 2);
  const median = source.length % 2 === 0 ? (source[mid - 1] + source[mid]) / 2 : source[mid];
  const p90Idx = Math.min(source.length - 1, Math.floor((source.length - 1) * 0.9));
  const p90 = source[p90Idx];

  return {
    medianAccuracy: round_(median, 2),
    p90Accuracy: round_(p90, 2),
    sampleCount: source.length,
    quality: median < 5 ? 'Tinggi' : median <= 10 ? 'Sedang' : 'Rendah',
  };
}

function estimateBiomassFromHeightCm_(heightCm) {
  const safeHeightCm = Number.isFinite(heightCm) && heightCm > 0 ? heightCm : 0;
  if (safeHeightCm === 0) {
    return 0;
  }

  const h = safeHeightCm / 100;
  const rho = 0.6;
  let d = 0;
  if (h <= 1.3) {
    d = Math.max(0.5, h * 0.85);
  } else {
    d = Math.max(1, 0.85 * Math.pow(h, 1.2));
  }

  const agb = 0.0673 * Math.pow(rho * d * d * h, 0.976);
  return round_(Math.max(0, agb), 3);
}

function estimateCarbonFromBiomass_(biomass) {
  const safeBiomass = Number.isFinite(biomass) && biomass > 0 ? biomass : 0;
  const cf = 0.47;
  return round_(safeBiomass * cf, 3);
}

function haversineMeters_(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const toRad = function (deg) {
    return (deg * Math.PI) / 180;
  };

  const rLat1 = toRad(lat1);
  const rLon1 = toRad(lon1);
  const rLat2 = toRad(lat2);
  const rLon2 = toRad(lon2);
  const dLat = rLat2 - rLat1;
  const dLon = rLon2 - rLon1;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

function getFixedLatLon_(xRaw, yRaw, coordinateText) {
  let x = toNumber_(xRaw);
  let y = toNumber_(yRaw);

  // Jika X/Y tidak valid atau tersimpan sebagai 0,0, coba fallback dari string koordinat.
  if (!Number.isFinite(x) || !Number.isFinite(y) || isNearZeroPair_(x, y)) {
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

  // Anggap 0,0 sebagai nilai placeholder invalid untuk dataset ini.
  if (isNearZeroPair_(lat, lon)) {
    return null;
  }

  // Tolak koordinat di luar rentang bumi agar tidak merusak analisis spasial.
  if (!isValidLatLon_(lat, lon)) {
    return null;
  }

  return { lat: lat, lon: lon };
}

function parseCoordinatePair_(raw) {
  const text = String(raw || '').trim();
  if (!text) {
    return null;
  }

  // Prioritas separator eksplisit agar tidak bentrok dengan koma desimal.
  const explicitSep = text.match(/[;|]/);
  if (explicitSep) {
    const parts = text
      .split(explicitSep[0])
      .map((p) => p.trim())
      .filter((p) => p !== '');
    if (parts.length >= 2) {
      const a = toNumber_(parts[0]);
      const b = toNumber_(parts[1]);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        return normalizeLatLonPair_(a, b);
      }
    }
  }

  // Format umum: "-2.98,115.19" (koma sebagai pemisah, titik sebagai desimal).
  if (text.indexOf('.') >= 0 && text.indexOf(',') >= 0) {
    const partsDot = text
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p !== '');
    if (partsDot.length >= 2) {
      const a = toNumber_(partsDot[0]);
      const b = toNumber_(partsDot[1]);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        return normalizeLatLonPair_(a, b);
      }
    }
  }

  // Fallback regex: aman untuk kombinasi titik/koma desimal.
  const nums = text.match(/-?\d+(?:[.,]\d+)?/g);
  if (nums && nums.length >= 2) {
    const first = toNumber_(nums[0]);
    const second = toNumber_(nums[1]);
    if (Number.isFinite(first) && Number.isFinite(second)) {
      return normalizeLatLonPair_(first, second);
    }
  }

  return null;
}

function normalizeLatLonPair_(a, b) {
  let lat = a;
  let lon = b;

  // Heuristik umum data lapangan Indonesia: lat sekitar -11..6, lon sekitar 95..141.
  // Jika terbaca terbalik, tukar posisi.
  if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) {
    lat = b;
    lon = a;
  }

  if (!isValidLatLon_(lat, lon)) {
    return null;
  }

  return { lat: lat, lon: lon };
}

function isValidLatLon_(lat, lon) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

function isNearZeroPair_(lat, lon) {
  const eps = 1e-9;
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= eps && Math.abs(lon) <= eps;
}

function normalizeTanggal_(value) {
  const tz = Session.getScriptTimeZone();
  const format = 'dd/MM/yyyy HH:mm:ss';

  if (value instanceof Date) {
    return Utilities.formatDate(value, tz, format);
  }

  const raw = String(value || '').trim();
  if (!raw) {
    return Utilities.formatDate(new Date(), tz, format);
  }

  // Dukung format umum input lama: 9/2/2026, 15.37.06 atau 9/2/2026 15:37:06
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2})[.:](\d{1,2})[.:](\d{1,2}))?$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const hour = Number(m[4] || 0);
    const minute = Number(m[5] || 0);
    const second = Number(m[6] || 0);

    const dt = new Date(year, month - 1, day, hour, minute, second);
    if (Number.isFinite(dt.getTime())) {
      return Utilities.formatDate(dt, tz, format);
    }
  }

  const parsed = new Date(raw);
  if (Number.isFinite(parsed.getTime())) {
    return Utilities.formatDate(parsed, tz, format);
  }

  return raw;
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

/**
 * Menghitung bobot HCV berdasarkan status kesehatan.
 * Sehat = 1, Merana = 0.5, Mati = 0.
 */
function mapHealthToHcvWeight_(health) {
  const h = normalizeHealth_(health);
  if (h === 'Sehat') return 1;
  if (h === 'Merana') return 0.5;
  return 0;
}

/**
 * Menghitung HCV_Input server-side.
 * HCV = bobot_kesehatan × confidence.
 * Jika confidence tidak tersedia, gunakan default 50%.
 */
function computeHcvInput_(kesehatan, aiKesehatan, aiConfidence) {
  const health = aiKesehatan || kesehatan || 'Sehat';
  var conf = Number(aiConfidence);
  if (!isFinite(conf) || conf <= 0) {
    conf = 50; // default confidence untuk input manual
  }
  conf = Math.max(0, Math.min(100, conf));
  var hcv = mapHealthToHcvWeight_(health) * conf;
  return Math.round(hcv * 100) / 100;
}

/**
 * Menghasilkan AI_Deskripsi server-side berdasarkan data kesehatan.
 * Dipakai sebagai fallback ketika klien tidak mengirim deskripsi.
 */
function generateHealthDescription_(kesehatan, aiKesehatan, aiConfidence, hcvInput) {
  var health = normalizeHealth_(aiKesehatan || kesehatan || 'Sehat');
  var conf = Number(aiConfidence);
  if (!isFinite(conf) || conf <= 0) conf = 50;
  conf = Math.max(0, Math.min(100, conf));

  var hcv = Number(hcvInput);
  if (!isFinite(hcv) || hcv < 0) {
    hcv = mapHealthToHcvWeight_(health) * conf;
    hcv = Math.round(hcv * 100) / 100;
  }

  // Interpretasi kesehatan
  var healthLabel, healthDesc;
  if (health === 'Sehat') {
    healthLabel = 'SEHAT';
    healthDesc = 'kanopi menunjukkan reflektansi hijau kuat, konsisten dengan vegetasi vigor tinggi';
  } else if (health === 'Merana') {
    healthLabel = 'MERANA (STRESS)';
    healthDesc = 'penurunan reflektansi hijau terdeteksi, potensi defisiensi nutrisi atau tekanan air';
  } else {
    healthLabel = 'MATI/KRITIS';
    healthDesc = 'reflektansi hijau minimal, jaringan didominasi pigmen non-fotosintetik';
  }

  // Interpretasi confidence
  var confDesc;
  if (conf >= 80) {
    confDesc = 'Tingkat keyakinan ' + conf + '% (tinggi) \u2014 distribusi piksel vegetasi konsisten dan terkonsentrasi pada satu kelas spektral';
  } else if (conf >= 50) {
    confDesc = 'Tingkat keyakinan ' + conf + '% (sedang) \u2014 sebagian piksel menunjukkan variasi spektral antar kelas kesehatan';
  } else {
    confDesc = 'Tingkat keyakinan ' + conf + '% (rendah) \u2014 distribusi spektral tersebar, kemungkinan noise atau campuran objek non-vegetasi';
  }

  return [
    'Analisis Kesehatan Vegetasi:',
    'Klasifikasi: ' + healthLabel + ' \u2014 ' + healthDesc + '.',
    confDesc + '.',
    'HCV Score: ' + hcv + '% \u2014 indeks komposit konservasi kesehatan vegetasi.',
  ].join(' ');
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

function toBoolean_(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  const raw = String(value || '').trim().toLowerCase();
  if (!raw) {
    return false;
  }

  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'y' || raw === 'on';
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
