const toggleBtn = document.getElementById("toggle");
const statusText = document.getElementById("status");
const countText = document.getElementById("count");

// Load initial state
chrome.storage.local.get(["enabled", "count"], (res) => {
    let enabled = res.enabled || false;

    statusText.innerText = enabled ? "ON" : "OFF";
    toggleBtn.innerText = enabled ? "Disable" : "Enable";

    countText.innerText = res.count || 0;
});

// Toggle button
toggleBtn.addEventListener("click", () => {
    chrome.storage.local.get(["enabled"], (res) => {
        let newState = !res.enabled;

        chrome.storage.local.set({ enabled: newState }, () => {
            statusText.innerText = newState ? "ON" : "OFF";
            toggleBtn.innerText = newState ? "Disable" : "Enable";
        });
    });
});