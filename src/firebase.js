export function initFirebase() {
  const firebaseConfig = {
    apiKey: 'AIzaSyBc2cDT3md2pk28dFMDoCeCgw37tpGBEjM',
    authDomain: 'gub-leaderboard.firebaseapp.com',
    databaseURL: 'https://gub-leaderboard-default-rtdb.firebaseio.com',
    projectId: 'gub-leaderboard',
    storageBucket: 'gub-leaderboard.firebasestorage.app',
    messagingSenderId: '851465760203',
    appId: '1:851465760203:web:1fc30c730a93c0fab25a4e',
    measurementId: 'G-95SE4H7EEW',
  };
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.database();
  const functions = firebase.functions();
  return { auth, db, functions };
}
