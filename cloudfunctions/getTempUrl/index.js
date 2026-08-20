const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const { fileID } = event
  try {
    const res = await cloud.getTempFileURL({ fileList: [fileID] })
    const item = res.fileList && res.fileList[0]
    if (item && item.tempFileURL) {
      return { url: item.tempFileURL }
    }
    return { url: '', error: item ? item.errMsg : '未知错误' }
  } catch (e) {
    return { url: '', error: e.message }
  }
}
