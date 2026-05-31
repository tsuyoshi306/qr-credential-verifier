// PDF / 画像ファイルから QR コードを読み取る
import jsQR from 'jsqr'

// pdf.js は重い（~600KB）。ファイル取り込み時のみ動的ロードして初期表示を軽量に保つ。
let pdfjsPromise = null
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjsLib = await import('pdfjs-dist')
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
      return pdfjsLib
    })()
  }
  return pdfjsPromise
}

/**
 * File から QR 文字列を読み取る。見つからなければ Error を投げる。
 * @param {File} file
 * @returns {Promise<string>} QRのデコード文字列
 */
export async function readQrFromFile(file) {
  const type = file.type || ''
  if (type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    return readFromPdf(file)
  }
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name)) {
    return readFromImage(file)
  }
  throw new Error('対応していないファイル形式です（PDF または 画像を選択してください）')
}

async function readFromPdf(file) {
  const pdfjsLib = await loadPdfjs()
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise
  // 各ページを描画してQRを探索。見つからなければ拡大して再試行。
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    for (const targetWidth of [2000, 3000]) {
      const found = scanCanvas(await renderPageToCanvas(page, targetWidth))
      if (found) { pdf.destroy?.(); return found }
    }
  }
  pdf.destroy?.()
  throw new Error('PDF内にQRコードが見つかりませんでした')
}

async function renderPageToCanvas(page, targetWidth) {
  const base = page.getViewport({ scale: 1 })
  const scale = Math.max(1, targetWidth / base.width)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas
}

async function readFromImage(file) {
  const bitmap = await createImageBitmap(file)
  // 大きすぎる画像は適度に抑えつつ、小さすぎる場合は拡大
  const targetWidth = Math.min(Math.max(bitmap.width, 1200), 3000)
  const scale = targetWidth / bitmap.width
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  const found = scanCanvas(canvas)
  if (!found) throw new Error('画像内にQRコードが見つかりませんでした')
  return found
}

function scanCanvas(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })
  return code ? code.data : null
}
