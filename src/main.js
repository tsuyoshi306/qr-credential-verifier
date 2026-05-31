import { QRScanner } from './scanner.js'
import { isCredentialUrl, analyzeCredential } from './cose.js'
import { addScan, getScans, deleteScan, clearScans } from './storage.js'

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

let currentUrl = null

async function handleDetected(data) {
  resetScanUI()
  currentUrl = data
  await showResult(data)
}

$('verify-btn').addEventListener('click', () => {
  if (currentUrl) window.open(currentUrl, '_blank', 'noopener')
})

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

  const isCredential = isCredentialUrl(url)
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
  await addScan(url, summarize(analysis))
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
        ${sigBadgeHtml(scan.sigStatus)}
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
