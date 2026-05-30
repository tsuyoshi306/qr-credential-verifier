import jsQR from 'jsqr'

const VERIFICATION_DOMAIN = 'dqcvs.nqs.go.jp'

export function isCredentialUrl(url) {
  try {
    return new URL(url).hostname === VERIFICATION_DOMAIN
  } catch {
    return false
  }
}

export class QRScanner {
  constructor({ onDetected, onError }) {
    this.onDetected = onDetected
    this.onError = onError
    this.stream = null
    this.animFrame = null
    this.running = false
  }

  async start(videoEl, canvasEl) {
    if (this.running) return
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      videoEl.srcObject = this.stream
      await videoEl.play()
      this.running = true
      this._loop(videoEl, canvasEl)
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? 'カメラへのアクセスが許可されていません。ブラウザの設定を確認してください。'
        : 'このブラウザはカメラ機能に対応していません。'
      this.onError(msg)
    }
  }

  _loop(videoEl, canvasEl) {
    if (!this.running) return
    const ctx = canvasEl.getContext('2d', { willReadFrequently: true })

    const tick = () => {
      if (!this.running) return
      if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
        canvasEl.width = videoEl.videoWidth
        canvasEl.height = videoEl.videoHeight
        ctx.drawImage(videoEl, 0, 0)
        const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height)
        if (code) {
          this.stop()
          this.onDetected(code.data)
          return
        }
      }
      this.animFrame = requestAnimationFrame(tick)
    }
    this.animFrame = requestAnimationFrame(tick)
  }

  stop() {
    this.running = false
    if (this.animFrame) cancelAnimationFrame(this.animFrame)
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop())
      this.stream = null
    }
  }
}
