const SECRET_KEY_MATERIAL = 'InextureLanKey@2024';
let cachedCryptoKey = null;

async function getCryptoKey() {
    if (cachedCryptoKey) return cachedCryptoKey;
    const enc = new TextEncoder().encode(SECRET_KEY_MATERIAL);
    const hashed = await crypto.subtle.digest('SHA-256', enc);
    cachedCryptoKey = await crypto.subtle.importKey('raw', hashed, 'AES-GCM', false, ['decrypt']);
    return cachedCryptoKey;
}

function bufferFromBase64(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function decryptField(stored) {
    if (!stored || !stored.data || !stored.iv) return null;
    try {
        const key = await getCryptoKey();
        const iv = bufferFromBase64(stored.iv);
        const payload = bufferFromBase64(stored.data);
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, payload);
        return new TextDecoder().decode(decrypted);
    } catch (err) {
        console.warn('background: decrypt failed', err);
        return null;
    }
}

function storageGet(keys) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, (data) => {
            if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
            resolve(data);
        });
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.action) return;

    if (message.action === 'getDecryptedCredentials') {
        storageGet(['credentials', 'autoSubmit'])
            .then(async (data) => {
                const creds = data.credentials;
                if (!creds) {
                    sendResponse({ error: 'no_credentials' });
                    return;
                }
                const username = await decryptField(creds.username);
                const password = await decryptField(creds.password);
                if (!username || !password) {
                    sendResponse({ error: 'decrypt_failed' });
                    return;
                }
                sendResponse({ username, password, autoSubmit: Boolean(data.autoSubmit) });
            })
            .catch((err) => {
                console.warn('background: storage get failed', err);
                sendResponse({ error: 'storage_error' });
            });
        return true;
    }
});
