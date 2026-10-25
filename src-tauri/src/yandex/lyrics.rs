use super::*;
use super::signer::lyrics_sign;

fn lyrics_from_text(
    track_id: &str,
    text: &str,
    writers: Vec<String>,
) -> Result<LyricsDto, String> {
    let lines = parse_lrc(text);
    if lines.is_empty() {
        return Err("Для этого трека текста нет".to_string());
    }
    let synced = lines.iter().any(|line| line.time_ms > 0);
    Ok(LyricsDto {
        track_id: track_id.to_string(),
        synced,
        lines,
        writers,
    })
}

impl Yandex {
    async fn lyrics_meta(
        &self,
        track_id: &str,
        ts: u64,
        sign: &str,
        format: &str,
    ) -> Result<serde_json::Value, String> {
        let url = format!(
            "{BASE}/tracks/{track_id}/lyrics?format={format}&timeStamp={ts}&sign={}",
            urlencode(sign)
        );
        let resp = self
            .http
            .get(url)
            .timeout(std::time::Duration::from_secs(7))
            .header("Authorization", self.auth())
            .header("X-Yandex-Music-Client", MUSIC_CLIENT)
            .header("Accept", "application/json")
            .header("Accept-Language", "ru")
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let status = resp.status();
        let body: serde_json::Value = resp.json().await.unwrap_or(serde_json::Value::Null);
        if status.as_u16() == 403 {
            return Err("Текст песни доступен только с подпиской Плюс".to_string());
        }
        if !status.is_success() {
            return Err(format!("Текст недоступен: {}", status.as_u16()));
        }
        Ok(body
            .get("result")
            .cloned()
            .unwrap_or(serde_json::Value::Null))
    }

    async fn lyrics_supplement(&self, track_id: &str) -> Result<(String, Vec<String>), String> {
        let url = format!("{BASE}/tracks/{track_id}/supplement");
        let resp = self
            .http
            .get(url)
            .timeout(std::time::Duration::from_secs(7))
            .header("Authorization", self.auth())
            .header("X-Yandex-Music-Client", MUSIC_CLIENT)
            .header("Accept", "application/json")
            .header("Accept-Language", "ru")
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("Текст недоступен: {}", resp.status().as_u16()));
        }
        let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        let node = body
            .get("result")
            .and_then(|r| r.get("lyrics"))
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        let text = node
            .get("fullLyrics")
            .or_else(|| node.get("lyrics"))
            .or_else(|| node.get("text"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if text.trim().is_empty() {
            return Err("Для этого трека текста нет".to_string());
        }
        let writers = node
            .get("textAuthor")
            .and_then(|v| v.as_str())
            .map(|s| {
                s.split(',')
                    .map(|p| p.trim().to_string())
                    .filter(|p| !p.is_empty())
                    .collect::<Vec<String>>()
            })
            .unwrap_or_default();
        Ok((text, writers))
    }

    async fn lyrics_external(&self, track: &TrackDto) -> Result<(String, Vec<String>), String> {
        let artist = track
            .artists
            .first()
            .map(|a| a.name.clone())
            .unwrap_or_default();
        if artist.is_empty() || track.title.is_empty() {
            return Err("Нет данных о треке для поиска текста".to_string());
        }
        let duration = (track.duration_ms.unwrap_or(0) / 1000).max(0);

        let get_url = format!(
            "{}://lrclib.net/api/get?artist_name={}&track_name={}&duration={}",
            "https",
            urlencode(&artist),
            urlencode(&track.title),
            duration
        );
        let mut body = self.lrclib_json(&get_url).await;

        if body.is_none() {
            let search_url = format!(
                "{}://lrclib.net/api/search?artist_name={}&track_name={}",
                "https",
                urlencode(&artist),
                urlencode(&track.title)
            );
            if let Some(list) = self.lrclib_json(&search_url).await {
                if let Some(items) = list.as_array() {
                    body = items
                        .iter()
                        .find(|i| {
                            i.get("syncedLyrics")
                                .and_then(|v| v.as_str())
                                .map(|s| !s.trim().is_empty())
                                .unwrap_or(false)
                        })
                        .or_else(|| items.first())
                        .cloned();
                }
            }
        }

        let body = body.ok_or_else(|| "Текста для этого трека нет".to_string())?;
        let text = body
            .get("syncedLyrics")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .or_else(|| {
                body.get("plainLyrics")
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.trim().is_empty())
            })
            .ok_or_else(|| "Для этого трека текста нет".to_string())?
            .to_string();

        Ok((text, Vec::new()))
    }

    async fn lrclib_json(&self, url: &str) -> Option<serde_json::Value> {
        let resp = self
            .http
            .get(url)
            .timeout(std::time::Duration::from_secs(6))
            .header("Accept", "application/json")
            .header("User-Agent", "Mashiro (https://github.com/mashiro/mashiro)")
            .send()
            .await
            .ok()?;
        if !resp.status().is_success() {
            return None;
        }
        resp.json::<serde_json::Value>().await.ok()
    }

    async fn lyrics_lrclib(&self, track: &TrackDto) -> Result<(String, Vec<String>), String> {
        let artist = track
            .artists
            .first()
            .map(|a| a.name.clone())
            .unwrap_or_default();
        let album = track.album_title.clone().unwrap_or_default();
        let duration = (track.duration_ms.unwrap_or(0) / 1000).max(0);

        let pick = |body: &serde_json::Value| -> Option<String> {
            let synced = body
                .get("syncedLyrics")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());
            if synced.is_some() {
                return synced;
            }
            body.get("plainLyrics")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
        };

        let exact = format!(
            "{}://lrclib.net/api/get?artist_name={}&track_name={}&album_name={}&duration={}",
            "https",
            urlencode(&artist),
            urlencode(&track.title),
            urlencode(&album),
            duration
        );
        if let Ok(response) = self
            .http
            .get(exact)
            .header("Accept", "application/json")
            .header("User-Agent", "Mashiro (https://github.com/mashiro)")
            .send()
            .await
        {
            if response.status().is_success() {
                if let Ok(body) = response.json::<serde_json::Value>().await {
                    if let Some(text) = pick(&body) {
                        return Ok((text, Vec::new()));
                    }
                }
            }
        }

        let search = format!(
            "{}://lrclib.net/api/search?artist_name={}&track_name={}",
            "https",
            urlencode(&artist),
            urlencode(&track.title)
        );
        let response = self
            .http
            .get(search)
            .header("Accept", "application/json")
            .header("User-Agent", "Mashiro (https://github.com/mashiro)")
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err("LRCLIB не нашёл текст".to_string());
        }
        let body: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        let items = body
            .as_array()
            .ok_or_else(|| "LRCLIB не нашёл текст".to_string())?;

        let mut best: Option<(i64, bool, String)> = None;
        for item in items {
            let Some(text) = pick(item) else { continue };
            let synced = item
                .get("syncedLyrics")
                .and_then(|v| v.as_str())
                .map(|s| !s.trim().is_empty())
                .unwrap_or(false);
            let item_duration = item
                .get("duration")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0)
                .round() as i64;
            let delta = (item_duration - duration as i64).abs();
            let better = match &best {
                None => true,
                Some((best_delta, best_synced, _)) => {
                    (synced && !*best_synced) || (synced == *best_synced && delta < *best_delta)
                }
            };
            if better {
                best = Some((delta, synced, text));
            }
        }

        match best {
            Some((_, _, text)) => Ok((text, Vec::new())),
            None => Err("LRCLIB не нашёл текст".to_string()),
        }
    }

    async fn lyrics_textyl(&self, track: &TrackDto) -> Result<(String, Vec<String>), String> {
        let artist = track
            .artists
            .first()
            .map(|a| a.name.clone())
            .unwrap_or_default();
        let query = urlencode(&format!("{} {}", artist, track.title));
        let url = format!("{}://api.textyl.co/api/lyrics?q={query}", "https");
        let response = self
            .http
            .get(url)
            .timeout(std::time::Duration::from_secs(6))
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err("Textyl не нашёл текст".to_string());
        }
        let body: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        let items = body
            .as_array()
            .ok_or_else(|| "Textyl не нашёл текст".to_string())?;
        let mut text = String::new();
        for item in items {
            let line = item
                .get("lyrics")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            if line.is_empty() {
                continue;
            }
            let seconds = item
                .get("seconds")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0)
                .max(0.0);
            let minutes = (seconds / 60.0).floor() as i64;
            let rest = seconds - minutes as f64 * 60.0;
            text.push_str(&format!("[{minutes:02}:{rest:05.2}]{line}\n"));
        }
        if text.trim().is_empty() {
            return Err("Textyl не нашёл текст".to_string());
        }
        Ok((text, Vec::new()))
    }

    async fn lyrics_ovh(&self, track: &TrackDto) -> Result<(String, Vec<String>), String> {
        let artist = track
            .artists
            .first()
            .map(|a| a.name.clone())
            .unwrap_or_default();
        let url = format!(
            "{}://api.lyrics.ovh/v1/{}/{}",
            "https",
            urlencode(&artist),
            urlencode(&track.title)
        );
        let response = self
            .http
            .get(url)
            .timeout(std::time::Duration::from_secs(6))
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err("Lyrics.ovh не нашёл текст".to_string());
        }
        let body: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        let text = body
            .get("lyrics")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if text.is_empty() {
            return Err("Lyrics.ovh не нашёл текст".to_string());
        }
        Ok((text, Vec::new()))
    }

    pub async fn lyrics(&self, track_id: &str) -> Result<LyricsDto, String> {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_secs();

        let sign = lyrics_sign(track_id, ts)?;

        let result = match self.lyrics_meta(track_id, ts, &sign, "LRC").await {
            Ok(value) => value,
            Err(_) => {
                let track_dto = self.track(track_id).await.ok();
                let mut plain_fallback: Option<LyricsDto> = None;

                if let Some(ref track) = track_dto {
                    if let Ok((text, writers)) = self.lyrics_lrclib(track).await {
                        if let Ok(lyrics) = lyrics_from_text(track_id, &text, writers) {
                            if lyrics.synced {
                                return Ok(lyrics);
                            }
                            plain_fallback = Some(lyrics);
                        }
                    }

                    if let Ok((text, writers)) = self.lyrics_external(track).await {
                        if let Ok(lyrics) = lyrics_from_text(track_id, &text, writers) {
                            if lyrics.synced {
                                return Ok(lyrics);
                            }
                            if plain_fallback.is_none() {
                                plain_fallback = Some(lyrics);
                            }
                        }
                    }

                    if let Ok((text, writers)) = self.lyrics_textyl(track).await {
                        if let Ok(lyrics) = lyrics_from_text(track_id, &text, writers) {
                            if lyrics.synced {
                                return Ok(lyrics);
                            }
                            if plain_fallback.is_none() {
                                plain_fallback = Some(lyrics);
                            }
                        }
                    }
                }

                match self.lyrics_meta(track_id, ts, &sign, "TEXT").await {
                    Ok(value) => value,
                    Err(_) => {
                        if let Ok((text, writers)) = self.lyrics_supplement(track_id).await {
                            return lyrics_from_text(track_id, &text, writers);
                        }
                        if let Some(lyrics) = plain_fallback {
                            return Ok(lyrics);
                        }
                        if let Some(ref track) = track_dto {
                            if let Ok((text, writers)) = self.lyrics_ovh(track).await {
                                return lyrics_from_text(track_id, &text, writers);
                            }
                        }
                        return Err("Для этого трека текста нет".to_string());
                    }
                }
            }
        };

        let inline = result
            .get("lyrics")
            .and_then(|l| {
                l.get("fullLyrics")
                    .or_else(|| l.get("lyrics"))
                    .or_else(|| l.get("text"))
            })
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let raw = match result.get("downloadUrl").and_then(|v| v.as_str()) {
            Some(download_url) => self
                .http
                .get(download_url)
                .send()
                .await
                .map_err(|e| e.to_string())?
                .text()
                .await
                .map_err(|e| e.to_string())?,
            None => inline.ok_or_else(|| "Для этого трека текста нет".to_string())?,
        };

        let writers = result
            .get("writers")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|w| w.as_str().map(|s| s.to_string()))
                    .collect::<Vec<String>>()
            })
            .unwrap_or_default();

        let lines = parse_lrc(&raw);
        if lines.is_empty() {
            return Err("Для этого трека текста нет".to_string());
        }
        let synced = lines.iter().any(|l| l.time_ms > 0);

        Ok(LyricsDto {
            track_id: track_id.to_string(),
            synced,
            lines,
            writers,
        })
    }
}
