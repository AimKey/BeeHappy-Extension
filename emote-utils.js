// Utility functions for BeeHappy emote picker

export function showCopiedToast(text) {
  try {
    const msg = text ? `${text} copied` : "Copied to clipboard";
    const toast = document.createElement("div");
    toast.className = "bh-toast";
    toast.textContent = msg;
    // Restore critical inline styles for visibility
    toast.style.position = "fixed";
    toast.style.left = "50%";
    toast.style.bottom = "8%";
    toast.style.transform = "translateX(-50%)";
    toast.style.background = "#7C3AED";
    toast.style.color = "#fff";
    toast.style.padding = "8px 12px";
    toast.style.borderRadius = "8px";
    toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
    toast.style.zIndex = 999999;
    toast.style.opacity = "0";
    toast.style.transition = "opacity 180ms ease-in-out, transform 180ms ease-in-out";
    toast.style.pointerEvents = "none";

    // Query for the overlay
    const overlay = document.querySelector("#overlay-footer");
    if (overlay) {
      overlay.appendChild(toast);
    } else {
      document.body.appendChild(toast);
    }

    // Force reflow then animate in
    toast.offsetHeight;
    toast.style.opacity = "1";
    toast.style.transform = "translateX(-50%) translateY(-6px)";

    // Remove after short delay
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(0)";
      setTimeout(() => {
        try {
          toast.remove();
        } catch (_) {}
      }, 200);
    }, 1400);
  } catch (e) {
    console.warn("🐝 Failed to show toast", e);
  }
}
