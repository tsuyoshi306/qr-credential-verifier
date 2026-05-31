// デジタル庁 検証結果HTMLのパーサ（純粋関数・Node/Workerどちらでも動作）
// 入力: 検証サイト POST /w/verify の結果HTML
// 出力: { valid, resultText, checkedAt, registration: [{key,value}], certificates: [{caption, rows:[{key,value}]}] }

export function parseVerifyResult(html) {
  const result = {
    valid: false,
    resultText: '',
    checkedAt: '',
    registration: [],
    certificates: []
  }

  // 確認日時
  const checkedAt = html.match(/確認日時：([^<\n]+)/)
  if (checkedAt) result.checkedAt = checkedAt[1].trim()

  // 検証結果（「検証結果：」の後、次のタグまでのテキスト）
  const res = html.match(/検証結果：([^<]*)/)
  if (res) {
    result.resultText = stripTags(res[1])
    result.valid = result.resultText.includes('有効') && !result.resultText.includes('無効')
  }

  // 登録情報テーブル（<h2 id="qualificationInfo"> 直後の <table>）
  const qualSection = html.match(/id="qualificationInfo"[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/)
  if (qualSection) result.registration = parseRows(qualSection[1])

  // 証明書情報（<details class="certificate-info ..."> 内の各 <table>）
  const certBlock = html.match(/certificate-info[\s\S]*?<\/details>/)
  if (certBlock) {
    const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/g
    let m
    while ((m = tableRe.exec(certBlock[0])) !== null) {
      const tableHtml = m[0]
      const capMatch = tableHtml.match(/<caption[^>]*>([\s\S]*?)<\/caption>/)
      const caption = capMatch ? stripTags(capMatch[1]) : ''
      result.certificates.push({ caption, rows: parseRows(m[1]) })
    }
  }

  return result
}

// <tr><th>key</th><td>value</td></tr> の並びを [{key,value}] に
function parseRows(tableInner) {
  const rows = []
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g
  let tr
  while ((tr = trRe.exec(tableInner)) !== null) {
    const th = tr[1].match(/<th[^>]*>([\s\S]*?)<\/th>/)
    const td = tr[1].match(/<td[^>]*>([\s\S]*?)<\/td>/)
    if (th && td) {
      rows.push({ key: stripTags(th[1]), value: stripTags(td[1]) })
    }
  }
  return rows
}

function stripTags(s) {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}
