use aes_gcm::aead::OsRng;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::RngCore;

const KEYRING_SERVICE: &str = "auralis";
const KEYRING_USER: &str = "master_key";
const MASTER_KEY_NOT_FOUND: &str = "Master key not found. Please initialize encryption first.";

pub(crate) fn get_master_key_bytes() -> Result<Vec<u8>, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("Keyring access failed: {e}"))?;
    let encoded = match entry.get_password() {
        Ok(encoded) => encoded,
        Err(keyring::Error::NoEntry) => return Err(MASTER_KEY_NOT_FOUND.to_string()),
        Err(error) => return Err(format!("Keyring read failed: {error}")),
    };
    B64.decode(encoded)
        .map_err(|e| format!("Invalid master key encoding: {e}"))
}

/// Establishes the first-use key at the native package boundary. Existing
/// encrypted caches continue to use `get_master_key_bytes` so a missing key
/// cannot be silently replaced while attempting recovery.
pub(crate) fn ensure_master_key_bytes() -> Result<Vec<u8>, String> {
    match get_master_key_bytes() {
        Ok(key_bytes) => Ok(key_bytes),
        Err(error) if error == MASTER_KEY_NOT_FOUND => {
            crypto_generate_master_key_sync()?;
            get_master_key_bytes()
        }
        Err(error) => Err(error),
    }
}

fn crypto_generate_master_key_sync() -> Result<bool, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("Keyring access failed: {e}"))?;
    match entry.get_password() {
        Ok(_) => return Ok(false),
        Err(keyring::Error::NoEntry) => {}
        Err(error) => return Err(format!("Keyring read failed: {error}")),
    }
    let mut key_bytes = [0u8; 32];
    OsRng.fill_bytes(&mut key_bytes);
    let encoded = B64.encode(key_bytes);
    entry
        .set_password(&encoded)
        .map_err(|e| format!("Failed to store master key: {e}"))?;
    Ok(true)
}

#[tauri::command]
pub async fn crypto_generate_master_key() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(crypto_generate_master_key_sync)
        .await
        .map_err(|_| "CRYPTO_MASTER_KEY_GENERATE_TASK_JOIN_FAILED".to_string())?
}

fn crypto_has_master_key_sync() -> Result<bool, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("Keyring access failed: {e}"))?;
    match entry.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(format!("Keyring read failed: {error}")),
    }
}

#[tauri::command]
pub async fn crypto_has_master_key() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(crypto_has_master_key_sync)
        .await
        .map_err(|_| "CRYPTO_MASTER_KEY_CHECK_TASK_JOIN_FAILED".to_string())?
}

#[cfg(test)]
mod tests {
    #[cfg(windows)]
    struct TestCredentialCleanup {
        service: String,
        user: String,
    }

    #[cfg(windows)]
    impl Drop for TestCredentialCleanup {
        fn drop(&mut self) {
            if let Ok(entry) = keyring::Entry::new(&self.service, &self.user) {
                let _ = entry.delete_credential();
            }
        }
    }

    #[cfg(windows)]
    #[test]
    fn keyring_persists_across_fresh_entries() {
        use std::time::{SystemTime, UNIX_EPOCH};

        let suffix = format!(
            "{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock must be after UNIX_EPOCH")
                .as_nanos()
        );
        let service = format!("auralis-runtime-test-{suffix}");
        let user = format!("entry-{suffix}");
        let cleanup = TestCredentialCleanup {
            service: service.clone(),
            user: user.clone(),
        };
        let secret = format!("secret-{suffix}");

        let first = keyring::Entry::new(&service, &user).expect("first keyring entry must open");
        let _ = first.delete_credential();
        first
            .set_password(&secret)
            .expect("first keyring entry must write");

        let second = keyring::Entry::new(&service, &user).expect("second keyring entry must open");
        assert_eq!(
            second
                .get_password()
                .expect("second keyring entry must read"),
            secret
        );

        drop(cleanup);
    }
}
