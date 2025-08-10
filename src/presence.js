export function initPresenceAndLeaderboard({
  db,
  uid,
  username,
  sanitizeUsername,
  allUsers,
  CLIENT_VERSION,
}) {
  const versionRef = db.ref('config/version');
  versionRef.on('value', (snap) => {
    const serverVersion = snap.val();
    if (serverVersion && serverVersion !== CLIENT_VERSION) {
      const warn = document.createElement('div');
      warn.textContent = 'Client outdated – refreshing in 5s...';
      warn.style.cssText =
        'position:fixed;top:0;left:0;width:100%;background:red;color:white;text-align:center;font-size:24px;padding:20px;z-index:100000;';
      document.body.appendChild(warn);
      setTimeout(() => location.reload(), 5000);
    }
  });

  const presenceRef = db.ref('.info/connected');
  const userOnlineRef = db.ref('presence/' + uid);

  presenceRef.on('value', (snap) => {
    if (snap.val() === true) {
      userOnlineRef.set(username);
      userOnlineRef.onDisconnect().remove();
    }
  });

  const presenceListRef = db.ref('presence');
  const onlineUsersEl = document.getElementById('online-users');
  const onlineUsers = new Map();
  const MAX_DISPLAY = 20;

  function renderOnlineUsers() {
    const arr = Array.from(onlineUsers.values());
    const list = arr.slice(0, MAX_DISPLAY).join(', ');
    const more =
      arr.length > MAX_DISPLAY ? ` (+${arr.length - MAX_DISPLAY} more)` : '';
    onlineUsersEl.textContent = `Online (${arr.length}): ${list}${more}`;
  }

  presenceListRef.on('child_added', (snap) => {
    const name = sanitizeUsername(snap.val());
    onlineUsers.set(snap.key, name);
    allUsers.add(name);
    renderOnlineUsers();
  });

  presenceListRef.on('child_removed', (snap) => {
    onlineUsers.delete(snap.key);
    renderOnlineUsers();
  });

  db.ref('leaderboard_v3')
    .once('value')
    .then((snap) => {
      snap.forEach((child) => {
        const data = child.val() || {};
        const u = sanitizeUsername(data.username || '');
        if (u) allUsers.add(u);
      });
    });
}
