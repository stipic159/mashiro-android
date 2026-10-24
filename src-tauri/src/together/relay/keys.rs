use std::env;
use std::sync::Mutex;

use ed25519_dalek::SigningKey;
use together_crypto::encoding::to_base64;
use together_crypto::identity;

pub const SERVICE: &str = "mashiro-together";

pub const ACCOUNT: &str = "seed-phrase";

const SEED_ENV: &str = "MASHIRO_TOGETHER_SEED";

fn env_seed() -> Option<String> {
    let raw = env::var(SEED_ENV).ok()?;
    let normalized = identity::normalize_phrase(&raw);
    if normalized.is_empty() {
        return None;
    }

    identity::keypair_from_phrase(&normalized).ok()?;
    Some(normalized)
}

static IN_MEMORY_SEED: Mutex<Option<String>> = Mutex::new(None);

pub fn save(phrase: &str) -> Result<String, String> {
    let normalized = identity::normalize_phrase(phrase);
    identity::keypair_from_phrase(&normalized).map_err(|error| error.to_string())?;
    let mut guard = IN_MEMORY_SEED.lock().map_err(|e| e.to_string())?;
    *guard = Some(normalized.clone());
    Ok(normalized)
}

pub fn load() -> Result<Option<String>, String> {
    if let Some(seed) = env_seed() {
        return Ok(Some(seed));
    }
    let guard = IN_MEMORY_SEED.lock().map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

pub fn forget() -> Result<(), String> {
    let mut guard = IN_MEMORY_SEED.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}

pub fn create(words: usize) -> Result<String, String> {
    let phrase = identity::generate_phrase(words).map_err(|error| error.to_string())?;
    save(&phrase)
}

pub fn signing_key(phrase: &str) -> Result<SigningKey, String> {
    identity::keypair_from_phrase(phrase).map_err(|error| error.to_string())
}

pub fn public(phrase: &str) -> Result<String, String> {
    Ok(to_base64(&signing_key(phrase)?.verifying_key().to_bytes()))
}
