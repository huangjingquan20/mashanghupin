Page({
  data: {
    content: '',
    submitting: false,
    submitted: false
  },

  onInput(e) {
    this.setData({ content: e.detail.value })
  },

  onSubmit() {
    const content = this.data.content.trim()
    if (!content) return wx.showToast({ title: '请输入反馈内容', icon: 'none' })

    this.setData({ submitting: true })

    wx.cloud.callFunction({
      name: 'submitFeedback',
      data: { content },
      success: () => {
        wx.showToast({ title: '感谢反馈！', icon: 'success' })
        this.setData({ submitted: true, submitting: false, content: '' })
      },
      fail: () => {
        wx.showToast({ title: '提交失败', icon: 'none' })
        this.setData({ submitting: false })
      }
    })
  }
})
