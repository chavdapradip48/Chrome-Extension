let fillCompleted = false;
let activeObserver = null;

function fetchDecryptedCredentials() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getDecryptedCredentials' }, (resp) => {
            if (!resp || resp.error) {
                console.warn('Unable to retrieve stored credentials', resp && resp.error);
                resolve(null);
            } else {
                resolve(resp);
            }
        });
    });
}

function setNativeValue(input, value) {
    if (!input) return;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

function elementMatchesLoginState(container) {
    if (!container) return false;
    if (!container.classList || container.classList.length === 0) return true;
    return container.classList.contains('loggedout');
}

function attemptAutoFill(username, password, autoSubmit) {
    const container = document.getElementById('credentials');
    if (!container || !elementMatchesLoginState(container)) return false;

    const usernameInput = document.getElementById('username') || document.querySelector('input[name="username"], input[type="text"]');
    const passwordInput = document.getElementById('password') || document.querySelector('input[name="password"], input[type="password"]');
    if (!usernameInput || !passwordInput) return false;

    setNativeValue(usernameInput, username);
    setNativeValue(passwordInput, password);

    const submitButton = document.getElementById('loginbutton') || document.querySelector('button[type="submit"], input[type="submit"]');
    if (autoSubmit) {
        autoSubmitViaEnter(passwordInput, submitButton);
    }
    container.dataset.intellimateLanFilled = '1';
    fillCompleted = true;
    return true;
}

function autoSubmitViaEnter(passwordInput, submitButton) {
    const trigger = passwordInput || submitButton || document.querySelector('input[type="password"]');
    if (!trigger) return;
    setTimeout(() => {
        const createEvent = (type) => new KeyboardEvent(type, {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        });
        trigger.dispatchEvent(createEvent('keydown'));
        trigger.dispatchEvent(createEvent('keypress'));
        trigger.dispatchEvent(createEvent('keyup'));
    }, 400);
}


function startFillLoop(username, password, autoSubmit) {
    if (!username || !password) return;

    const tryFill = () => {
        if (fillCompleted) return;
        const success = attemptAutoFill(username, password, autoSubmit);
        if (success) return;
        setTimeout(tryFill, 1000);
    };

    tryFill();
}

function watchCredentialContainer(username, password, autoSubmit) {
    const initObserver = () => {
        const container = document.getElementById('credentials');
        if (!container) {
            setTimeout(initObserver, 1000);
            return;
        }
        if (activeObserver) {
            try { activeObserver.disconnect(); } catch (_) {}
        }
        activeObserver = new MutationObserver(() => {
            if (container.classList.contains('loggedout')) {
                fillCompleted = false;
                attemptAutoFill(username, password, autoSubmit);
            }
        });
        activeObserver.observe(container, { attributes: true, attributeFilter: ['class'] });
    };
    initObserver();
}

async function bootstrapAutoLogin() {
    const creds = await fetchDecryptedCredentials();
    if (!creds || !creds.username || !creds.password) return;

    fillCompleted = false;
    startFillLoop(creds.username, creds.password, creds.autoSubmit);
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        watchCredentialContainer(creds.username, creds.password, creds.autoSubmit);
    } else {
        document.addEventListener('DOMContentLoaded', () => watchCredentialContainer(creds.username, creds.password, creds.autoSubmit), { once: true });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapAutoLogin, { once: true });
} else {
    bootstrapAutoLogin();
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.credentials || changes.autoSubmit) {
        fillCompleted = false;
        bootstrapAutoLogin();
    }
});
