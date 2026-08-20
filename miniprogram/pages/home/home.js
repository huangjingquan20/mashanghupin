Page({
  data: {
    keyword: '',
    categories: [],
    activeCategory: '全部',
    groups: [],
    page: 1,
    hasMore: true,
    loading: false,
    searchFocused: false,
    loadError: '',
    searchHistory: []
  },

  onLoad() {
    this._firstLoad = true
    this.loadHistory()
    this.loadCategories()
    this.syncFavsThenLoad()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    if (this._firstLoad) {
      this._firstLoad = false
      return
    }
    const app = getApp()
    if (app.globalData.needRefreshHome) {
      app.globalData.needRefreshHome = false
      this.setData({ page: 1, groups: [], hasMore: true, loading: false, loadError: '' })
      this.syncFavsThenLoad()
    }
  },

  loadHistory() {
    try {
      const history = wx.getStorageSync('searchHistory') || []
      this.setData({ searchHistory: history })
    } catch (_) {}
  },

  saveHistory(keyword) {
    if (!keyword.trim()) return
    let history = this.data.searchHistory.filter(h => h !== keyword)
    history.unshift(keyword)
    if (history.length > 10) history = history.slice(0, 10)
    this.setData({ searchHistory: history })
    wx.setStorageSync('searchHistory', history)
  },

  clearHistory() {
    this.setData({ searchHistory: [] })
    wx.removeStorageSync('searchHistory')
  },

  syncFavsThenLoad() {
    wx.cloud.callFunction({
      name: 'getMyFavorites',
      success: res => {
        this._favIds = (res.result.data || []).map(g => g._id)
      },
      fail: () => {
        this._favIds = []
      },
      complete: () => {
        this.setData({ page: 1, groups: [], hasMore: true, loading: false, loadError: '' })
        this.loadGroups()
      }
    })
  },

  loadCategories() {
    wx.cloud.callFunction({
      name: 'getCategories',
      success: res => {
        const categories = [{ name: '全部' }].concat(res.result.data || [])
        this.setData({ categories })
      },
      fail: () => {
        this.setData({
          categories: [
            { name: '全部' },
            { name: '食品饮料' }, { name: '生鲜果蔬' }, { name: '家居日用' },
            { name: '个护美妆' }, { name: '服饰鞋包' },
            { name: '数码家电' }, { name: '宠物用品' }, { name: '其他' }
          ]
        })
      }
    })
  },

  loadGroups() {
    if (this.data.loading || !this.data.hasMore) return

    this.setData({ loading: true, loadError: '' })
    const { keyword, activeCategory, page } = this.data
    const PAGE_SIZE = 20

    wx.cloud.callFunction({
      name: 'getGroups',
      data: {
        keyword,
        category: activeCategory === '全部' ? '' : activeCategory,
        page,
        pageSize: PAGE_SIZE
      },
      success: res => {
        const newGroups = (res.result && res.result.data) || []
        const groups = page === 1 ? newGroups : this.data.groups.concat(newGroups)
        this.setData({
          groups: groups.map(g => ({ ...g, _favorited: (this._favIds || []).includes(g._id) })),
          hasMore: newGroups.length === PAGE_SIZE,
          loading: false
        })
      },
      fail: err => {
        console.error('getGroups error', err)
        this.setData({ loading: false, loadError: err.errMsg || '加载失败' })
      }
    })
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearchClear() {
    this.setData({ keyword: '', page: 1, groups: [], hasMore: true, loading: false })
    this.loadGroups()
  },

  onSearchFocus() {
    this.setData({ searchFocused: true })
  },

  onSearchBlur() {
    this.setData({ searchFocused: false })
  },

  onSearchConfirm() {
    const kw = this.data.keyword.trim()
    if (!kw) return
    this.saveHistory(kw)
    this.setData({ page: 1, groups: [], hasMore: true, loading: false, searchFocused: false })
    this.loadGroups()
  },

  onHistoryTap(e) {
    const kw = e.currentTarget.dataset.keyword
    this.setData({ keyword: kw, page: 1, groups: [], hasMore: true, loading: false, searchFocused: false })
    this.loadGroups()
  },

  onCategoryTap(e) {
    const category = e.currentTarget.dataset.name
    if (category === this.data.activeCategory) return
    this.setData({ activeCategory: category, keyword: '', page: 1, groups: [], hasMore: true, loading: false })
    this.loadGroups()
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 })
      this.loadGroups()
    }
  },

  onPullDownRefresh() {
    this.setData({ page: 1, groups: [], hasMore: true, loading: false })
    this.loadGroups()
    wx.stopPullDownRefresh()
  },

  onShareGroup(e) {
    this._shareGroup = e.detail.group
  },

  onFavGroup(e) {
    const groupId = e.detail.group._id
    wx.cloud.callFunction({
      name: 'toggleFavorite',
      data: { groupId },
      success: res => {
        const favorited = res.result && res.result.favorited
        wx.showToast({ title: favorited ? '已收藏' : '已取消收藏', icon: 'none', duration: 1500 })
        const groups = this.data.groups.map(g => {
          if (g._id === groupId) return { ...g, _favorited: favorited }
          return g
        })
        this.setData({ groups })
        if (favorited) {
          this._favIds = [...(this._favIds || []), groupId]
        } else {
          this._favIds = (this._favIds || []).filter(id => id !== groupId)
        }
      }
    })
  },

  onShareAppMessage() {
    const group = this._shareGroup || {}
    const p = (group.price || '').replace(/元$/, '')
    return {
      title: `${p ? '¥' + p : ''} ${group.title || '拼团商品'}`.trim(),
      imageUrl: group.image_url || '',
      path: `/pages/jump/jump?group_order_id=${group.group_order_id || ''}&goods_id=${group.goods_id || ''}`
    }
  }
})
