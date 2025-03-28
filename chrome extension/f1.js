"use strict";

console.log("ICAL.js loaded successfully!", ICAL);

const ICAL_URL =
  "https://raw.githubusercontent.com/silentdragoon/f1count/refs/heads/main/f1.ics";
const F2_URL =
  "https://raw.githubusercontent.com/silentdragoon/f1count/refs/heads/main/f2.ics";
const F3_URL =
  "https://raw.githubusercontent.com/silentdragoon/f1count/refs/heads/main/f3.ics";
const activeTimers = {}; // Store intervals by event ID

// Default values
let maxSessions = 5;
let showSeconds = true;
let showF1 = true;
let showF2 = false;
let showF3 = false;

// Load settings from storage and then start the app
chrome.storage.sync.get(
  ["maxSessions", "showSeconds", "showF1", "showF2", "showF3"],
  (data) => {
    maxSessions =
      data.maxSessions !== undefined ? parseInt(data.maxSessions, 10) : 5;
    showSeconds = data.showSeconds !== undefined ? data.showSeconds : true;
    showF1 = data.showF1 !== undefined ? data.showF1 : true;
    showF2 = data.showF2 !== undefined ? data.showF2 : false;
    showF3 = data.showF3 !== undefined ? data.showF3 : false;

    console.log("Loaded settings:", {
      maxSessions,
      showSeconds,
      showF1,
      showF2,
      showF3,
    });

    // Now we can safely fetch events
    fetchEvents().then((events) => scheduleNotifications(events));
  }
);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    console.log("Settings updated, reloading...");

    chrome.storage.sync.get(
      ["maxSessions", "showSeconds", "showF1", "showF2", "showF3", "showFantasyLock"], // Include "showFantasyLock"
      (data) => {
        maxSessions =
          data.maxSessions !== undefined ? parseInt(data.maxSessions, 10) : 5;
        showSeconds = data.showSeconds !== undefined ? data.showSeconds : true;
        showF1 = data.showF1 !== undefined ? data.showF1 : true;
        showF2 = data.showF2 !== undefined ? data.showF2 : false;
        showF3 = data.showF3 !== undefined ? data.showF3 : false;

        // Retrieve Fantasy Lock toggle status
        const showFantasyLock =
          data.showFantasyLock !== undefined ? data.showFantasyLock : true;

        console.log("Updated settings:", {
          maxSessions,
          showSeconds,
          showF1,
          showF2,
          showF3,
          showFantasyLock, // Log the Fantasy Lock setting
        });

        // Reload events after settings change
        fetchEvents().then((events) => {
          const updatedEvents = addFantasyWarning(events); // Recalculate warnings
          processICalData(updatedEvents); // Re-render the events
          scheduleNotifications(updatedEvents); // Schedule notifications
        });
      }
    );
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "updateSettings") {
    console.log("Settings updated. Reloading...");
    fetchEvents().then((events) => scheduleNotifications(events));
    updateTimerDisplay();
  }
});

function clearAllTimers() {
  Object.keys(activeTimers).forEach((timerId) => {
    clearInterval(activeTimers[timerId]);
    delete activeTimers[timerId];
  });
}

async function fetchEvents() {
  clearAllTimers();
  try {
      const urls = [];
      if (showF1) urls.push({ url: ICAL_URL, source: "F1" });
      if (showF2) urls.push({ url: F2_URL, source: "F2" });
      if (showF3) urls.push({ url: F3_URL, source: "F3" });

      // Fetch data and process events
      const eventPromises = urls.map(({ url, source }) =>
          fetch(url, { cache: "no-cache" }).then((response) => {
              if (!response.ok)
                  throw new Error(`HTTP error! Status: ${response.status}`);
              return response.text().then((icalData) => ({
                  icalData,
                  source, // Keep track of the source
              }));
          })
      );

      const icalDataArray = await Promise.all(eventPromises);

      let allEvents = [];
      icalDataArray.forEach(({ icalData, source }) => {
          try {
              const parsed = ICAL.parse(icalData);
              const comp = new ICAL.Component(parsed);
      
              const events = comp.getAllSubcomponents("vevent").map((vevent) => {
                  const event = new ICAL.Event(vevent);
      
                  // Safely extract summary and startDate
                  const summary = event.summary || vevent.getFirstPropertyValue("summary");
                  const startDate = event.startDate || vevent.getFirstPropertyValue("dtstart");
      
                  if (summary && startDate) {
                      return {
                          summary,
                          startDate: new ICAL.Time(startDate),
                          calendarSource: source,
                      };
                  }
      
                  console.warn("Skipping invalid event:", { summary, startDate, source });
                  return null; // Skip invalid events
              });
      
              allEvents = allEvents.concat(events.filter((event) => event !== null)); // Remove invalid events
          } catch (error) {
              console.error(`Error parsing ICAL data for source ${source}:`, error);
          }
      });

      // Log events for debugging
      allEvents.forEach((event, index) => {
          if (!event.calendarSource) {
              console.warn(`Event missing calendarSource at index ${index}:`, event);
          } else {
              console.log(`Valid Event: ${event.summary}, Source: ${event.calendarSource}, Date: ${event.startDate?.toJSDate()}`);
          }
      });

      return processICalData(allEvents); // Process and return events
  } catch (error) {
      document.getElementById("loading").innerText = "Error loading events";
      console.error("Error in fetchEvents:", error);
      return [];
  }
}

// Function to clean and format event titles
function formatEventTitle(originalTitle) {
  let title = originalTitle;

  // Replace "Grand Prix" (without parentheses) with "Race"
  title = title.replace(/\bGrand Prix\b(?![^\(]*\))/g, "Race");

  // Hide "F1: " prefix if F2 and F3 are both disabled
  if (!showF2 && !showF3 && title.startsWith("F1: ")) {
    title = title.replace("F1: ", "");
  }

  // Replace "(" with " - "
  title = title.replace("(", " - ");

  // Replace "Grand Prix)" with "GP)"
  title = title.replace(")", "");

  // Add " GP)" if the event is from F2 or F3 and ends with ")"
  if (title.includes("F2:") || title.includes("F3:")) {
    title = title.replace(/\)$/, " GP)");
  }

  // Replace "FP1" with "Free Practice 1", "FP2" with "Free Practice 2", etc.
  /* title = title
    .replace(/\bFP1\b/, "Free Practice 1")
    .replace(/\bFP2\b/, "Free Practice 2")
    .replace(/\bFP3\b/, "Free Practice 3");
  */

  return title;
}

function addFantasyWarning(events) {
  const now = new Date();
  const flaggedSessions = identifyFantasyLockSession(events);

  flaggedSessions.forEach((session) => {
      // Skip sessions in the past
      if (session.startDate.toJSDate() > now) {
          session.fantasyWarning = true; // Mark this session for warning
      }
  });

  return events.map((event) => ({
      ...event,
      fantasyWarning: flaggedSessions.some((fs) => fs === event), // Add warning flag
  }));
}

function identifyFantasyLockSessions(events) {
  const now = new Date();
  const weekends = new Map(); // Track first session per race weekend

  events.forEach((event) => {
      if (
          event.calendarSource === "F1" && // Only F1 events
          (event.summary.toLowerCase().includes("qualifying") || event.summary.toLowerCase().includes("sprint")) && // Qualifying or Sprint sessions
          !event.summary.toLowerCase().includes("sprint qualifying") // Exclude Sprint Qualifying
      ) {
          const eventDate = event.startDate.toJSDate();

          // Identify the race weekend by year, month, and week
          const weekendKey = `${eventDate.getFullYear()}-${eventDate.getMonth()}-${Math.floor(eventDate.getDate() / 7)}`;

          // Add the first session of the weekend
          if (!weekends.has(weekendKey) || weekends.get(weekendKey).startDate > eventDate) {
              weekends.set(weekendKey, event);
          }
      }
  });

  // Collect the earliest flagged sessions for Fantasy Lock warning
  return [...weekends.values()]; // Return the first session of each weekend
}

function addFantasyWarning(events) {
  chrome.storage.sync.get("showFantasyLock", (data) => {
    if (!data.showFantasyLock) return events; // Skip warning logic if disabled

    // Fantasy lock logic goes here...
    console.log("Fantasy Team Lock warning is enabled.");
  });
}

function scheduleNotifications(events) {
  // Check if notifications are enabled
  chrome.storage.sync.get("notificationsEnabled", (data) => {
    if (!data.notificationsEnabled) {
      console.log("Notifications are disabled. No alarms will be scheduled.");
      return;
    }

    // Clear all existing alarms before scheduling new ones
    chrome.alarms.clearAll(() => {
      console.log("Cleared all existing alarms.");

      // Schedule a notification 5 minutes before each event
      events.forEach((event) => {
        const eventDate = event.startDate.toJSDate();
        const notificationTime = new Date(eventDate.getTime() - 5 * 60 * 1000); // 5 minutes before

        if (notificationTime > new Date()) {
          chrome.alarms.create(`f1_session_${event.summary}`, {
            when: notificationTime.getTime(),
          });
          console.log(
            `Alarm scheduled for ${event.summary} at ${notificationTime}`
          );
        }
      });
    });
  });
}

// Fetch events and schedule notifications after DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  fetchEvents().then((events) => {
    scheduleNotifications(events); // Schedule alarms for upcoming events
  });
});

function processICalData(allEvents) {
  try {
    const now = new Date();

    // Retrieve user settings
    chrome.storage.sync.get("showFantasyLock", (data) => {
      const showFantasyLock = data.showFantasyLock !== undefined ? data.showFantasyLock : true;

      // Identify Fantasy Lock sessions if enabled
      const flaggedSessions = showFantasyLock ? identifyFantasyLockSessions(allEvents) : [];

      // Flag events for warning
      allEvents.forEach((event) => {
        event.fantasyWarning = flaggedSessions.some((fs) => fs === event);
      });

      // Filter and sort upcoming events
      const upcomingEvents = allEvents
        .filter((event) => event.startDate && event.startDate.toJSDate() > now) // Ensure startDate exists and is in the future
        .sort((a, b) => a.startDate.toJSDate() - b.startDate.toJSDate()) // Sort by startDate
        .slice(0, maxSessions); // Limit to maxSessions

      const colours = ["#D9ED92", "#B5E48C", "#99D98C", "#76C893", "#52B69A"];
      let lastSessionTime = null;
      let currentColourIndex = 0;

      document.getElementById("loading").style.display = "none";
      document.getElementById("events").style.display = "flex";
      document.getElementById("events").innerHTML = "";

      // Render events
      upcomingEvents.forEach((event, index) => {
        const eventDate = event.startDate.toJSDate();

        // Change color if sessions are spaced apart by 96 hours
        if (
          lastSessionTime &&
          (eventDate.getTime() - lastSessionTime.getTime()) / (1000 * 60 * 60) >= 96
        ) {
          currentColourIndex = (currentColourIndex + 1) % colours.length;
        }
        lastSessionTime = eventDate;

        const fullTitle = formatEventTitle(
          event.summary.replace(/2025/g, "").trim()
        );
        const cleanedTitle = fullTitle.replace(/^[^\w]+/, "").trim();
        const raceName = cleanedTitle.split("-")[0].trim();

        const eventDiv = document.createElement("div");
        eventDiv.className = "event";
        eventDiv.style.backgroundColor = colours[currentColourIndex];

        // Add Fantasy Lock warning if flagged and setting is enabled
        if (event.fantasyWarning && showFantasyLock) {
          const warningDiv = document.createElement("div");
          warningDiv.className = "fantasy-warning";
          warningDiv.innerHTML = "⚠️ <strong>F1 Fantasy Team Lock!</strong><br />Make sure your team is set before this session.";
          eventDiv.appendChild(warningDiv);
        }

        const localTime = eventDate.toLocaleString(undefined, {
          weekday: "short",
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short",
        });

        eventDiv.innerHTML += `<h3>${cleanedTitle}</h3>
                               <p>${localTime}</p>
                               <div id='event${index + 1}-timer' class='countdown'></div>`;
        document.getElementById("events").appendChild(eventDiv);

        startCountdown(event, `event${index + 1}-timer`);
      });

      return upcomingEvents; // Ensure upcomingEvents is returned
    });
  } catch (error) {
    console.error("Error processing events:", error);
    document.getElementById("loading").innerText = "Error processing events";
    return [];
  }
}

// Handle settings & UI events
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded and parsed!");

  const settingsModal = document.getElementById("settings-modal");
  const settingsIcon = document.getElementById("settings-icon");
  console.log(settingsIcon); // Verify this logs the correct element
  const closeSettings = document.getElementById("close-settings");
  const numSessionsInput = document.getElementById("numSessions");
  const showSecondsInput = document.getElementById("showSeconds");

  const showF1Input = document.getElementById("showF1");
  const showF2Input = document.getElementById("showF2");
  const showF3Input = document.getElementById("showF3");

  const notificationsToggle = document.getElementById("notifications-toggle");
  const testNotificationBtn = document.getElementById("test-notification");

  const showFantasyLockInput = document.getElementById("showFantasyLock");
  chrome.storage.sync.get("showFantasyLock", (data) => {
      showFantasyLockInput.checked = data.showFantasyLock ?? true;
  });
  showFantasyLockInput.addEventListener("change", () => {
      chrome.storage.sync.set({ showFantasyLock: showFantasyLockInput.checked });
  });

  // Disable notifications by default
  chrome.storage.sync.get("notificationsEnabled", (data) => {
    const isEnabled = data.notificationsEnabled ?? false; // Default to false
    notificationsToggle.checked = isEnabled;
    if (!isEnabled) {
      console.log("Notifications are disabled by default.");
    }
  });

  notificationsToggle.addEventListener("change", async () => {
    const notificationsEnabled = notificationsToggle.checked;
    // Save the updated setting
    chrome.storage.sync.set({ notificationsEnabled });

    if (notificationsEnabled) {
      console.log("Notifications enabled, scheduling alarms...");

      // Fetch events and schedule alarms
      fetchEvents().then((events) => {
        scheduleNotifications(events);
      });
    } else {
      console.log("Notifications disabled, clearing all alarms...");

      // Clear all existing alarms
      chrome.alarms.clearAll(() => {
        console.log("All alarms cleared.");
      });
    }
  });

  testNotificationBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "testNotification" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error:", chrome.runtime.lastError);
      } else {
        console.log("Response from service worker:", response);
      }
    });
  });

  // Set initial states
  showF1Input.checked = showF1;
  showF2Input.checked = showF2;
  showF3Input.checked = showF3;

  showF1Input.addEventListener("change", (e) => {
    showF1 = e.target.checked;
    chrome.storage.sync.set({ showF1 });
  });

  showF2Input.addEventListener("change", (e) => {
    showF2 = e.target.checked;
    chrome.storage.sync.set({ showF2 });
  });

  showF3Input.addEventListener("change", (e) => {
    showF3 = e.target.checked;
    chrome.storage.sync.set({ showF3 });
  });

  // Set initial checkbox state
  showSecondsInput.checked = showSeconds;

  // Open settings modal
  settingsIcon.addEventListener("click", () => {
    console.log("Settings icon clicked!");
    settingsModal.style.display = "flex";
  });

  // Close settings modal
  closeSettings.addEventListener("click", () => {
    settingsModal.style.display = "none";
  });

  // Handle "Number of Sessions" setting
  numSessionsInput.value = maxSessions; // Set initial value
  numSessionsInput.addEventListener("change", (e) => {
    const newMax = parseInt(e.target.value, 10) || 5;
    if (newMax !== maxSessions) {
      maxSessions = newMax;
      localStorage.setItem("maxSessions", maxSessions); // Save to localStorage
      fetchEvents(); // Reload events
    }
  });

  // Handle "Show Seconds" setting
  showSecondsInput.addEventListener("change", (e) => {
    showSeconds = e.target.checked;
    localStorage.setItem("showSeconds", showSeconds);
    updateTimerDisplay(); // Update layout immediately
  });

  // Call this function after fetching and processing events
  fetchEvents().then((events) => {
    scheduleNotifications(events); // Pass the fetched events correctly
  });
});

// Utility function to apply the correct countdown layout
function updateTimerDisplay() {
  console.log("Updating timer display. showSeconds =", showSeconds);

  document.querySelectorAll(".countdown").forEach((timerDiv) => {
    // Show/hide seconds
    timerDiv.querySelectorAll("div").forEach((unit) => {
      if (unit.innerText.includes("SECOND")) {
        unit.style.display = showSeconds ? "flex" : "none";
      }
    });

    // Apply three-column layout when seconds are hidden
    if (!showSeconds) {
      console.log("Applying three-columns class");
      timerDiv.classList.add("three-columns");
    } else {
      console.log("Removing three-columns class");
      timerDiv.classList.remove("three-columns");
    }
  });
}

// Countdown function
function startCountdown(event, elementId) {
  const countDownDate = event.startDate.toJSDate().getTime();

  // Clear any existing interval for this timer
  if (activeTimers[elementId]) {
    clearInterval(activeTimers[elementId]);
    delete activeTimers[elementId];
  }

  function formatTimeUnit(value, unit) {
    const paddedValue = String(value).padStart(2, "0");
    return `${paddedValue}<span class='label'>${unit}${
      value === 1 ? "" : "S"
    }</span>`;
  }

  function updateTimer() {
    const now = new Date().getTime();
    const distance = countDownDate - now;
    const element = document.getElementById(elementId);

    if (!element) return; // Timer element may no longer exist

    if (distance < 0) {
      element.innerHTML = "Event Started";
      clearInterval(activeTimers[elementId]); // Stop the timer
      delete activeTimers[elementId];
      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    element.innerHTML = `
      <div>${formatTimeUnit(days, "DAY")}</div>
      <div>${formatTimeUnit(hours, "HOUR")}</div>
      <div>${formatTimeUnit(minutes, "MIN")}</div>
      ${showSeconds ? `<div>${formatTimeUnit(seconds, "SEC")}</div>` : ""}`;

    updateTimerDisplay(); // Ensure layout updates after each refresh
  }

  // Start a new interval and save its reference
  activeTimers[elementId] = setInterval(updateTimer, 1000);
  updateTimer(); // Run immediately
}

// Utility function
function toTitleCase(text) {
  return text.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}
