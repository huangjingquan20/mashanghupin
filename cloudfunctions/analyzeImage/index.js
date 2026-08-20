const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

/* ── 从 Buffer 读取图片真实尺寸 ── */
function getImageSize(buf) {
  if (!buf || buf.length < 100) return null
  // JPEG: FF D8
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2
    while (i < buf.length - 9) {
      if (buf[i] !== 0xFF) break
      const m = buf[i + 1]
      if (m >= 0xC0 && m <= 0xC2) {
        return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) }
      }
      i += 2 + buf.readUInt16BE(i + 2)
    }
  }
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
  }
  return null
}

/* ── 腾讯云 API v3 通用请求（原生签名，零依赖） ── */
function callTencentAPI(action, imageBase64, secretId, secretKey) {
  return new Promise((resolve, reject) => {
    const host = 'ocr.tencentcloudapi.com'
    const service = 'ocr'
    const timestamp = Math.floor(Date.now() / 1000)
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
    const payload = JSON.stringify({ ImageBase64: imageBase64 })

    const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex')
    const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`
    const canonicalRequest = ['POST', '/', '', canonicalHeaders, 'content-type;host', hashedPayload].join('\n')
    const hashedCR = crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    const credentialScope = `${date}/${service}/tc3_request`
    const stringToSign = ['TC3-HMAC-SHA256', timestamp, credentialScope, hashedCR].join('\n')

    const kDate = crypto.createHmac('sha256', 'TC3' + secretKey).update(date).digest()
    const kSvc = crypto.createHmac('sha256', kDate).update(service).digest()
    const kSign = crypto.createHmac('sha256', kSvc).update('tc3_request').digest()
    const signature = crypto.createHmac('sha256', kSign).update(stringToSign).digest('hex')

    const req = https.request({
      method: 'POST', hostname: host, path: '/',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Host': host,
        'X-TC-Action': action,
        'X-TC-Version': '2018-11-19',
        'X-TC-Timestamp': timestamp,
        'Authorization': `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`
      }
    }, res => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.Response && json.Response.Error) {
            reject(new Error(`${json.Response.Error.Code}: ${json.Response.Error.Message}`))
          } else {
            resolve(json.Response)
          }
        } catch (e) { reject(e) }
      })
    })
    req.on('error', e => reject(e))
    req.write(payload)
    req.end()
  })
}

/* ── 文字 OCR ── */
function textOCR(imageBase64, secretId, secretKey) {
  return callTencentAPI('GeneralBasicOCR', imageBase64, secretId, secretKey).then(response => {
    let imgH = 0
    const items = (response.TextDetections || []).map(d => {
      const txt = (d.DetectedText || '').replace(/\s/g, '')
      let y = 999, x = 0
      if (d.ItemPolygon) {
        const ip = d.ItemPolygon
        y = ip.Y + ip.Height / 2; x = ip.X + ip.Width / 2
        imgH = Math.max(imgH, ip.Y + ip.Height)
      } else if (d.Polygon && d.Polygon.length >= 4) {
        const ys = d.Polygon.map(p => p.Y), xs = d.Polygon.map(p => p.X)
        y = (Math.min(...ys) + Math.max(...ys)) / 2
        x = (Math.min(...xs) + Math.max(...xs)) / 2
        imgH = Math.max(imgH, Math.max(...ys))
      }
      return { text: txt, y, x }
    })
    return { items, imgH }
  })
}

/* ── 提取标题 + 价格 ── */
function extractInfo(items) {
  if (items.length === 0) return { title: '', price: '' }

  const sorted = [...items].sort((a, b) => a.y - b.y)

  /* ── 价格：找有多人团价的行 ── */
  let price = ''
  for (const it of items) {
    const t = it.text || ''
    const pre = t.match(/多人团价?\s*(.*)/)
    if (pre && pre[1]) {
      let num = pre[1]
      num = num.replace(/(\d)\s+(\d)/g, '$1.$2')
      const digit = num.match(/[¥￥]?\s*(\d+\.?\d*)/)
      if (digit) { price = digit[1] + '元'; break }
    }
  }
  if (!price) {
    for (const it of items) {
      const m = (it.text || '').match(/多人团价?\s*[¥￥]?\s*(\d+\.?\d*)/)
      if (m) { price = m[1] + '元'; break }
    }
  }

  /* ── 标题：找含 3人团/三人团 的行，取团后内容 + 下一行 ── */
  let title = ''
  for (let i = 0; i < sorted.length; i++) {
    const t = (sorted[i].text || '').replace(/\s/g, '')
    if (t.includes('3人团') || t.includes('三人团')) {
      const after = t.split('团').slice(1).join('')
      let next = ''
      if (i + 1 < sorted.length) {
        next = (sorted[i + 1].text || '').replace(/\s/g, '')
      }
      title = (after + next).replace(/\s+/g, '').trim()
      // 清理噪声
      title = title.replace(/先用后付|正品保证|免费开票/g, '')
      break
    }
  }

  return { title, price }
}

exports.main = async (event) => {
  const { fileID } = event
  let items = []
  let imgH = 0
  let qrcodeUrl = ''
  let qrDiag = '未到QR'
  let textDiag = '未到OCR'
  let imageHash = ''

  try {
    const downloadRes = await cloud.downloadFile({ fileID })
    const buffer = downloadRes.fileContent
    const base64 = buffer.toString('base64')
    imageHash = crypto.createHash('md5').update(buffer).digest('hex')

    // 从图片文件头读取真实高度
    const fileSize = getImageSize(buffer)
    if (fileSize && fileSize.h > 100) imgH = fileSize.h

    /* ── A: cloud.openapi.ocr ── */
    let openapiOK = false
    if (cloud.openapi && cloud.openapi.ocr) {
      let imgUrl = fileID
      try {
        const tmpRes = await cloud.getTempFileURL({ fileList: [fileID] })
        const f = (tmpRes.fileList && tmpRes.fileList[0]) || {}
        if (f.tempFileURL) imgUrl = f.tempFileURL
      } catch (_) {}
      try {
        const r = await cloud.openapi.ocr.printedText({ imgUrl })
        if (r && Array.isArray(r.items) && r.items.length > 0) {
          if (r.img_size && r.img_size.h) imgH = r.img_size.h
          items = r.items.map(it => ({
            text: (it.text || '').replace(/\s/g, ''),
            y: it.pos ? it.pos.top + (it.pos.height || 0) / 2 : 999,
            x: it.pos ? it.pos.left : 0
          }))
          openapiOK = true
        }
      } catch (_) {}
    }

    /* ── B: 腾讯云 OCR（文字+QR并行加速） ── */
    const sid = process.env.TENCENT_SECRET_ID
    const skey = process.env.TENCENT_SECRET_KEY
    if (sid && skey) {
      const tasks = []
      if (!openapiOK) {
        tasks.push(textOCR(base64, sid, skey).then(res => {
          items = res.items
          if (!imgH || imgH <= 100) imgH = res.imgH
          textDiag = `文字OCR成功(${items.length}条)`
        }).catch(e => {
          textDiag = '文字OCR失败: ' + e.message
        }))
      } else {
        textDiag = 'cloud.openapi已有结果'
      }
      tasks.push(callTencentAPI('QrcodeOCR', base64, sid, skey).then(r => {
        qrcodeUrl = (r.CodeResults && r.CodeResults[0] && r.CodeResults[0].Url) || ''
        qrDiag = qrcodeUrl ? '成功' : '无二维码'
      }).catch(e => {
        qrDiag = '失败: ' + e.message
      }))
      await Promise.all(tasks)
    } else {
      textDiag = '未配置TENCENT密钥'
    }

    /* ── 提取 goods_id & group_order_id ── */
    let goodsId = ''
    let groupOrderId = ''
    if (qrcodeUrl) {
      const mGoods = qrcodeUrl.match(/goods_id[=:](\d+)/) || qrcodeUrl.match(/goods[\/=](\d+)/)
      if (mGoods) goodsId = mGoods[1]
      const mOrder = qrcodeUrl.match(/group_order_id[=:](\d+)/)
      if (mOrder) groupOrderId = mOrder[1]

      // 短链接重定向解析
      if ((!goodsId || !groupOrderId) && qrcodeUrl.includes('file-link.pinduoduo.com')) {
        try {
          const realUrl = await new Promise((resolve) => {
            function follow(hostname, path) {
              const req = https.get({ hostname, path, rejectUnauthorized: false }, res => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                  const loc = new URL(res.headers.location, 'https://' + hostname + path)
                  follow(loc.hostname, loc.pathname + loc.search)
                } else { resolve(`https://${hostname}${path}`) }
              })
              req.on('error', () => resolve(''))
            }
            const u = new URL(qrcodeUrl)
            follow(u.hostname, u.pathname + u.search)
          })
          if (realUrl) {
            if (!goodsId) {
              const rm = realUrl.match(/goods_id[=:](\d+)/) || realUrl.match(/goods[\/=](\d+)/)
              if (rm) goodsId = rm[1]
            }
            if (!groupOrderId) {
              const rm = realUrl.match(/group_order_id[=:](\d+)/)
              if (rm) groupOrderId = rm[1]
            }
          }
        } catch (_) {}
      }
    }

    if (items.length === 0) {
      return { success: false, message: 'OCR 不可用', title: '', price: '', category: '', qrcode_url: '', image_hash: imageHash, qr: qrDiag, text: textDiag, group_order_id: '' }
    }

    const { title, price } = extractInfo(items)

    /* ── 分类 ── */
    let category = ''
    const catMap = {
      '食品饮料': /可乐|雪碧|饮|汁|茶|奶|咖|糖|巧|饼|薯|片|干|脯|蜜饯|坚果|瓜子|花生|辣条|膨化|糕点|蜂|燕麦|豆粉|矿泉|米|面|油|酱|醋|盐|调味|料酒|火锅底料|饭|粉|汤|糕|酥|脆|蛋糕|面包|饼干|方便面|火腿肠|酸奶|果汁|白酒|啤酒|红酒|巧克力|糖果|冰淇淋|速食|自热|速溶|蛋白粉|绿茶|红茶|奶茶|饮用水|纯净水|苏打水|功能饮料|汽水|豆浆|八宝粥|罐头|速冻|卤味|泡菜|榨菜|海苔|锅巴|麻花|蚕豆|腰果|核桃|开心果|松子|红枣|枸杞|葡萄干|芒果干|山楂|话梅|果冻|奶酪|蚝油|生抽|老抽|麻辣|拌面|卤蛋|螺蛳粉|酸辣粉|方便粉丝|牛肉干|猪肉脯|凤爪|鸭脖|奶茶粉|咖啡粉|纯牛奶|鲜奶|脱脂/,
      '生鲜果蔬': /芒|榴|橘|橙|葡|桃|瓜|蕉|荔|柿|莓|李|杏|枣|梨|柚|猕猴|菜|蒜|姜|葱|椒|豆|茄|菇|笋|薯|芋|藕|卜|肉|鸡|鸭|鹅|猪|牛|羊|蛋|腊|肠|火腿|扒|排|虾|蟹|鱼|贝|海|蛤|蚝|螺|鱿|带鱼|三文|鲍|参|虾仁|牛排|肥牛|牛腩|猪蹄|五花|排骨|鸡翅|鸡胸|三黄鸡|鲫鱼|鲈鱼|黄鱼|基围虾|梭子蟹|大闸蟹|扇贝|生蚝|蛤蜊|花蛤|鲜肉|土鸡|土鸡蛋|柴鸡蛋|笨鸡蛋|有机菜|时令|现摘|当季|新鲜|冷链|产地直发/,
      '家居日用': /纸|巾|杯|拖|扫|收纳|垃圾|保鲜|挂钩|胶|锅|碗|筷|勺|刀|菜|砧|铲|饭盒|保温|被|枕|床|四件套|毯|席|蚊|凉席|抱枕|灯|桌|椅|柜|架|沙|帘|地毯|装饰|花|绿植|盆|皂|液|桶|袋|盒|瓶|罐|篮|筛|夹|钩|架|箱|轮|梯|垫|套|罩|刷|布|巾|球|清洁|抹布|垃圾袋|保鲜袋|保鲜膜|洗洁精|洗衣液|衣架|衣杆/,
      '个护美妆': /妆|口|粉|乳|霜|面膜|隔离|防晒|眼影|腮红|口红|唇|牙|刷|洁|皂|洗面|卸妆|湿巾|棉柔巾|卫生|姨妈巾|洗|护|沐|浴|洗发|护发|发膜|沐浴露|香水|精华|眼霜|眉笔|粉底|BB霜|CC霜|气垫|散粉|睫毛膏|眼线|卸妆水|卸妆油|磨砂膏|身体乳|手霜|足膜|染发|定型|发蜡|发胶/,
      '服饰鞋包': /衣|服|裙|裤|衫|T恤|卫衣|外套|夹克|衬|风衣|羽绒|鞋|靴|拖|凉鞋|运动鞋|帆布|包|箱|背包|书包|旅行|帽|围|手套|袜|眼镜|耳环|项链|手链|戒|短袖|长袖|毛衣|针织|牛仔|西服|休闲裤|阔腿裤|打底|丝袜|棉袜|船袜|拖鞋|棉拖|雪地靴|马丁靴|双肩包|斜挎|钱包|卡包|墨镜|皮带|领带|袖扣/,
      '数码家电': /手|耳|机|电|充|数据线|充电|移动|平板|电脑|键|鼠|蓝|USB|扇|煲|锅|炉|烤|微波|吸尘|扫地|加湿|净化|空调|冰箱|电视|洗衣机|热水器|电饭煲|电磁炉|电水壶|榨汁机|破壁机|豆浆机|空气炸锅|电暖器|风扇|取暖器|除湿|投影|音箱|耳机|充电宝|充电头|快充|无线充|Type-C|HDMI|路由器|网线/,
      '宠物用品': /宠|猫|狗|粮|砂|猫砂|猫粮|狗粮|罐头|诱食|逗猫|抓板|猫抓板|猫爬架|猫窝|狗窝|牵引|胸背|项圈|驱虫|除蚤|清洁|沐浴露|梳子|指甲剪|食盆|饮水机|尿垫|猫条|冻干|磨牙/,
    }
    for (const [cat, re] of Object.entries(catMap)) {
      if (re.test(title)) { category = cat; break }
    }
    // 运动器材归其他（避免"羽毛球"中"鸭"字被生鲜误匹配）
    if (/羽毛球|乒乓球|篮球|足球|排球|网球|台球|棒球|高尔夫|运动|健身|瑜伽|登山|骑行|跑步|游泳|滑板|跳绳|哑铃|球拍|球鞋|护膝/.test(title)) {
      category = '其他'
    }
    if (!category) category = '其他'

    return { success: true, title, price, category, qrcode_url: qrcodeUrl, goods_id: goodsId, group_order_id: groupOrderId, image_hash: imageHash, qr: qrDiag, text: textDiag }
  } catch (e) {
    return { success: false, message: e.message, title: '', price: '', category: '', qrcode_url: '', image_hash: '', qr: '崩溃', text: '崩溃: ' + e.message }
  }
}
