// BeeHappy Popup: Only overlay toggle and auth placeholder
document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("toggle-overlay");

  toggleBtn.addEventListener("click", async () => {
    const originalText = toggleBtn.textContent;
    toggleBtn.textContent = "Toggling...";
    toggleBtn.disabled = true;

    const maxRetries = 50;
    const retryDelay = 500; // 500ms
    let attempt = 0;

    const attemptToggle = async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const currentTab = tabs[0];
        const response = await chrome.tabs.sendMessage(currentTab.id, { action: "toggleOverlay" });
        toggleBtn.textContent = "Overlay Toggled ✓";
        window.close();
        return true; // Success
      } catch (error) {
        attempt++;
        console.error(`BeeHappy Popup: Toggle overlay failed (attempt ${attempt}/${maxRetries}):`, error);

        if (attempt < maxRetries) {
          toggleBtn.textContent = `Retrying... (${attempt}/${maxRetries})`;
          return new Promise(resolve => {
            setTimeout(async () => {
              const success = await attemptToggle();
              resolve(success);
            }, retryDelay);
          });
        } else {
          // Final failure after all retries
          toggleBtn.textContent = "Toggle Failed ✗: " + error.message;
          setTimeout(() => {
            toggleBtn.textContent = originalText;
            toggleBtn.disabled = false;
          }, 2000);
          return false;
        }
      }
    };

    await attemptToggle();
  });

});
