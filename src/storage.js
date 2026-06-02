import { openDB } from 'idb'

const DB_NAME = 'qr-credential-verifier'
const STORE = 'scans'

let db

async function getDB() {
  if (!db) {
    db = await openDB(DB_NAME, 1, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('scannedAt', 'scannedAt')
      }
    })
  }
  return db
}

export async function addScan(qrData, analysis = {}) {
  const db = await getDB()
  const record = {
    id: crypto.randomUUID(),
    scannedAt: new Date(),
    qrData,
    // 解析結果サマリ（cose.js summarize の出力）
    sigStatus: analysis.sigStatus || null, // 'ok'|'ng'|'skipped'|'error'|null
    name: analysis.name || '',
    qualification: analysis.qualification || '',
    officialValid: null,   // 公式検証の判定（true/false/null=未実施）
    officialResult: '',    // 公式検証の結果テキスト
    officialCheckedAt: '', // 公式検証の確認日時
    certOwner: '',         // 証明書 所有者別名
    certIssuer: '',        // 証明書 発行者別名
    certSerial: '',        // 証明書 シリアル番号
    certValidity: '',      // 証明書 有効期間
    memo: ''
  }
  await db.add(STORE, record)
  return record
}

// 既存レコードの一部フィールドを更新（公式検証結果など）
export async function updateScan(id, fields) {
  const db = await getDB()
  const record = await db.get(STORE, id)
  if (!record) return
  Object.assign(record, fields)
  await db.put(STORE, record)
  return record
}

export async function getScans() {
  const db = await getDB()
  const all = await db.getAll(STORE)
  return all.sort((a, b) => new Date(b.scannedAt) - new Date(a.scannedAt))
}

export async function markVerified(id) {
  const db = await getDB()
  const record = await db.get(STORE, id)
  if (!record) return
  record.isVerified = true
  record.verifiedAt = new Date()
  await db.put(STORE, record)
  return record
}

export async function deleteScan(id) {
  const db = await getDB()
  await db.delete(STORE, id)
}

export async function clearScans() {
  const db = await getDB()
  await db.clear(STORE)
}
