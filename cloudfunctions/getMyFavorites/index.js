const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async () => {
  try {
    const { OPENID } = cloud.getWXContext()
    const favRes = await db.collection('favorites')
      .where({ user_openid: OPENID })
      .orderBy('created_at', 'desc')
      .get()

    const groupIds = favRes.data.map(f => f.group_id)
    if (groupIds.length === 0) return { data: [] }

    // 只返回 24h 内的拼团
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const groupsRes = await db.collection('groups')
      .where(_.and([
        { _id: _.in(groupIds) },
        { status: 'active' },
        { created_at: _.gte(cutoff) }
      ]))
      .get()

    let data = groupsRes.data || []
    const fileIDs = data.map(g => g.image_url).filter(Boolean)
    if (fileIDs.length > 0) {
      const tmpRes = await cloud.getTempFileURL({ fileList: fileIDs })
      const urlMap = {}
      ;(tmpRes.fileList || []).forEach(item => { if (item.tempFileURL) urlMap[item.fileID] = item.tempFileURL })
      data = data.map(g => ({ ...g, image_url: urlMap[g.image_url] || g.image_url }))
    }
    return { data }
  } catch (err) {
    console.error('getMyFavorites error:', err)
    return { data: [], error: err.message }
  }
}
