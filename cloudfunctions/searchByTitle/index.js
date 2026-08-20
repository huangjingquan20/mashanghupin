const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 密钥从云函数环境变量读取（云开发控制台 → 云函数 → 配置 → 环境变量）
const PDD_CLIENT_ID = process.env.PDD_CLIENT_ID || ''
const PDD_CLIENT_SECRET = process.env.PDD_CLIENT_SECRET || ''
const PDD_PID = process.env.PDD_PID || ''

function signDuoduo(params) {
  const keys = Object.keys(params).sort()
  let str = PDD_CLIENT_SECRET
  for (const k of keys) str += k + params[k]
  str += PDD_CLIENT_SECRET
  return crypto.createHash('md5').update(str).digest('hex').toUpperCase()
}

function callDuoduoAPI(params) {
  return new Promise((resolve, reject) => {
    params.client_id = PDD_CLIENT_ID
    params.timestamp = Math.floor(Date.now() / 1000)
    params.data_type = 'JSON'
    params.sign = signDuoduo(params)
    const body = Object.keys(params).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&')
    const req = https.request({
      hostname: 'gw-api.pinduoduo.com',
      path: '/api/router', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
    })
    req.on('error', e => reject(e))
    req.write(body)
    req.end()
  })
}

exports.main = async (event) => {
  const { title } = event
  if (!title) return { found: false }

  const kw = title.replace(/先用后付|正品保证|免费开票/g, '').trim().slice(0, 30)
  if (!kw) return { found: false }

  try {
    const res = await callDuoduoAPI({
      type: 'pdd.ddk.goods.search',
      pid: PDD_PID,
      keyword: kw,
      page: 1,
      page_size: 10
    })
    const list = res.goods_search_response && res.goods_search_response.goods_list || []
    if (list.length > 0) {
      return { found: true, goods_id: list[0].goods_id, goods_name: list[0].goods_name }
    }
    return { found: false }
  } catch (e) {
    return { found: false, error: e.message }
  }
}
