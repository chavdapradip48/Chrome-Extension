document.getElementById("openPortal").addEventListener("click", function() {
    chrome.tabs.create({ url: "https://portal.inexture.com/time-entry" });
});

document.addEventListener("DOMContentLoaded", function () {
    const projectDropdown = document.getElementById("projectDropdown");
    const saveButton = document.getElementById("saveProject");
    const worklogButton = document.getElementById("goToWorklog");

    chrome.storage.local.get(["currentProject"], function (data) {
        projectDropdown.value = data.currentProject || "Java Delivery";
    });

    saveButton.addEventListener("click", function () {
        const selectedProject = projectDropdown.value;

        chrome.storage.local.set({ currentProject: selectedProject }, function () {
            alert("Project selection saved as: " + selectedProject);
        });
    });

    worklogButton.addEventListener("click", function () {
        chrome.tabs.create({ url: "https://portal.inexture.com/tasks" });
    });
});
