console.log("Background script is running!");

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") {
      chrome.runtime.sendMessage({ action: "updateSettings" });
    }
  });
  

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "testNotification") {
      chrome.notifications.create("test_notification", {
          type: "basic",
          iconUrl: "icon128.png", // Ensure this file exists
          title: "F1 session starting soon",
          message: "If this were real, a session would be starting in 5 minutes!"
      }, (notificationId) => {
          if (chrome.runtime.lastError) {
              console.error("Error creating test notification:", chrome.runtime.lastError);
          } else {
              console.log("Test notification created:", notificationId);
          }
      });
      sendResponse({ success: true }); // Acknowledge the request
  }
  return true; // Keep the message channel open for asynchronous responses
});

chrome.alarms.onAlarm.addListener((alarm) => {
    console.log(`Alarm triggered for: ${alarm.name}`);

    // Extract the session name from the alarm name
    const sessionName = alarm.name.replace("f1_session_", "");

    // Display a notification for the session
    chrome.notifications.create(alarm.name, {
        type: "basic",
        iconUrl: "icon128.png", // Ensure this file exists
        title: `${sessionName} starting soon`,
        message: `${sessionName} is starting in 5 minutes!`
    }, (notificationId) => {
        if (chrome.runtime.lastError) {
            console.error("Error creating notification:", chrome.runtime.lastError.message);
        } else {
            console.log("Notification sent:", notificationId);
        }
    });
});