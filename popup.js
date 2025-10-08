// BeeHappy Popup: Only overlay toggle and auth placeholder
document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("toggle-overlay");

  toggleBtn.addEventListener("click", async () => {
    const originalText = toggleBtn.textContent;
    toggleBtn.textContent = "Toggling...";
    toggleBtn.disabled = true;
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];
      const response = await chrome.tabs.sendMessage(currentTab.id, { action: "toggleOverlay" });
      toggleBtn.textContent = "Overlay Toggled ✓";
      window.close();
    } catch (error) {
      console.error("BeeHappy Popup: Toggle overlay failed:", error);
      toggleBtn.textContent = "Toggle Failed ✗: " + error.message;
      setTimeout(() => {
        toggleBtn.textContent = originalText;
      }, 2000);
    } finally {
      toggleBtn.disabled = false;
    }
  });

  // Auth UI placeholder
  // const authSpace = document.getElementById("auth-space");
  // if (authSpace) {
  //   authSpace.innerHTML = '<div style="text-align:center; color:#888; padding:16px;">Auth UI coming soon...</div>';
  // }
});
