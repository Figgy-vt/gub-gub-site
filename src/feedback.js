export function initFeedback({ db, username }) {
  const feedbackBtn = document.getElementById('feedbackBtn');
  const feedbackModal = document.getElementById('feedbackModal');
  const feedbackInput = document.getElementById('feedbackInput');
  const feedbackSubmit = document.getElementById('feedbackSubmit');
  const feedbackSee = document.getElementById('feedbackSee');
  const feedbackAnon = document.getElementById('feedbackAnon');
  const feedbackCounter = document.getElementById('feedbackCounter');

  feedbackInput.addEventListener('input', () => {
    const remaining = 200 - feedbackInput.value.length;
    feedbackCounter.textContent = `${remaining} characters remaining`;
  });

  feedbackBtn.addEventListener('click', () => {
    feedbackModal.style.display =
      feedbackModal.style.display === 'block' ? 'none' : 'block';
  });

  feedbackSee.addEventListener('click', () => {
    window.open('feedback-list/', '_blank');
    feedbackModal.style.display = 'none';
  });

  feedbackSubmit.addEventListener('click', () => {
    const text = feedbackInput.value.trim();
    if (!text) return;
    const who = feedbackAnon.checked ? 'Anon' : username;
    db.ref('feedback').push({
      user: who,
      text,
      ts: Date.now(),
    });
    feedbackInput.value = '';
    feedbackAnon.checked = false;
    feedbackCounter.textContent = '200 characters remaining';
    feedbackModal.style.display = 'none';
  });
}
