// BeeHappy Popup: Only overlay toggle and auth placeholder
document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("toggle-overlay");
  const loginBtn = document.getElementById("login-btn");

  // Handle login button click
  loginBtn.addEventListener("click", async () => {
    console.log("BeeHappy Popup: Starting login flow...");
    // TODO: Replace this with the deployed auth URL
    const devUrl = "https://localhost:7256/extension/AuthBridge";
    const prodUrl = "https://beehappy-gfghhffadqbra6g8.eastasia-01.azurewebsites.net/extension/AuthBridge";
    chrome.tabs.create({
      url: devUrl,
    });
  });

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
