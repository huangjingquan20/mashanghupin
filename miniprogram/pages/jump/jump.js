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

Page({
  data: { tip: '加载中...' },
  _triggered: false,

  onLoad(query) {
    const groupOrderId = query.group_order_id || ''
    const goodsId = query.goods_id || ''

    if (!groupOrderId && !goodsId) {
      this.setData({ tip: '参数错误' })
      wx.switchTab({ url: '/pages/home/home' })
      return
    }

    if (groupOrderId) {
      wx.navigateToMiniProgram({
        appId: PDD_MAIN_APPID,
        path: getGroupJoinPath(groupOrderId),
        envVersion: 'release',
        complete: () => { this._triggered = true }
      })
    } else if (goodsId) {
      wx.navigateToMiniProgram({
        appId: PDD_FULI_APPID,
        path: 'package_a/welfare_coupon/welfare_coupon?goods_id=' + goodsId + '&pid=' + PID + '&duoduo_type=2',
        extraData: { goods_id: goodsId, pid: PID },
        envVersion: 'release',
        complete: () => { this._triggered = true }
      })
    }
  },

  onShow() {
    if (this._triggered) {
      wx.switchTab({ url: '/pages/home/home' })
    }
  }
})
