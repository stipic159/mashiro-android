use std::env;

use ed25519_dalek::SigningKey;
use together_crypto::encoding::to_base64;
use together_crypto::identity;

pub const SERVICE: &str = "mashiro-together";

pub const ACCOUNT: &str = "seed-phrase";

const ACCOUNT_ENV: &str = "MASHIRO_TOGETHER_ACCOUNT";

const SEED_ENV: &str = "MASHIRO_TOGETHER_SEED";

fn account() -> String {
    match env::var(ACCOUNT_ENV) {
        Ok(suffix) if !suffix.trim().is_empty() => format!("{ACCOUNT}-{}", suffix.trim()),
        _ => ACCOUNT.to_string(),
    }
}

fn env_seed() -> Option<String> {
    let raw = env::var(SEED_ENV).ok()?;
    let normalized = identity::normalize_phrase(&raw);
    if normalized.is_empty() {
        return None;
    }

    identity::keypair_from_phrase(&normalized).ok()?;
    Some(normalized)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod storage {
    use super::*;
    use keyring::Entry;

    fn entry() -> Result<Entry, String> {
        Entry::new(SERVICE, &account())
            .map_err(|error| format!("хранилище ключей недоступно: {error}"))
    }

    pub fn save(phrase: &str) -> Result<String, String> {
        let normalized = identity::normalize_phrase(phrase);
        identity::keypair_from_phrase(&normalized).map_err(|error| error.to_string())?;

        entry()?
            .set_password(&normalized)
            .map_err(|error| format!("не удалось сохранить сид-фразу: {error}"))?;

        Ok(normalized)
    }

    pub fn load() -> Result<Option<String>, String> {
        if let Some(seed) = env_seed() {
            return Ok(Some(seed));
        }

        match entry()?.get_password() {
            Ok(phrase) => Ok(Some(phrase)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(format!("не удалось прочитать хранилище ключей: {error}")),
        }
    }

    pub fn forget() -> Result<(), String> {
        match entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(format!("не удалось удалить сид-фразу: {error}")),
        }
    }
}

#[cfg(any(target_os = "android", target_os = "ios"))]
mod storage {
    use super::*;
    use std::sync::Mutex;

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
}

pub use storage::*;

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
