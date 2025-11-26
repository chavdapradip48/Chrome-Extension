chrome.runtime.onInstalled.addListener(() => {
    console.log("Time Entry Helper Extension Installed!");
});
  

// Listen to outgoing requests and capture Bearer tokens from Authorization headers.
// NOTE: This will capture tokens for requests matching the host permissions in the manifest.
chrome.webRequest.onBeforeSendHeaders.addListener(
    
    function(details) {
        console.log("Hello");
        try {
            if (!details.requestHeaders) return;
            console.log("Hello")
            for (const header of details.requestHeaders) {
                if (header.name && header.name.toLowerCase() === 'authorization' && header.value && header.value.startsWith('Bearer ')) {
                    const token = header.value.split(' ')[1];
                    const meta = {
                        tokenCapturedAt: new Date().toISOString(),
                        url: details.url,
                        initiator: details.initiator || details.originUrl || null,
                        tabId: details.tabId
                    };
                    console.log('token', token);         

                    chrome.storage.local.set({ lastBearerToken: token, lastBearerMeta: meta }, function() {
                        console.log('Captured Bearer token from', details.url);
                    });

                    // We don't modify the request, only read. Break after first match.
                    break;
                }
            }
        } catch (e) {
            console.error('Error reading request headers', e);
        }

        // do not modify headers
        return {};
    },
    { urls: ["<all_urls>"] },
    ["requestHeaders", "extraHeaders"]
);

// Allow content scripts to ask the background to fetch API endpoints (so token isn't exposed)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.action) return;

    if (message.action === 'fetchWithToken') {
        const url = message.url;
        chrome.storage.local.get(['lastBearerToken'], async function (data) {
            const token = data.lastBearerToken;

            try {
                // If we have a token, use it via Authorization header.
                // If we don't have a token, try a cookie-based request (credentials: 'include')
                // — this helps when the portal uses cookie/session auth instead of Bearer tokens.
                const fetchOpts = token ? {
                    headers: {
                        'Authorization': 'Bearer ' + token,
                        'Accept': 'application/json'
                    }
                } : {
                    // No token saved — try cookie based request so logged-in sessions still work
                    credentials: 'include',
                    headers: { 'Accept': 'application/json' }
                };

                if (token) console.log('background.fetchWithToken — using bearer token');
                else console.log('background.fetchWithToken — no token found; attempting cookie-based request');

                const resp = await fetch(url, fetchOpts);

                const status = resp.status;
                let parsed = null;
                try { parsed = await resp.json(); } catch (e) { parsed = null; }

                // If unauthorized, clear stored token and notify UI
                if (status === 401) {
                    try {
                        chrome.storage.local.remove('lastBearerToken', function() {
                            console.log('Cleared stored token after 401');
                        });
                    } catch (e) { /* ignore */ }

                    // broadcast an authRequired event so popup/content can prompt user
                    try { chrome.runtime.sendMessage({ action: 'authRequired', status: 401 }); } catch (e) { }
                }

                sendResponse({ status, ok: resp.ok, data: parsed });
            } catch (err) {
                sendResponse({ error: String(err) });
            }
        });

        // Indicate we'll call sendResponse asynchronously
        return true;
    }
});
