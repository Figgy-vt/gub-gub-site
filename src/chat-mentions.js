export function initChatMentions({ chatInput, mentionSuggestions, allUsers }) {
  function updateSuggestions() {
    const cursor = chatInput.selectionStart;
    const textBefore = chatInput.value.slice(0, cursor);
    const match = textBefore.match(/@([A-Za-z0-9_]*)$/);
    if (match) {
      const prefix = match[1].toLowerCase();
      const matches = Array.from(allUsers)
        .filter((u) => u.toLowerCase().startsWith(prefix))
        .sort();
      if (matches.length > 0) {
        mentionSuggestions.innerHTML = matches
          .slice(0, 5)
          .map((m) => `<div>${m}</div>`)
          .join("");
        mentionSuggestions.style.display = "block";
      } else {
        mentionSuggestions.style.display = "none";
      }
    } else {
      mentionSuggestions.style.display = "none";
    }
  }

  chatInput.addEventListener("input", updateSuggestions);
  chatInput.addEventListener("keydown", (e) => {
    if (
      (e.key === "Tab" || e.key === " " || e.key === "Enter") &&
      mentionSuggestions.style.display === "block"
    ) {
      e.preventDefault();
      const first = mentionSuggestions.firstChild;
      if (first) {
        const name = first.textContent + " ";
        const cursor = chatInput.selectionStart;
        const textBefore = chatInput.value.slice(0, cursor);
        const match = textBefore.match(/@([A-Za-z0-9_]*)$/);
        if (match) {
          const start = cursor - match[1].length;
          chatInput.value =
            chatInput.value.slice(0, start) +
            name +
            chatInput.value.slice(cursor);
          chatInput.selectionStart = chatInput.selectionEnd =
            start + name.length;
        }
        mentionSuggestions.style.display = "none";
      }
    }
  });

  mentionSuggestions.addEventListener("mousedown", (e) => {
    if (e.target && e.target.tagName === "DIV") {
      e.preventDefault();
      const name = e.target.textContent + " ";
      const cursor = chatInput.selectionStart;
      const textBefore = chatInput.value.slice(0, cursor);
      const match = textBefore.match(/@([A-Za-z0-9_]*)$/);
      if (match) {
        const start = cursor - match[1].length;
        chatInput.value =
          chatInput.value.slice(0, start) +
          name +
          chatInput.value.slice(cursor);
        chatInput.selectionStart = chatInput.selectionEnd =
          start + name.length;
      }
      mentionSuggestions.style.display = "none";
      chatInput.focus();
    }
  });
}

