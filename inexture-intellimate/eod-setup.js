const statusEl = document.getElementById('status');
const chooseBtn = document.getElementById('chooseBtn');
const syncBtn = document.getElementById('syncBtn');

function showStatus(meta, message, isError) {
    const lines = [];
    if (meta) {
        lines.push(`Folder: <strong>${meta.folder.replace(/[<>&"]/g, '')}</strong>`);
        lines.push(`EODs cached: <strong>${meta.count}</strong>`);
        lines.push(`Last sync: ${new Date(meta.syncedAt).toLocaleString('en-GB')}`);
    } else {
        lines.push('No folder chosen yet.');
    }
    if (message) lines.push(`<span class="${isError ? 'err' : 'ok'}">${message}</span>`);
    statusEl.innerHTML = lines.join('<br>');
    syncBtn.disabled = !meta;
}

async function sync(handle) {
    const meta = await eodSyncFromHandle(handle);
    showStatus(meta, `Synced ${meta.count} EOD file(s).`);
}

chooseBtn.addEventListener('click', async () => {
    try {
        const handle = await window.showDirectoryPicker({ id: 'intellimate-eod', mode: 'read' });
        await eodSaveHandle(handle);
        await sync(handle);
    } catch (e) {
        if (e.name === 'AbortError') return;
        const { eodMeta } = await chrome.storage.local.get('eodMeta');
        showStatus(eodMeta, 'Could not read folder: ' + e.message, true);
    }
});

syncBtn.addEventListener('click', async () => {
    const { eodMeta } = await chrome.storage.local.get('eodMeta');
    try {
        const handle = await eodLoadHandle();
        if (!handle) return showStatus(eodMeta, 'Choose the folder first.', true);
        // Button click gives the user gesture Chrome needs to re-grant access.
        if ((await handle.requestPermission({ mode: 'read' })) !== 'granted') {
            return showStatus(eodMeta, 'Folder access was not allowed.', true);
        }
        await sync(handle);
    } catch (e) {
        showStatus(eodMeta, 'Sync failed: ' + e.message, true);
    }
});

// Auto-sync on open when access is still granted.
(async () => {
    const { eodMeta } = await chrome.storage.local.get('eodMeta');
    showStatus(eodMeta);
    try {
        const handle = await eodLoadHandle();
        if (handle && (await handle.queryPermission({ mode: 'read' })) === 'granted') await sync(handle);
        else if (handle) showStatus(eodMeta, 'Click Sync Now to allow folder access again.');
    } catch (e) { /* keep cached status */ }
})();
