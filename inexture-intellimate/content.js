var timeEntryLoad = setInterval(function () {
    if (!window.location.pathname.includes("/time-entry")) return;
    var currentTimeType = document.querySelector('input.globalTable-Input-input.globalTable-Select-input[aria-haspopup="listbox"]');
    var yesterdayTimeEnt = getTimeFromTableByDate(getSpecifiedDayStringFromToday(-1));

    if (yesterdayTimeEnt) {
        clearInterval(timeEntryLoad);
    } else if (!yesterdayTimeEnt && currentTimeType && currentTimeType.value != "Today") {
        clearInterval(timeEntryLoad);
    }
}, 3000);

function getSpecifiedDayStringFromToday(offset) {
    let date = new Date();
    date.setDate(date.getDate() + offset);

    const day = date.getDay();

    if (offset > 0 && (day === 6 || day === 0)) date.setDate(date.getDate() + (day === 6 ? 2 : 1));
    else if (offset < 0 && (day === 6 || day === 0)) date.setDate(date.getDate() - (day === 6 ? 1 : 2));

    return date.toLocaleDateString('en-GB');
}

// helper to ask background to fetch an URL with stored token
function fetchFromBackground(url) {
    return new Promise((resolve, reject) => {
        try {
            chrome.runtime.sendMessage({ action: 'fetchWithToken', url }, (response) => {
                if (!response) return reject('no_response');
                if (response.error) return reject(response.error);
                resolve(response.data || response);
            });
        } catch (e) {
            reject(e);
        }
    });
}

function parseGBDateString(str) {
    if (!str) return null;
    const parts = str.split('/');
    if (parts.length < 3) return null;
    const [d, m, y] = parts.map(Number);
    if (!d || !m || !y) return null;
    const fullYear = y < 100 ? 2000 + y : y;
    const dt = new Date(fullYear, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
}

function formatDateToGB(dateObj) {
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return null;
    return dateObj.toLocaleDateString('en-GB');
}

async function refreshTimeEntriesFromApi(targetDateString) {
    const baseDate = parseGBDateString(targetDateString) || new Date();
    const pairs = [];
    const addPair = (dt) => {
        pairs.push({ month: dt.getMonth() + 1, year: dt.getFullYear() });
    };
    addPair(baseDate);
    const prev = new Date(baseDate);
    prev.setMonth(prev.getMonth() - 1);
    addPair(prev);

    const seen = new Set();
    const uniquePairs = pairs.filter(p => {
        const key = `${p.year}-${p.month}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    let collected = [];
    for (const p of uniquePairs) {
        const url = `https://api.portal.inexture.com/api/v1/time-entry/my_time_entry/?month=${p.month}&year=${p.year}&page=1&page_size=100`;
        try {
            const resp = await fetchFromBackground(url);
            if (resp && resp.results) {
                const entries = resp.results.map(r => {
                    const d = r.log_date ? new Date(r.log_date) : null;
                    const formatted = d ? formatDateToGB(d) : null;
                    const normalized = normalizeTimeString(r.total_duration) || normalizeTimeString(r.totalDuration) || r.total_duration || r.totalDuration || null;
                    if (!formatted || !normalized) return null;
                    return { date: formatted, total: normalized };
                }).filter(Boolean);
                collected = collected.concat(entries);
            }
        } catch (e) {
            console.warn('refreshTimeEntriesFromApi error', e);
        }
    }

    return collected;
}

// Allow background/service-worker to ask the page (via content script) to perform
// a same-origin fetch using the page context so cookies/session auth is used and
// CORS isn't an issue for portal-origin requests.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.action) return;

    if (message.action === 'fetchFromPage') {
        const url = message.url;
        fetch(url, { credentials: 'include', headers: { 'Accept': 'application/json' } })
            .then(async (resp) => {
                const status = resp.status;
                let data = null;
                try { data = await resp.json(); } catch (e) { data = null; }
                sendResponse({ status, ok: resp.ok, data });
            })
            .catch(err => {
                sendResponse({ error: String(err) });
            });

        return true;
    }
});

let projectName = "";
let projectTask = "";
let currentProject = "";

// Function to load project selection from chrome.storage.local; falls back to API first entry if nothing is saved.
function setTimePortal() {
    return new Promise((resolve) => {
        try {
            chrome.storage.local.get(["currentProject", "currentTask"], async function (data) {
                try {
                    if (data.currentProject && data.currentTask) {
                        projectName = data.currentProject;
                        projectTask = data.currentTask;
                        currentProject = data.currentProject;
                        return resolve();
                    }

                    // Fallback: fetch first project/task from API so we still auto-select something.
                    try {
                        const resp = await fetchFromBackground('https://api.portal.inexture.com/api/v1/project/my-tasks?public_access=true&page=1&page_size=50');
                        if (resp && resp.results && resp.results.length) {
                            const first = resp.results[0];
                            projectName = first.project_name;
                            projectTask = first.task_name;
                            currentProject = first.project_name;
                            chrome.storage.local.set({ currentProject: projectName, currentTask: projectTask });
                        }
                    } catch (e) {
                        console.warn('setTimePortal: API fallback failed', e);
                    }
                } catch (e) { /* ignore */ }
                resolve();
            });
        } catch (e) {
            console.warn('setTimePortal error', e);
            resolve();
        }
    });
}

// Wait for modal/dialog element to appear. Returns the modal element or null if timed out.
function waitForModal(timeout = 4000, interval = 120) {
    const modalSelectors = ['[role="dialog"]', '.inexture-Modal-root', '.inexture-Modal', '.modal', '.Dialog-root', '.mantine-Modal', '.inexture-Popover-root'];
    const end = Date.now() + timeout;
    return new Promise((resolve) => {
        const check = () => {
            for (const sel of modalSelectors) {
                const el = document.querySelector(sel);
                if (el) return resolve(el);
            }
            if (Date.now() < end) setTimeout(check, interval);
            else resolve(null);
        };
        check();
    });
}

function findWorklogAddButton() {
    const byId = document.querySelector("button#add_worklog_btn_id");
    if (byId) return byId;

    const modalSelectors = ['[role="dialog"]', '.inexture-Modal-root', '.inexture-Modal', '.modal', '.Dialog-root', '.mantine-Modal'];
    const modals = Array.from(document.querySelectorAll(modalSelectors.join(',')));
    for (const modal of modals) {
        const titleNode = modal.querySelector('h1,h2,h3,.inexture-Modal-title,.mantine-Modal-title,[data-title]');
        const titleText = (titleNode && titleNode.innerText ? titleNode.innerText : '').toLowerCase();
        if (!titleText.includes('worklog')) continue;
        const buttons = Array.from(modal.querySelectorAll('button'));
        const addBtn = buttons.find(btn => (btn.innerText || '').trim().toLowerCase() === 'add');
        if (addBtn) return addBtn;
    }
    return null;
}

// Attach event listener to "Add Entry" button
function attachButtonEventListener() {
    const addButton = findWorklogAddButton();

    if (addButton && !addButton.dataset.intellimateBound) {
        const modalSelectors = ['[role="dialog"]', '.inexture-Modal-root', '.inexture-Modal', '.modal', '.Dialog-root', '.mantine-Modal', '.inexture-Popover-root'];
        const modalFromButton = addButton.closest(modalSelectors.join(','));
        if (modalFromButton) lastModalContext = modalFromButton;
        addButton.addEventListener("click", async () => {
            // Wait for modal to appear so inputs exist before filling values
            const modal = await waitForModal(4500);
            if (modal) lastModalContext = modal;

            await getAndSetWorklogTime(lastModalContext || document);
            setTimeout(async () => {
                await setTimePortal();
                const activeModal = lastModalContext || await waitForModal(4500);
                if (activeModal) {
                    lastModalContext = activeModal;
                    selectProjectAndTask(projectName, projectTask, activeModal);
                } else {
                    selectProjectAndTask(projectName, projectTask);
                }
            }, 500);
            
            setTimeout(async () => {
                const activeModal = lastModalContext || await waitForModal(4500);
                if (activeModal) lastModalContext = activeModal;
                await getAndSetWorklogTime(lastModalContext || document);
            }, 1000);
        });
        addButton.dataset.intellimateBound = "1";
    }
}

let lastModalContext = null;

async function getAndSetWorklogTime(ctx) {
    const context = ctx || document;
    const currentWorklogElement = findCurrentWorklogDateElement(context);
    const currentWorklogDate = extractDateValue(currentWorklogElement);

    if (!currentWorklogDate) return;

    let timeRaw = null;
    try {
        const entries = await refreshTimeEntriesFromApi(currentWorklogDate);
        if (entries && entries.length) {
            const match = entries.find(entry => entry.date === currentWorklogDate);
            if (match && match.total) timeRaw = match.total;
        }
    } catch (e) {
        console.warn('refreshTimeEntriesFromApi failed', e);
    }
    // Fallback: read directly from visible table if API doesn't return a match.
    if (!timeRaw) timeRaw = getTimeFromTableByDate(currentWorklogDate, context) || null;

    const parsed = parseTotalTimeToHM(timeRaw);
    console.log("Total Time:", timeRaw, 'parsed:', parsed);
    if (parsed) {
        setWorklogTime(parsed.hours, parsed.minutes, context);
    }
}

function findCurrentWorklogDateElement(ctx = document) {
    const selectors = [
        'button[id^=\"mantine-\"].inexture-Input-input.inexture-DatePickerInput-input',
        'input.inexture-DatePickerInput-input',
        'input[type=\"date\"]',
        'input[placeholder*=\"Date\"]',
        'input[aria-label*=\"Date\"]',
        'button[aria-label*=\"Date\"]'
    ];
    for (const sel of selectors) {
        const el = ctx.querySelector(sel);
        if (el) return el;
    }
    return null;
}

function extractDateValue(el) {
    if (!el) return null;
    if (typeof el.value === 'string' && el.value.trim()) return el.value.trim();
    if (el.innerText && el.innerText.trim()) return el.innerText.trim();
    return null;
}

function parseTotalTimeToHM(total) {
    if (!total) return null;
    const cleaned = total.toString().trim();

    // Match patterns like "8h 30m 0s" or "8h 30m"
    const hmsMatch = cleaned.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?$/i);
    if (hmsMatch && (hmsMatch[1] || hmsMatch[2] || hmsMatch[3])) {
        return {
            hours: (hmsMatch[1] || '0').padStart(2, '0'),
            minutes: (hmsMatch[2] || '0').padStart(2, '0'),
            seconds: (hmsMatch[3] || '0').padStart(2, '0')
        };
    }

    // Match colon formats like "08:30" or "08:30:00"
    const colonParts = cleaned.split(':');
    if (colonParts.length >= 2) {
        return {
            hours: (colonParts[0] || '0').padStart(2, '0'),
            minutes: (colonParts[1] || '0').padStart(2, '0'),
            seconds: (colonParts[2] || '0').padStart(2, '0')
        };
    }

    // Match compact digits like "830" => 8:30
    const compact = cleaned.match(/^(\d{1,2})(\d{2})$/);
    if (compact) {
        return {
            hours: compact[1].padStart(2, '0'),
            minutes: compact[2].padStart(2, '0'),
            seconds: '00'
        };
    }
    return null;
}

function normalizeTimeString(total) {
    const parsed = parseTotalTimeToHM(total);
    if (!parsed) return null;
    return `${parsed.hours}:${parsed.minutes}:${parsed.seconds}`;
}

// Function to select worklog time
function setWorklogTime(hours, minutes, ctx) {
    if (hours !== null && minutes !== null) {
        const formattedHours = parseInt(hours, 10).toString();
        const formattedMinutes = parseInt(minutes, 10).toString();
        selectDropdownOption("Select Hours", formattedHours, 500, ctx);
        setTimeout(() => {
            selectDropdownOption("Select Minutes", formattedMinutes, 500, ctx);
        }, 1000);
    }
}

function getTimeFromTableByDate(dateString, ctx = document) {
    const table = ctx.querySelector(".mrt-table");
    if (!table) return null;
    const rows = Array.from(table.rows || []);
    for (let i = 1; i < rows.length; i++) { // skip header
        const row = rows[i];
        const firstCell = row.cells && row.cells[0];
        if (!firstCell) continue;
        const dateText = (firstCell.innerText || firstCell.textContent || '').trim();
        if (dateText === dateString) {
            const timeCell = row.cells[row.cells.length - 2];
            if (!timeCell) continue;
            return (timeCell.innerText || timeCell.textContent || '').trim();
        }
    }
    return null;
}

var yesterdayTimeLoadInterval;

function getAndSetLastDayTimeEntry() {
    let lastDayElement = document.evaluate("//p[text()='Last Day']", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (!lastDayElement) return
    let yesterdayTimeEntryRaw = lastDayElement.parentElement.parentElement.lastElementChild.firstElementChild.textContent;
    const normalized = normalizeTimeString(yesterdayTimeEntryRaw);
    if (!normalized || normalized === "00:00:00") return;
    clearInterval(yesterdayTimeLoadInterval);
    yesterdayTimeLoadInterval = null;
}

function selectProjectAndTask(project, task, modalContext) {
    if (project && task) {
        selectDropdownOption("Select Project", project, 500, modalContext);
        setTimeout(() => {
            selectDropdownOption("Select Task", task, 500, modalContext);
        }, 900); // Ensuring tasks load after selecting the project
    }
}

function selectDropdownOption(placeholder, dropValue, waitTime = 500, ctx = document, retried = false) {
    const desiredRaw = (dropValue || '').toString().trim();
    const desired = desiredRaw;
    const alt = desiredRaw.length === 1 ? desiredRaw.padStart(2, '0') : (desiredRaw.length === 2 && desiredRaw.startsWith('0') ? desiredRaw.slice(1) : desiredRaw);

    function findTrigger() {
        const selectors = [
            `[placeholder='${placeholder}']`,
            `[aria-label='${placeholder}']`,
            `[placeholder*='${placeholder}']`,
            `[aria-label*='${placeholder}']`,
            `button[title*='${placeholder}']`,
            `div[role='combobox']`,
            `button[role='combobox']`,
            `select`
        ];
        for (const sel of selectors) {
            const el = ctx.querySelector(sel);
            if (el) return el;
        }

        // try label text
        const labels = Array.from(ctx.querySelectorAll('label'));
        for (const lab of labels) {
            try {
                if (lab.innerText && lab.innerText.trim().toLowerCase().includes(placeholder.toLowerCase())) {
                    const container = lab.parentElement || lab.closest('div');
                    if (container) {
                        const candidate = container.querySelector('button, input, select, div[role="combobox"], .inexture-Select-control, .mantine-Select-control');
                        if (candidate) return candidate;
                    }
                }
            } catch (e) { /* ignore */ }
        }

        // fallback: any element that shows placeholder text
        const all = Array.from(ctx.querySelectorAll('button,div,span'));
        for (const el of all) {
            try {
                if (el.innerText && el.innerText.trim().toLowerCase().includes(placeholder.toLowerCase())) {
                    const candidate = el.querySelector('button, input, select, div[role="combobox"]');
                    if (candidate) return candidate;
                }
            } catch (e) {}
        }
        return null;
    }

    const trigger = findTrigger();
    if (!trigger) {
        console.warn(`Dropdown trigger for '${placeholder}' not found`);
        return;
    }

    // Handle native <select> elements directly without waiting for custom dropdowns.
    if (trigger.tagName && trigger.tagName.toLowerCase() === 'select') {
        const options = Array.from(trigger.options || []);
        const match = options.find(opt => {
            const text = (opt.innerText || '').trim();
            const val = (opt.value || '').trim();
            return text === desired || text === alt || val === desired || val === alt || text.includes(desired);
        });

        if (match) {
            trigger.value = match.value;
            trigger.dispatchEvent(new Event('input', { bubbles: true }));
            trigger.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            console.warn(`Option '${dropValue}' not found for '${placeholder}'`);
        }
        return;
    }

    try { trigger.click(); } catch (e) { try { trigger.focus(); trigger.click(); } catch (_) {} }

    setTimeout(() => {
        let foundDropdown = false;

        const dropdownNodes = document.querySelectorAll(".inexture-Popover-dropdown.inexture-Select-dropdown, .mantine-Select-dropdown, [role='listbox']");
        dropdownNodes.forEach(dropdown => {
            if (dropdown.style.display === 'none' || dropdown.offsetHeight <= 0 || dropdown.offsetWidth <= 0) return;
            let selectedOption = null;
            dropdown.querySelectorAll("div[data-combobox-option='true'], [role='option']").forEach(option => {
                const textValue = option.innerText.trim();
                if (textValue === desired || textValue === alt || textValue.includes(desired) || textValue.includes(alt)) {
                    selectedOption = option;
                }
            });

            if (selectedOption) {
                selectedOption.click();
                foundDropdown = true;
            }
        });

        if (!foundDropdown) {
            if (!retried) {
                // try once more after a short delay
                setTimeout(() => selectDropdownOption(placeholder, dropValue, waitTime, ctx, true), 300);
            } else {
                console.warn('No visible dropdown was found or options were not selected');
            }
        }
    }, waitTime);
}

function timeEntryPageCheck() {
    const onTimeEntry = window.location.pathname == "/time-entry";
    if (onTimeEntry) {
        if (!yesterdayTimeLoadInterval) {
            yesterdayTimeLoadInterval = setInterval(function () {
                getAndSetLastDayTimeEntry();
            }, 3000);
        }
    } else if (yesterdayTimeLoadInterval) {
        clearInterval(yesterdayTimeLoadInterval);
        yesterdayTimeLoadInterval = null;
    }
}

// Observe DOM changes and attach event listener
const observer = new MutationObserver((mutationsList) => {
    mutationsList.forEach(mutation => {
        if (mutation.type === 'childList') {
            timeEntryPageCheck();
            attachButtonEventListener();
        }
    });
});

// Start observing the DOM for added nodes
observer.observe(document.body, { childList: true, subtree: true });

// Initialize project selection on script load
setTimePortal();
