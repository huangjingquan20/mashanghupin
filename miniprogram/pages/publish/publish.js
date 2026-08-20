Page({
  data: {
    imageUrl: '',
    uploading: false,
    analyzing: false,
    title: '',
    price: '',
    category: '',
    categories: [],
    submitting: false,
    showTutorial: false,
    step: 'upload',
    analyzed: false,
    tutorialImg: '',
    tutorialImgErr: '',
    qrcodeUrl: '',
    goodsId: '',
    groupOrderId: '',
    imageHash: '',
    qrDiag: '',
    textDiag: '',
    showOcrWarning: false,
    linkUrl: '',
    linkRequired: false,
    titleLocked: false,
    matchStatus: ''
  },

  onLoad() {
    this.loadCategories()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
  },

  loadCategories() {
    wx.cloud.callFunction({
      name: 'getCategories',
      success: res => {
        this.setData({ categories: res.result.data || [] })
      },
      fail: () => {
        this.setData({
          categories: [
            { name: '食品饮料' }, { name: '生鲜果蔬' }, { name: '家居日用' },
            { name: '个护美妆' }, { name: '服饰鞋包' },
            { name: '数码家电' }, { name: '宠物用品' }, { name: '其他' }
          ]
        })
      }
    })
  },

  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: res => {
        this.uploadImage(res.tempFiles[0].tempFilePath)
      }
    })
  },

  uploadImage(filePath) {
    this.setData({ uploading: true })
    const cloudPath = 'group-images/' + Date.now() + '-' + Math.random().toString(36).substring(2, 8) + '.jpg'

    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: res => {
        this.setData({ imageUrl: res.fileID, uploading: false, step: 'analyze' })
        this.autoAnalyze(res.fileID)
      },
      fail: () => {
        this.setData({ uploading: false })
        wx.showToast({ title: '上传失败', icon: 'none' })
      }
    })
  },

  autoAnalyze(fileID) {
    this.setData({ analyzing: true })

    wx.cloud.callFunction({
      name: 'analyzeImage',
      data: { fileID },
      success: res => {
        const result = res.result || {}
        const hasTitle = result.success && result.title && result.title !== '拼团商品'

        this.setData({
          title: result.title || '',
          price: result.price || '',
          category: result.category || '',
          step: 'confirm',
          analyzed: !!result.success,
          analyzing: false,
          qrcodeUrl: result.qrcode_url || '',
          goodsId: result.goods_id || '',
          groupOrderId: result.group_order_id || '',
          imageHash: result.image_hash || '',
          qrDiag: result.qr || (result.diag && result.diag.qr) || '',
          textDiag: result.text || (result.diag && result.diag.text) || '',
          showOcrWarning: !result.success || result.title === '拼团商品' || (result.qr && result.qr.indexOf('失败') === 0)
        }, () => {
          if (hasTitle) {
            this.searchByTitle(result.title)
          } else {
            this.setData({
              titleLocked: false,
              linkRequired: true,
              matchStatus: '未识别到商品信息，请填写下方链接'
            })
          }
        })
      },
      fail: () => {
        this.setData({
          title: '',
          price: '',
          qrcodeUrl: '',
          analyzing: false,
          step: 'confirm',
          analyzed: false,
          titleLocked: false,
          linkRequired: true,
          matchStatus: '识别失败，请手动填写信息'
        })
      }
    })
  },

  searchByTitle(title) {
    this.setData({ matchStatus: '正在匹配商品...' })
    wx.cloud.callFunction({
      name: 'searchByTitle',
      data: { title },
      success: res => {
        const r = res.result || {}
        if (r.found) {
          this.setData({
            goodsId: String(r.goods_id),
            titleLocked: true,
            linkRequired: false,
            matchStatus: '已自动匹配到商品'
          })
        } else {
          this.setData({
            titleLocked: false,
            linkRequired: true,
            matchStatus: '未匹配到商品，请填写下方链接'
          })
        }
      },
      fail: () => {
        this.setData({
          titleLocked: false,
          linkRequired: true,
          matchStatus: '匹配失败，请填写下方链接'
        })
      }
    })
  },

  onDeleteImage() {
    this.setData({
      imageUrl: '',
      title: '', price: '', category: '', qrcodeUrl: '', goodsId: '', imageHash: '',
      step: 'upload', analyzed: false,
      linkUrl: '', linkRequired: false, titleLocked: false, matchStatus: ''
    })
  },

  onShowTutorial() {
    this.setData({ showTutorial: true, tutorialImgErr: '' })
    if (!this.data.tutorialImg) {
      const fileID = 'cloud://YOUR_CLOUD_ENV_ID.636c-YOUR_CLOUD_ENV_ID-1428663391/tutorial/箭头指引图片.jpg'
      wx.cloud.callFunction({
        name: 'getTempUrl',
        data: { fileID },
        success: res => {
          const result = res.result || {}
          if (result.url) {
            this.setData({ tutorialImg: result.url })
          } else {
            this.setData({ tutorialImgErr: result.error || '获取URL失败' })
          }
        },
        fail: err => {
          this.setData({ tutorialImgErr: '云函数调用失败: ' + (err.errMsg || JSON.stringify(err)) })
        }
      })
    }
  },

  onTutorialImgError(e) {
    this.setData({ tutorialImgErr: e.detail.errMsg || '加载失败' })
  },

  onCloseTutorial() {
    this.setData({ showTutorial: false })
  },

  onCategorySelect(e) {
    this.setData({ category: e.currentTarget.dataset.name })
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value })
  },

  onPriceInput(e) {
    this.setData({ price: e.detail.value })
  },

  onLinkInput(e) {
    this.setData({ linkUrl: e.detail.value })
  },

  onSubmit() {
    this.preparePublish(false)
  },

  preparePublish(force) {
    const { title, price, category, imageUrl, submitting, linkUrl, qrcodeUrl, goodsId, groupOrderId, imageHash, linkRequired } = this.data
    if (submitting) return
    if (!category) return wx.showToast({ title: '请选择分类', icon: 'none' })
    if (!title || !title.trim()) return wx.showToast({ title: '请输入商品标题', icon: 'none' })
    if (linkRequired && !linkUrl) return wx.showToast({ title: '请粘贴拼多多链接', icon: 'none' })

    this.setData({ submitting: true })

    const doPublish = (gid, gOrderId, link) => {
      wx.cloud.callFunction({
        name: 'createGroup',
        data: {
          title: title.trim(), description: '',
          image_url: imageUrl, price,
          qrcode_url: link,
          goods_id: gid,
          group_order_id: gOrderId,
          image_hash: imageHash,
          category, force: !!force
        },
        success: res => {
          const result = res.result || {}
          if (!result.success) {
            if (result.duplicate) {
              wx.showModal({
                title: '已有同款',
                content: '已有同款「' + (result.dupTitle || '') + '」¥' + (result.dupPrice || ''),
                confirmText: '去参团',
                cancelText: '发起我的拼团',
                confirmColor: 'var(--primary)',
                success: r => {
                  if (r.confirm) {
                    wx.switchTab({ url: '/pages/home/home' })
                  } else {
                    this.preparePublish(true)
                  }
                }
              })
              this.setData({ submitting: false })
              return
            }
            wx.showToast({ title: result.message || '发布失败', icon: 'none', duration: 3000 })
            this.setData({ submitting: false })
            return
          }
          this.resetForm()
          this.showSuccessModal()
        },
        fail: () => {
          wx.showToast({ title: '发布失败', icon: 'none' })
          this.setData({ submitting: false })
        }
      })
    }

    const link = linkUrl || qrcodeUrl
    if (linkUrl) {
      wx.cloud.callFunction({
        name: 'resolveLink',
        data: { link: linkUrl },
        success: resolveRes => {
          const rr = resolveRes.result || {}
          if (rr.error) {
            wx.showToast({ title: rr.error, icon: 'none', duration: 3000 })
            this.setData({ submitting: false })
            return
          }
          doPublish(rr.goods_id || goodsId, rr.group_order_id || groupOrderId, linkUrl)
        },
        fail: () => {
          wx.showToast({ title: '链接解析失败', icon: 'none', duration: 3000 })
          this.setData({ submitting: false })
        }
      })
    } else {
      doPublish(goodsId, groupOrderId, qrcodeUrl)
    }
  },

  showSuccessModal() {
    wx.showModal({
      title: '发布成功',
      content: '如果每个人发布后，\n也拼一单别人的，\n这圈子就转起来了——\n\n你帮我，我帮他，\n大家都能拿到好物。\n\n现在去看看，\n也帮别人补一单吧？',
      confirmText: '去看看',
      cancelText: '不用了',
      confirmColor: '#FF6B35',
      success: () => {
        getApp().globalData.needRefreshHome = true
        wx.switchTab({ url: '/pages/home/home' })
      }
    })
  },

  resetForm() {
    this.setData({
      imageUrl: '', uploading: false, analyzing: false,
      title: '', price: '', category: '', qrcodeUrl: '', goodsId: '', groupOrderId: '', imageHash: '',
      submitting: false, step: 'upload', analyzed: false, showOcrWarning: false,
      linkUrl: '', linkRequired: false, titleLocked: false, matchStatus: ''
    })
  }
})
