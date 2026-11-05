// Auto login: clicks "Sign In with Microsoft" on the Inexture auth page, then picks the account on the Microsoft picker.
(function () {
    const ACCOUNT = 'pradip@inexture.com';
    const TIMEOUT_MS = 15000;
    // Microsoft step only runs within this window after the Inexture click, so other Microsoft logins are untouched.
    const PENDING_WINDOW_MS = 60000;

    function waitAndClick(find, label, onClick) {
        const start = Date.now();
        const timer = setInterval(() => {
            const el = find();
            if (el) {
                clearInterval(timer);
                console.log('[IntelliMate auto-login] clicking', label);
                if (onClick) onClick();
                el.click();
            } else if (Date.now() - start > TIMEOUT_MS) {
                clearInterval(timer);
                console.warn('[IntelliMate auto-login] not found:', label);
            }
        }, 300);
    }

    chrome.storage.local.get(['autoLoginEnabled', 'autoLoginPendingAt'], (data) => {
        if (!data.autoLoginEnabled) return;
        const pendingAt = data.autoLoginPendingAt || 0;
        const isRecent = Date.now() - pendingAt < PENDING_WINDOW_MS;

        if (location.hostname === 'auth.inexture.com') {
            // Skip if we just clicked, so a failed login doesn't loop.
            if (isRecent) return;
            waitAndClick(
                () => document.getElementById('social-microsoft'),
                'Sign In with Microsoft',
                () => chrome.storage.local.set({ autoLoginPendingAt: Date.now() })
            );
            return;
        }

        if (location.hostname === 'login.microsoftonline.com') {
            if (!isRecent) return;
            waitAndClick(() => {
                const byTestId = document.querySelector(`[data-test-id="${ACCOUNT}"]`);
                if (byTestId) return byTestId;
                const tiles = document.querySelectorAll('#tilesHolder [role="button"], #tilesHolder .table, [role="listitem"] [role="button"]');
                return Array.from(tiles).find(t => t.textContent.toLowerCase().includes(ACCOUNT)) || null;
            }, ACCOUNT, () => chrome.storage.local.remove('autoLoginPendingAt'));
        }
    });
})();
