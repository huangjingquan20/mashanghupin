const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { groupId } = event
  const favRes = await db.collection('favorites')
    .where({ user_openid: OPENID, group_id: groupId })
    .get()
  if (favRes.data.length > 0) {
    await db.collection('favorites').doc(favRes.data[0]._id).remove()
    return { favorited: false }
  } else {
    await db.collection('favorites').add({
      data: {
        user_openid: OPENID,
        group_id: groupId,
        created_at: db.serverDate()
      }
    })
    return { favorited: true }
  }
}
