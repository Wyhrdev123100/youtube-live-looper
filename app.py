from flask import Flask, render_template, request, redirect, url_for, flash
import subprocess
import os
import threading
import time

app = Flask(__name__)
app.secret_key = "supersecretkey"

UPLOAD_FOLDER = '/data'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

current_process = None
current_video = None
stream_key = None

def stream_loop(video_path, key):
    global current_process
    rtmp_url = f"rtmp://a.rtmp.youtube.com/live2/{key}"
    
    command = [
        'ffmpeg', '-re', '-stream_loop', '-1', '-i', video_path,
        '-c:v', 'libx264', '-preset', 'veryfast', '-maxrate', '4500k',
        '-bufsize', '9000k', '-pix_fmt', 'yuv420p', '-g', '50',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
        '-f', 'flv', rtmp_url
    ]
    
    current_process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    print("Đã bắt đầu live loop...")

@app.route('/', methods=['GET', 'POST'])
def index():
    global current_process, current_video, stream_key

    if request.method == 'POST':
        if 'video' in request.files:
            file = request.files['video']
            if file.filename != '':
                filepath = os.path.join(UPLOAD_FOLDER, file.filename)
                file.save(filepath)
                current_video = filepath
                flash(f'Đã tải video: {file.filename}', 'success')

        elif 'start' in request.form:
            key = request.form.get('stream_key', '').strip()
            if not current_video:
                flash('Chưa upload video!', 'danger')
            elif not key:
                flash('Chưa nhập Stream Key!', 'danger')
            else:
                stream_key = key
                threading.Thread(target=stream_loop, args=(current_video, key), daemon=True).start()
                flash('ĐÃ BẮT ĐẦU LIVE LOOP 24/7!', 'success')

        elif 'stop' in request.form:
            if current_process:
                current_process.terminate()
                current_process = None
                flash('Đã dừng stream.', 'info')

    status = "🟢 Đang LIVE (Loop)" if current_process and current_process.poll() is None else "🔴 Dừng"
    video_name = os.path.basename(current_video) if current_video else "Chưa có video"

    return render_template('index.html', status=status, video_name=video_name)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
