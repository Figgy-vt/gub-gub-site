import { initChatResize } from "./chat-resize.js";
import { initChatMentions } from "./chat-mentions.js";

export function escapeHTML(str) {
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

export function initChat({ db, username, allUsers, sanitizeUsername, playMentionSound }) {
  const chatRef = db.ref("chat");
  const messagesEl = document.getElementById("messages");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const mentionSuggestions = document.getElementById("mentionSuggestions");
  const chatBox = document.getElementById("chat");
  const resizeHandle = document.getElementById("chatResizeHandle");

  initChatResize(chatBox, resizeHandle);
  initChatMentions({ chatInput, mentionSuggestions, allUsers });

  const emoteMap = {};
  const HARUPI_SET = "01H6Q79JP80007TK4TYM94A0B4";
  const emotesLoaded = fetch(`https://7tv.io/v3/emote-sets/${HARUPI_SET}`)
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

  async function emoteHTML(text) {
    await emotesLoaded;
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

