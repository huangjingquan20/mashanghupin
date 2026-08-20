const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  try {
    const { groupId } = event
    if (!groupId) return { success: false, message: '缺少 groupId' }
    await db.collection('groups').doc(groupId).update({
      data: { copy_count: _.inc(1) }
    })
    return { success: true }
  } catch (e) {
    return { success: false, message: e.message }
  }
}
