const crypto = require('crypto')
const https = require('https')

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
      hostname: 'gw-api.pinduoduo.com', path: '/api/router', method: 'POST',
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

exports.main = async () => {
  try {
    // 查授权状态
    const authQuery = await callDuoduoAPI({ type: 'pdd.ddk.member.authority.query', pid: PDD_PID })
    const bind = (authQuery.authority_query_response || {}).bind
    if (bind === 1) return { authorized: true, message: '已授权' }

    // 生成授权链接（channel_type=10 官方定义：生成绑定备案链接）
    const authLink = await callDuoduoAPI({
      type: 'pdd.ddk.rp.prom.url.generate',
      p_id_list: JSON.stringify([PDD_PID]),
      channel_type: 10,
      generate_we_app: true
    })
    const rpRes = authLink.rp_promotion_url_generate_response || {}
    const urlList = rpRes.url_list || []
    const authUrl = (urlList[0] && (urlList[0].mobile_url || urlList[0].url)) || ''
    const weAppInfo = (urlList[0] && urlList[0].we_app_info) || null

    return { authorized: false, authUrl, weAppInfo }
  } catch (e) {
    return { error: e.message }
  }
}
