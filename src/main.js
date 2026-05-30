import { QRScanner, isCredentialUrl } from './scanner.js'
import { addScan, getScans, markVerified, deleteScan, clearScans } from './storage.js'

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

let currentScanId = null

async function handleDetected(data) {
  resetScanUI()
  const record = await addScan(data)
  currentScanId = record.id
  showResult(data, false)
}

$('verify-btn').addEventListener('click', () => {
  const url = $('result-url').textContent
  window.open(url, '_blank', 'noopener')
  $('verified-btn').style.display = ''
})

$('verified-btn').addEventListener('click', async () => {
  if (!currentScanId) return
  await markVerified(currentScanId)
  $('result-badge').innerHTML = '<span class="badge badge-verified">✓ 検証済み</span>'
  $('verified-btn').style.display = 'none'
})

function showResult(url, verified) {
  $('result-url').textContent = url
  const isCredential = isCredentialUrl(url)
  $('result-badge').innerHTML = isCredential
    ? (verified ? '<span class="badge badge-verified">✓ 検証済み</span>' : '')
    : '<span class="badge badge-warning">⚠ 資格者証のQRコードではない可能性があります</span>'
  $('verify-btn').style.display = isCredential ? '' : 'none'
  $('verified-btn').style.display = 'none'
  $('result-card').classList.add('show')
  $('scan-status').textContent = 'QRコードを読み取りました'
}

function hideResult() {
  $('result-card').classList.remove('show')
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
    li.innerHTML = `
      <div class="history-item-header">
        <span class="history-date">${date}</span>
        ${scan.isVerified ? '<span class="badge badge-verified">✓ 検証済み</span>' : ''}
      </div>
      <div class="history-url">${escHtml(scan.qrData)}</div>
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

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escAttr(str) {
  return str.replace(/"/g, '&quot;')
}
