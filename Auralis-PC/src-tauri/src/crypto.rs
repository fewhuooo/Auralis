use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::Sha256;

const KEYRING_SERVICE: &str = "auralis";
const KEYRING_USER: &str = "master_key";
const PBKDF2_ITERATIONS: u32 = 600_000;
const NONCE_LEN: usize = 12;
const SALT_LEN: usize = 32;

pub(crate) fn get_master_key_bytes() -> Result<Vec<u8>, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("Keyring access failed: {e}"))?;
    let encoded = entry
        .get_password()
        .map_err(|_| "Master key not found. Please initialize encryption first.".to_string())?;
    B64.decode(encoded)
        .map_err(|e| format!("Invalid master key encoding: {e}"))
}

#[tauri::command]
pub fn crypto_generate_master_key() -> Result<bool, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("Keyring access failed: {e}"))?;
    if entry.get_password().is_ok() {
        return Ok(false);
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
pub fn crypto_has_master_key() -> Result<bool, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("Keyring access failed: {e}"))?;
    Ok(entry.get_password().is_ok())
}

#[tauri::command]
pub fn crypto_encrypt(data: String) -> Result<String, String> {
    let key_bytes = get_master_key_bytes()?;
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, data.as_bytes())
        .map_err(|e| format!("Encryption failed: {e}"))?;

    let mut payload = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    payload.extend_from_slice(&nonce_bytes);
    payload.extend_from_slice(&ciphertext);

    Ok(B64.encode(payload))
}

#[tauri::command]
pub fn crypto_decrypt(encrypted_data: String) -> Result<String, String> {
    let key_bytes = get_master_key_bytes()?;
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    let payload = B64
        .decode(&encrypted_data)
        .map_err(|e| format!("Invalid encrypted payload encoding: {e}"))?;

    if payload.len() < NONCE_LEN {
        return Err("Encrypted payload too short".to_string());
    }

    let (nonce_bytes, ciphertext) = payload.split_at(NONCE_LEN);
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Decryption failed. Data may be corrupted or key mismatch.".to_string())?;

    String::from_utf8(plaintext).map_err(|e| format!("Decrypted data is not valid UTF-8: {e}"))
}

#[derive(Serialize, Deserialize)]
pub struct KeyBundle {
    pub encrypted_key: String,
    pub salt: String,
    pub version: u32,
}

#[tauri::command]
pub fn crypto_export_key_bundle(passphrase: String) -> Result<KeyBundle, String> {
    let key_bytes = get_master_key_bytes()?;

    let mut salt = [0u8; SALT_LEN];
    OsRng.fill_bytes(&mut salt);

    let mut derived = [0u8; 32];
    pbkdf2_hmac::<Sha256>(
        passphrase.as_bytes(),
        &salt,
        PBKDF2_ITERATIONS,
        &mut derived,
    );

    let wrapping_key = Key::<Aes256Gcm>::from_slice(&derived);
    let wrapping_cipher = Aes256Gcm::new(wrapping_key);

    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let wrapped = wrapping_cipher
        .encrypt(nonce, key_bytes.as_ref())
        .map_err(|e| format!("Key wrapping failed: {e}"))?;

    let mut wrapped_payload = Vec::with_capacity(NONCE_LEN + wrapped.len());
    wrapped_payload.extend_from_slice(&nonce_bytes);
    wrapped_payload.extend_from_slice(&wrapped);

    Ok(KeyBundle {
        encrypted_key: B64.encode(wrapped_payload),
        salt: B64.encode(salt),
        version: 1,
    })
}

#[tauri::command]
pub fn crypto_import_key_bundle(
    encrypted_key: String,
    salt: String,
    passphrase: String,
) -> Result<bool, String> {
    let salt_bytes = B64
        .decode(&salt)
        .map_err(|e| format!("Invalid salt encoding: {e}"))?;

    let mut derived = [0u8; 32];
    pbkdf2_hmac::<Sha256>(
        passphrase.as_bytes(),
        &salt_bytes,
        PBKDF2_ITERATIONS,
        &mut derived,
    );

    let wrapping_key = Key::<Aes256Gcm>::from_slice(&derived);
    let wrapping_cipher = Aes256Gcm::new(wrapping_key);

    let wrapped_payload = B64
        .decode(&encrypted_key)
        .map_err(|e| format!("Invalid encrypted key encoding: {e}"))?;

    if wrapped_payload.len() < NONCE_LEN {
        return Err("Encrypted key payload too short".to_string());
    }

    let (nonce_bytes, wrapped) = wrapped_payload.split_at(NONCE_LEN);
    let nonce = Nonce::from_slice(nonce_bytes);

    let master_key_bytes = wrapping_cipher
        .decrypt(nonce, wrapped)
        .map_err(|_| "Decryption failed. Wrong passphrase or corrupted backup.".to_string())?;

    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("Keyring access failed: {e}"))?;
    let encoded = B64.encode(&master_key_bytes);
    entry
        .set_password(&encoded)
        .map_err(|e| format!("Failed to store recovered key: {e}"))?;

    Ok(true)
}
