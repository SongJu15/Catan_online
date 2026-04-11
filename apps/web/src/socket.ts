import { io } from 'socket.io-client'

// 👇 就是改了这里，把 localhost 换成了公网 IP
const socket = io('http://124.222.7.192:3001', {
  autoConnect: true,
  reconnection: true,           // 自动重连
  reconnectionAttempts: 10,     // 最多尝试10次
  reconnectionDelay: 1000,      // 第一次等1秒
  reconnectionDelayMax: 5000,   // 最长等5秒
})

socket.on('connect', () => {
  console.log('✅ Socket 已连接:', socket.id)
})

socket.on('disconnect', (reason) => {
  console.log('❌ Socket 已断开，原因:', reason)
})

socket.on('connect_error', (error) => {
  console.error('❌ Socket 连接失败:', error)
})

export default socket
