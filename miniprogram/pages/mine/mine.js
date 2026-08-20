Page({
  data: {
    openid: '',
    userInfo: null,
    isLogin: false,
    tabs: ['我发布的', '我的收藏'],
    activeTab: 0,
    myGroups: [],
    myFavorites: []
  },

  onLoad() {
    this._syncLogin()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this._syncLogin()
    this.loadMyGroups()
    this.loadMyFavorites()
  },

  _syncLogin() {
    const app = getApp()
    if (app.globalData.openid && !this.data.isLogin) {
      this.setData({ openid: app.globalData.openid, isLogin: true })
    }
  },

  loadMyGroups() {
    wx.cloud.callFunction({
      name: 'getMyGroups',
      success: res => {
        this.setData({ myGroups: res.result.data || [] })
      },
      fail: () => {
        this.setData({ myGroups: [] })
      }
    })
  },

  loadMyFavorites() {
    wx.cloud.callFunction({
      name: 'getMyFavorites',
      success: res => {
        this.setData({ myFavorites: res.result.data || [] })
      },
      fail: () => {
        this.setData({ myFavorites: [] })
      }
    })
  },

  onTabTap(e) {
    this.setData({ activeTab: e.currentTarget.dataset.index })
  },

  onViewGroup(e) {
    const g = e.currentTarget.dataset.group || {}
    wx.setClipboardData({
      data: g.promo_url || g.qrcode_url || g.title || '',
      success: () => wx.showToast({ title: '已复制', icon: 'none' })
    })
  },

  onDeleteGroup(e) {
    const group = e.detail.group
    wx.cloud.callFunction({
      name: 'deleteGroup',
      data: { groupId: group._id },
      success: res => {
        if (res.result && res.result.success) {
          wx.showToast({ title: '已删除', icon: 'none' })
          getApp().globalData.needRefreshHome = true
          this.loadMyGroups()
        } else {
          wx.showToast({ title: res.result.message || '删除失败', icon: 'none' })
        }
      },
      fail: () => {
        wx.showToast({ title: '删除失败', icon: 'none' })
      }
    })
  },

  onFavToggle(e) {
    wx.cloud.callFunction({
      name: 'toggleFavorite',
      data: { groupId: e.detail.group._id },
      success: () => {
        wx.showToast({ title: '已取消收藏', icon: 'none' })
        this.loadMyFavorites()
      }
    })
  },

  onShareGroup(e) {
    this._shareGroup = e.detail.group
  },

  onShareAppMessage() {
    const group = this._shareGroup || {}
    const p = (group.price || '').replace(/元$/, '')
    return {
      title: `${p ? '¥' + p : ''} ${group.title || '拼团商品'}`.trim(),
      imageUrl: group.image_url || '',
      path: `/pages/jump/jump?group_order_id=${group.group_order_id || ''}&goods_id=${group.goods_id || ''}`
    }
  },

  onFeedback() {
    wx.navigateTo({ url: '/pages/feedback/feedback' })
  }
})
