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
        document.getElementById('sticky-button').addEventListener('click', function () {
          alert(calculateTimeDifference());
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
  var table = document.getElementsByClassName("mrt-table")[0];
  var todayEntry = table.rows[1]
  var earlyTimeString = todayEntry.getElementsByTagName("td")[1].querySelectorAll("div.globalTable-Flex-root > div")[0].querySelector("div span.globalTable-Badge-label").innerText;
  let liveDurationSeconds = timeToSeconds(todayEntry.cells[todayEntry.cells.length - 2].innerText);

  if(earlyTimeString.startsWith("09")) {
    liveDurationSeconds = liveDurationSeconds - (timeToSeconds(dayStartTime) - timeToSeconds(earlyTimeString));
  }

  var weekPreviosERTime = getExtraOrRemainOfWeek();
  var weekPreviosERTimeSecond = timeToSeconds(weekPreviosERTime);
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
function setTimePortal() {
    chrome.storage.local.get(["currentProject"], function (data) {
        currentProject = data.currentProject || "Java Delivery";

        if (currentProject === "Java Delivery") {
            projectName = "Java Delivery";
            projectTask = "Java Activities 2023/24 - Pradip Chavda";
        } else if (currentProject === "Cemex") {
            projectName = "Liferay Oscar Cemex";
            projectTask = "Liferay Cemex Oscar - Pradip Chavda";
        }
    });
}

// Attach event listener to "Add Entry" button
function attachButtonEventListener() {
    const addButton = document.querySelector("button#add_worklog_btn_id");

    if (addButton) {
        addButton.addEventListener("click", () => {
            getAndSetWorklogTime();
            setTimeout(() => {
                setTimePortal();
                setTimeout(() => {
                    selectProjectAndTask(projectName, projectTask);
                }, 500);
            }, 1000);
            
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
                        if (option.innerText.trim() === dropValue) {
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