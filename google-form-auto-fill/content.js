(function () {

    console.log("🚀 Extension Loaded");

    let isEnabled = false;
    let observer = null;
    let cachedProfile = null;

    // =========================
    // 🔹 INIT
    // =========================
    chrome.storage.local.get(["enabled"], (res) => {
        isEnabled = res.enabled || false;
        if (isEnabled) startBot();
    });

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.enabled) {
            isEnabled = changes.enabled.newValue;

            if (isEnabled) startBot();
            else stopBot();
        }
    });

    function startBot() {
        console.log("✅ Bot Started");

        cachedProfile = generateProfile();

        runStep();

        if (observer) observer.disconnect();

        observer = new MutationObserver(() => {
            if (!isEnabled) return;
            runStep();
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function stopBot() {
        console.log("⛔ Bot Stopped");
        if (observer) observer.disconnect();
    }

    // =========================
    // 🔹 MAIN FLOW
    // =========================
    function runStep() {

        if (!isEnabled) return;

        setTimeout(() => {

            if (handleResubmit()) return;

            fillPage(cachedProfile);

            setTimeout(() => {
                let btn = findButton("Next") || findButton("Submit");
                if (btn) btn.click();
            }, 1200);

        }, 1500);
    }

    // =========================
    // 🔹 RESUBMIT
    // =========================
    function handleResubmit() {
        let link = Array.from(document.querySelectorAll("a"))
            .find(a => a.innerText.toLowerCase().includes("submit another response"));

        if (link) {
            incrementSubmissionCount();

            setTimeout(() => {
                cachedProfile = generateProfile();
                link.click();
            }, 1500);

            return true;
        }

        return false;
    }

    // =========================
    // 🔹 SAFE TEXT EXTRACTION
    // =========================
    function getOptionText(opt) {
        return (
            opt.getAttribute("aria-label") ||
            opt.closest('[role="listitem"]')?.innerText ||
            opt.innerText ||
            ""
        ).toLowerCase();
    }

    // =========================
    // 🔹 FILL FORM
    // =========================
    function fillPage(profile) {

        let form = document.querySelector("form");
        if (!form) return;

        // TEXT INPUTS
        form.querySelectorAll('input[type="text"], textarea').forEach(input => {

            let label = getLabel(input);

            let value = "";

            if (label.includes("email")) value = profile.email;
            else if (label.includes("name")) value = profile.name;
            else if (label.includes("phone")) value = profile.phone;
            else value = "Test " + Math.floor(Math.random() * 1000);

            input.value = value;
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });

        // =========================
        // 🔥 RADIO LOGIC (STRICT)
        // =========================
form.querySelectorAll('[role="radiogroup"]').forEach(group => {

    let opts = Array.from(group.querySelectorAll('[role="radio"]'));
    if (!opts.length) return;

    function getText(opt) {
        return (opt.getAttribute("aria-label") || "").toLowerCase();
    }

    function clickSafe(opt) {
        if (opt.getAttribute("aria-checked") !== "true") {
            opt.click();
        }
    }

    // 🔥 STEP 1: Remove unwanted options globally
    let validOptions = opts.filter(opt => {
        let text = getText(opt);

        // ❌ EXCLUDE THESE ALWAYS
        if (text.includes("project manager")) return false;
        if (text.includes("industrial project")) return false;
        if (text.includes("10+ years")) return false;


        return true;
    });

    // =========================
    // 🎯 SCALE (1–5)
    // =========================
    if (opts.length === 5) {
        let index = Math.random() < 0.7 ? 3 : 4;
        clickSafe(opts[index]);
        return;
    }

    // =========================
    // 🎯 USE FILTERED OPTIONS
    // =========================
    if (validOptions.length > 0) {
        let selected = validOptions[Math.floor(Math.random() * validOptions.length)];

        console.log("✅ Selected:", getText(selected));

        clickSafe(selected);
    }

});
        // CHECKBOX
        form.querySelectorAll('[role="group"]').forEach(group => {
            let opts = group.querySelectorAll('[role="checkbox"]');
            if (opts.length) {
                opts[Math.floor(Math.random() * opts.length)].click();
            }
        });
    }

    // =========================
    // 🔹 DATASET
    // =========================
    const firstNames = [
        "Hardik","Nirav","Dhruv","Kunal","Mehul",
        "Jatin","Pranav","Sanket","Amit","Raj",
        "Chirag","Hiren","Devang","Bhavesh","Ketan",
        "Paresh","Rakesh","Suresh","Mahesh","Tushar",
        "Jay","Vimal","Nilesh","Dipak","Manish"
    ];

    const surnames = [
        "Patel","Shah","Mehta","Joshi","Desai",
        "Panchal","Trivedi","Vaghela","Solanki","Parmar",
        "Chauhan","Rathod","Makwana","Gohil","Zala",
        "Barot","Pandya","Dave","Bhatt","Sheth",
        "Modi","Kapadia","Vora","Kothari","Brahmbhatt"
    ];

    function generateProfile() {
        let first = random(firstNames);
        let last = random(surnames);

        return {
            name: `${first} ${last}`,
            email: generateEmail(first, last),
            phone: generatePhone()
        };
    }

    function generateEmail(first, last) {
            const num = Math.floor(Math.random() * 9999);
            return `${first}${last}${num}@gmail.com`.toLowerCase();
    }

    function generatePhone() {
        return "9" + Math.floor(100000000 + Math.random() * 900000000);
    }

    function random(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function getLabel(input) {
        return input.closest('[role="listitem"]')?.innerText.toLowerCase() || "";
    }

    function findButton(text) {
        return Array.from(document.querySelectorAll('[role="button"]'))
            .find(btn => btn.innerText.trim().toLowerCase() === text.toLowerCase());
    }

    function incrementSubmissionCount() {
        chrome.storage.local.get(["count"], (res) => {
            chrome.storage.local.set({ count: (res.count || 0) + 1 });
        });
    }

})();