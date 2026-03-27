const firebaseConfig = {
  apiKey: "AIzaSyCEekuLbc013usrJ6q8oHupgxBz5EEyG2k",
  authDomain: "npat-game-a2b7e.firebaseapp.com",
  databaseURL: "https://npat-game-a2b7e-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "npat-game-a2b7e",
  storageBucket: "npat-game-a2b7e.appspot.com",
  messagingSenderId: "305601317068",
  appId: "1:305601317068:web:d5514f039eb0f153a75a69"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();