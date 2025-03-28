document.addEventListener("DOMContentLoaded", () => {
    const showF1Input = document.getElementById("showF1");
    const showF2Input = document.getElementById("showF2");
    const showF3Input = document.getElementById("showF3");
    const showSecondsInput = document.getElementById("showSeconds");
    const numSessionsInput = document.getElementById("numSessions");
    const notificationsToggle = document.getElementById("notifications-toggle");
    const testNotificationBtn = document.getElementById("test-notification");
    const showFantasyLockInput = document.getElementById("showFantasyLock");

  // Load fantasy lock setting from storage
  chrome.storage.sync.get("showFantasyLock", (data) => {
    showFantasyLockInput.checked = data.showFantasyLock ?? true; // Default to true
  });

  // Save fantasy lock setting on change
  showFantasyLockInput.addEventListener("change", () => {
    chrome.storage.sync.set({ showFantasyLock: showFantasyLockInput.checked });
  });

    // Load settings from storage
    chrome.storage.sync.get(["showF1", "showF2", "showF3", "showSeconds", "numSessions", "notificationsEnabled"], (data) => {
        showF1Input.checked = data.showF1 ?? true;
        showF2Input.checked = data.showF2 ?? false;
        showF3Input.checked = data.showF3 ?? false;
        showSecondsInput.checked = data.showSeconds ?? true;
        numSessionsInput.value = data.numSessions ?? 5;
        notificationsToggle.checked = data.notificationsEnabled ?? false;
    });

    // Save settings on change
    function saveSetting(key, value) {
        chrome.storage.sync.set({ [key]: value });
    }

    showF1Input.addEventListener("change", () => saveSetting("showF1", showF1Input.checked));
    showF2Input.addEventListener("change", () => saveSetting("showF2", showF2Input.checked));
    showF3Input.addEventListener("change", () => saveSetting("showF3", showF3Input.checked));
    showSecondsInput.addEventListener("change", () => saveSetting("showSeconds", showSecondsInput.checked));
    numSessionsInput.addEventListener("change", () => saveSetting("numSessions", parseInt(numSessionsInput.value, 10)));
    notificationsToggle.addEventListener("change", () => saveSetting("notificationsEnabled", notificationsToggle.checked));

    testNotificationBtn.addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "testNotification" }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error:", chrome.runtime.lastError);
            } else {
                console.log("Response from service worker:", response);
            }
        });
    });
});
