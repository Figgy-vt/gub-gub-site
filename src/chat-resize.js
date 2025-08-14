export function initChatResize(chatBox, resizeHandle) {
  const savedChatWidth = localStorage.getItem("chatWidth");
  const savedChatHeight = localStorage.getItem("chatHeight");
  if (savedChatWidth) chatBox.style.width = savedChatWidth + "px";
  if (savedChatHeight) chatBox.style.height = savedChatHeight + "px";

  const saveChatSize = () => {
    localStorage.setItem("chatWidth", chatBox.offsetWidth);
    localStorage.setItem("chatHeight", chatBox.offsetHeight);
  };

  let startX, startY, startWidth, startHeight;

  function initResize(e) {
    e.preventDefault();
    const touch = e.touches ? e.touches[0] : e;
    startX = touch.clientX;
    startY = touch.clientY;
    startWidth = chatBox.offsetWidth;
    startHeight = chatBox.offsetHeight;
    document.documentElement.addEventListener("mousemove", doResize);
    document.documentElement.addEventListener("touchmove", doResize);
    document.documentElement.addEventListener("mouseup", stopResize);
    document.documentElement.addEventListener("touchend", stopResize);
  }

  function doResize(e) {
    const touch = e.touches ? e.touches[0] : e;
    const newWidth = Math.max(200, startWidth + (touch.clientX - startX));
    const newHeight = Math.max(100, startHeight - (touch.clientY - startY));
    chatBox.style.width = newWidth + "px";
    chatBox.style.height = newHeight + "px";
  }

  function stopResize() {
    document.documentElement.removeEventListener("mousemove", doResize);
    document.documentElement.removeEventListener("touchmove", doResize);
    document.documentElement.removeEventListener("mouseup", stopResize);
    document.documentElement.removeEventListener("touchend", stopResize);
    saveChatSize();
  }

  resizeHandle.addEventListener("mousedown", initResize);
  resizeHandle.addEventListener("touchstart", initResize);
}

