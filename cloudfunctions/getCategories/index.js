const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const PRESET_CATEGORIES = [
  { name: '食品饮料', sort_order: 1, is_preset: true },
  { name: '生鲜果蔬', sort_order: 2, is_preset: true },
  { name: '家居日用', sort_order: 3, is_preset: true },
  { name: '个护美妆', sort_order: 4, is_preset: true },
  { name: '服饰鞋包', sort_order: 5, is_preset: true },
  { name: '数码家电', sort_order: 6, is_preset: true },
  { name: '宠物用品', sort_order: 7, is_preset: true },
  { name: '其他',     sort_order: 8, is_preset: true }
]

exports.main = async () => {
  try {
    const res = await db.collection('categories')
      .where({ is_preset: true })
      .orderBy('sort_order', 'asc')
      .get()

    if (res.data.length !== PRESET_CATEGORIES.length) {
      const oldIds = await db.collection('categories').where({ is_preset: true }).get()
      for (const old of oldIds.data) {
        await db.collection('categories').doc(old._id).remove()
      }
      for (const cat of PRESET_CATEGORIES) {
        await db.collection('categories').add({ data: cat })
      }
      return { data: PRESET_CATEGORIES }
    }

    return { data: res.data }
  } catch (err) {
    console.error('getCategories error:', err)
    return { data: PRESET_CATEGORIES, error: err.message }
  }
}
