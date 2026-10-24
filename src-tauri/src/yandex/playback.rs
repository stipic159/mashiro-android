use super::*;
use super::signer::{file_info_sign, legacy_sign};

static STREAM_CACHE: std::sync::OnceLock<
    std::sync::Mutex<Vec<(String, StreamDto, std::time::Instant)>>,
> = std::sync::OnceLock::new();

const STREAM_TTL_SECS: u64 = 240;

static BEST_PROBE: std::sync::atomic::AtomicUsize =
    std::sync::atomic::AtomicUsize::new(usize::MAX);

impl Yandex {
    async fn stream_file_info(
        &self,
        track_id: &str,
        quality: &str,
        codecs: &str,
        client: &str,
    ) -> Result<StreamDto, String> {
        let transports = "raw";
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let sign = file_info_sign(ts, track_id, quality, codecs, transports);
        let url = format!(
            "{BASE}/get-file-info?ts={ts}&trackId={track_id}&quality={quality}&codecs={}&transports={transports}&sign={}",
            urlencode(codecs),
            urlencode(&sign)
        );

        let resp = self
            .http
            .get(url)
            .timeout(std::time::Duration::from_secs(10))
            .header("Authorization", self.auth())
            .header("X-Yandex-Music-Client", client)
            .header("Accept", "application/json")
            .header("Accept-Language", "ru")
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let status = resp.status();
        if status.as_u16() == 401 {
            return Err("Невалидный токен Яндекс Музыки".to_string());
        }
        let text = resp.text().await.map_err(|e| e.to_string())?;
        if !status.is_success() {
            let hint: String = text.chars().take(200).collect();
            return Err(format!("Поток недоступен: {} {hint}", status.as_u16()));
        }
        let body: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;

        let info = body
            .get("result")
            .and_then(|r| r.get("downloadInfo").or_else(|| r.get("download_info")))
            .cloned()
            .ok_or_else(|| "Нет данных о потоке".to_string())?;

        let raw_url = info
            .get("url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                info.get("urls")
                    .and_then(|v| v.as_array())
                    .and_then(|list| list.first())
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_default();
        if raw_url.is_empty() {
            return Err("Нет ссылки на поток".to_string());
        }
        let url = if let Some(rest) = raw_url.strip_prefix("//") {
            format!("https://{rest}")
        } else {
            raw_url
        };

        let codec = info
            .get("codec")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();
        let bitrate = info
            .get("bitrate")
            .and_then(|v| v.as_i64())
            .unwrap_or_default();

        Ok(StreamDto {
            track_id: track_id.to_string(),
            url,
            codec,
            bitrate,
            source: "get-file-info".to_string(),
        })
    }

    fn lossy(codec: &str) -> bool {
        let c = codec.to_ascii_lowercase();
        !(c.contains("flac")
            || c.contains("alac")
            || c.starts_with("wav")
            || c.starts_with("aiff"))
    }

    fn report(track_id: &str, dto: &StreamDto) {
        let bitrate = if dto.bitrate > 0 {
            format!("{} kbps", dto.bitrate)
        } else {
            "bitrate n/a".to_string()
        };
        println!(
            "[quality] track {track_id}: {} {} via {}",
            dto.codec, bitrate, dto.source
        );
    }

    pub async fn stream(&self, track_id: &str, quality: &str) -> Result<StreamDto, String> {
        let key = format!("{track_id}:{quality}");
        let store = STREAM_CACHE.get_or_init(|| std::sync::Mutex::new(Vec::new()));
        if let Ok(mut items) = store.lock() {
            items.retain(|(_, _, at)| at.elapsed().as_secs() < STREAM_TTL_SECS);
            if let Some((_, dto, _)) = items.iter().find(|(id, _, _)| id == &key) {
                println!("[quality] track {track_id}: ссылка из кэша ({})", dto.codec);
                return Ok(dto.clone());
            }
        }
        let dto = self.stream_fresh(track_id, quality).await?;
        if let Ok(mut items) = store.lock() {
            items.push((key, dto.clone(), std::time::Instant::now()));
            while items.len() > 24 {
                items.remove(0);
            }
        }
        Ok(dto)
    }

    async fn stream_fresh(
        &self,
        track_id: &str,
        quality: &str,
    ) -> Result<StreamDto, String> {
        if quality == "lossless" {
            self.report_entitlements().await;
            let mut fallback: Option<StreamDto> = None;
            for (attempt, (client, codecs)) in Self::probe_order().into_iter().enumerate() {
                match self
                    .stream_file_info(track_id, "lossless", codecs, client)
                    .await
                {
                    Ok(dto) => {
                        Self::report(track_id, &dto);
                        if !Self::lossy(&dto.codec) {
                            Self::remember_probe(client, codecs);
                            println!(
                                "[quality] track {track_id}: lossless получен с попытки {} - {} ({client}, codecs={codecs})",
                                attempt + 1,
                                dto.codec
                            );
                            return Ok(dto);
                        }
                        if fallback.is_none() {
                            fallback = Some(dto);
                        }
                    }
                    Err(err) => println!(
                        "[quality] track {track_id}: get-file-info ({client}, codecs={codecs}) failed: {err}"
                    ),
                }
            }
            if let Some(dto) = fallback {
                println!(
                    "[quality] track {track_id}: lossless для этого трека недоступен, играет {} {} kbps",
                    dto.codec, dto.bitrate
                );
                return Ok(dto);
            }
            match self.stream_legacy(track_id, quality, true).await {
                Ok(dto) => {
                    Self::report(track_id, &dto);
                    return Ok(dto);
                }
                Err(err) => {
                    println!("[quality] track {track_id}: streaming download-info failed: {err}")
                }
            }
        }
        let dto = self.stream_legacy(track_id, quality, false).await?;
        Self::report(track_id, &dto);
        Ok(dto)
    }

    fn probe_order() -> Vec<(&'static str, &'static str)> {
        use std::sync::atomic::Ordering;
        let mut all: Vec<(&'static str, &'static str)> = Vec::new();
        for client in MUSIC_CLIENTS {
            for codecs in PROBE_CODECS {
                all.push((client, codecs));
            }
        }
        let best = BEST_PROBE.load(Ordering::Relaxed);
        if best < all.len() {
            let winner = all.remove(best);
            all.insert(0, winner);
        }
        all
    }

    fn remember_probe(client: &str, codecs: &str) {
        use std::sync::atomic::Ordering;
        let mut index = 0usize;
        for c in MUSIC_CLIENTS {
            for k in PROBE_CODECS {
                if c == client && k == codecs {
                    BEST_PROBE.store(index, Ordering::Relaxed);
                    return;
                }
                index += 1;
            }
        }
    }

    async fn report_entitlements(&self) {
        use std::sync::atomic::{AtomicBool, Ordering};
        static DONE: AtomicBool = AtomicBool::new(false);
        if DONE.swap(true, Ordering::Relaxed) {
            return;
        }
        let Ok(result) = self.get_result("/account/status").await else {
            return;
        };
        for key in ["plus", "subscription", "permissions"] {
            if let Some(value) = result.get(key) {
                let dump: String = value.to_string().chars().take(400).collect();
                println!("[quality] account {key}: {dump}");
            }
        }
    }

    async fn stream_legacy(
        &self,
        track_id: &str,
        quality: &str,
        streaming: bool,
    ) -> Result<StreamDto, String> {
        let suffix = if streaming { "?can_use_streaming=true" } else { "" };
        let result = self
            .get_result(&format!("/tracks/{track_id}/download-info{suffix}"))
            .await?;
        let infos: Vec<YDownloadInfo> =
            serde_json::from_value(result).map_err(|e| e.to_string())?;
        if infos.is_empty() {
            return Err("Нет доступных потоков".to_string());
        }

        let rank = |i: &YDownloadInfo| -> i64 {
            let br = i.bitrate_in_kbps.unwrap_or(0);
            let bonus = if !Self::lossy(&i.codec) {
                3000
            } else if i.codec.contains("aac") {
                1000
            } else {
                0
            };
            br + bonus
        };

        let best = match quality {
            "low" => infos
                .iter()
                .filter(|i| i.bitrate_in_kbps.unwrap_or(0) <= 128)
                .max_by_key(|i| i.bitrate_in_kbps.unwrap_or(0))
                .or_else(|| infos.iter().min_by_key(|i| rank(i))),
            "normal" => infos
                .iter()
                .filter(|i| i.codec != "flac" && i.bitrate_in_kbps.unwrap_or(0) <= 256)
                .max_by_key(|i| rank(i))
                .or_else(|| infos.iter().min_by_key(|i| rank(i))),
            "high" => infos
                .iter()
                .filter(|i| i.codec != "flac")
                .max_by_key(|i| rank(i))
                .or_else(|| infos.iter().max_by_key(|i| rank(i))),
            _ => infos.iter().max_by_key(|i| rank(i)),
        }
        .ok_or_else(|| "Нет доступных потоков".to_string())?;

        let xml = self
            .http
            .get(&best.download_info_url)
            .header("Authorization", self.auth())
            .send()
            .await
            .map_err(|e| e.to_string())?
            .text()
            .await
            .map_err(|e| e.to_string())?;

        let host = between(&xml, "<host>", "</host>").ok_or("Некорректный ответ CDN")?;
        let path = between(&xml, "<path>", "</path>").ok_or("Некорректный ответ CDN")?;
        let ts = between(&xml, "<ts>", "</ts>").ok_or("Некорректный ответ CDN")?;
        let s = between(&xml, "<s>", "</s>").ok_or("Некорректный ответ CDN")?;

        let sign = legacy_sign(&path[1..], s);
        let url = format!("https://{host}/get-mp3/{sign}/{ts}{path}");

        Ok(StreamDto {
            track_id: track_id.to_string(),
            url,
            codec: best.codec.clone(),
            bitrate: best.bitrate_in_kbps.unwrap_or(0),
            source: if streaming {
                "download-info+streaming".to_string()
            } else {
                "download-info".to_string()
            },
        })
    }

    pub async fn download_bytes(&self, url: &str) -> Result<Vec<u8>, String> {
        let res = self
            .http
            .get(url)
            .header("X-Yandex-Music-Client", MUSIC_CLIENT)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("CDN ответил {}", res.status().as_u16()));
        }
        let bytes = res.bytes().await.map_err(|e| e.to_string())?;
        Ok(bytes.to_vec())
    }
}
