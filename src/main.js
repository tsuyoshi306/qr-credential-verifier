import { QRScanner } from './scanner.js'
import { isCredentialUrl, analyzeCredential, extractCoseBytes } from './cose.js'
import { addScan, getScans, updateScan, deleteScan, clearScans } from './storage.js'
import { PROXY_URL, isProxyConfigured } from './proxy-config.js'
import { readQrFromFile } from './file-import.js'

const $ = id => document.getElementById(id)

// 動的import（pdf.js等）が旧キャッシュのチャンク欠落で失敗した場合、一度だけ自動リロードして
// 最新のService Worker/チャンクを取得する（デプロイ直後の取り残し対策）。
window.addEventListener('vite:preloadError', () => {
  if (!sessionStorage.getItem('preloadReloadTried')) {
    sessionStorage.setItem('preloadReloadTried', '1')
    window.location.reload()
  }
})
window.addEventListener('load', () => sessionStorage.removeItem('preloadReloadTried'))

// Nav
document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'))
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
    btn.classList.add('active')
    $('page-' + btn.dataset.page).classList.add('active')
    if (btn.dataset.page === 'history') renderHistory()
  })
})

// Scanner
const scanner = new QRScanner({
  onDetected: handleDetected,
  onError: msg => {
    showError(msg)
    resetScanUI()
  }
})

$('start-btn').addEventListener('click', () => {
  hideError()
  hideResult()
  $('start-btn').style.display = 'none'
  $('stop-btn').style.display = ''
  $('scan-status').textContent = 'QRコードをフレーム内に合わせてください…'
  scanner.start($('video'), $('canvas'))
})

$('stop-btn').addEventListener('click', () => {
  scanner.stop()
  resetScanUI()
})

$('rescan-btn').addEventListener('click', () => {
  hideResult()
  $('start-btn').click()
})

// ファイル（PDF/画像）から読み取り
$('file-btn').addEventListener('click', () => $('file-input').click())
$('file-input').addEventListener('change', async e => {
  const files = Array.from(e.target.files || [])
  e.target.value = '' // 同じファイルを再選択できるように
  if (!files.length) return
  scanner.stop()
  resetScanUI()
  hideError()
  if (files.length === 1) {
    hideBulk()
    hideResult()
    $('file-loading').style.display = ''
    $('file-btn').disabled = true
    try {
      const data = await readQrFromFile(files[0])
      await handleDetected(data)
    } catch (err) {
      showError(err.message || 'ファイルの読み取りに失敗しました')
    } finally {
      $('file-loading').style.display = 'none'
      $('file-btn').disabled = false
    }
  } else {
    await runBulkImport(files)
  }
})

// ---- 一括取り込み ----
let bulkItems = [] // { id, fileName, url, summary, scanId, error }

async function runBulkImport(files) {
  hideResult()
  bulkItems = []
  $('bulk-list').innerHTML = ''
  $('bulk-card').style.display = ''
  $('bulk-verify-all').style.display = 'none'
  $('file-btn').disabled = true
  $('bulk-title').textContent = `一括読み取り結果（${files.length}件）`

  let okCount = 0
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    $('bulk-progress').textContent = `解析中… ${i + 1}/${files.length}：${file.name}`
    const item = { id: 'b' + i, fileName: file.name, url: null, summary: null, fields: [], analysis: null, scanId: null, error: null }
    try {
      const data = await readQrFromFile(file)
      item.url = data
      const analysis = await analyzeCredential(data)
      item.summary = summarize(analysis)
      item.fields = analysis.fields || []   // QRのCOSE登録情報（単一検証と同一）
      item.analysis = analysis              // 技術情報（署名バッジ等）生成用
      const rec = await addScan(data, item.summary)
      item.scanId = rec.id
      if (analysis.isCredential && !analysis.error) okCount++
      else if (!analysis.isCredential) item.error = '資格者証QRではありません'
      else item.error = analysis.error
    } catch (err) {
      item.error = err.message || '読み取り失敗'
    }
    bulkItems.push(item)
    renderBulkItem(item)
  }

  $('bulk-progress').textContent = `完了：${files.length}件中 ${okCount}件が資格者証QR`
  $('file-btn').disabled = false
  if (isProxyConfigured() && bulkItems.some(it => it.url && isCredentialUrl(it.url))) {
    $('bulk-verify-all').style.display = ''
  }
}

// QRのCOSE登録情報テーブルHTML（単一検証の cred-info と同一項目）
function buildRegistrationTableHtml(fields) {
  if (!fields || !fields.length) return ''
  let html = '<h4 class="detail-h">登録情報（QRに含まれる内容）</h4><table class="result-table">'
  for (const f of fields) html += `<tr><th>${escHtml(f.label)}</th><td>${escHtml(f.value)}</td></tr>`
  html += '</table>'
  return html
}

function renderBulkItem(item) {
  const li = document.createElement('li')
  li.className = 'bulk-item'
  li.id = 'item-' + item.id
  const isCred = item.url && isCredentialUrl(item.url) && !item.error
  const title = item.summary && (item.summary.qualification || item.summary.name)
    ? `${escHtml(item.summary.qualification || '')}${item.summary.name ? '／' + escHtml(item.summary.name) : ''}`
    : (item.error ? '—' : '（資格情報なし）')
  let actions = ''
  if (isCred) {
    actions = `<span class="sig-badge ${sigCls(item.summary?.sigStatus)}" style="padding:2px 8px;font-size:0.72rem">${sigShort(item.summary?.sigStatus)}</span>`
    actions += `<button class="btn btn-secondary bulk-detail" data-id="${item.id}">詳細</button>`
  }
  // 詳細パネル：まずQR登録情報、技術情報、その下に公式検証ボタンと結果スロット（単一検証と同じ流れ）
  let panelInner = buildRegistrationTableHtml(item.fields)
  if (isCred && item.analysis) panelInner += buildTechInfoHtml(item.url, item.analysis)
  if (isCred && isProxyConfigured()) {
    panelInner +=
      `<button class="btn btn-primary bulk-verify" data-id="${item.id}" style="margin-top:10px">🏛 公式検証を実行</button>` +
      `<p class="consent-note">資格データを中継サーバ経由でデジタル庁に送信し有効性を確認します。</p>` +
      `<div class="bulk-official-slot" id="official-${item.id}"></div>`
  }
  li.innerHTML = `
    <div class="bulk-item-name">📄 ${escHtml(item.fileName)}</div>
    <div class="bulk-item-title">${title}</div>
    ${item.error ? `<div class="bulk-error">⚠️ ${escHtml(item.error)}</div>` : ''}
    <div class="bulk-item-row">${actions}</div>
    <div class="bulk-detail-panel" id="detail-${item.id}" style="display:none">${panelInner}</div>
  `
  $('bulk-list').appendChild(li)
  const dbtn = li.querySelector('.bulk-detail')
  const panel = li.querySelector('#detail-' + item.id)
  if (dbtn && panel) {
    dbtn.addEventListener('click', () => {
      const open = panel.style.display === ''
      panel.style.display = open ? 'none' : ''
      dbtn.textContent = open ? '詳細' : '閉じる'
    })
  }
  const vbtn = li.querySelector('.bulk-verify')
  if (vbtn) vbtn.addEventListener('click', () => verifyBulkItem(item.id))
}

// 詳細パネルを開く（全件検証時に結果が見えるように）
function openBulkDetail(id) {
  const panel = $('detail-' + id)
  const dbtn = document.querySelector(`#item-${id} .bulk-detail`)
  if (panel) panel.style.display = ''
  if (dbtn) dbtn.textContent = '閉じる'
}

async function verifyBulkItem(id) {
  const item = bulkItems.find(it => it.id === id)
  if (!item || !item.url) return
  const slot = $('official-' + id)
  if (!slot) return
  const btn = document.querySelector(`#item-${id} .bulk-verify`)
  if (btn) btn.disabled = true
  slot.innerHTML = '<span class="consent-note">⏳ デジタル庁に照会中…</span>'
  try {
    const data = await requestOfficialVerification(getCheckdata(item.url))
    // 公式検証の結果は単一検証と同一（buildOfficialResultHtml）
    slot.innerHTML = buildOfficialResultHtml(data)
    if (item.scanId) await updateScan(item.scanId, buildOfficialUpdateFields(data))
  } catch (e) {
    slot.innerHTML = '<span class="bulk-error">⚠️ ' + escHtml(e.message) + '</span>'
  } finally {
    if (btn) btn.disabled = false
  }
}

$('bulk-verify-all').addEventListener('click', async () => {
  const targets = bulkItems.filter(it => it.url && isCredentialUrl(it.url) && !it.error)
  $('bulk-verify-all').disabled = true
  for (let i = 0; i < targets.length; i++) {
    $('bulk-progress').textContent = `公式検証中… ${i + 1}/${targets.length}`
    openBulkDetail(targets[i].id)
    await verifyBulkItem(targets[i].id)
  }
  $('bulk-progress').textContent = `公式検証 完了（${targets.length}件）`
  $('bulk-verify-all').disabled = false
})

$('bulk-clear').addEventListener('click', hideBulk)

function hideBulk() {
  $('bulk-card').style.display = 'none'
  $('bulk-list').innerHTML = ''
  $('bulk-progress').textContent = ''
  bulkItems = []
}

function sigCls(s) {
  return { ok: 'sig-ok', ng: 'sig-ng', skipped: 'sig-skip', error: 'sig-error' }[s] || 'sig-skip'
}
function sigShort(s) {
  return { ok: '🔏 署名OK', ng: '⛔ 署名NG', skipped: '🔒 署名スキップ', error: '⚠️ エラー' }[s] || '🔒 署名スキップ'
}

let currentUrl = null
let lastSummary = {}
let currentScanId = null

async function handleDetected(data, opts = {}) {
  resetScanUI()
  hideBulk()
  currentUrl = data
  await showResult(data, opts)
}

$('verify-btn').addEventListener('click', () => {
  if (currentUrl) window.open(currentUrl, '_blank', 'noopener')
})

// 公式検証の共通関数。checkdata を中継サーバに送り、結果データを返す。失敗時 throw。
function getCheckdata(url) {
  try { return new URL(url).searchParams.get('c') } catch { return null }
}
async function requestOfficialVerification(checkdata) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ checkdata })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) {
    throw new Error(data.error || `照会に失敗しました (HTTP ${res.status})`)
  }
  return data
}

$('official-btn').addEventListener('click', async () => {
  if (!currentUrl || !isProxyConfigured()) return
  const checkdata = getCheckdata(currentUrl)
  if (!checkdata) { showOfficialError('QRから検証データを取得できませんでした'); return }

  $('official-btn').disabled = true
  $('official-loading').style.display = ''
  $('official-result').style.display = 'none'
  try {
    const data = await requestOfficialVerification(checkdata)
    renderOfficialResult(data)
    if (currentScanId) await updateScan(currentScanId, buildOfficialUpdateFields(data))
  } catch (e) {
    showOfficialError(e.message || '中継サーバへの接続に失敗しました')
  } finally {
    $('official-loading').style.display = 'none'
    $('official-btn').disabled = false
  }
})

function showOfficialError(msg) {
  $('official-result').innerHTML = `<div class="sig-badge sig-error">⚠️ ${escHtml(msg)}</div>`
  $('official-result').style.display = ''
}

// 公式検証結果の表示HTMLを生成（単一・一括で共通利用）
// 登録情報はQR読み取り結果と重複するため表示しない。判定＋証明書情報のみ。
function buildOfficialResultHtml(data) {
  const cls = data.valid ? 'verdict-valid' : 'verdict-invalid'
  const icon = data.valid ? '✅' : '⛔'
  let html = `<div class="verdict ${cls}">${icon} ${escHtml(data.resultText || (data.valid ? '有効' : '無効'))}` +
    `<small>確認日時: ${escHtml(data.checkedAt || '')}／デジタル庁 検証サイトの判定結果</small></div>`
  if (data.certificates && data.certificates.length) {
    html += '<details><summary>証明書情報</summary>'
    for (const c of data.certificates) {
      if (c.caption) html += `<div class="cert-caption">${escHtml(c.caption)}</div>`
      html += '<table class="result-table">'
      for (const r of c.rows) html += `<tr><th>${escHtml(r.key)}</th><td>${escHtml(r.value)}</td></tr>`
      html += '</table>'
    }
    html += '</details>'
  }
  return html
}

function renderOfficialResult(data) {
  $('official-result').innerHTML = buildOfficialResultHtml(data)
  $('official-result').style.display = ''
}

// 公式検証結果から履歴に保存するフィールド（証明書情報の主要項目を抽出）
function buildOfficialUpdateFields(data) {
  const rows = (data.certificates && data.certificates[0] && data.certificates[0].rows) || []
  const get = k => (rows.find(r => r.key === k) || {}).value || ''
  return {
    officialValid: data.valid,
    officialResult: data.resultText || '',
    officialCheckedAt: data.checkedAt || '',
    certOwner: get('所有者別名'),
    certIssuer: get('発行者別名'),
    certSerial: get('シリアル番号'),
    certValidity: get('有効期間')
  }
}

const SIG_PRESENTATION = {
  ok:    { cls: 'sig-ok',    icon: '🔏', head: '署名OK（改竄なし）' },
  ng:    { cls: 'sig-ng',    icon: '⛔', head: '署名検証に失敗（改竄の疑い）' },
  skipped: { cls: 'sig-skip', icon: '🔒', head: '署名検証スキップ（公開鍵未設定）' },
  error: { cls: 'sig-error', icon: '⚠️', head: '署名検証エラー' }
}

// 署名検証バッジHTML（単一・一括・履歴で共通）
function buildSigBadgeHtml(analysis) {
  const sig = (analysis && analysis.signature) || { status: 'skipped', reason: '' }
  const p = SIG_PRESENTATION[sig.status] || SIG_PRESENTATION.error
  return `<span class="sig-badge ${p.cls}">${p.icon} ${p.head}` +
    `<small>${escHtml(sig.reason || '')}${analysis && analysis.alg ? '（alg: ' + escHtml(analysis.alg) + '）' : ''}</small>` +
    `<small>※失効・取消の状態は確認できません</small></span>`
}

// 「🔧 技術情報を表示」折りたたみHTML（署名バッジ＋生URL＋注意書き）
function buildTechInfoHtml(url, analysis) {
  return `<details class="tech-details"><summary>🔧 技術情報を表示</summary>` +
    `<div class="caveat">⚠️ 下記の登録情報はQRに含まれる内容です。<strong>失効・取消の状態は含みません。</strong>` +
    `正式な有効性は「公式検証」またはデジタル庁の検証サイトで確認してください。</div>` +
    `<div style="margin-top:10px">${buildSigBadgeHtml(analysis)}</div>` +
    `<div class="tech-label">QRの生データ（URL）</div>` +
    `<div class="raw-url">${escHtml(url)}</div></details>`
}

async function showResult(url, { save = true, existingId = null } = {}) {
  $('result-url').textContent = url
  $('result-card').classList.add('show')
  $('scan-status').textContent = 'QRコードを読み取りました'

  // 表示リセット
  $('cred-info').style.display = 'none'
  $('parse-error').style.display = 'none'
  $('sig-badge').innerHTML = ''
  $('official-result').style.display = 'none'
  $('official-result').innerHTML = ''
  $('official-loading').style.display = 'none'

  const isCredential = isCredentialUrl(url)
  // 公式検証セクションの表示制御
  $('official-verify').style.display = isCredential ? '' : 'none'
  if (isCredential) {
    $('official-btn').disabled = !isProxyConfigured()
    $('official-btn').textContent = isProxyConfigured()
      ? '🏛 公式検証を実行（デジタル庁）'
      : '🏛 公式検証（中継サーバ未設定）'
  }
  $('result-badge').innerHTML = isCredential
    ? '<span class="badge badge-verified">デジタル資格者証QRを検出</span>'
    : '<span class="badge badge-warning">⚠ 資格者証のQRコードではない可能性があります</span>'
  $('verify-btn').style.display = isCredential ? '' : 'none'

  let analysis = { isCredential }
  if (isCredential) {
    analysis = await analyzeCredential(url)
    renderAnalysis(analysis)
  }

  lastSummary = summarize(analysis)
  if (save) {
    // 新規読み取り → 履歴に保存
    const rec = await addScan(url, lastSummary)
    currentScanId = rec.id
  } else {
    // 履歴からの再表示 → 既存レコードを対象にする（新規追加しない）
    currentScanId = existingId
  }
}

function renderAnalysis(a) {
  if (a.error) {
    $('parse-error').className = ''
    $('parse-error').innerHTML =
      `<div class="sig-badge sig-error">⚠️ ${escHtml(a.error)}` +
      (a.rawHex ? `<small>先頭バイト: ${escHtml(a.rawHex)}…</small>` : '') + '</div>'
    $('parse-error').style.display = ''
    return
  }
  // 署名バッジ（共通関数）
  $('sig-badge').innerHTML = buildSigBadgeHtml(a)

  // 登録情報テーブル
  const table = $('cred-table')
  table.innerHTML = ''
  if (a.fields && a.fields.length) {
    for (const f of a.fields) {
      const tr = document.createElement('tr')
      tr.innerHTML = `<td>${escHtml(f.label)}</td><td>${escHtml(f.value)}</td>`
      table.appendChild(tr)
    }
    $('cred-info').style.display = ''
  }
}

// 履歴保存用に解析結果を要約
function summarize(a) {
  if (!a.isCredential) return { isCredential: false }
  if (a.error) return { isCredential: true, sigStatus: 'error', error: a.error }
  const nameField = (a.fields || []).find(f => f.label === '氏名')
  const qualField = (a.fields || []).find(f => f.label === '資格名称')
  return {
    isCredential: true,
    sigStatus: a.signature ? a.signature.status : 'skipped',
    name: nameField ? nameField.value : '',
    qualification: qualField ? qualField.value : ''
  }
}

function hideResult() {
  $('result-card').classList.remove('show')
  currentUrl = null
  currentScanId = null
}

function resetScanUI() {
  $('start-btn').style.display = ''
  $('stop-btn').style.display = 'none'
  $('scan-status').textContent = '「スキャン開始」をタップしてカメラを起動してください'
}

function showError(msg) {
  $('error-msg').textContent = msg
  $('error-msg').classList.add('show')
}

function hideError() {
  $('error-msg').classList.remove('show')
}

// History
async function renderHistory() {
  const scans = await getScans()
  const list = $('history-list')
  const empty = $('history-empty')
  const clearBtn = $('clear-all-btn')

  list.innerHTML = ''
  if (scans.length === 0) {
    empty.style.display = ''
    clearBtn.style.display = 'none'
    $('csv-btn').style.display = 'none'
    return
  }
  empty.style.display = 'none'
  clearBtn.style.display = ''
  $('csv-btn').style.display = ''

  for (const scan of scans) {
    const li = document.createElement('li')
    li.className = 'history-item'
    const date = new Date(scan.scannedAt).toLocaleString('ja-JP')
    const title = scan.qualification || scan.name
      ? `${escHtml(scan.qualification)}${scan.name ? '／' + escHtml(scan.name) : ''}`
      : escHtml(scan.qrData)
    const canView = isCredentialUrl(scan.qrData)
    li.innerHTML = `
      <div class="history-body${canView ? ' clickable' : ''}" data-url="${escAttr(scan.qrData)}" data-id="${scan.id}">
        <div class="history-item-header">
          <span class="history-date">${date}</span>
          ${officialBadgeHtml(scan) || sigBadgeHtml(scan.sigStatus)}
        </div>
        <div class="history-url">${title}</div>
        ${canView ? '<div class="history-hint">タップで再表示・再検証 ›</div>' : ''}
      </div>
      <div class="history-actions">
        <button class="btn-del" data-id="${scan.id}">🗑 削除</button>
      </div>
    `
    list.appendChild(li)
  }

  // 行本文クリック → スキャン結果カードに再表示（新規履歴は作らず既存IDを対象に）
  list.querySelectorAll('.history-body.clickable').forEach(body => {
    body.addEventListener('click', () => {
      switchToScanTab()
      handleDetected(body.dataset.url, { save: false, existingId: body.dataset.id })
    })
  })
  list.querySelectorAll('.btn-del').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation()
      await deleteScan(btn.dataset.id)
      renderHistory()
    })
  })
}

function switchToScanTab() {
  const scanBtn = document.querySelector('nav button[data-page="scan"]')
  if (scanBtn) scanBtn.click()
}

$('clear-all-btn').addEventListener('click', async () => {
  if (!confirm('全ての履歴を削除しますか？')) return
  await clearScans()
  renderHistory()
})

// ---- CSV出力 ----
const CSV_HEADER = [
  'スキャン日時', '資格名', '氏名', '生年月日', '登録番号', '登録年月日', '発行年月日',
  '交付機関', '交付者名', '署名検証', '公式検証済み', '公式判定', '確認日時',
  '証明書_所有者別名', '証明書_発行者別名', '証明書_シリアル番号', '証明書_有効期間', 'QR_URL'
]
const SIG_LABEL = { ok: 'OK', ng: 'NG', skipped: 'スキップ', error: 'エラー' }

function csvCell(v) {
  const s = v == null ? '' : String(v)
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
function buildCsv(rows) {
  return [CSV_HEADER, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n')
}

async function buildCsvRows(scans) {
  const rows = []
  for (const scan of scans) {
    // QR登録情報は qrData を再解析して取得（ネット不要）
    const f = {}
    if (isCredentialUrl(scan.qrData)) {
      const a = await analyzeCredential(scan.qrData)
      for (const fld of (a.fields || [])) f[fld.label] = fld.value
    }
    rows.push([
      new Date(scan.scannedAt).toLocaleString('ja-JP'),
      f['資格名称'] || scan.qualification || '',
      f['氏名'] || scan.name || '',
      f['生年月日'] || '',
      f['登録番号'] || '',
      f['登録年月日'] || '',
      f['発行年月日'] || '',
      f['交付機関'] || '',
      f['交付者名'] || '',
      SIG_LABEL[scan.sigStatus] || '',
      scan.officialValid == null ? 'いいえ' : 'はい',
      scan.officialValid == null ? '—' : (scan.officialResult || (scan.officialValid ? '有効' : '無効')),
      scan.officialCheckedAt || '',
      scan.certOwner || '',
      scan.certIssuer || '',
      scan.certSerial || '',
      scan.certValidity || '',
      scan.qrData || ''
    ])
  }
  return rows
}

$('csv-btn').addEventListener('click', async () => {
  $('csv-btn').disabled = true
  try {
    const scans = await getScans()
    const csv = buildCsv(await buildCsvRows(scans))
    // Excel(日本語)向けに UTF-8 BOM 付与
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const d = new Date()
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const a = document.createElement('a')
    a.href = url
    a.download = `qr-credentials-${stamp}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } finally {
    $('csv-btn').disabled = false
  }
})

// PWA install prompt (T23)
let deferredPrompt = null
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  deferredPrompt = e
  $('install-btn').style.display = ''
})
$('install-btn').addEventListener('click', async () => {
  if (!deferredPrompt) return
  deferredPrompt.prompt()
  await deferredPrompt.userChoice
  deferredPrompt = null
  $('install-btn').style.display = 'none'
})
window.addEventListener('appinstalled', () => {
  $('install-btn').style.display = 'none'
})

// Offline warning (T24)
function updateOnlineStatus() {
  $('offline-banner').classList.toggle('show', !navigator.onLine)
}
window.addEventListener('online', updateOnlineStatus)
window.addEventListener('offline', updateOnlineStatus)
updateOnlineStatus()

function officialBadgeHtml(scan) {
  if (scan.officialValid === true) return '<span class="badge badge-verified">✅ 公式: 有効</span>'
  if (scan.officialValid === false) return '<span class="badge badge-warning">⛔ 公式: 無効</span>'
  return ''
}

function sigBadgeHtml(status) {
  const map = {
    ok: '<span class="badge badge-verified">🔏 署名OK</span>',
    ng: '<span class="badge badge-warning">⛔ 署名NG</span>',
    skipped: '<span class="badge" style="background:#f3f4f6;color:#6b7280">🔒 検証スキップ</span>',
    error: '<span class="badge badge-warning">⚠️ 解析エラー</span>'
  }
  return map[status] || ''
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escAttr(str) {
  return str.replace(/"/g, '&quot;')
}
