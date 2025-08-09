export function initChat({ db, username, allUsers, sanitizeUsername, playMentionSound }) {
  const chatRef = db.ref("chat");
  const messagesEl = document.getElementById("messages");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const mentionSuggestions = document.getElementById("mentionSuggestions");
  const chatBox = document.getElementById("chat");
  const resizeHandle = document.getElementById("chatResizeHandle");
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

  const emoteMap = {};
  const HARUPI_SET = "01H6Q79JP80007TK4TYM94A0B4";
  fetch(`https://7tv.io/v3/emote-sets/${HARUPI_SET}`)
    .then((r) => r.json())
    .then((d) => {
      d.emotes.forEach((e) => {
        const url = `https:${e.data.host.url}/2x.webp`;
        emoteMap[e.name] = url;
        emoteMap[e.name.toLowerCase()] = url;
      });
    })
    .catch((err) => {
      console.error("Failed to load 7TV emote set", err);
    });

  async function getEmoteURL(name) {
    if (emoteMap[name]) return emoteMap[name];
    const lower = name.toLowerCase();
    if (emoteMap[lower]) return emoteMap[lower];
    return null;
  }

  function escapeHTML(str) {
    return str.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }

  async function emoteHTML(text) {
    let safe = escapeHTML(text);
    const tokens = safe.split(/(\s+)/);
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (/^\s+$/.test(token)) continue;
      const stripped = token.replace(/^:|:$/g, "");
      if (/^[A-Za-z0-9_]+$/.test(stripped)) {
        const url = await getEmoteURL(stripped);
        if (url) {
          tokens[i] = `<img class="chat-emote" alt="${stripped}" src="${url}">`;
        }
      }
    }
    return tokens.join("");
  }

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

  const CHAT_MESSAGE_LIMIT = 50;
  const MAX_CHAT_LENGTH = 200;
  let initialChatLoaded = false;
  chatRef
    .orderByChild("ts")
    .limitToLast(CHAT_MESSAGE_LIMIT)
    .on("child_added", (snap) => {
      const { user, text, ts } = snap.val();
      const safeUser = sanitizeUsername(user);
      allUsers.add(safeUser);
      const msgEl = document.createElement("div");
      const dateObj = new Date(ts);
      const date = dateObj.toLocaleDateString();
      const time = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const mentionRegex = new RegExp(`@${username}\\b`, "gi");
      const isMention = mentionRegex.test(text);
      mentionRegex.lastIndex = 0;
      const initial = escapeHTML(text).replace(
        mentionRegex,
        '<span class="mention-highlight">$&</span>',
      );
      msgEl.innerHTML = `[${date} ${time}] ${user}: ${initial}`;
      messagesEl.appendChild(msgEl);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      if (initialChatLoaded && isMention && safeUser !== username) {
        playMentionSound();
      }
      emoteHTML(text)
        .then((processed) => {
          mentionRegex.lastIndex = 0;
          const final = processed.replace(
            mentionRegex,
            '<span class="mention-highlight">$&</span>',
          );
          msgEl.innerHTML = `[${date} ${time}] ${user}: ${final}`;
          msgEl.querySelectorAll("img").forEach((img) => {
            if (img.complete) {
              messagesEl.scrollTop = messagesEl.scrollHeight;
            } else {
              img.addEventListener("load", () => {
                messagesEl.scrollTop = messagesEl.scrollHeight;
              });
            }
          });
          messagesEl.scrollTop = messagesEl.scrollHeight;
        })
        .catch(() => {});
    });

  chatRef.once("value").then(() => {
    initialChatLoaded = true;
  });

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInput.value.trim().slice(0, MAX_CHAT_LENGTH);
    if (!text) return;
    chatRef.push({
      user: username,
      text,
      ts: firebase.database.ServerValue.TIMESTAMP,
    });
    chatInput.value = "";
    mentionSuggestions.style.display = "none";
  });
}
