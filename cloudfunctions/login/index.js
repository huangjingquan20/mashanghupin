const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()

  const userRes = await db.collection('users').where({ openid: OPENID }).get()

  if (userRes.data.length === 0) {
    await db.collection('users').add({
      data: {
        openid: OPENID,
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    })
  } else {
    await db.collection('users').where({ openid: OPENID }).update({
      data: { updated_at: db.serverDate() }
    })
  }

  return { openid: OPENID }
}
