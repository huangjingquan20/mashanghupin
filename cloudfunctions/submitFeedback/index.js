const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { content } = event

  if (!content) return { success: false, message: '内容不能为空' }

  try {
    await db.collection('feedbacks').add({
      data: {
        openid: OPENID,
        content,
        created_at: db.serverDate()
      }
    })
    return { success: true }
  } catch (e) {
    return { success: false, message: e.message }
  }
}
