const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function resolveUrl(url) {
  return new Promise(resolve => {
    if (!url || !url.startsWith('http')) return resolve(url)
    function follow(hostname, path) {
      const req = https.get({ hostname, path, rejectUnauthorized: false }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const loc = new URL(res.headers.location, 'https://' + hostname + path)
          follow(loc.hostname, loc.pathname + loc.search)
        } else { resolve(`https://${hostname}${path}`) }
      })
      req.on('error', () => resolve(url))
    }
    try { const u = new URL(url); follow(u.hostname, u.pathname + u.search) }
    catch (_) { resolve(url) }
  })
}

function extractIds(url) {
  let goodsId = '', groupOrderId = ''
  const m1 = url.match(/goods_id[=:](\d+)/)
  if (m1) goodsId = m1[1]
  if (!goodsId) { const m2 = url.match(/goods[\/=](\d+)/); if (m2) goodsId = m2[1] }
  const mo = url.match(/group_order_id[=:](\d+)/)
  if (mo) groupOrderId = mo[1]

  try {
    const pu = new URL(url)
    const launchUrl = pu.searchParams.get('launch_url')
    if (launchUrl) {
      const decoded = decodeURIComponent(launchUrl)
      if (!goodsId) {
        const rm = decoded.match(/goods_id[=:](\d+)/) || decoded.match(/goods[\/=](\d+)/)
        if (rm) goodsId = rm[1]
      }
      if (!groupOrderId) {
        const rm = decoded.match(/group_order_id[=:](\d+)/)
        if (rm) groupOrderId = rm[1]
      }
    }
  } catch (_) {}

  return { goods_id: goodsId, group_order_id: groupOrderId }
}

exports.main = async (event) => {
  const { link } = event
  if (!link) return { error: '链接为空' }

  try {
    let resolvedUrl = link
    if (link.includes('file-link.pinduoduo.com')) {
      resolvedUrl = await resolveUrl(link)
    }
    const ids = extractIds(resolvedUrl)

    if (ids.goods_id || ids.group_order_id) {
      return ids
    }
    return { error: '链接无效，无法识别到商品' }
  } catch (e) {
    return { error: '链接解析失败: ' + e.message }
  }
}
