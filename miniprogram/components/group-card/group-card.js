const PDD_MAIN_APPID = 'wx32540bd863b27570'
const PDD_FULI_APPID = 'wxa918198f16869201'
// 上线前请填回真实推广位 PID（或改为从云函数下发）
const PID = 'YOUR_PDD_PID'

function getGroupJoinPath(groupOrderId) {
  const src = encodeURIComponent(
    'https://mobile.yangkeduo.com/pincard_ask.html?__rp_name=brand_amazing_price_group&_pdd_tc=ffffff&_pdd_sbs=1&group_order_id=' + groupOrderId + '&refer_share_channel=group_qrcode'
  )
  return 'pages/web/web?share_time=' + Date.now() + '&share_form=custom_card&src=' + src + '&xcx_x_zyw=&from_share=1&refer_share_channel=message&x_scene=1036&refer_share_btn=top_forward&refer_share_source=native&specialUrl=1&refer_share_page=web&card_v=v8.2.3.1&_wv=1'
}

Component({
  properties: {
    group: { type: Object, value: {} },
    showDelete: { type: Boolean, value: false },
    deleteLabel: { type: String, value: '删除' },
    favorited: { type: Boolean, value: false },
    showFav: { type: Boolean, value: true }
  },

  methods: {
    onJoin() {
      const group = this.data.group
      const link = group.promo_url || group.qrcode_url || ''

      let goodsId = group.goods_id || ''
      if (!goodsId && link) {
        const m = link.match(/goods_id[=:](\d+)/) || link.match(/goods[\/=](\d+)/)
        if (m) goodsId = m[1]
      }

      let groupOrderId = group.group_order_id || ''
      if (!groupOrderId && link) {
        const m = link.match(/group_order_id[=:](\d+)/)
        if (m) groupOrderId = m[1]
      }

      if (!link && !goodsId && !groupOrderId) {
        wx.showToast({ title: '未识别到商品信息，请手动搜索', icon: 'none', duration: 2000 })
        return
      }

      wx.showModal({
        title: '拼多多参团',
        content: groupOrderId ? '即将打开拼多多加入该拼团' : '即将打开拼多多商品页',
        confirmText: '立即前往',
        cancelText: '取消',
        confirmColor: '#FF6B35',
        success: res => {
          if (res.confirm) {
            wx.cloud.callFunction({ name: 'copyGroup', data: { groupId: group._id } })

            if (groupOrderId) {
              const path = getGroupJoinPath(groupOrderId)
              wx.navigateToMiniProgram({
                appId: PDD_MAIN_APPID,
                path: path,
                envVersion: 'release',
                success: () => {},
                fail: () => {
                  wx.setClipboardData({
                    data: link,
                    success: () => wx.showToast({ title: '已复制链接，请打开拼多多', icon: 'none', duration: 3000 })
                  })
                }
              })
            } else if (goodsId) {
              const wxappPath = 'package_a/welfare_coupon/welfare_coupon?goods_id=' + goodsId + '&pid=' + PID + '&duoduo_type=2'
              wx.navigateToMiniProgram({
                appId: PDD_FULI_APPID,
                path: wxappPath,
                extraData: { goods_id: goodsId, pid: PID },
                envVersion: 'release',
                success: () => {},
                fail: () => {
                  wx.setClipboardData({
                    data: link,
                    success: () => wx.showToast({ title: '已复制链接，请打开拼多多', icon: 'none', duration: 3000 })
                  })
                }
              })
            } else {
              wx.setClipboardData({
                data: link,
                success: () => wx.showToast({ title: '已复制链接，请打开拼多多', icon: 'none', duration: 3000 })
              })
            }
          }
        }
      })
    },

    onImageTap() {
      const group = this.data.group
      if (group.image_url) {
        wx.previewImage({ urls: [group.image_url], current: group.image_url })
      }
    },

    onShareTap() {
      this.triggerEvent('share', { group: this.data.group })
    },

    onDelete() {
      const label = this.data.deleteLabel || '删除'
      wx.showModal({
        title: '确认' + label,
        content: label === '取消收藏' ? '确定要取消收藏吗？' : '删除后无法恢复',
        confirmColor: '#FF6B35',
        success: res => {
          if (res.confirm) {
            this.triggerEvent('delete', { group: this.data.group })
          }
        }
      })
    },

    onFavorite() {
      this.triggerEvent('fav', { group: this.data.group })
    }
  }
})
