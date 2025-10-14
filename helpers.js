function findChatContainer() {
  // Try multiple selectors for different YouTube layouts
  const selectors = [
    "#chatframe", // Main chat iframe
    "ytd-live-chat-frame", // Live chat frame element
    "#chat", // Alternative chat selector
    "yt-live-chat-renderer", // Chat renderer element
    "#secondary #chat", // Chat in secondary column
    "ytd-watch-flexy #secondary #chat" // Specific watch page chat
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    // console.log("🐝 Checking chat selector:", selector, element);
    if (element && element.getBoundingClientRect().width > 0) {
      // console.log("🐝 Found chat container using selector:", selector, element);
      return element;
    }
  }

  return null;
}

function repositionToChatContainer() {
  const chatFrame = findChatContainer();
  const overlay = document.querySelector("#beeHappyOverlay");
  console.log("[ContentScript][Helpers] Found chat container:", chatFrame);
  if (chatFrame) {
    const rect = chatFrame.getBoundingClientRect();
    const overlayWidth = 200; // Updated to match new compact width
    const overlayHeight = 80; // Updated to match new compact height

    // Position at the top-left of the chat container
    const left = rect.left;
    const top = rect.top;

    // Ensure overlay stays within viewport bounds
    const finalLeft = Math.max(0, Math.min(left, window.innerWidth - overlayWidth));
    const finalTop = Math.max(0, Math.min(top, window.innerHeight - overlayHeight));

    // Apply position
    overlay.style.position = "fixed";
    overlay.style.left = finalLeft + "px";
    overlay.style.top = finalTop + "px";
    overlay.style.right = "auto";
    overlay.style.bottom = "auto";

    // Set default dimensions if not already set
    if (!overlay.style.width || overlay.style.width === "") {
      overlay.style.width = overlayWidth + "px";
    }
    if (!overlay.style.height || overlay.style.height === "") {
      overlay.style.height = "auto";
    }

    console.log("🐝 Positioned controls at top-left of chat container:", {
      chatRect: rect,
      overlayLeft: overlay.style.left,
      overlayTop: overlay.style.top,
      finalLeft,
      finalTop
    });
  } else {
    hideOverlayManually();
    console.log("🐝 Chat container not found, hiding overlay");
  }
}

function showOverlayManually() {
  // Query for the overlay
  const overlay = document.querySelector("#beeHappyOverlay");
  const chatFrame = findChatContainer();
  console.log("[ContentScript][Helpers] showOverlayManually", {
    overlay,
    chatFrame
  });
  if (overlay && chatFrame) {
    // If user hasn't positioned the overlay manually, position it relative to chat
    if (!this.userPositioned) {
      repositionToChatContainer();
    }
    overlay.style.display = "flex";
  }
}

function hideOverlayManually() {
  // Query for the overlay
  const overlay = document.querySelector("#beeHappyOverlay");
  if (overlay) {
    overlay.style.display = "none";
  }
}

window.ManualFuncs = {
  showOverlayManually,
  hideOverlayManually,
}