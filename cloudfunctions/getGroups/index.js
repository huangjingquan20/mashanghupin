const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  try {
    const { keyword = '', category = '', page = 1, pageSize = 20 } = event
    const skip = (page - 1) * pageSize
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)

    let conditions = [
      { status: 'active' },
      { created_at: _.gte(cutoff) }
    ]

    if (category) {
      conditions.push({ category })
    }

    if (keyword) {
      conditions.push({
        title: db.RegExp({ regexp: keyword, options: 'i' })
      })
    }

    const res = await db.collection('groups')
      .where(_.and(conditions))
      .orderBy('created_at', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()

    let data = res.data || []

    // 批量转换 cloud:// 图片为临时可访问链接
    const fileIDs = data.map(g => g.image_url).filter(Boolean)
    if (fileIDs.length > 0) {
      const tmpRes = await cloud.getTempFileURL({ fileList: fileIDs })
      const urlMap = {}
      ;(tmpRes.fileList || []).forEach(item => {
        if (item.tempFileURL) urlMap[item.fileID] = item.tempFileURL
      })
      data = data.map(g => ({
        ...g,
        image_url: urlMap[g.image_url] || g.image_url
      }))
    }

    return {
      data,
      page,
      pageSize,
      hasMore: data.length === pageSize && data.length > 0
    }

  } catch (err) {
    console.error('getGroups error:', err)
    return {
      data: [],
      page,
      pageSize,
      hasMore: false,
      error: err.message || '查询失败'
    }
  }
}
