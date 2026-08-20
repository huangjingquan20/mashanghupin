function formatTime(date) {
  const year = date.getFullYear()
  const month = padZero(date.getMonth() + 1)
  const day = padZero(date.getDate())
  const hour = padZero(date.getHours())
  const minute = padZero(date.getMinutes())
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function padZero(n) {
  return n < 10 ? '0' + n : n
}

function timeAgo(dateStr) {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return '刚刚'
  if (diff < hour) return Math.floor(diff / minute) + '分钟前'
  if (diff < day) return Math.floor(diff / hour) + '小时前'
  if (diff < 7 * day) return Math.floor(diff / day) + '天前'
  return formatTime(new Date(dateStr))
}

function isValidUrl(url) {
  return /^https?:\/\/.+/.test(url)
}

function showToast(title, icon = 'none') {
  wx.showToast({ title, icon, duration: 2000 })
}

module.exports = {
  formatTime,
  timeAgo,
  isValidUrl,
  showToast
}
