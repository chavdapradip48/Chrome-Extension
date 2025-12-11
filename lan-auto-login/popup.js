const SECRET_KEY_MATERIAL = 'InextureLanKey@2024';
let popupCryptoKey = null;

function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary);
}

async function getCryptoKey() {
    if (popupCryptoKey) return popupCryptoKey;
    const enc = new TextEncoder().encode(SECRET_KEY_MATERIAL);
    const hashed = await crypto.subtle.digest('SHA-256', enc);
    popupCryptoKey = await crypto.subtle.importKey('raw', hashed, 'AES-GCM', false, ['encrypt', 'decrypt']);
    return popupCryptoKey;
}

async function encryptField(value) {
    const key = await getCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(value);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    return {
        data: bufferToBase64(ciphertext),
        iv: bufferToBase64(iv.buffer)
    };
}

function setStatus(message, type = '') {
    const statusEl = document.getElementById('status');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `status ${type}`.trim();
}

document.addEventListener('DOMContentLoaded', () => {
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const autoSubmitCheckbox = document.getElementById('autoSubmit');
    const saveBtn = document.getElementById('saveBtn');
    const clearBtn = document.getElementById('clearBtn');

    if (!window.crypto || !window.crypto.subtle) {
        setStatus('Browser crypto APIs unavailable. Extension cannot encrypt credentials.', 'error');
        saveBtn.disabled = true;
        clearBtn.disabled = true;
        return;
    }

    chrome.storage.local.get(['credentials', 'autoSubmit'], async (data) => {
        const hasSaved = Boolean(data.credentials && data.credentials.username && data.credentials.password);
        autoSubmitCheckbox.checked = data.autoSubmit !== undefined ? Boolean(data.autoSubmit) : true;
        if (hasSaved) {
            setStatus('Encrypted credentials already stored. Saving again will overwrite them.', 'success');
        } else {
            setStatus('No credentials stored yet.');
        }
    });

    const storageSet = (payload) => new Promise((resolve, reject) => {
        chrome.storage.local.set(payload, () => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve();
        });
    });

    const storageRemove = (keys) => new Promise((resolve, reject) => {
        chrome.storage.local.remove(keys, () => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve();
        });
    });

    saveBtn.addEventListener('click', async () => {
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        const autoSubmit = autoSubmitCheckbox.checked;

        if (!username || !password) {
            setStatus('Username and password are required.', 'error');
            return;
        }

        try {
            const encryptedUsername = await encryptField(username);
            const encryptedPassword = await encryptField(password);
            await storageSet({
                credentials: {
                    username: encryptedUsername,
                    password: encryptedPassword
                },
                autoSubmit
            });

            usernameInput.value = '';
            passwordInput.value = '';
            setStatus('Credentials encrypted and saved locally.', 'success');
        } catch (err) {
            console.error('Failed to save credentials', err);
            setStatus('Failed to encrypt or save credentials.', 'error');
        }
    });

    clearBtn.addEventListener('click', async () => {
        try {
            await storageRemove(['credentials']);
            setStatus('Stored credentials removed.', '');
        } catch (err) {
            console.warn('Could not clear credentials', err);
            setStatus('Failed to clear credentials.', 'error');
        }
    });
});
