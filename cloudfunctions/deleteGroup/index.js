const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { groupId } = event

  try {
    const doc = await db.collection('groups').doc(groupId).get()
    if (!doc.data) return { success: false, message: '记录不存在' }
    if (doc.data.publisher_openid !== OPENID) return { success: false, message: '无权删除' }

    await db.collection('groups').doc(groupId).remove()

    // 同时删除云存储中的图片
    if (doc.data.image_url) {
      try { await cloud.deleteFile({ fileList: [doc.data.image_url] }) } catch (_) {}
    }

    return { success: true }
  } catch (e) {
    return { success: false, message: e.message }
  }
}
