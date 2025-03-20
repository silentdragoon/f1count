"use strict";

console.log("ICAL.js loaded successfully!", ICAL);

const ICAL_URL =
  "https://raw.githubusercontent.com/silentdragoon/f1count/refs/heads/main/Formula_1.ics";
  let maxSessions = parseInt(localStorage.getItem("maxSessions"), 10) || 5; // Default to 5 if no value exists
let showSeconds = localStorage.getItem("showSeconds") === "true"; // Load saved setting

async function fetchEvents() {
  try {
    const response = await fetch(ICAL_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    const icalData = await response.text();
    requestAnimationFrame(() => processICalData(icalData));
  } catch (error) {
    document.getElementById("loading").innerText = "Error loading events";
  }
}

function processICalData(icalData) {
  try {
    const parsed = ICAL.parse(icalData);
    const comp = new ICAL.Component(parsed);
    const events = comp
      .getAllSubcomponents("vevent")
      .map((vevent) => new ICAL.Event(vevent));

    const now = new Date();
    const upcomingEvents = events
      .filter((event) => event.startDate.toJSDate() > now)
      .sort((a, b) => a.startDate.toJSDate() - b.startDate.toJSDate())
      .slice(0, maxSessions);

    const raceWeekends = {};
    const Colours = ["#F7B267", "#F79D65", "#F4845F", "#F27059", "#F25C54"];

    document.getElementById("loading").style.display = "none";
    document.getElementById("events").style.display = "flex";
    document.getElementById("events").innerHTML = "";

    upcomingEvents.forEach((event, index) => {
      const fullTitle = event.summary.replace(/FORMULA 1|2025/g, "").trim();
      const cleanedTitle = toTitleCase(fullTitle.replace(/^[^\w]+/, "").trim());
      const raceName = cleanedTitle.split("-")[0].trim();

      if (!raceWeekends[raceName]) {
        const colorIndex = Object.keys(raceWeekends).length % Colours.length;
        raceWeekends[raceName] = Colours[colorIndex];
      }

      const eventDiv = document.createElement("div");
      eventDiv.className = "event";
      eventDiv.style.backgroundColor = raceWeekends[raceName];

      const eventDate = event.startDate.toJSDate();
      const localTime = eventDate.toLocaleString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });

      eventDiv.innerHTML = `<h3>${cleanedTitle}</h3>
                            <p>${localTime}</p>
                            <div id='event${index + 1}-timer' class='countdown'></div>`;
      document.getElementById("events").appendChild(eventDiv);
      startCountdown(event, `event${index + 1}-timer`);
    });

    updateTimerDisplay(); // Ensure correct layout when events load
  } catch (error) {
    document.getElementById("loading").innerText = "Error processing events";
  }
}

// Handle settings & UI events
document.addEventListener("DOMContentLoaded", () => {
  const settingsModal = document.getElementById("settings-modal");
  const settingsIcon = document.getElementById("settings-icon");
  const closeSettings = document.getElementById("close-settings");
  const numSessionsInput = document.getElementById("numSessions");
  const showSecondsInput = document.getElementById("showSeconds");

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

  function formatTimeUnit(value, unit) {
    const paddedValue = String(value).padStart(2, "0");
    return `${paddedValue}<span class='label'>${unit}${value === 1 ? "" : "S"}</span>`;
  }

  function updateTimer() {
    const now = new Date().getTime();
    const distance = countDownDate - now;
    const element = document.getElementById(elementId);

    if (distance < 0) {
      element.innerHTML = "Event Started";
      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    element.innerHTML = `
      <div>${formatTimeUnit(days, "DAY")}</div>
      <div>${formatTimeUnit(hours, "HOUR")}</div>
      <div>${formatTimeUnit(minutes, "MINUTE")}</div>
      ${showSeconds ? `<div>${formatTimeUnit(seconds, "SECOND")}</div>` : ""}`;

    updateTimerDisplay(); // Ensure layout updates after each refresh
  }

  updateTimer();
  setInterval(updateTimer, 1000);
}

// Utility function
function toTitleCase(text) {
  return text.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}
