const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async () => {
  // 20 天前
  const cutoff = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)

  let deleted = 0
  let imagesDeleted = 0
  let favsDeleted = 0

  // 批量查：每次最多 100 条
  const res = await db.collection('groups')
    .where(_.and([
      { status: 'active' },
      { created_at: _.lt(cutoff) }
    ]))
    .limit(100)
    .get()

  const expired = res.data || []

  for (const g of expired) {
    // 删云存储图片
    if (g.image_url) {
      try {
        await cloud.deleteFile({ fileList: [g.image_url] })
        imagesDeleted++
      } catch (_) {}
    }

    // 删收藏
    try {
      const fRes = await db.collection('favorites')
        .where({ group_id: g._id })
        .remove()
      favsDeleted += fRes.stats && fRes.stats.removed || 0
    } catch (_) {}

    // 删拼团记录
    try {
      await db.collection('groups').doc(g._id).remove()
      deleted++
    } catch (_) {}
  }

  return {
    success: true,
    expiredFound: expired.length,
    deleted,
    imagesDeleted,
    favsDeleted,
    cutoff
  }
}
