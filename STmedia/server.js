const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Создаем папку для загрузок, если её нет
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

// Настройка хранилища видео и файлов
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Хранилище в памяти (для примера)
const users = {}; // { username: { password, nickname, uzx } }
const channels = [];
const flashes = [];

// API: Регистрация / Вход
app.post('/api/auth', (req, res) => {
  const { username, password, nickname, uzx } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Заполните поля' });

  if (users[username]) {
    if (users[username].password !== password) {
      return res.status(401).json({ error: 'Неверный пароль' });
    }
  } else {
    users[username] = { password, nickname: nickname || username, uzx: uzx || '🔥 В STmedia' };
  }

  res.json({ success: true, user: users[username], username });
});

// API: Загрузка Flash видео
app.post('/api/flash/upload', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  
  const flashItem = {
    id: Date.now(),
    videoUrl: `/uploads/${req.file.filename}`,
    author: req.body.username || 'Аноним',
    uzx: req.body.uzx || ''
  };
  flashes.unshift(flashItem);
  res.json({ success: true, flash: flashItem });
});

// API: Получение списка Flash
app.get('/api/flash', (req, res) => {
  res.json(flashes);
});

// Socket.IO: Обработка сообщений в реальном времени и звонков
io.on('connection', (socket) => {
  socket.on('join', (data) => {
    socket.username = data.username;
    socket.join(data.username);
  });

  // Отправка сообщения
  socket.on('private_message', ({ to, message, sender, uzx }) => {
    io.to(to).emit('receive_message', { sender, message, uzx });
    socket.emit('receive_message', { sender, message, uzx });
  });

  // Сигналинг для WebRTC Звонков
  socket.on('call_user', ({ to, offer, type }) => {
    io.to(to).emit('incoming_call', { from: socket.username, offer, type });
  });

  socket.on('answer_call', ({ to, answer }) => {
    io.to(to).emit('call_accepted', { answer });
  });

  socket.on('ice_candidate', ({ to, candidate }) => {
    io.to(to).emit('ice_candidate', { candidate });
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер STmedia запущен на http://localhost:${PORT}`);
});