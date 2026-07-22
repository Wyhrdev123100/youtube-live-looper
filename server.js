const express = require('express');
const multer = require('multer');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Setup =====
const UPLOAD_DIR = '/data/uploads';
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ===== State =====
let ffmpegProcess = null;
let currentVideo = null;
let isStreaming = false;
let streamLog = [];

// ===== Middleware =====
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(session({
  secret: 'youtube-live-secret-2024',
  resave: false,
  saveUninitialized: true
}));

// ===== Multer Upload =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = Date.now() + '_' + file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, safe);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5GB
  fileFilter: (req, file, cb) => {
    const allowed = /mp4|mkv|avi|mov|flv|webm/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ hỗ trợ file video!'));
    }
  }
});

// ===== Functions =====
function addLog(msg) {
  const time = new Date().toLocaleTimeString('vi-VN');
  const entry = `[${time}] ${msg}`;
  streamLog.push(entry);
  if (streamLog.length > 100) streamLog.shift();
  console.log(entry);
}

function startStream(videoPath, streamKey) {
  if (ffmpegProcess) {
    ffmpegProcess.kill('SIGKILL');
    ffmpegProcess = null;
  }

  const rtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;

  addLog(`🎬 Bắt đầu stream: ${path.basename(videoPath)}`);
  addLog(`📡 RTMP: ${rtmpUrl.replace(streamKey, '****')}`);

  const args = [
    '-re',
    '-stream_loop', '-1',
    '-i', videoPath,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-b:v', '3000k',
    '-maxrate', '3500k',
    '-bufsize', '6000k',
    '-pix_fmt', 'yuv420p',
    '-g', '60',
    '-keyint_min', '60',
    '-sc_threshold', '0',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-ar', '44100',
    '-f', 'flv',
    rtmpUrl
  ];

  ffmpegProcess = spawn('ffmpeg', args);
  isStreaming = true;

  ffmpegProcess.stderr.on('data', (data) => {
    const text = data.toString();
    if (text.includes('frame=') || text.includes('fps=') || text.includes('time=')) {
      const match = text.match(/time=(\S+)/);
      if (match) addLog(`⏱️ Thời gian stream: ${match[1]}`);
    }
    if (text.includes('Error') || text.includes('error')) {
      addLog(`❌ Lỗi: ${text.trim().substring(0, 100)}`);
    }
  });

  ffmpegProcess.on('close', (code) => {
    addLog(`⚠️ FFmpeg kết thúc với code: ${code}`);
    isStreaming = false;
    ffmpegProcess = null;
  });

  ffmpegProcess.on('error', (err) => {
    addLog(`❌ Lỗi spawn FFmpeg: ${err.message}`);
    isStreaming = false;
  });
}

function stopStream() {
  if (ffmpegProcess) {
    ffmpegProcess.kill('SIGKILL');
    ffmpegProcess = null;
  }
  isStreaming = false;
  addLog('⛔ Đã dừng stream.');
}

// ===== Routes =====

// Trang chính
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Upload video
app.post('/upload', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.json({ success: false, message: 'Không có file nào được tải lên!' });
  }
  currentVideo = req.file.path;
  addLog(`✅ Đã upload: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(1)} MB)`);
  res.json({
    success: true,
    message: `Đã tải lên: ${req.file.originalname}`,
    filename: req.file.originalname,
    size: (req.file.size / 1024 / 1024).toFixed(1) + ' MB'
  });
});

// Bắt đầu stream
app.post('/start', (req, res) => {
  const { streamKey } = req.body;

  if (!currentVideo) {
    return res.json({ success: false, message: 'Chưa có video! Hãy upload video trước.' });
  }
  if (!streamKey || streamKey.trim() === '') {
    return res.json({ success: false, message: 'Chưa nhập Stream Key!' });
  }
  if (!fs.existsSync(currentVideo)) {
    currentVideo = null;
    return res.json({ success: false, message: 'File video không tồn tại!' });
  }

  startStream(currentVideo, streamKey.trim());
  res.json({ success: true, message: '🚀 Đã bắt đầu live loop 24/7!' });
});

// Dừng stream
app.post('/stop', (req, res) => {
  stopStream();
  res.json({ success: true, message: '⛔ Đã dừng stream!' });
});

// Lấy trạng thái
app.get('/status', (req, res) => {
  res.json({
    isStreaming,
    videoName: currentVideo ? path.basename(currentVideo) : null,
    logs: streamLog.slice(-20)
  });
});

// ===== Start Server =====
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server chạy tại http://0.0.0.0:${PORT}`);
  addLog(`🚀 Server khởi động tại port ${PORT}`);
});
