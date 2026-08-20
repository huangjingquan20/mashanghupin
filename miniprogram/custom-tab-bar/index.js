Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/home/home',
        text: '首页',
        icon: 'home'
      },
      {
        pagePath: '/pages/publish/publish',
        text: '发布',
        icon: 'plus'
      },
      {
        pagePath: '/pages/mine/mine',
        text: '我的',
        icon: 'mine'
      }
    ]
  },

  methods: {
    switchTab(e) {
      const index = e.currentTarget.dataset.index
      const item = this.data.list[index]
      const url = item.pagePath

      wx.switchTab({
        url,
        success: () => {
          this.setData({ selected: index })
        },
        fail: () => {
          this.setData({ selected: index })
        }
      })
    }
  }
})
