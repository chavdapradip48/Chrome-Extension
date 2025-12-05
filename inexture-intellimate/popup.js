document.addEventListener("DOMContentLoaded", function () {
    const projectDropdown = document.getElementById("projectDropdown");
    const saveButton = document.getElementById("saveProject");
    const worklogButton = document.getElementById("goToWorklog");
    const authPrompt = document.getElementById('authPrompt');
    const goToLoginBtn = document.getElementById('goToLogin');

    // If critical elements are missing, bail out to avoid runtime errors.
    if (!projectDropdown || !saveButton || !worklogButton) {
        console.warn('Popup required elements missing; aborting init');
        return;
    }

    console.log("Popup loaded");
    // Populate dropdown while loading
    projectDropdown.innerHTML = "<option>Loading projects...</option>";
    // temporarily disable actions until projects load
    saveButton.disabled = true;
    worklogButton.disabled = true;
    projectDropdown.disabled = true;

    let fetchedTasks = [];
    // in seconds: positive => surplus, negative => deficit
    let lastWeeklySignedSeconds = null;
    let tasksLoaded = false;

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
    const calcAtEl = document.getElementById('calcAt');
    const calcAtTimeEl = document.getElementById('calcAtTime');
    const targetSelect = document.getElementById('targetSelect');
    const customTarget = document.getElementById('customTarget');
    const useWeeklyExtra = document.getElementById('useWeeklyExtra');
    const shortDayNoticeEl = document.getElementById('shortDayNotice');
    const shortDayOption = targetSelect ? targetSelect.querySelector('option[value="07:00:00"]') : null;

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
    function isLastWorkingDay(dateObj) {
        const d = (dateObj && dateObj instanceof Date) ? dateObj : new Date();
        return d.getDay() === 5; // Friday treated as last working day
    }
    const fullDaySeconds = timeToSeconds('08:20:00');
    const shortDaySeconds = timeToSeconds('07:00:00');
    let shortDayUsedBeforeToday = false;

    function setShortDayNotice(message, tone = 'info') {
        if (!shortDayNoticeEl) return;
        if (!message) {
            shortDayNoticeEl.style.display = 'none';
            shortDayNoticeEl.classList.remove('notice-alert');
            return;
        }
        shortDayNoticeEl.style.display = 'block';
        if (tone === 'alert') shortDayNoticeEl.classList.add('notice-alert');
        else shortDayNoticeEl.classList.remove('notice-alert');
        shortDayNoticeEl.innerText = message;
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
                projectDropdown.disabled = false;
                worklogButton.disabled = false;
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

            // enable controls now that we have data
            tasksLoaded = true;
            saveButton.disabled = false;
            worklogButton.disabled = false;
            projectDropdown.disabled = false;
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
            // allow navigation even if selection fails; keep save disabled to avoid storing empty values
            worklogButton.disabled = false;
            projectDropdown.disabled = false;
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
            let shortDayCount = 0;
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
                            const entrySeconds = timeToSeconds(r.total_duration);
                            weeklySeconds += entrySeconds;
                            // count short-day usage (any worked day under 8:20)
                            if (entrySeconds > 0 && entrySeconds < fullDaySeconds) shortDayCount += 1;
                        }
                    });

                    // count working days from monday to yesterday (exclude today)
                    let workDays = 0;
                    for (let d = new Date(monday); d < startOfToday; d.setDate(d.getDate()+1)) {
                        const wd = d.getDay(); if (wd !== 0 && wd !== 6) workDays++;
                    }

                    const targetWeekSeconds = timeToSeconds('08:20:00') * workDays;
                    console.log({ monday, startOfToday, workDays, weeklySeconds, targetWeekSeconds });
                    if (weeklySeconds > targetWeekSeconds) {
                        weeklyExtra = secondsToTime(weeklySeconds - targetWeekSeconds);
                        lastWeeklySignedSeconds = (weeklySeconds - targetWeekSeconds); // positive
                    } else {
                        weeklyExtra = '-' + secondsToTime(targetWeekSeconds - weeklySeconds);
                        lastWeeklySignedSeconds = (weeklySeconds - targetWeekSeconds); // negative
                    }

                    // short-day allowance: only one sub-8:20 day allowed per week
                    shortDayUsedBeforeToday = shortDayCount > 0;
                    if (shortDayOption) shortDayOption.disabled = shortDayUsedBeforeToday;
                    if (shortDayUsedBeforeToday && targetSelect.value === '07:00:00') targetSelect.value = '08:20:00';
                    if (shortDayUsedBeforeToday) {
                        setShortDayNotice('7h allowance already used earlier this week.', 'alert');
                    } else {
                        setShortDayNotice('One 7h allowance available this week.', 'info');
                    }
                }
            } catch (e) {
                console.warn('error fetching weekly list:', (e && e.message) ? e.message : e);
                if (e && e.error === 'no_token') weeklyExtra = '—';
                else if (e && e.status === 401) weeklyExtra = '—';
                else weeklyExtra = '—';
                lastWeeklySignedSeconds = null;
                shortDayUsedBeforeToday = false;
                if (shortDayOption) shortDayOption.disabled = false;
                setShortDayNotice(null);
            }

            weeklyExtraEl.innerText = weeklyExtra;
            // keep the element text but remember we cached numeric signed value
            // success — ensure auth prompt is hidden
            showAuthPrompt(false);
        } catch (e) {
            try { console.warn('refresh error', (e && e.message) ? e.message : JSON.stringify(e)); } catch (_) { console.warn('refresh error', e); }
            // Keep UI clean: show placeholders instead of verbose errors
            liveDurationEl.innerText = '—';
            weeklyExtraEl.innerText = '—';
        }

        // compute leave times automatically after refresh — pass a fixed base time so the
        // calculated 'leave' timestamps remain stable until the next refresh (they won't
        // continuously slide forward as `Now` moves).
        try {
            // use the 'today' anchor from above as a stable base timestamp
            computeLeaveTimes(today);
        } catch (e) {
            console.warn('computeLeaveTimes error after refresh', e);
        } finally {
            // hide loader
            if (resultsLoader) resultsLoader.style.display = 'none';
        }
    }

    // If a baseDate is provided, use that as the anchor for timestamp calculations.
    // Otherwise fallback to the current time when computeLeaveTimes is called.
    function computeLeaveTimes(baseDate) {
        // update 'calculated at' label when a baseDate is provided
        try {
            if (baseDate && baseDate instanceof Date) {
                if (calcAtEl && calcAtTimeEl) {
                    calcAtTimeEl.innerText = formatClock(baseDate);
                    calcAtEl.style.display = 'block';
                }
            } else {
                if (calcAtEl) calcAtEl.style.display = 'none';
            }
        } catch (e) { /* ignore formatting errors */ }
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
        const baseRefDate = (baseDate && baseDate instanceof Date) ? baseDate : new Date();

        // target selection
        let target = targetSelect.value;
        const requestedShortDay = target === '07:00:00';
        const shortDayAllowedNow = !shortDayUsedBeforeToday;
        if (requestedShortDay && !shortDayAllowedNow) {
            target = '08:20:00';
            if (targetSelect.value === '07:00:00') targetSelect.value = '08:20:00';
            setShortDayNotice('7h allowance already used earlier this week. Minimum 08:20 applies. Weekly minimum stays 41:40.', 'alert');
        } else if (requestedShortDay && shortDayAllowedNow) {
            setShortDayNotice('Using your single 7h allowance for this week. Remaining days must meet 08:20 (weekly minimum 41:40).', 'info');
        }
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

        const weeklyDeficitSeconds = (typeof lastWeeklySignedSeconds === 'number' && lastWeeklySignedSeconds < 0) ? Math.abs(lastWeeklySignedSeconds) : 0;
        const isLastDay = isLastWorkingDay(baseRefDate);
        let staySeconds = Math.max(0, targetSeconds - liveSeconds);
        let enforcedWeeklyDeficit = false;

        if (isLastDay && weeklyDeficitSeconds > 0) {
            staySeconds += weeklyDeficitSeconds;
            enforcedWeeklyDeficit = true;
        }

        if (!enforcedWeeklyDeficit && liveSeconds >= targetSeconds) {
            // Target reached: show target and overtime info
            const overtime = liveSeconds - targetSeconds;
            const overtimeText = secondsToTime(overtime);
            needToStayEl.innerText = `00:00:00 (Target ${secondsToTime(targetSeconds)} reached — +${overtimeText})`;
            leaveAtEl.innerText = 'Now';
        } else {
            if (enforcedWeeklyDeficit) {
                needToStayEl.innerText = `${secondsToTime(staySeconds)} (includes weekly deficit ${secondsToTime(weeklyDeficitSeconds)})`;
            } else {
                needToStayEl.innerText = secondsToTime(staySeconds);
            }
            leaveAtEl.innerText = addSecondsToCurrentTime(staySeconds, baseRefDate);
        }

        // using weekly extra
        // prefer using cached numeric weekly signed seconds when available (avoid races)
        const weeklyText = weeklyExtraEl.innerText;
        const cachedSigned = (typeof lastWeeklySignedSeconds === 'number') ? lastWeeklySignedSeconds : null;
        let leaveWithExtra = '—';
        if (!enforcedWeeklyDeficit && useWeeklyExtra.checked && weeklyText && weeklyText !== '...' && weeklyText !== 'err' && weeklyText !== '—') {
            // weeklyText may be '-HH:MM:SS' or 'HH:MM:SS'
            let extraIsNegative;
            let weeklyClean;
            let weeklySeconds;

            if (cachedSigned !== null) {
                extraIsNegative = cachedSigned < 0;
                weeklySeconds = Math.abs(cachedSigned);
                weeklyClean = secondsToTime(weeklySeconds);
            } else {
                extraIsNegative = typeof weeklyText === 'string' && weeklyText.trim().startsWith('-');
                weeklyClean = (typeof weeklyText === 'string') ? weeklyText.replace('-', '') : '';
                weeklySeconds = timeToSeconds(weeklyClean);
            }
            if (/^[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?$/.test(weeklyClean)) {
                // weeklySeconds is already computed/parsed above
                let capped = weeklySeconds;
                if (capped > timeToSeconds('01:20:00')) capped = timeToSeconds('01:20:00');

                // deltaToTarget: seconds remaining until target (positive when need to reach,
                // negative when target already reached = overtime seconds)
                const deltaToTarget = targetSeconds - liveSeconds;
                const required = Math.max(0, deltaToTarget);

                // today's overtime (seconds) — positive if we are past target
                const todayOvertime = Math.max(0, -deltaToTarget);

                // Determine anchorTime: the moment when today's target is (or will be) reached.
                // - if target is already reached, anchor = baseDate - overtime (when target completed)
                // - if not, anchor = baseDate + required (when target will be reached)
                let anchorMillis;
                try {
                    const baseMs = baseRefDate && baseRefDate instanceof Date ? baseRefDate.getTime() : Date.now();
                    if (liveSeconds >= targetSeconds) {
                        // completed earlier — anchor at the time target was reached
                        const overtimeSeconds = liveSeconds - targetSeconds;
                        anchorMillis = baseMs - (overtimeSeconds * 1000);
                    } else {
                        // target is in the future — anchor when it will be reached
                        anchorMillis = baseMs + (required * 1000);
                    }
                } catch (e) {
                    anchorMillis = Date.now();
                }

                if (extraIsNegative) {
                    // previous-days deficit
                    const prevDeficit = weeklySeconds;
                    // today's overtime reduces the previous deficit
                    const remainingDeficitAfterToday = Math.max(0, prevDeficit - todayOvertime);

                    const baseMs = baseRefDate && baseRefDate instanceof Date ? baseRefDate.getTime() : Date.now();

                    // If target already reached, remaining deficit must be earned from now onward
                    // (user already has todayOvertime; they need additional remainingDeficitAfterToday seconds)
                    let finalLeaveMillis;
                    if (liveSeconds >= targetSeconds) {
                        finalLeaveMillis = baseMs + (remainingDeficitAfterToday * 1000);
                    } else {
                        // target not yet reached: they must first reach target (required seconds),
                        // then cover the whole prevDeficit (todayOvertime is zero in this branch)
                        finalLeaveMillis = anchorMillis + (prevDeficit * 1000);
                    }

                    console.debug('leaveWithExtra (neg):', { anchor: new Date(anchorMillis).toLocaleTimeString(), prevDeficit, todayOvertime, remainingDeficitAfterToday, finalLeave: new Date(finalLeaveMillis).toLocaleTimeString() });
                    // If the computed final time is in the past compared to base, show 'Now'
                    leaveWithExtra = (finalLeaveMillis <= baseMs) ? 'Now' : formatClock(new Date(finalLeaveMillis));
                } else {
                    // previous-days surplus reduces the required time to reach target
                    const usableSurplus = Math.min(capped, weeklySeconds);
                    // newRequired is how many seconds are actually needed from now
                    // after using previous-days surplus. Use base time for final calculation.
                    const baseMs = baseRefDate && baseRefDate instanceof Date ? baseRefDate.getTime() : Date.now();
                    const newRequired = Math.max(0, required - usableSurplus);

                    // final leave is base + newRequired (shorter than anchor if surplus applies)
                    const finalLeaveMillis = baseMs + (newRequired * 1000);
                    // `newRequired` is the adjusted required seconds after taking usableSurplus into account.
                    console.debug('leaveWithExtra (pos):', { anchor: formatClock(new Date(anchorMillis)), usableSurplus, required, newRequired, finalLeave: formatClock(new Date(finalLeaveMillis)) });

                    // if final leave is in the past or now, show Now
                    leaveWithExtra = (finalLeaveMillis <= baseMs) ? 'Now' : formatClock(new Date(finalLeaveMillis));
                }
            } else {
                leaveWithExtra = '—';
            }
        }

        leaveWithExtraEl.innerText = enforcedWeeklyDeficit ? leaveAtEl.innerText : leaveWithExtra;
    }

    refreshBtn.addEventListener('click', refreshDataAndDisplay);
    calcBtn.addEventListener('click', () => computeLeaveTimes(new Date()));

    // auto refresh on open
    refreshDataAndDisplay();

    // helper to add seconds to current time for popup display
    function addSecondsToCurrentTime(secondsToAdd, baseDate) {
        // If caller provides a baseDate (Date instance), compute from that, otherwise use now.
        let currentTime = baseDate && (baseDate instanceof Date) ? new Date(baseDate.getTime()) : new Date();
        currentTime.setSeconds(currentTime.getSeconds() + secondsToAdd);
        return formatClock(currentTime);
    }

    // 12-hour clock helper with seconds
    function formatClock(dateObj) {
        try {
            return dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
        } catch (e) {
            // fallback to manual
            const d = new Date(dateObj.getTime ? dateObj.getTime() : Date.now());
            let h = d.getHours();
            const m = String(d.getMinutes()).padStart(2, '0');
            const s = String(d.getSeconds()).padStart(2, '0');
            const ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12; h = h ? h : 12;
            return `${h}:${m}:${s} ${ampm}`;
        }
    }
});
