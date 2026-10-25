use serde::{Deserialize, Serialize};
#[allow(unused_imports)]
use tauri::{AppHandle, Manager, Runtime};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativePlayPayload {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub cover_url: Option<String>,
    pub stream_url: String,
    pub start_position_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSeekPayload {
    pub position_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeVolumePayload {
    pub volume: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeRatePayload {
    pub rate: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeRepeatPayload {
    pub mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeFullscreenPayload {
    pub open: bool,
}

#[tauri::command]
pub async fn media_play<R: Runtime>(
    app: AppHandle<R>,
    payload: NativePlayPayload,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Some(plugin) = app.try_state::<crate::MediaPluginHandle<R>>() {
            return plugin
                .0
                .run_mobile_plugin("play", payload)
                .map_err(|e| e.to_string());
        }
    }
    let _ = (app, payload);
    Ok(())
}

#[tauri::command]
pub async fn media_prepare_next<R: Runtime>(
    app: AppHandle<R>,
    payload: NativePlayPayload,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Some(plugin) = app.try_state::<crate::MediaPluginHandle<R>>() {
            return plugin
                .0
                .run_mobile_plugin("prepareNext", payload)
                .map_err(|e| e.to_string());
        }
    }
    let _ = (app, payload);
    Ok(())
}

#[tauri::command]
pub async fn media_pause<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Some(plugin) = app.try_state::<crate::MediaPluginHandle<R>>() {
            return plugin
                .0
                .run_mobile_plugin("pause", ())
                .map_err(|e| e.to_string());
        }
    }
    let _ = app;
    Ok(())
}

#[tauri::command]
pub async fn media_resume<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Some(plugin) = app.try_state::<crate::MediaPluginHandle<R>>() {
            return plugin
                .0
                .run_mobile_plugin("resume", ())
                .map_err(|e| e.to_string());
        }
    }
    let _ = app;
    Ok(())
}

#[tauri::command]
pub async fn media_seek<R: Runtime>(
    app: AppHandle<R>,
    position_ms: i64,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Some(plugin) = app.try_state::<crate::MediaPluginHandle<R>>() {
            return plugin
                .0
                .run_mobile_plugin("seek", NativeSeekPayload { position_ms })
                .map_err(|e| e.to_string());
        }
    }
    let _ = (app, position_ms);
    Ok(())
}

#[tauri::command]
pub async fn media_set_volume<R: Runtime>(
    app: AppHandle<R>,
    volume: f32,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Some(plugin) = app.try_state::<crate::MediaPluginHandle<R>>() {
            return plugin
                .0
                .run_mobile_plugin("setVolume", NativeVolumePayload { volume })
                .map_err(|e| e.to_string());
        }
    }
    let _ = (app, volume);
    Ok(())
}

#[tauri::command]
pub async fn media_set_playback_rate<R: Runtime>(
    app: AppHandle<R>,
    rate: f32,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Some(plugin) = app.try_state::<crate::MediaPluginHandle<R>>() {
            return plugin
                .0
                .run_mobile_plugin("setPlaybackRate", NativeRatePayload { rate })
                .map_err(|e| e.to_string());
        }
    }
    let _ = (app, rate);
    Ok(())
}

#[tauri::command]
pub async fn media_set_repeat<R: Runtime>(
    app: AppHandle<R>,
    mode: String,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Some(plugin) = app.try_state::<crate::MediaPluginHandle<R>>() {
            return plugin
                .0
                .run_mobile_plugin("setRepeat", NativeRepeatPayload { mode })
                .map_err(|e| e.to_string());
        }
    }
    let _ = (app, mode);
    Ok(())
}

#[tauri::command]
pub async fn media_set_fullscreen<R: Runtime>(
    app: AppHandle<R>,
    open: bool,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Some(plugin) = app.try_state::<crate::MediaPluginHandle<R>>() {
            return plugin
                .0
                .run_mobile_plugin("setFullscreen", NativeFullscreenPayload { open })
                .map_err(|e| e.to_string());
        }
    }
    let _ = (app, open);
    Ok(())
}

#[tauri::command]
pub async fn media_get_status<R: Runtime>(
    app: AppHandle<R>,
) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        if let Some(plugin) = app.try_state::<crate::MediaPluginHandle<R>>() {
            return plugin
                .0
                .run_mobile_plugin("getStatus", ())
                .map_err(|e| e.to_string());
        }
    }
    let _ = app;
    Ok(serde_json::json!({
        "isPlaying": false,
        "positionMs": 0,
        "durationMs": 0
    }))
}

#[tauri::command]
pub async fn media_open_system_equalizer<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Some(plugin) = app.try_state::<crate::MediaPluginHandle<R>>() {
            return plugin
                .0
                .run_mobile_plugin("openSystemEqualizer", ())
                .map_err(|e| e.to_string());
        }
    }
    let _ = app;
    Ok(())
}
