const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async () => {
  try {
    const { OPENID } = cloud.getWXContext()
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const res = await db.collection('groups')
      .where(_.and([
        { publisher_openid: OPENID },
        { status: 'active' },
        { created_at: _.gte(cutoff) }
      ]))
      .orderBy('created_at', 'desc')
      .get()
    let data = res.data || []
    const fileIDs = data.map(g => g.image_url).filter(Boolean)
    if (fileIDs.length > 0) {
      const tmpRes = await cloud.getTempFileURL({ fileList: fileIDs })
      const urlMap = {}
      ;(tmpRes.fileList || []).forEach(item => { if (item.tempFileURL) urlMap[item.fileID] = item.tempFileURL })
      data = data.map(g => ({ ...g, image_url: urlMap[g.image_url] || g.image_url }))
    }
    return { data }
  } catch (err) {
    console.error('getMyGroups error:', err)
    return { data: [], error: err.message }
  }
}
