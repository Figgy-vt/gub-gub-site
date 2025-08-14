export function sanitizeUsername(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20);
}

export function initUsername(db, onReady) {
  let username = sanitizeUsername(localStorage.getItem('gubUser'));

  function showUsernamePrompt() {
    const overlay = document.getElementById('usernameOverlay');
    const input = document.getElementById('usernameInput');
    const submit = document.getElementById('usernameSubmit');
    overlay.style.display = 'flex';
    async function accept() {
      const u = sanitizeUsername(input.value);
      if (u.length >= 3) {
        try {
          const snap = await db
            .ref('leaderboard_v3')
            .orderByChild('username')
            .equalTo(u)
            .once('value');
          if (snap.exists()) {
            alert('Username already taken');
            return;
          }
        } catch (err) {
          console.error('Username check failed', err);
          return;
        }
        username = u;
        localStorage.setItem('gubUser', username);
        overlay.style.display = 'none';
        onReady(username);
      }
    }
    submit.addEventListener('click', accept);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') accept();
    });
    input.focus();
  }

  if (username && username.length >= 3) {
    onReady(username);
  } else {
    showUsernamePrompt();
  }
}
