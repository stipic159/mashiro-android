use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use hmac::{Hmac, Mac};
use md5::{Digest, Md5};
use sha2::Sha256;
use super::{FILE_INFO_SECRET, LYRICS_SECRET, SIGN_SALT};

pub fn file_info_sign(
    ts: u64,
    track_id: &str,
    quality: &str,
    codecs: &str,
    transports: &str,
) -> String {
    let message = format!(
        "{ts}{track_id}{quality}{}{}",
        codecs.replace(',', ""),
        transports.replace(',', "")
    );
    let mut mac =
        Hmac::<Sha256>::new_from_slice(FILE_INFO_SECRET.as_bytes()).expect("hmac key");
    mac.update(message.as_bytes());
    BASE64
        .encode(mac.finalize().into_bytes())
        .trim_end_matches('=')
        .to_string()
}

pub fn legacy_sign(path: &str, s: &str) -> String {
    let raw = format!("{SIGN_SALT}{path}{s}");
    let mut hasher = Md5::new();
    hasher.update(raw.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn lyrics_sign(track_id: &str, ts: u64) -> Result<String, String> {
    let mut mac = Hmac::<Sha256>::new_from_slice(LYRICS_SECRET.as_bytes())
        .map_err(|e| e.to_string())?;
    mac.update(format!("{track_id}{ts}").as_bytes());
    Ok(BASE64
        .encode(mac.finalize().into_bytes())
        .trim_end_matches('=')
        .to_string())
}
