import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  autoConnect: true,
});

socket.on('connect', () => {
  console.log('✅ Socket 已连接:', socket.id);
});

socket.on('disconnect', () => {
  console.log('❌ Socket 已断开');
});

socket.on('connect_error', (error) => {
  console.error('❌ Socket 连接失败:', error);
});

export default socket;
