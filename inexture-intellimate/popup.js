document.getElementById("openPortal").addEventListener("click", function() {
    chrome.tabs.create({ url: "https://portal.inexture.com/time-entry" });
});

document.addEventListener("DOMContentLoaded", function () {
    const projectDropdown = document.getElementById("projectDropdown");
    const saveButton = document.getElementById("saveProject");
    const worklogButton = document.getElementById("goToWorklog");
    const authPrompt = document.getElementById('authPrompt');
    const goToLoginBtn = document.getElementById('goToLogin');
    console.log("Popup loaded");
    // Populate dropdown while loading
    projectDropdown.innerHTML = "<option>Loading projects...</option>";
    let fetchedTasks = [];

    // Save when the Save button is clicked
    saveButton.addEventListener("click", function () {
        const idx = parseInt(projectDropdown.value, 10);
        const selected = fetchedTasks[idx];
        if (!selected) {
            alert('No project selected');
            return;
        }

        // store both project and task so content script can use them
        chrome.storage.local.set({ currentProject: selected.project_name, currentTask: selected.task_name }, function () {
            alert("Project selection saved as: " + selected.project_name + ' / ' + selected.task_name);
        });
    });

    // Also save immediately when user changes selection (optional UX)
    projectDropdown.addEventListener('change', function () {
        const idx = parseInt(projectDropdown.value, 10);
        // update visible tooltip/title for the select so long names are readable on hover
        try { projectDropdown.title = projectDropdown.options[projectDropdown.selectedIndex].text; } catch(e){}

        // store the selected project+task names (not the index) so other parts of the extension
        // that expect names in storage continue to work.
        const sel = fetchedTasks[idx];
        if (sel) {
            chrome.storage.local.set({ currentProject: sel.project_name, currentTask: sel.task_name });
        }
    });

    // token display removed

    worklogButton.addEventListener("click", function () {
        chrome.tabs.create({ url: "https://portal.inexture.com/tasks" });
    });
    
    // --- New UI handlers and calculation logic ---
    const refreshBtn = document.getElementById('refreshBtn');
    const calcBtn = document.getElementById('calcBtn');
    const liveDurationEl = document.getElementById('liveDuration');
    const weeklyExtraEl = document.getElementById('weeklyExtra');
    const needToStayEl = document.getElementById('needToStay');
    const leaveAtEl = document.getElementById('leaveAt');
    const leaveWithExtraEl = document.getElementById('leaveWithExtra');
    const targetSelect = document.getElementById('targetSelect');
    const customTarget = document.getElementById('customTarget');
    const useWeeklyExtra = document.getElementById('useWeeklyExtra');

    targetSelect.addEventListener('change', () => {
        if (targetSelect.value === 'custom') customTarget.style.display = 'inline-block';
        else customTarget.style.display = 'none';
    });

    function timeToSeconds(time) {
        // time format HH:MM:SS
        const parts = time.split(':').map(Number);
        return parts[0]*3600 + parts[1]*60 + (parts[2] || 0);
    }

    function secondsToTime(seconds) {
        let hours = Math.floor(seconds/3600);
        seconds %= 3600;
        let minutes = Math.floor(seconds/60);
        seconds = seconds % 60;
        return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
    }

    function getApi(url) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'fetchWithToken', url }, (resp) => {
                try {
                    if (!resp) return reject(new Error('no_response'));
                    if (resp.error) return reject(new Error('fetch_error: ' + String(resp.error) + (resp.status ? ' status=' + resp.status : '')));
                    if (resp.status && !resp.ok) return reject(new Error('http_error: status=' + resp.status + ' data=' + JSON.stringify(resp.data)));
                    resolve(resp.data);
                } catch (ex) {
                    reject(new Error('getApi unexpected error: ' + String(ex)));
                }
            });
        });
    }

    // Fetch projects/tasks from API and populate the dropdown
    async function fetchAndPopulateProjects() {
        projectDropdown.innerHTML = '<option>Loading projects...</option>';
        try {
            const url = 'https://api.portal.inexture.com/api/v1/project/my-tasks?public_access=true&page=1&page_size=50';
            const resp = await getApi(url);
            console.log('my-tasks response:', resp);
            fetchedTasks = (resp && resp.results) ? resp.results : [];

            if (!fetchedTasks.length) {
                projectDropdown.innerHTML = '<option>No projects found</option>';
                return;
            }

            projectDropdown.innerHTML = '';
            fetchedTasks.forEach((t, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                const longText = `${t.project_name} — ${t.task_name}`;
                opt.textContent = longText;
                // set a tooltip/title so the full value is visible on hover
                opt.title = longText;
                projectDropdown.appendChild(opt);
            });

            // hide any auth prompt if we successfully loaded projects
            showAuthPrompt(false);

            // set saved selection if exists
            chrome.storage.local.get(['currentProject', 'currentTask'], function (data) {
                const a = data.currentProject;
                const b = data.currentTask;
                if (a && b) {
                    const found = fetchedTasks.findIndex(ft => ft.project_name === a && ft.task_name === b);
                    if (found >= 0) {
                        projectDropdown.value = found;
                        try { projectDropdown.title = projectDropdown.options[projectDropdown.selectedIndex].text; } catch(e) {}
                    }
                }
            });
        } catch (e) {
                const msg = (e && e.message) ? e.message : JSON.stringify(e);
                try { console.warn('fetchAndPopulateProjects error', msg); } catch (_) { console.warn('fetchAndPopulateProjects error', e); }
            // If unauthorized or no token, show auth prompt
            if (msg && (msg.includes('no_token') || msg.includes('status=401') || msg.toLowerCase().includes('token_not_valid') )) {
                showAuthPrompt(true);
            } else {
                // Keep the UI minimal: show a neutral placeholder instead of error strings
                projectDropdown.innerHTML = '<option>Choose a project</option>';
                showAuthPrompt(false);
            }
        }
    }

    // call fetch after getApi is defined
    fetchAndPopulateProjects();

    function showAuthPrompt(show) {
        if (show) {
            if (projectDropdown) projectDropdown.style.display = 'none';
            if (saveButton) saveButton.style.display = 'none';
            if (worklogButton) worklogButton.style.display = 'none';
            if (authPrompt) authPrompt.style.display = 'block';
        } else {
            if (projectDropdown) projectDropdown.style.display = '';
            if (saveButton) saveButton.style.display = '';
            if (worklogButton) worklogButton.style.display = '';
            if (authPrompt) authPrompt.style.display = 'none';
        }
    }

    // expose login button to open in new tab if needed (default anchor handles it)
    if (goToLoginBtn) goToLoginBtn.addEventListener('click', () => {
        // UI action only — anchor will open link
    });

    // Listen for authRequired broadcast from background
    chrome.runtime.onMessage.addListener((msg) => {
        if (!msg || !msg.action) return;
        if (msg.action === 'authRequired') {
            showAuthPrompt(true);
            liveDurationEl.innerText = '—';
            weeklyExtraEl.innerText = '—';
        }
    });

    const resultsLoader = document.getElementById('resultsLoader');

    async function refreshDataAndDisplay() {
        // show loader
        if (resultsLoader) resultsLoader.style.display = 'flex';
        liveDurationEl.innerText = '...';
        weeklyExtraEl.innerText = '...';
        needToStayEl.innerText = '...';
        leaveAtEl.innerText = '...';
        leaveWithExtraEl.innerText = '...';

        const today = new Date();
        const month = today.getMonth()+1;
        const year = today.getFullYear();
        const todayISO = today.toISOString().slice(0,10);

        // fetch live
        try {
            const live = await getApi(`https://api.portal.inexture.com/api/v1/time-entry/my_live_time_entry?month=${month}&year=${year}`);
            console.log('my_live_time_entry response:', live);
            let liveSeconds = 0;
            if (live && live.results && live.results.length) {
                const item = live.results.find(r => r.log_date === todayISO) || live.results[0];
                if (item && item.total_duration) {
                    liveSeconds = timeToSeconds(item.total_duration);
                }
            }
            console.log('computed liveSeconds:', liveSeconds);
            liveDurationEl.innerText = secondsToTime(liveSeconds);

            // fetch monthly list and compute this week's extra
            let weeklyExtra = '00:00:00';
            try {
                const list = await getApi(`https://api.portal.inexture.com/api/v1/time-entry/my_time_entry/?month=${month}&year=${year}&page=1&page_size=50`);
                console.log('my_time_entry response:', list);
                if (list && list.results) {
                    // compute monday and startOfToday (exclude today's entries for "previous days of this week")
                    const now = new Date();
                    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    const day = now.getDay();
                    const diffToMonday = (day === 0) ? 6 : (day - 1);
                    const monday = new Date(now);
                    monday.setDate(now.getDate() - diffToMonday);
                    monday.setHours(0,0,0,0);

                    let weeklySeconds = 0;
                    list.results.forEach(r => {
                        if (!r.log_date || !r.total_duration) return;
                        const entryDate = new Date(r.log_date + 'T00:00:00');
                        // include only previous days (>= monday && < startOfToday)
                        if (entryDate >= monday && entryDate < startOfToday) {
                            weeklySeconds += timeToSeconds(r.total_duration);
                        }
                    });

                    // count working days from monday to yesterday (exclude today)
                    let workDays = 0;
                    for (let d = new Date(monday); d < startOfToday; d.setDate(d.getDate()+1)) {
                        const wd = d.getDay(); if (wd !== 0 && wd !== 6) workDays++;
                    }

                    const targetWeekSeconds = timeToSeconds('08:20:00') * workDays;
                    console.log({ monday, startOfToday, workDays, weeklySeconds, targetWeekSeconds });
                    if (weeklySeconds > targetWeekSeconds) weeklyExtra = secondsToTime(weeklySeconds - targetWeekSeconds);
                    else weeklyExtra = '-' + secondsToTime(targetWeekSeconds - weeklySeconds);
                }
            } catch (e) {
                console.warn('error fetching weekly list:', (e && e.message) ? e.message : e);
                if (e && e.error === 'no_token') weeklyExtra = '—';
                else if (e && e.status === 401) weeklyExtra = '—';
                else weeklyExtra = '—';
            }

            weeklyExtraEl.innerText = weeklyExtra;
            // success — ensure auth prompt is hidden
            showAuthPrompt(false);
        } catch (e) {
            try { console.warn('refresh error', (e && e.message) ? e.message : JSON.stringify(e)); } catch (_) { console.warn('refresh error', e); }
            // Keep UI clean: show placeholders instead of verbose errors
            liveDurationEl.innerText = '—';
            weeklyExtraEl.innerText = '—';
        }

        // compute leave times automatically after refresh
        try {
            computeLeaveTimes();
        } catch (e) {
            console.warn('computeLeaveTimes error after refresh', e);
        } finally {
            // hide loader
            if (resultsLoader) resultsLoader.style.display = 'none';
        }
    }

    function computeLeaveTimes() {
        const liveText = liveDurationEl.innerText;
        // If liveText is not a valid HH:MM:SS string, clear outputs and return
        if (!liveText || liveText === '...' || liveText === 'err' || liveText === '—') {
            needToStayEl.innerText = '—';
            leaveAtEl.innerText = '—';
            leaveWithExtraEl.innerText = '—';
            return;
        }

        // basic validation: must contain colons and digits
        if (typeof liveText !== 'string' || !/^[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?$/.test(liveText)) {
            needToStayEl.innerText = '—';
            leaveAtEl.innerText = '—';
            leaveWithExtraEl.innerText = '—';
            return;
        }

        const liveSeconds = timeToSeconds(liveText);

        // target selection
        let target = targetSelect.value;
        if (target === 'custom') {
            const t = customTarget.value; // format HH:MM or HH:MM:SS depending on input
            if (!t) target = '08:20:00';
            else {
                const parts = t.split(':');
                if (parts.length === 2) target = `${parts[0]}:${parts[1]}:00`;
                else target = t;
            }
        }
        const targetSeconds = timeToSeconds(target);

        const needSeconds = Math.max(0, targetSeconds - liveSeconds);

        if (liveSeconds >= targetSeconds) {
            // Target reached: show target and overtime info
            const overtime = liveSeconds - targetSeconds;
            const overtimeText = secondsToTime(overtime);
            needToStayEl.innerText = `00:00:00 (Target ${secondsToTime(targetSeconds)} reached — +${overtimeText})`;
            leaveAtEl.innerText = 'Now';
        } else {
            needToStayEl.innerText = secondsToTime(needSeconds);
            leaveAtEl.innerText = addSecondsToCurrentTime(needSeconds);
        }

        // using weekly extra
        const weeklyText = weeklyExtraEl.innerText;
        let leaveWithExtra = '—';
        if (useWeeklyExtra.checked && weeklyText && weeklyText !== '...' && weeklyText !== 'err' && weeklyText !== '—') {
            // weeklyText may be '-HH:MM:SS' or 'HH:MM:SS'
            const extraIsNegative = typeof weeklyText === 'string' && weeklyText.trim().startsWith('-');
            const weeklyClean = (typeof weeklyText === 'string') ? weeklyText.replace('-', '') : '';
            if (/^[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?$/.test(weeklyClean)) {
                const weeklySeconds = timeToSeconds(weeklyClean);
                let capped = weeklySeconds;
                if (capped > timeToSeconds('01:20:00')) capped = timeToSeconds('01:20:00');

                const required = Math.max(0, targetSeconds - liveSeconds);
                const afterUsing = extraIsNegative ? required + capped : Math.max(0, required - capped);
                // If target already reached, user can leave now even after considering weekly extra
                if (liveSeconds >= targetSeconds) {
                    leaveWithExtra = 'Now';
                } else {
                    leaveWithExtra = addSecondsToCurrentTime(afterUsing);
                }
            } else {
                leaveWithExtra = '—';
            }
        }

        leaveWithExtraEl.innerText = leaveWithExtra;
    }

    refreshBtn.addEventListener('click', refreshDataAndDisplay);
    calcBtn.addEventListener('click', computeLeaveTimes);

    // auto refresh on open
    refreshDataAndDisplay();

    // helper to add seconds to current time for popup display
    function addSecondsToCurrentTime(secondsToAdd) {
        let currentTime = new Date();
        currentTime.setSeconds(currentTime.getSeconds() + secondsToAdd);
        let hours = String(currentTime.getHours()).padStart(2, '0');
        let minutes = String(currentTime.getMinutes()).padStart(2, '0');
        let seconds = String(currentTime.getSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }
});
