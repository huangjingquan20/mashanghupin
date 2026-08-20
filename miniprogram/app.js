App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }
    wx.cloud.init({
      env: 'YOUR_CLOUD_ENV_ID'
    })
    setTimeout(() => this.getOpenid(), 500)
  },

  getOpenid(retry = 0) {
    wx.cloud.callFunction({
      name: 'login',
      success: res => {
        this.globalData.openid = res.result.openid
        console.log('[login] 登录成功')
      },
      fail: err => {
        console.error('[login] 登录失败(第' + (retry + 1) + '次)', err)
        if (retry < 2) {
          setTimeout(() => this.getOpenid(retry + 1), 2000)
        }
      }
    })
  },

  globalData: {
    openid: '',
    userInfo: null,
    needRefreshHome: false
  }
})
