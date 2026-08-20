const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 密钥从云函数环境变量读取（云开发控制台 → 云函数 → 配置 → 环境变量）
const PDD_CLIENT_ID = process.env.PDD_CLIENT_ID || ''
const PDD_CLIENT_SECRET = process.env.PDD_CLIENT_SECRET || ''
const PDD_PID = process.env.PDD_PID || ''

function signDuoduo(params) {
  const keys = Object.keys(params).sort()
  let str = PDD_CLIENT_SECRET
  for (const k of keys) {
    str += k + params[k]
  }
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
      path: '/api/router',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
      })
    })
    req.on('error', e => reject(e))
    req.write(body)
    req.end()
  })
}

exports.main = async (event) => {
  try {
    const { OPENID } = cloud.getWXContext()
    let { title, description, category, image_url, price, qrcode_url, image_hash, goods_id, group_order_id, force } = event

    if (!title) {
      return { success: false, message: '标题不能为空' }
    }

    // 兜底：从 qrcode_url 提取 goods_id / group_order_id
    if ((!goods_id || !group_order_id) && qrcode_url) {
      if (!goods_id) {
        const m = qrcode_url.match(/goods_id[=:](\d+)/) || qrcode_url.match(/goods[\/=](\d+)/)
        if (m) goods_id = m[1]
      }
      if (!group_order_id) {
        const m = qrcode_url.match(/group_order_id[=:](\d+)/)
        if (m) group_order_id = m[1]
      }
    }

    // 查重：24h 内同一人不能发同款
    if (image_hash) {
      const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const selfDup = await db.collection('groups').where({
        image_hash, publisher_openid: OPENID, status: 'active',
        created_at: db.command.gte(cutoff24h)
      }).limit(1).get()
      if (selfDup.data.length > 0) {
        return { success: false, message: '你已发布过同款商品' }
      }

      // 公查：已有人发布同款（不拦自己，给选择）
      if (!force) {
        const pubDup = await db.collection('groups').where({ image_hash, status: 'active' }).limit(1).get()
        if (pubDup.data.length > 0) {
          const dup = pubDup.data[0]
          return { success: false, duplicate: true, dupTitle: dup.title, dupPrice: dup.price }
        }
      }
    }

    // 先创建拼团记录
    const res = await db.collection('groups').add({
      data: {
        title,
        description: description || '',
        category: category || '其他',
        image_url: image_url || '',
        image_hash: image_hash || '',
        price: price || '',
        qrcode_url: qrcode_url || '',
        promo_url: '',
        goods_id: goods_id || '',
        group_order_id: group_order_id || '',
        publisher_openid: OPENID,
        copy_count: 0,
        status: 'active',
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    })

    // PDD API 实时价格：取较低值（OCR价 vs API价）
    if (goods_id) {
      try {
        const detailRes = await callDuoduoAPI({
          type: 'pdd.ddk.goods.detail',
          goods_id_list: JSON.stringify([Number(goods_id)])
        })
        const goodsDetails = (detailRes.goods_detail_response && detailRes.goods_detail_response.goods_details) || []
        if (goodsDetails.length > 0) {
          const apiPriceFen = goodsDetails[0].min_group_price
          if (apiPriceFen) {
            const apiPrice = apiPriceFen / 100
            const ocrMatch = String(price || '').match(/(\d+\.?\d*)/)
            const ocrPrice = ocrMatch ? parseFloat(ocrMatch[1]) : null
            const finalPrice = (ocrPrice !== null) ? Math.min(apiPrice, ocrPrice) : apiPrice
            await db.collection('groups').doc(res._id).update({ data: { price: String(finalPrice) + '元' } })
          }
        }
      } catch (e) {
        console.error('PDD价格获取失败:', e.message)
      }
    }

    // 多多进宝：查 PID 授权状态
    let promoUrl = ''
    let wxappPagePath = ''
    let wxappAppId = ''
    let pddDiag = ''

    async function tryGetPromoData(gid) {
      const pddRes = await callDuoduoAPI({
        type: 'pdd.ddk.goods.promotion.url.generate',
        p_id: PDD_PID,
        goods_id_list: JSON.stringify([gid]),
        generate_we_app: true,
        generate_weapp_webview: true
      })
      if (pddRes.goods_promotion_url_generate_response) {
        const list = pddRes.goods_promotion_url_generate_response.goods_promotion_url_list || []
        if (list[0]) {
          const weAppInfo = list[0].we_app_info || {}
          return {
            promo_url: list[0].url || list[0].short_url || list[0].mobile_url || '',
            wxapp_page_path: weAppInfo.page_path || '',
            wxapp_app_id: weAppInfo.app_id || 'wxa918198f16869201'
          }
        }
      }
      return { promo_url: '', wxapp_page_path: '', wxapp_app_id: '' }
    }

    try {
      const authQueryRes = await callDuoduoAPI({
        type: 'pdd.ddk.member.authority.query',
        pid: PDD_PID
      })
      const isAuthorized = (authQueryRes.authority_query_response || {}).bind === 1

      if (!isAuthorized) {
        pddDiag = '未授权'
      } else if (goods_id) {
        const d = await tryGetPromoData(goods_id)
        promoUrl = d.promo_url
        wxappPagePath = d.wxapp_page_path
        wxappAppId = d.wxapp_app_id
        if (promoUrl) {
          pddDiag = '成功'
        } else {
          const kw = (title || '').replace(/先用后付|正品保证|免费开票/g, '').trim().slice(0, 30)
          const searchRes = await callDuoduoAPI({
            type: 'pdd.ddk.goods.search', pid: PDD_PID,
            keyword: kw, page: 1, page_size: 10
          })
          const list = searchRes.goods_search_response && searchRes.goods_search_response.goods_list || []
          if (list.length > 0) {
            const d2 = await tryGetPromoData(list[0].goods_id)
            promoUrl = d2.promo_url
            wxappPagePath = d2.wxapp_page_path
            wxappAppId = d2.wxapp_app_id
            pddDiag = promoUrl ? '成功' : '搜索后无url'
          } else {
            pddDiag = '搜索无结果'
          }
        }
      } else {
        pddDiag = '无goods_id'
      }
    } catch (e) {
      pddDiag = '异常: ' + e.message
    }

    const updateData = {}
    if (promoUrl) updateData.promo_url = promoUrl
    if (wxappPagePath) updateData.wxapp_page_path = wxappPagePath
    if (Object.keys(updateData).length > 0) {
      if (wxappAppId) updateData.wxapp_app_id = wxappAppId
      await db.collection('groups').doc(res._id).update({ data: updateData })
    }

    return { success: true, groupId: res._id, pdd_diag: pddDiag }
  } catch (e) {
    return { success: false, message: e.message || JSON.stringify(e) }
  }
}
