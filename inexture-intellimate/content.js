var isButtonAdded = false;
var targetTimeSeconds = timeToSeconds('08:20:00');
var dayMustTimeSeconds = timeToSeconds('07:00:00');
var dayExtraUseTimeSeconds = timeToSeconds('01:20:00');
var minLeaveTime = "17:30:00";
var dayStartTime = "10:00:00";
var minLeaveTimeSeconds = timeToSeconds(minLeaveTime);

function checkAndAddButton() {
    if(window.location.pathname !== "/time-entry") {
        var stickButton = document.getElementById("sticky-button");
        if (stickButton) {
            stickButton.remove(); 
            isButtonAdded = false;
        }
        return;
    }
    if(isButtonAdded) return;
    if(window.location.pathname === "/time-entry") {
        isButtonAdded = true;
        addButtonInBody('Calculate Time', 'sticky-button', '#007bff', 'white');
                document.getElementById('sticky-button').addEventListener('click', async function () {
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

// Login prompt: if the user is not logged in (on auth page or login form present), show a small banner
function showLoginPrompt() {
    // Intentionally disabled — popup injected banner has been removed by user request.
    // This function is kept as a no-op to avoid breakage in other logic that may call it.
    return;
}

function hideLoginPrompt() {
    // No-op — we never inject a login prompt, but keep this function for compatibility.
    return;
}

function checkLoginStatus() {
    try {
        if (window.location.host !== 'portal.inexture.com') return hideLoginPrompt();

        const path = window.location.pathname || '';
        const onAuthPath = path.startsWith('/auth') || path.startsWith('/login');
        const hasPasswordInput = !!document.querySelector('input[type="password"], input[name*="password"]');

        if (onAuthPath || hasPasswordInput) {
            showLoginPrompt();
        } else {
            hideLoginPrompt();
        }
    } catch (e) {
        console.error('checkLoginStatus error', e);
    }
}

// login UI is disabled by user request — do not run status checks or observe DOM

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

// helper to ask background to fetch an URL with stored token
function fetchFromBackground(url) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'fetchWithToken', url }, (response) => {
            if (!response) return reject('no_response');
            if (response.error) return reject(response.error);
            resolve(response.data);
        });
    });
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
    var leaveTImeString = addSecondsToCurrentTime(diffSecond);
    var leaveTImeSecond = timeToSeconds(leaveTImeString)
    var leaveSecondPrevious = secondsToTime((weekPreviosERTime.includes("-")) ? leaveTImeSecond + weekPreviosERTimeSecond : leaveTImeSecond - weekPreviosERTimeSecond)
    
    if (timeToSeconds(leaveSecondPrevious) < minLeaveTimeSeconds) leaveSecondPrevious = minLeaveTime;

    return (liveDurationSeconds < targetTimeSeconds) ? 
        "=> Need to stay in office for : "+secondsToTime(targetTimeSeconds - liveDurationSeconds)+
        "\n\n=> You can leave at : "+ leaveTImeString + weekPreviosERTimeString +
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

// Function to load project selection from chrome.storage.local
// Read saved project/task and optionally call callback when available.
function setTimePortal(callback) {
    chrome.storage.local.get(["currentProject", "currentTask"], function (data) {
        // Use explicit project+task saved by the popup. If not available, clear values.
        if (data.currentProject && data.currentTask) {
            projectName = data.currentProject;
            projectTask = data.currentTask;
            currentProject = data.currentProject;
        } else {
            projectName = "";
            projectTask = "";
            currentProject = "";
        }

        // invoke optional callback so callers can rely on updated values
        if (typeof callback === 'function') callback();
    });
}

// Attach event listener to "Add Entry" button
function attachButtonEventListener() {
    const addButton = document.querySelector("button#add_worklog_btn_id");

    if (addButton) {
            addButton.addEventListener('click', () => {
                getAndSetWorklogTime();

                // Ensure we read stored project/task first and then try selection.
                // Use a short timeout after storage is read to let the portal UI open dropdowns.
                setTimePortal(() => {
                    setTimeout(() => {
                        selectProjectAndTask(projectName, projectTask);
                    }, 350);
                });

                // Keep updating the worklog field shortly after opening the modal.
                setTimeout(() => {
                    getAndSetWorklogTime();
                }, 1000);
            });
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
        clearInterval(yesterdayTimeLoadInterval)
    }
}

function selectProjectAndTask(project, task) {
    if (project && task) {
        console.log('Auto-select -> project:', project, 'task:', task);
        selectDropdownOption("Select Project", project, 500);
        setTimeout(() => {
            selectDropdownOption("Select Task", task, 500);
        }, 1000); // Ensuring tasks load after selecting the project
    }
}

function selectDropdownOption(placeholder, dropValue, waitTime = 500) {
    const inputField = document.querySelector(`input[placeholder='${placeholder}']`);

    if (inputField) {
        inputField.click();

        setTimeout(() => {
            let foundDropdown = false;

            document.querySelectorAll(".inexture-Popover-dropdown.inexture-Select-dropdown").forEach(dropdown => {
                if (dropdown.style.display !== 'none' && dropdown.offsetHeight > 0 && dropdown.offsetWidth > 0) {
                    let selectedOption = null;
                    dropdown.querySelectorAll("div[data-combobox-option='true']").forEach(option => {
                        const textValue = option.innerText.trim();
                        // Match exact or substring (tolerant match) to handle small formatting differences
                        if (textValue === dropValue || textValue.includes(dropValue)) {
                            selectedOption = option;
                        }
                    });

                    if (selectedOption) {
                        selectedOption.click();
                        foundDropdown = true;
                    } else {
                        console.warn(`Dropdown option '${dropValue}' not found`);
                    }
                }
            });

            if (!foundDropdown) {
                console.warn('No visible dropdown was found or options were not selected');
            }
        }, waitTime);
    } else {
        console.warn(`Input field with placeholder '${placeholder}' not found`);
    }
}

function timeEntryPageCheck() {
    if(window.location.pathname == "/time-entry") {
        yesterdayTimeLoadInterval = setInterval(function () {                                                                                                                                                           
            getAndSetLastDayTimeEntry();
        }, 3000);
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
