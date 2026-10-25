use std::sync::{Arc, Mutex, OnceLock};
use std::net::SocketAddr;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::watch;

static SYNC_STATE: OnceLock<Arc<Mutex<ServerState>>> = OnceLock::new();

struct ServerState {
    running: bool,
    port: u16,
    stop_tx: Option<watch::Sender<bool>>,
    music_dir: PathBuf,
}

fn get_state(app: &AppHandle) -> Arc<Mutex<ServerState>> {
    SYNC_STATE
        .get_or_init(|| {
            let music_dir = app
                .path()
                .audio_dir()
                .or_else(|_| app.path().download_dir())
                .unwrap_or_else(|_| PathBuf::from("/storage/emulated/0/Music"))
                .join("Mashiro");
            let _ = std::fs::create_dir_all(&music_dir);

            Arc::new(Mutex::new(ServerState {
                running: false,
                port: 8765,
                stop_tx: None,
                music_dir,
            }))
        })
        .clone()
}

pub fn get_local_ip() -> Option<String> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    Some(socket.local_addr().ok()?.ip().to_string())
}

#[tauri::command]
pub async fn start_sync_server(app: AppHandle) -> Result<String, String> {
    let state_arc = get_state(&app);
    let music_dir = {
        let state = state_arc.lock().map_err(|e| e.to_string())?;
        if state.running {
            let ip = get_local_ip().unwrap_or_else(|| "127.0.0.1".to_string());
            return Ok(format!("http://{}:{}/", ip, state.port));
        }
        state.music_dir.clone()
    };

    let port = 8765;
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = TcpListener::bind(addr).await.map_err(|e| e.to_string())?;

    let (stop_tx, mut stop_rx) = watch::channel(false);
    {
        let mut state = state_arc.lock().map_err(|e| e.to_string())?;
        state.running = true;
        state.port = port;
        state.stop_tx = Some(stop_tx);
    }

    let state_clone = state_arc.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::select! {
                Ok((socket, _)) = listener.accept() => {
                    let dir = music_dir.clone();
                    tokio::spawn(async move {
                        let _ = handle_client(socket, dir).await;
                    });
                }
                _ = stop_rx.changed() => {
                    if *stop_rx.borrow() {
                        break;
                    }
                }
            }
        }
        if let Ok(mut s) = state_clone.lock() {
            s.running = false;
        }
    });

    let ip = get_local_ip().unwrap_or_else(|| "127.0.0.1".to_string());
    Ok(format!("http://{}:{}/", ip, port))
}

#[tauri::command]
pub fn stop_sync_server(app: AppHandle) -> Result<(), String> {
    let state_arc = get_state(&app);
    let mut state = state_arc.lock().map_err(|e| e.to_string())?;
    if let Some(tx) = state.stop_tx.take() {
        let _ = tx.send(true);
    }
    state.running = false;
    Ok(())
}

#[tauri::command]
pub fn is_sync_server_running(app: AppHandle) -> bool {
    get_state(&app).lock().map(|s| s.running).unwrap_or(false)
}

const HTML_PAGE: &str = r#"<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mashiro Wi-Fi Sync</title>
<style>
  body {
    margin: 0;
    padding: 24px;
    background: #09090b;
    color: #f5f5f7;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100vh;
    box-sizing: border-box;
  }
  .card {
    width: 100%;
    max-width: 560px;
    background: #151518;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 20px;
    padding: 28px;
    box-shadow: 0 16px 40px rgba(0,0,0,0.5);
  }
  h1 { margin: 0 0 8px; font-size: 24px; color: #fa2d48; }
  p { color: rgba(255,255,255,0.65); font-size: 14px; line-height: 1.5; margin: 0 0 20px; }
  .dropzone {
    border: 2px dashed rgba(250,45,72,0.5);
    border-radius: 16px;
    padding: 40px 20px;
    text-align: center;
    background: rgba(250,45,72,0.04);
    cursor: pointer;
    transition: all 0.2s;
  }
  .dropzone.hover {
    background: rgba(250,45,72,0.12);
    border-color: #fa2d48;
  }
  .track-id-input {
    width: 100%;
    box-sizing: border-box;
    padding: 12px 14px;
    margin-top: 14px;
    border-radius: 10px;
    background: #1c1c20;
    border: 1px solid rgba(255,255,255,0.15);
    color: #fff;
    font-size: 14px;
  }
  .track-id-input:focus { outline: none; border-color: #fa2d48; }
  .btn {
    width: 100%;
    padding: 14px;
    background: #fa2d48;
    color: #fff;
    border: none;
    border-radius: 12px;
    font-weight: 600;
    font-size: 15px;
    cursor: pointer;
    margin-top: 16px;
    transition: opacity 0.2s;
  }
  .btn:hover { opacity: 0.9; }
  .status { margin-top: 16px; font-size: 14px; text-align: center; }
</style>
</head>
<body>
<div class="card">
  <h1>Mashiro Wi-Fi Sync</h1>
  <p>Синхронизация треков с компьютером по домашней сети. Перетащите аудиофайл (.mp3 / .flac), чтобы заменить трек на телефоне.</p>
  
  <div class="dropzone" id="dropzone">
    <div id="dropText">Перетащите сюда аудиофайл или нажмите для выбора</div>
    <input type="file" id="fileInput" accept="audio/*" style="display:none">
  </div>

  <input type="text" id="trackId" class="track-id-input" placeholder="ID трека (опционально, если не в имени файла)">

  <button class="btn" id="uploadBtn">Отправить на телефон</button>
  <div class="status" id="status"></div>
</div>

<script>
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const dropText = document.getElementById('dropText');
  const trackIdInput = document.getElementById('trackId');
  const uploadBtn = document.getElementById('uploadBtn');
  const status = document.getElementById('status');

  let selectedFile = null;

  dropzone.onclick = () => fileInput.click();
  fileInput.onchange = (e) => {
    if (e.target.files.length) {
      selectedFile = e.target.files[0];
      dropText.innerText = selectedFile.name;
    }
  };

  dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('hover'); };
  dropzone.ondragleave = () => dropzone.classList.remove('hover');
  dropzone.ondrop = (e) => {
    e.preventDefault();
    dropzone.classList.remove('hover');
    if (e.dataTransfer.files.length) {
      selectedFile = e.dataTransfer.files[0];
      dropText.innerText = selectedFile.name;
    }
  };

  uploadBtn.onclick = async () => {
    if (!selectedFile) {
      status.innerText = 'Выберите аудиофайл';
      status.style.color = '#ef4444';
      return;
    }
    status.innerText = 'Загрузка на телефон...';
    status.style.color = '#fff';

    try {
      const id = trackIdInput.value.trim();
      const filename = id ? `${selectedFile.name.replace(/\.[^/.]+$/, "")} [${id}].mp3` : selectedFile.name;
      const res = await fetch('/upload?filename=' + encodeURIComponent(filename), {
        method: 'POST',
        body: selectedFile
      });
      const data = await res.json();
      if (data.ok) {
        status.innerText = 'Успешно сохранено на телефоне: ' + data.filename;
        status.style.color = '#22c55e';
      } else {
        status.innerText = 'Ошибка сохранения: ' + (data.error || 'неизвестно');
        status.style.color = '#ef4444';
      }
    } catch (err) {
      status.innerText = 'Ошибка соединения: ' + err.message;
      status.style.color = '#ef4444';
    }
  };
</script>
</body>
</html>"#;

const MAX_HEADER_SIZE: usize = 16 * 1024;
const MAX_FILE_SIZE: usize = 200 * 1024 * 1024; // 200 MB

async fn handle_client(mut stream: TcpStream, music_dir: PathBuf) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut header_buf = Vec::new();
    let mut header_end = 0;
    let mut temp = [0u8; 2048];

    while header_buf.len() < MAX_HEADER_SIZE {
        let n = stream.read(&mut temp).await?;
        if n == 0 {
            return Ok(());
        }
        header_buf.extend_from_slice(&temp[..n]);
        if let Some(pos) = header_buf.windows(4).position(|w| w == b"\r\n\r\n") {
            header_end = pos + 4;
            break;
        }
    }

    if header_end == 0 {
        let resp = "HTTP/1.1 431 Request Header Fields Too Large\r\nConnection: close\r\n\r\n";
        stream.write_all(resp.as_bytes()).await?;
        return Ok(());
    }

    let header_str = String::from_utf8_lossy(&header_buf[..header_end]);
    let first_line = header_str.lines().next().unwrap_or("");

    if first_line.starts_with("GET / ") || first_line.starts_with("GET /index.html") {
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            HTML_PAGE.len(),
            HTML_PAGE
        );
        stream.write_all(response.as_bytes()).await?;
        return Ok(());
    }

    if first_line.starts_with("POST /upload") {
        let raw_filename = header_str
            .lines()
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
            .and_then(|uri| uri.split('?').nth(1))
            .and_then(|query| {
                query.split('&').find_map(|pair| {
                    let mut parts = pair.split('=');
                    if parts.next() == Some("filename") {
                        parts.next()
                    } else {
                        None
                    }
                })
            })
            .and_then(|enc| urlencoding_decode(enc).ok())
            .unwrap_or_else(|| "track.mp3".to_string());

        let filename = sanitize_filename(&raw_filename);

        let content_length = header_str
            .lines()
            .find(|l| l.to_lowercase().starts_with("content-length:"))
            .and_then(|l| l.split(':').nth(1))
            .and_then(|v| v.trim().parse::<usize>().ok())
            .unwrap_or(0);

        if content_length > MAX_FILE_SIZE {
            let resp = "HTTP/1.1 413 Payload Too Large\r\nConnection: close\r\n\r\n";
            stream.write_all(resp.as_bytes()).await?;
            return Ok(());
        }

        let initial_body = &header_buf[header_end..];
        let file_path = music_dir.join(&filename);

        let mut file = match tokio::fs::File::create(&file_path).await {
            Ok(f) => f,
            Err(e) => {
                let json_body = format!(r#"{{"ok":false,"error":"{}"}}"#, e);
                let response = format!(
                    "HTTP/1.1 500 Internal Server Error\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    json_body.len(),
                    json_body
                );
                stream.write_all(response.as_bytes()).await?;
                return Ok(());
            }
        };

        let mut written = initial_body.len();
        if !initial_body.is_empty() {
            file.write_all(initial_body).await?;
        }

        let mut chunk = [0u8; 16384];
        while written < content_length {
            let to_read = (content_length - written).min(chunk.len());
            let read_bytes = stream.read(&mut chunk[..to_read]).await?;
            if read_bytes == 0 {
                break;
            }
            file.write_all(&chunk[..read_bytes]).await?;
            written += read_bytes;
        }

        file.flush().await?;

        let json_body = format!(r#"{{"ok":true,"filename":"{}"}}"#, filename);
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            json_body.len(),
            json_body
        );
        stream.write_all(response.as_bytes()).await?;
        return Ok(());
    }

    let not_found = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
    stream.write_all(not_found.as_bytes()).await?;
    Ok(())
}

fn sanitize_filename(raw: &str) -> String {
    let path = std::path::Path::new(raw);
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("track.mp3");

    let clean = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0' => '_',
            other => other,
        })
        .collect::<String>()
        .trim()
        .to_string();

    if clean.is_empty() || clean.starts_with('.') {
        format!("track_{clean}.mp3")
    } else {
        clean
    }
}

fn urlencoding_decode(input: &str) -> Result<String, ()> {
    let mut bytes = Vec::with_capacity(input.len());
    let mut chars = input.chars();
    let mut buf = [0u8; 4];
    while let Some(ch) = chars.next() {
        if ch == '%' {
            let h1 = chars.next().ok_or(())?.to_digit(16).ok_or(())?;
            let h2 = chars.next().ok_or(())?.to_digit(16).ok_or(())?;
            bytes.push((h1 * 16 + h2) as u8);
        } else if ch == '+' {
            bytes.push(b' ');
        } else {
            let s = ch.encode_utf8(&mut buf);
            bytes.extend_from_slice(s.as_bytes());
        }
    }
    String::from_utf8(bytes).map_err(|_| ())
}
