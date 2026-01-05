chrome.runtime.onInstalled.addListener(() => {
    console.log("Time Entry Helper Extension Installed!");
});
  
function invalidateStoredToken(reason) {
    try {
        chrome.storage.local.remove(['lastBearerToken', 'lastBearerMeta'], function() {
            console.log('Cleared stored token', reason ? ('(' + reason + ')') : '');
        });
        chrome.storage.local.set({ lastBearerTokenInvalidatedAt: new Date().toISOString() });
    } catch (e) { /* ignore */ }
}

// Listen to outgoing requests and capture Bearer tokens from Authorization headers.
// NOTE: This will capture tokens for requests matching the host permissions in the manifest.
chrome.webRequest.onBeforeSendHeaders.addListener(
    
    function(details) {
    
        try {
            if (!details.requestHeaders) return;
            
            for (const header of details.requestHeaders) {
                try {
                    if (!header.name || header.name.toLowerCase() !== 'authorization') continue;
                    if (!header.value || !header.value.startsWith('Bearer ')) continue;

                    const token = header.value.split(' ')[1];
                    // only accept tokens issued for portal hosts to avoid capturing unrelated tokens
                    if (!details.url || (!details.url.includes('portal.inexture.com') && !details.url.includes('api.portal.inexture.com'))) {
                        console.log('Ignoring bearer token from non-portal host:', details.url);
                        continue;
                    }

                    const meta = {
                        tokenCapturedAt: new Date().toISOString(),
                        url: details.url,
                        initiator: details.initiator || details.originUrl || null,
                        tabId: details.tabId
                    };

                    console.log('Captured bearer token candidate from portal URL', details.url);

                    // Only validate/store if it's different from the last stored token
                    chrome.storage.local.get(['lastBearerToken'], async function(data) {
                        try {
                            if (data && data.lastBearerToken === token) {
                                console.log('Captured token is same as stored token — skipping validation.');
                                return;
                            }

                            // Store captured token immediately; validate through real API usage.
                            chrome.storage.local.set({ lastBearerToken: token, lastBearerMeta: meta }, function() {
                                console.log('Stored bearer token from', details.url);
                            });
                        } catch (e) { console.warn('Error handling captured token', e); }
                    });

                    // We don't modify the request, only read. Break after first match.
                    break;
                } catch (e) {
                    console.warn('Error processing header', e);
                }
            }
        } catch (e) {
            console.error('Error reading request headers', e);
        }

        // do not modify headers
        return {};
    },
    { urls: ["*://portal.inexture.com/*", "*://api.portal.inexture.com/*", "*://*.portal.inexture.com/*"] },
    ["requestHeaders", "extraHeaders"]
);

// Allow content scripts to ask the background to fetch API endpoints (so token isn't exposed)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // small developer-friendly message hooks: content-script pings are harmless and help debugging
    if (message && message.action === 'intellimate_event') {
        try {
            const info = message.event + (message.source ? (' (' + message.source + ')') : '');
            console.log('content-script event:', info, message);
        } catch (e) { console.warn('Error logging intellimate_event', e); }
    }

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

                const isAuthError = status === 401 || (parsed && JSON.stringify(parsed).toLowerCase().includes('token_not_valid'));

                // If unauthorized, clear stored token and attempt page-based fetch (cookie/session).
                if (isAuthError) {
                    invalidateStoredToken('api 401');
                }

                const shouldPageFetch = isAuthError || !resp || status === 0;

                if (!shouldPageFetch) {
                    // If fetch succeeded or returned useful HTTP status, respond immediately.
                    if (resp && (resp.ok || status !== 0)) {
                        sendResponse({ status, ok: resp.ok, data: parsed });
                        return;
                    }
                }

                // Try to use a portal page tab to perform the request from the page
                // (which has cookie session and same-origin privileges).
                try {
                    chrome.tabs.query({ url: '*://portal.inexture.com/*' }, function(tabs) {
                        const handlePageFetch = (tabId) => {
                            chrome.tabs.sendMessage(tabId, { action: 'fetchFromPage', url }, (pageResp) => {
                                if (!pageResp) {
                                    sendResponse({ status, ok: resp ? resp.ok : false, data: parsed });
                                    return;
                                }

                                // if page fetch returned 401, clear saved token and notify UI
                                if (pageResp.status === 401) {
                                    invalidateStoredToken('page 401');
                                    try { chrome.runtime.sendMessage({ action: 'authRequired', status: 401 }); } catch(e) {}
                                }

                                // If the page fetch returned an Authorization bearer token in headers
                                // (page may cause the token to be issued via a redirect or XHR), we rely
                                // on our webRequest capture to store it. If not, just pass the page response back.
                                sendResponse(pageResp);
                            });
                        };

                        if (!tabs || !tabs.length) {
                            // No portal tab available — open a temporary background tab and ask it to fetch
                            chrome.tabs.create({ url: 'https://portal.inexture.com/time-entry', active: false }, function(newTab) {
                                if (!newTab || !newTab.id) { sendResponse({ status, ok: resp ? resp.ok : false, data: parsed }); return; }

                                const createdTabId = newTab.id;

                                // wait for the tab to finish loading
                                const onUpdated = function(tabId, changeInfo) {
                                    if (tabId !== createdTabId) return;
                                    if (changeInfo.status === 'complete') {
                                        chrome.tabs.onUpdated.removeListener(onUpdated);

                                        // ask the tab to do the fetch
                                        handlePageFetch(createdTabId);

                                        // close the temporary tab after a short delay to allow response
                                        setTimeout(() => {
                                            try { chrome.tabs.remove(createdTabId); } catch(e) {}
                                        }, 2000);
                                    }
                                };

                                chrome.tabs.onUpdated.addListener(onUpdated);
                                // also set a timeout to abort if the tab never loads
                                setTimeout(() => {
                                    chrome.tabs.onUpdated.removeListener(onUpdated);
                                    // if we didn't yet get a response, fallback to original result
                                    sendResponse({ status, ok: resp ? resp.ok : false, data: parsed });
                                }, 8000);
                            });
                        } else {
                            // pick first matching tab and ask it to fetch
                            handlePageFetch(tabs[0].id);
                        }
                    });
                    return;
                } catch (e) {
                    // fallback: send original response
                    sendResponse({ status, ok: resp ? resp.ok : false, data: parsed });
                    return;
                }
            } catch (err) {
                sendResponse({ error: String(err) });
            }
        });

        // Indicate we'll call sendResponse asynchronously
        return true;
    }
});
