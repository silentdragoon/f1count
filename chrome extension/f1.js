"use strict";

console.log("ICAL.js loaded successfully!", ICAL);

const ICAL_URL =
  "https://raw.githubusercontent.com/silentdragoon/f1count/refs/heads/main/f1.ics";
const F2_URL =
  "https://raw.githubusercontent.com/silentdragoon/f1count/refs/heads/main/f2.ics";
const F3_URL =
  "https://raw.githubusercontent.com/silentdragoon/f1count/refs/heads/main/f3.ics";
const activeTimers = {}; // Store intervals by event ID

let maxSessions = parseInt(localStorage.getItem("maxSessions"), 10) || 5; //
let showSeconds = localStorage.getItem("showSeconds") !== "false";
let showF1 = localStorage.getItem("showF1") !== "false"; // Default to true
let showF2 = localStorage.getItem("showF2") === "true"; // Default to false
let showF3 = localStorage.getItem("showF3") === "true"; // Default to false;

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

      const eventPromises = urls.map((item) =>
          fetch(item.url, { cache: "no-cache" }).then((response) => {
              if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
              return response.text().then((icalData) => ({ icalData, source: item.source }));
          })
      );

      const icalDataArray = await Promise.all(eventPromises);

      const allEvents = icalDataArray.flatMap(({ icalData, source }) => {
          const parsed = ICAL.parse(icalData);
          const comp = new ICAL.Component(parsed);
          return comp.getAllSubcomponents("vevent").map((vevent) => {
              const event = new ICAL.Event(vevent);
              event.source = source; // Tag the event with its source
              return event;
          });
      });

      return processICalData(allEvents); // Pass tagged events to the processing function
  } catch (error) {
      document.getElementById("loading").innerText = "Error loading events";
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

function processICalData(allEvents) {
  try {
      const now = new Date();
      const upcomingEvents = allEvents
          .filter((event) => event.startDate.toJSDate() > now)
          .sort((a, b) => a.startDate.toJSDate() - b.startDate.toJSDate())
          .slice(0, maxSessions);

      const colours = ["#D9ED92", "#B5E48C", "#99D98C", "#76C893", "#52B69A"];
      let lastSessionTime = null;
      let currentColourIndex = 0;

      chrome.storage.sync.get("fantasyWarningEnabled", (data) => {
          const showFantasyWarning = data.fantasyWarningEnabled ?? true; // Default to true

          document.getElementById("loading").style.display = "none";
          document.getElementById("events").style.display = "flex";
          document.getElementById("events").innerHTML = "";

          upcomingEvents.forEach((event, index) => {
              const eventDate = event.startDate.toJSDate();

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

              const eventDiv = document.createElement("div");
              eventDiv.className = "event";
              eventDiv.style.backgroundColor = colours[currentColourIndex];

              const localTime = eventDate.toLocaleString(undefined, {
                  weekday: "short",
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZoneName: "short",
              });

              const countdownHtml = `<h3>${cleanedTitle}</h3>
                                     <p>${localTime}</p>
                                     <div id='event${index + 1}-timer' class='countdown'></div>`;

              // Display Fantasy lock warning only if enabled and applicable
              if (
                  showFantasyWarning && // Check user preference
                  event.source === "F1" && // Only apply to F1 sessions
                  (cleanedTitle.includes("Sprint") || cleanedTitle.includes("Qualifying")) &&
                  !cleanedTitle.includes("Sprint Qualifying")
              ) {
                  const lockDiv = document.createElement("div");
                  lockDiv.className = "fantasy-lock";
                  lockDiv.innerHTML = `<h4>⚠️ F1 Fantasy team lock ⚠️</h4>`;

                  eventDiv.appendChild(lockDiv); // Add Fantasy lock box above countdown
              }

              eventDiv.innerHTML += countdownHtml;

              document.getElementById("events").appendChild(eventDiv);

              startCountdown(event, `event${index + 1}-timer`);
          });
      });

      return upcomingEvents; // Ensure upcomingEvents is returned
  } catch (error) {
      console.error("Error processing events:", error);
      document.getElementById("loading").innerText = "Error processing events";
      return [];
  }
}




// Handle settings & UI events
document.addEventListener("DOMContentLoaded", () => {
  const settingsModal = document.getElementById("settings-modal");
  const settingsIcon = document.getElementById("settings-icon");
  const closeSettings = document.getElementById("close-settings");
  const numSessionsInput = document.getElementById("numSessions");
  const showSecondsInput = document.getElementById("showSeconds");

  const showF1Input = document.getElementById("showF1");
  const showF2Input = document.getElementById("showF2");
  const showF3Input = document.getElementById("showF3");

  const fantasyWarningToggle = document.getElementById("fantasy-warning-toggle");

    // Load saved preference for Fantasy lock warning
    chrome.storage.sync.get("fantasyWarningEnabled", (data) => {
        const isEnabled = data.fantasyWarningEnabled ?? true; // Default to true
        fantasyWarningToggle.checked = isEnabled;
    });

    // Save preference when toggled
    fantasyWarningToggle.addEventListener("change", () => {
        const fantasyWarningEnabled = fantasyWarningToggle.checked;
        chrome.storage.sync.set({ fantasyWarningEnabled }, () => {
            console.log(`Fantasy warning preference set to: ${fantasyWarningEnabled}`);
        });

        // Optionally reload events to reflect the new preference immediately
        fetchEvents().then((events) => {
            document.getElementById("events").innerHTML = ""; // Clear events
            processICalData(events); // Re-process events with updated settings
        });
    });

  // Set initial states
  showF1Input.checked = showF1;
  showF2Input.checked = showF2;
  showF3Input.checked = showF3;

  showF1Input.addEventListener("change", (e) => {
    showF1 = e.target.checked;
    localStorage.setItem("showF1", showF1);
    fetchEvents(); // Reload events with updated preferences
  });

  showF2Input.addEventListener("change", (e) => {
    showF2 = e.target.checked;
    localStorage.setItem("showF2", showF2);
    fetchEvents(); // Reload events with updated preferences
  });

  showF3Input.addEventListener("change", (e) => {
    showF3 = e.target.checked;
    localStorage.setItem("showF3", showF3);
    fetchEvents(); // Reload events with updated preferences
  });

  // Set initial checkbox state
  showSecondsInput.checked = showSeconds;

  // Open settings modal
  settingsIcon.addEventListener("click", () => {
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

  // Load events & update display on startup
  fetchEvents();
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
