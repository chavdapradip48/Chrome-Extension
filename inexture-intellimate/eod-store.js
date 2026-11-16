// Shared by eod-setup.js (page) and background.js (importScripts): folder handle in IndexedDB, EOD text cache in chrome.storage.local.
const EOD_FILE_RE = /^EOD_(\d{4}-\d{2}-\d{2})\.md$/i;

function eodOpenDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('intellimate', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('handles');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function eodIdb(mode, fn) {
    const db = await eodOpenDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('handles', mode);
        const req = fn(tx.objectStore('handles'));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = () => reject(tx.error);
    });
}

const eodSaveHandle = (handle) => eodIdb('readwrite', (s) => s.put(handle, 'eodDir'));
const eodLoadHandle = () => eodIdb('readonly', (s) => s.get('eodDir'));

// Reads every EOD_YYYY-MM-DD.md in the folder and replaces the cache.
async function eodSyncFromHandle(handle) {
    const cache = {};
    for await (const entry of handle.values()) {
        const m = entry.kind === 'file' && entry.name.match(EOD_FILE_RE);
        if (!m) continue;
        cache[m[1]] = await (await entry.getFile()).text();
    }
    const meta = { folder: handle.name, count: Object.keys(cache).length, syncedAt: new Date().toISOString() };
    await chrome.storage.local.set({ eodCache: cache, eodMeta: meta });
    return meta;
}

// Live read when the folder permission is still granted, else the cached copy.
async function eodGetForDate(isoDate) {
    try {
        const handle = await eodLoadHandle();
        if (handle && (await handle.queryPermission({ mode: 'read' })) === 'granted') {
            const fh = await handle.getFileHandle(`EOD_${isoDate}.md`).catch(() => null);
            if (fh) {
                const text = await (await fh.getFile()).text();
                const { eodCache = {} } = await chrome.storage.local.get('eodCache');
                eodCache[isoDate] = text;
                await chrome.storage.local.set({ eodCache });
                return text;
            }
        }
    } catch (e) {
        console.warn('EOD live read failed, using cache', e);
    }
    const { eodCache = {} } = await chrome.storage.local.get('eodCache');
    return eodCache[isoDate] || null;
}
