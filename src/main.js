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
    const item = { id: 'b' + i, fileName: file.name, url: null, summary: null, scanId: null, error: null }
    try {
      const data = await readQrFromFile(file)
      item.url = data
      const analysis = await analyzeCredential(data)
      item.summary = summarize(analysis)
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

function renderBulkItem(item) {
  const li = document.createElement('li')
  li.className = 'bulk-item'
  li.id = 'item-' + item.id
  const title = item.summary && (item.summary.qualification || item.summary.name)
    ? `${escHtml(item.summary.qualification || '')}${item.summary.name ? '／' + escHtml(item.summary.name) : ''}`
    : (item.error ? '—' : '（資格情報なし）')
  let actions = ''
  if (item.url && isCredentialUrl(item.url) && !item.error) {
    actions = `<span class="sig-badge ${sigCls(item.summary?.sigStatus)}" style="padding:2px 8px;font-size:0.72rem">${sigShort(item.summary?.sigStatus)}</span>`
    if (isProxyConfigured()) {
      actions += `<button class="btn btn-primary bulk-verify" data-id="${item.id}">🏛 公式検証</button>`
    }
  }
  li.innerHTML = `
    <div class="bulk-item-name">📄 ${escHtml(item.fileName)}</div>
    <div class="bulk-item-title">${title}</div>
    ${item.error ? `<div class="bulk-error">⚠️ ${escHtml(item.error)}</div>` : ''}
    <div class="bulk-item-row">${actions}</div>
    <div class="bulk-verdict-slot" id="verdict-${item.id}"></div>
  `
  $('bulk-list').appendChild(li)
  const vbtn = li.querySelector('.bulk-verify')
  if (vbtn) vbtn.addEventListener('click', () => verifyBulkItem(item.id))
}

async function verifyBulkItem(id) {
  const item = bulkItems.find(it => it.id === id)
  if (!item || !item.url) return
  const slot = $('verdict-' + id)
  const btn = document.querySelector(`#item-${id} .bulk-verify`)
  if (btn) btn.disabled = true
  slot.innerHTML = '<span class="consent-note">⏳ 照会中…</span>'
  try {
    const data = await requestOfficialVerification(getCheckdata(item.url))
    // コンパクト判定＋「詳細」トグル。詳細は単一検証と同一（buildOfficialResultHtml）
    const vcls = data.valid ? 'verdict-valid' : 'verdict-invalid'
    const vicon = data.valid ? '✅' : '⛔'
    slot.innerHTML =
      `<div class="bulk-item-row">` +
        `<span class="bulk-verdict ${vcls}">${vicon} ${escHtml(data.resultText || (data.valid ? '有効' : '無効'))}</span>` +
        `<span class="consent-note">確認日時: ${escHtml(data.checkedAt || '')}</span>` +
        `<button class="btn btn-secondary bulk-detail" data-id="${id}">詳細</button>` +
      `</div>` +
      `<div class="bulk-detail-panel" id="detail-${id}" style="display:none">${buildOfficialResultHtml(data)}</div>`
    const dbtn = slot.querySelector('.bulk-detail')
    const panel = slot.querySelector('#detail-' + id)
    dbtn.addEventListener('click', () => {
      const open = panel.style.display === ''
      panel.style.display = open ? 'none' : ''
      dbtn.textContent = open ? '詳細' : '閉じる'
    })
    if (item.scanId) await updateScan(item.scanId, { officialValid: data.valid, officialResult: data.resultText })
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

async function handleDetected(data) {
  resetScanUI()
  hideBulk()
  currentUrl = data
  await showResult(data)
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
    if (currentScanId) await updateScan(currentScanId, { officialValid: data.valid, officialResult: data.resultText })
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
function buildOfficialResultHtml(data) {
  const cls = data.valid ? 'verdict-valid' : 'verdict-invalid'
  const icon = data.valid ? '✅' : '⛔'
  let html = `<div class="verdict ${cls}">${icon} ${escHtml(data.resultText || (data.valid ? '有効' : '無効'))}` +
    `<small>確認日時: ${escHtml(data.checkedAt || '')}／デジタル庁 検証サイトの判定結果</small></div>`
  if (data.registration && data.registration.length) {
    html += '<table class="result-table">'
    for (const r of data.registration) html += `<tr><th>${escHtml(r.key)}</th><td>${escHtml(r.value)}</td></tr>`
    html += '</table>'
  }
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

const SIG_PRESENTATION = {
  ok:    { cls: 'sig-ok',    icon: '🔏', head: '署名OK（改竄なし）' },
  ng:    { cls: 'sig-ng',    icon: '⛔', head: '署名検証に失敗（改竄の疑い）' },
  skipped: { cls: 'sig-skip', icon: '🔒', head: '署名検証スキップ（公開鍵未設定）' },
  error: { cls: 'sig-error', icon: '⚠️', head: '署名検証エラー' }
}

async function showResult(url) {
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

  // 履歴に保存（解析結果込み）
  lastSummary = summarize(analysis)
  const rec = await addScan(url, lastSummary)
  currentScanId = rec.id
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
  // 署名バッジ
  const sig = a.signature || { status: 'skipped', reason: '' }
  const p = SIG_PRESENTATION[sig.status] || SIG_PRESENTATION.error
  $('sig-badge').innerHTML =
    `<span class="sig-badge ${p.cls}">${p.icon} ${p.head}` +
    `<small>${escHtml(sig.reason)}${a.alg ? '（alg: ' + escHtml(a.alg) + '）' : ''}</small>` +
    `<small>※失効・取消の状態は確認できません</small></span>`

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
    return
  }
  empty.style.display = 'none'
  clearBtn.style.display = ''

  for (const scan of scans) {
    const li = document.createElement('li')
    li.className = 'history-item'
    const date = new Date(scan.scannedAt).toLocaleString('ja-JP')
    const title = scan.qualification || scan.name
      ? `${escHtml(scan.qualification)}${scan.name ? '／' + escHtml(scan.name) : ''}`
      : escHtml(scan.qrData)
    li.innerHTML = `
      <div class="history-item-header">
        <span class="history-date">${date}</span>
        ${officialBadgeHtml(scan) || sigBadgeHtml(scan.sigStatus)}
      </div>
      <div class="history-url">${title}</div>
      <div class="history-actions">
        ${isCredentialUrl(scan.qrData)
          ? `<button class="btn-open" data-url="${escAttr(scan.qrData)}">🔍 検証サイト</button>`
          : ''}
        <button class="btn-del" data-id="${scan.id}">🗑 削除</button>
      </div>
    `
    list.appendChild(li)
  }

  list.querySelectorAll('.btn-open').forEach(btn => {
    btn.addEventListener('click', () => window.open(btn.dataset.url, '_blank', 'noopener'))
  })
  list.querySelectorAll('.btn-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      await deleteScan(btn.dataset.id)
      renderHistory()
    })
  })
}

$('clear-all-btn').addEventListener('click', async () => {
  if (!confirm('全ての履歴を削除しますか？')) return
  await clearScans()
  renderHistory()
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
