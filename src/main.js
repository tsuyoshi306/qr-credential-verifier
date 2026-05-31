import { QRScanner } from './scanner.js'
import { isCredentialUrl, analyzeCredential, extractCoseBytes } from './cose.js'
import { addScan, getScans, updateScan, deleteScan, clearScans } from './storage.js'
import { PROXY_URL, isProxyConfigured } from './proxy-config.js'
import { readQrFromFile } from './file-import.js'

const $ = id => document.getElementById(id)

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
  const file = e.target.files && e.target.files[0]
  e.target.value = '' // 同じファイルを再選択できるように
  if (!file) return
  scanner.stop()
  resetScanUI()
  hideError()
  hideResult()
  $('file-loading').style.display = ''
  $('file-btn').disabled = true
  try {
    const data = await readQrFromFile(file)
    await handleDetected(data)
  } catch (err) {
    showError(err.message || 'ファイルの読み取りに失敗しました')
  } finally {
    $('file-loading').style.display = 'none'
    $('file-btn').disabled = false
  }
})

let currentUrl = null
let lastSummary = {}
let currentScanId = null

async function handleDetected(data) {
  resetScanUI()
  currentUrl = data
  await showResult(data)
}

$('verify-btn').addEventListener('click', () => {
  if (currentUrl) window.open(currentUrl, '_blank', 'noopener')
})

$('official-btn').addEventListener('click', async () => {
  if (!currentUrl || !isProxyConfigured()) return
  let checkdata
  try { checkdata = new URL(currentUrl).searchParams.get('c') } catch { checkdata = null }
  if (!checkdata) { showOfficialError('QRから検証データを取得できませんでした'); return }

  $('official-btn').disabled = true
  $('official-loading').style.display = ''
  $('official-result').style.display = 'none'
  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkdata })
    })
    const data = await res.json()
    if (!res.ok || data.error) {
      showOfficialError(data.error || `照会に失敗しました (HTTP ${res.status})`)
    } else {
      renderOfficialResult(data)
      // 公式判定を既存履歴レコードに反映
      if (currentScanId) await updateScan(currentScanId, { officialValid: data.valid, officialResult: data.resultText })
    }
  } catch (e) {
    showOfficialError('中継サーバへの接続に失敗しました')
  } finally {
    $('official-loading').style.display = 'none'
    $('official-btn').disabled = false
  }
})

function showOfficialError(msg) {
  $('official-result').innerHTML = `<div class="sig-badge sig-error">⚠️ ${escHtml(msg)}</div>`
  $('official-result').style.display = ''
}

function renderOfficialResult(data) {
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
  $('official-result').innerHTML = html
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
