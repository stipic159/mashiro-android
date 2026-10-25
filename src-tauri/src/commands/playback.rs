use tauri::{AppHandle, Manager, State};

use crate::state::AppState;
use crate::yandex::{LyricsDto, StreamDto, Yandex};

#[tauri::command]
pub async fn get_stream(
    id: String,
    quality: Option<String>,
    state: State<'_, AppState>,
) -> Result<StreamDto, String> {
    let session = state.session()?;
    let quality = quality.unwrap_or_else(|| "lossless".to_string());
    Yandex::new(&session.token).stream(&id, &quality).await
}

#[tauri::command]
pub fn clear_stream_cache() {
    crate::proxy::clear();
}

#[tauri::command]
pub async fn prefetch_stream(url: String) -> Result<(), String> {
    crate::proxy::warm(url).await;
    Ok(())
}

#[tauri::command]
pub async fn get_lyrics(id: String, state: State<'_, AppState>) -> Result<LyricsDto, String> {
    let session = state.session()?;
    Yandex::new(&session.token).lyrics(&id).await
}

fn safe_name(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            other => other,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

fn base_audio_dir(app: &AppHandle) -> std::path::PathBuf {
    app.path()
        .audio_dir()
        .or_else(|_| app.path().download_dir())
        .unwrap_or_else(|_| std::path::PathBuf::from("/storage/emulated/0/Music"))
        .join("Mashiro")
}

#[tauri::command]
pub fn default_download_dir(app: AppHandle) -> Result<String, String> {
    Ok(base_audio_dir(&app).to_string_lossy().to_string())
}

fn resolve_dir(app: &AppHandle, dir: Option<String>) -> Result<std::path::PathBuf, String> {
    if let Some(custom) = dir.map(|d| d.trim().to_string()).filter(|d| !d.is_empty()) {
        return Ok(std::path::PathBuf::from(custom));
    }
    Ok(base_audio_dir(app))
}

#[tauri::command]
pub fn find_local_track(
    app: AppHandle,
    id: String,
    dir: Option<String>,
) -> Result<Option<String>, String> {
    let root = resolve_dir(&app, dir)?;
    if !root.exists() {
        return Ok(None);
    }
    let marker = format!("[{id}]");
    let entries = std::fs::read_dir(&root).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let stem = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        if stem.ends_with(&marker) {
            return Ok(Some(path.to_string_lossy().to_string()));
        }
    }
    Ok(None)
}

#[tauri::command]
pub fn get_downloaded_track_ids(
    app: AppHandle,
    dir: Option<String>,
) -> Result<Vec<String>, String> {
    let root = resolve_dir(&app, dir)?;
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut ids = Vec::new();
    let entries = match std::fs::read_dir(&root) {
        Ok(e) => e,
        Err(_) => return Ok(Vec::new()),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
            if let Some(start) = stem.rfind('[') {
                if let Some(end) = stem.rfind(']') {
                    if start < end {
                        ids.push(stem[start + 1..end].to_string());
                    }
                }
            }
        }
    }
    Ok(ids)
}

#[tauri::command]
pub async fn download_track(
    app: AppHandle,
    id: String,
    name: String,
    quality: Option<String>,
    dir: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let session = state.session()?;
    let client = Yandex::new(&session.token);
    let quality = quality.unwrap_or_else(|| "lossless".to_string());

    let target_dir = resolve_dir(&app, dir)?;
    std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let stream = client.stream(&id, &quality).await?;
    let bytes = client.download_bytes(&stream.url).await?;

    let ext = match stream.codec.as_str() {
        "flac" => "flac",
        "aac" => "m4a",
        _ => "mp3",
    };
    let file = target_dir.join(format!("{} [{id}].{ext}", safe_name(&name)));
    std::fs::write(&file, bytes).map_err(|e| e.to_string())?;

    Ok(file.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn download_image(app: AppHandle, url: String, name: String) -> Result<String, String> {
    let mut clean = url.trim().to_string();
    if clean.starts_with('{') && clean.ends_with('}') {
        clean = clean[1..clean.len() - 1].to_string();
    }
    if clean.starts_with("//") {
        clean = format!("https:{clean}");
    } else if !clean.starts_with("http") {
        clean = format!("https://{clean}");
    }

    let bytes = reqwest::Client::new()
        .get(&clean)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    let mut target = app
        .path()
        .picture_dir()
        .or_else(|_| app.path().download_dir())
        .map_err(|e| e.to_string())?
        .join("Mashiro");
    std::fs::create_dir_all(&target).ok();
    target.push(format!("{}.jpg", safe_name(&name)));
    std::fs::write(&target, &bytes).map_err(|e| e.to_string())?;

    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub fn import_local_track(
    app: AppHandle,
    id: String,
    name: String,
    bytes: Option<Vec<u8>>,
    base64_data: Option<String>,
    dir: Option<String>,
) -> Result<String, String> {
    use base64::engine::general_purpose::STANDARD as BASE64;
    use base64::Engine as _;

    let raw_bytes = if let Some(b) = bytes {
        b
    } else if let Some(b64) = base64_data {
        BASE64.decode(b64.trim()).map_err(|e| format!("Base64 decode error: {e}"))?
    } else {
        return Err("No data provided for import".to_string());
    };

    let target_dir = resolve_dir(&app, dir)?;
    std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let lower = name.to_lowercase();
    let ext = if lower.ends_with(".flac") {
        "flac"
    } else if lower.ends_with(".m4a") || lower.ends_with(".aac") {
        "m4a"
    } else if lower.ends_with(".ogg") {
        "ogg"
    } else if lower.ends_with(".wav") {
        "wav"
    } else {
        "mp3"
    };

    let clean_stem = if let Some(dot_idx) = name.rfind('.') {
        &name[..dot_idx]
    } else {
        &name
    };

    let file = target_dir.join(format!("{} [{id}].{ext}", safe_name(clean_stem)));
    std::fs::write(&file, &raw_bytes).map_err(|e| e.to_string())?;

    Ok(file.to_string_lossy().to_string())
}

#[tauri::command]
pub fn remove_local_track(
    app: AppHandle,
    id: String,
    dir: Option<String>,
) -> Result<bool, String> {
    match find_local_track(app, id, dir)? {
        Some(path) => {
            std::fs::remove_file(path).map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => Ok(false),
    }
}

#[tauri::command]
pub fn downloads_info(app: AppHandle, dir: Option<String>) -> Result<(u32, u64), String> {
    let root = resolve_dir(&app, dir)?;
    if !root.exists() {
        return Ok((0, 0));
    }
    let mut count = 0u32;
    let mut bytes = 0u64;
    for entry in std::fs::read_dir(&root).map_err(|e| e.to_string())?.flatten() {
        if let Ok(meta) = entry.metadata() {
            if meta.is_file() {
                count += 1;
                bytes += meta.len();
            }
        }
    }
    Ok((count, bytes / 1024 / 1024))
}
