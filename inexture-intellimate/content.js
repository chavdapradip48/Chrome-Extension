var isButtonAdded = false;
var targetTimeSeconds = timeToSeconds('08:20:00');
var dayMustTimeSeconds = timeToSeconds('07:00:00');
var dayExtraUseTimeSeconds = timeToSeconds('01:20:00');
var minLeaveTime = "17:30:00";
var dayStartTime = "10:00:00";
var minLeaveTimeSeconds = timeToSeconds(minLeaveTime);

function checkAndAddButton() {
    if (window.location.pathname !== "/time-entry") {
        var stickButton = document.getElementById("sticky-button");
        if (stickButton) {
            stickButton.remove();
            isButtonAdded = false;
        }
        return;
    }
    if (isButtonAdded) return;

    isButtonAdded = true;
    addButtonInBody('Calculate Time', 'sticky-button', '#007bff', 'white');
    var calculateBtn = document.getElementById('sticky-button');
    if (calculateBtn) {
        calculateBtn.addEventListener('click', async function () {
            try {
                const msg = await calculateTimeDifferenceUsingApi();
                alert(msg);
            } catch (e) {
                console.error('Error calculating time:', e);
                alert('Error calculating time: ' + e);
            }
        });
    }
}
function addButtonInBody(name, id, backgroudColor, color) {
  const button = document.createElement('button');
  button.id = id;
  button.textContent = name;
  document.body.appendChild(button);
  button.style.position = 'fixed';
  button.style.left = '20px';
  button.style.bottom = '20px';
  button.style.backgroundColor = backgroudColor;
  button.style.color = color;
  button.style.padding = '10px 20px';
  button.style.border = 'none';
  button.style.borderRadius = '5px';
  button.style.cursor = 'pointer';
  button.style.zIndex = '999';
}

var timeEntryLoad = setInterval(function () {                                                                                                                                                           
    var yesterdayTimeEnt = getWorklogTimeByDate(getSpecifiedDayStringFromToday(-1));
    var currentTimeType = document.querySelector('input.globalTable-Input-input.globalTable-Select-input[aria-haspopup="listbox"]');

    if(!window.location.pathname.includes("/time-entry")) return;

    if(yesterdayTimeEnt) {
       clearInterval(timeEntryLoad)
    } else if(!yesterdayTimeEnt && currentTimeType.value != "Today") {
        clearInterval(timeEntryLoad)
    }

    if(currentTimeType && currentTimeType.value != "Today") loadWorklogTimesInLocalStorage();
}, 3000);




function getSpecifiedDayStringFromToday(offset) {
    let date = new Date();
    date.setDate(date.getDate() + offset);

    const day = date.getDay();

    if (offset > 0 && (day === 6 || day === 0)) date.setDate(date.getDate() + (day === 6 ? 2 : 1));
    else if (offset < 0 && (day === 6 || day === 0)) date.setDate(date.getDate() - (day === 6 ? 1 : 2));

    return date.toLocaleDateString('en-GB');
}

if(window.location.host === "portal.inexture.com") {
    var timeEntryLoop = setInterval(checkAndAddButton, 2000);
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

function timeToSeconds(time) {
    let [hours, minutes, seconds] = time.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds;
}
function secondsToTime(seconds) {
    let hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    let minutes = Math.floor(seconds / 60);
    seconds %= 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
function calculateTimeDifference() {
  return "Calculating...";
}

// API-based calculation. Returns a formatted string similar to the previous implementation.
async function calculateTimeDifferenceUsingApi() {
    // get earlyTimeString from page if available (used for early arrivals adjustment)
    let earlyTimeString = null;
    try {
        const table = document.getElementsByClassName("mrt-table")[0];
        const todayEntry = table && table.rows[1];
        if (todayEntry) {
            earlyTimeString = todayEntry.getElementsByTagName("td")[1].querySelectorAll("div.globalTable-Flex-root > div")[0].querySelector("div span.globalTable-Badge-label").innerText;
        }
    } catch (e) {
        // ignore
    }

    const today = new Date();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();
    const todayISO = today.toISOString().slice(0,10); // YYYY-MM-DD

    let liveDurationSeconds = null;
    try {
        const liveUrl = `https://api.portal.inexture.com/api/v1/time-entry/my_live_time_entry?month=${month}&year=${year}`;
        const liveResp = await fetchFromBackground(liveUrl);
        if (liveResp && liveResp.results && liveResp.results.length) {
            // find today's entry if present
            const todayEntry = liveResp.results.find(r => r.log_date === todayISO) || liveResp.results[0];
            if (todayEntry && todayEntry.total_duration) {
                liveDurationSeconds = timeToSeconds(todayEntry.total_duration);
            }
        }
    } catch (err) {
        console.warn('live API fetch failed:', err);
    }

    // Fallback to scraping if API didn't return live duration
    if (liveDurationSeconds === null) {
        try {
            const table = document.getElementsByClassName("mrt-table")[0];
            const todayEntry = table && table.rows[1];
            if (todayEntry) {
                liveDurationSeconds = timeToSeconds(todayEntry.cells[todayEntry.cells.length - 2].innerText);
            } else {
                liveDurationSeconds = 0;
            }
        } catch (e) {
            liveDurationSeconds = 0;
        }
    }

    // Adjust early arrival like previous logic
    if (earlyTimeString && earlyTimeString.startsWith("09")) {
        liveDurationSeconds = liveDurationSeconds - (timeToSeconds(dayStartTime) - timeToSeconds(earlyTimeString));
    }

    // Fetch monthly entries and compute week extra/deficit
    let weekPreviosERTime = "00:00:00";
    try {
        const weekUrl = `https://api.portal.inexture.com/api/v1/time-entry/my_time_entry/?month=${month}&year=${year}&page=1&page_size=50`;
        const weekResp = await fetchFromBackground(weekUrl);
        if (weekResp && weekResp.results) {
            // compute start of week (Monday)
            const now = new Date();
            const day = now.getDay();
            const diffToMonday = (day === 0) ? 6 : (day - 1);
            const monday = new Date(now);
            monday.setDate(now.getDate() - diffToMonday);
            monday.setHours(0,0,0,0);

            // collect entries within this week (mon..today)
            let weeklySeconds = 0;
            weekResp.results.forEach(r => {
                if (!r.log_date || !r.total_duration) return;
                const entryDate = new Date(r.log_date + 'T00:00:00');
                if (entryDate >= monday && entryDate <= now) {
                    try {
                        weeklySeconds += timeToSeconds(r.total_duration);
                    } catch (e) {}
                }
            });

            // count working days from monday to today (exclude weekends)
            let workDays = 0;
            for (let d = new Date(monday); d <= now; d.setDate(d.getDate() + 1)) {
                const wd = d.getDay();
                if (wd !== 0 && wd !== 6) workDays++;
            }

            const targetWeekTillToday = targetTimeSeconds * workDays;
            if (weeklySeconds > targetWeekTillToday) {
                weekPreviosERTime = secondsToTime(weeklySeconds - targetWeekTillToday);
            } else {
                weekPreviosERTime = '-' + secondsToTime(targetWeekTillToday - weeklySeconds);
            }
        }
    } catch (err) {
        console.warn('weekly API fetch failed:', err);
        // fallback to existing DOM-based calculation
        try {
            weekPreviosERTime = getExtraOrRemainOfWeek();
        } catch (e) {
            weekPreviosERTime = "00:00:00";
        }
    }

    var weekPreviosERTimeSecond = timeToSeconds(weekPreviosERTime.replace('-', ''));
    if(weekPreviosERTimeSecond > dayExtraUseTimeSeconds) weekPreviosERTimeSecond = dayExtraUseTimeSeconds;
    var weekPreviosERTimeString = "\n\n=> Time duration of previous days of this week : " + weekPreviosERTime;

    var diffSecond = targetTimeSeconds - liveDurationSeconds;
    var leaveTimeString = addSecondsToCurrentTime(diffSecond);
    var leaveTimeSecond = timeToSeconds(leaveTimeString)
    var leaveSecondPrevious = secondsToTime((weekPreviosERTime.includes("-")) ? leaveTimeSecond + weekPreviosERTimeSecond : leaveTimeSecond - weekPreviosERTimeSecond)
    
    if (timeToSeconds(leaveSecondPrevious) < minLeaveTimeSeconds) leaveSecondPrevious = minLeaveTime;

    return (liveDurationSeconds < targetTimeSeconds) ? 
        "=> Need to stay in office for : "+secondsToTime(targetTimeSeconds - liveDurationSeconds)+
        "\n\n=> You can leave at : "+ leaveTimeString + weekPreviosERTimeString +
        "\n\n=> You can leave at : "+ leaveSecondPrevious +" by using previous days time of this week." : 
        "=> You can leave now.\n\n => As your time is over for today.\n\n=> Your extra time is : "
        +secondsToTime(liveDurationSeconds - targetTimeSeconds)+"."+ weekPreviosERTimeString;
}
function addSecondsToCurrentTime(secondsToAdd) {
    let currentTime = new Date();
    currentTime.setSeconds(currentTime.getSeconds() + secondsToAdd);
    let hours = String(currentTime.getHours()).padStart(2, '0');
    let minutes = String(currentTime.getMinutes()).padStart(2, '0');
    let seconds = String(currentTime.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}
function getExtraOrRemainOfWeek() {
    var totalTimeTillNowString = document.querySelector('main div div .inexture-ScrollArea-root .inexture-ScrollArea-viewport div .inexture-Paper-root div .grid-cols-1 .inexture-Paper-root:nth-child(2) div:last-child p').textContent;
    let [hours, minutes, seconds] = totalTimeTillNowString.match(/\d+/g).map(Number);
    var weeklySeconds = (hours * 3600 + minutes * 60 + seconds);
    var attendedDays = Math.round(weeklySeconds / targetTimeSeconds);
    var targetWeekTillToday = (targetTimeSeconds * attendedDays);
    return (targetWeekTillToday < weeklySeconds) ? secondsToTime(weeklySeconds - targetWeekTillToday) : "-" + secondsToTime(targetWeekTillToday - weeklySeconds);
}

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

// Attach event listener to "Add Entry" button
function attachButtonEventListener() {
    const addButton = document.querySelector("button#add_worklog_btn_id");

    if (addButton && !addButton.dataset.intellimateBound) {
        addButton.addEventListener("click", async () => {
            getAndSetWorklogTime();
            setTimeout(async () => {
                await setTimePortal();
                const modal = await waitForModal(4500);
                if (modal) {
                    selectProjectAndTask(projectName, projectTask, modal);
                } else {
                    selectProjectAndTask(projectName, projectTask);
                }
            }, 500);
            
            setTimeout(() => {
                getAndSetWorklogTime();
            }, 1000);
        });
        addButton.dataset.intellimateBound = "1";
    }
}

function getAndSetWorklogTime() {
    var currentWorklogElement = document.querySelector('button[id^="mantine-"].inexture-Input-input.inexture-DatePickerInput-input');

    if(currentWorklogElement) {
        var currentWorklogDate = currentWorklogElement.innerText.trim();
        var time = getWorklogTimeByDate(currentWorklogDate);
        console.log("Total Time:", time);
        if (time) {
            let [hours, minutes] = time.split(":");
            setWorklogTime(hours, minutes);
        }
    }
}

// Function to select worklog time
function setWorklogTime(hours, minutes) {
    if (hours !== null && minutes !== null) {
        const formattedHours = parseInt(hours, 10).toString();
        selectDropdownOption("Select Hours", formattedHours, 500);
        setTimeout(() => {
            selectDropdownOption("Select Minutes", minutes, 500);
        }, 1000);
    }
}

function getWorklogTimeByDate(dateString) {
    var storedData = localStorage.getItem("timeEntries");
    if (!storedData) return null;
    var entry = JSON.parse(storedData).find(entry => entry.date === dateString);
    return entry ? entry.total : null;
}

function saveTimeEntry(date, total) {
    let timeEntries = JSON.parse(localStorage.getItem("timeEntries")) || [];
    timeEntries.push({ date, total });
    localStorage.setItem("timeEntries", JSON.stringify(timeEntries));
}

function loadWorklogTimesInLocalStorage() {
    var table = document.getElementsByClassName("mrt-table")[0];
    var today = new Date();
    var todayFormatted = today.toLocaleDateString('en-GB');
    var currentMonth = today.getMonth() + 1;
    var timeEntries = [];
    for (var i = 1; i < table.rows.length; i++) {
        var row = table.rows[i];
        var date = row.cells[0].innerText.trim();
        if (date) {
            var totalTime = row.cells[row.cells.length - 2].innerText.trim();
            var dateParts = date.split('/');
            var entryMonth = parseInt(dateParts[1], 10);
            if (date === todayFormatted || entryMonth !== currentMonth) break;
            timeEntries.push({ date: date, total: totalTime });
        }
    }
    
    if(timeEntries && timeEntries.length != 0) {
        localStorage.setItem("timeEntries", JSON.stringify(timeEntries));
        console.log("Data stored in local storage:", timeEntries);    
    }
}

var yesterdayTimeLoadInterval;

function getAndSetLastDayTimeEntry() {
    let lastDayElement = document.evaluate("//p[text()='Last Day']", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (!lastDayElement) return
    let yesterday = getSpecifiedDayStringFromToday(-1);

    let timeEntry = getWorklogTimeByDate(yesterday);
    if(!timeEntry) {
        let yesterdayTimeEntry = lastDayElement.parentElement.parentElement.lastElementChild.firstElementChild.textContent.replace("h ",":").replace("m ",":").replace("s","");
        if(yesterdayTimeEntry == "0:0:0") return;
        console.log("Yeesterday time entry loaded")
        saveTimeEntry(yesterday, yesterdayTimeEntry);
    } else {
        clearInterval(yesterdayTimeLoadInterval);
        yesterdayTimeLoadInterval = null;
    }
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

    try { trigger.click(); } catch (e) { try { trigger.focus(); trigger.click(); } catch (_) {} }

    setTimeout(() => {
        let foundDropdown = false;

        const dropdownNodes = document.querySelectorAll(".inexture-Popover-dropdown.inexture-Select-dropdown, .mantine-Select-dropdown, [role='listbox']");
        dropdownNodes.forEach(dropdown => {
            if (dropdown.style.display === 'none' || dropdown.offsetHeight <= 0 || dropdown.offsetWidth <= 0) return;
            let selectedOption = null;
            dropdown.querySelectorAll("div[data-combobox-option='true'], [role='option']").forEach(option => {
                const textValue = option.innerText.trim();
                if (textValue === dropValue || textValue.includes(dropValue)) {
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
