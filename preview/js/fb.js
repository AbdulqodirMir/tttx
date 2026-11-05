// TTTX online: Firebase bootstrap (anonymous auth + RTDB). Config values are public-by-design web config.
import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,signInAnonymously} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getDatabase} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';

const cfg={
  apiKey:"AIzaSyCQpNHsTtu7k6u2IXqIngNk4eX1dvCljcY",
  authDomain:"tttx-e7404.firebaseapp.com",
  databaseURL:"https://tttx-e7404-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:"tttx-e7404",
  storageBucket:"tttx-e7404.firebasestorage.app",
  messagingSenderId:"862633433956",
  appId:"1:862633433956:web:bce95cf065d73d0858f871"
};
export const app=initializeApp(cfg);
export const auth=getAuth(app);
export const db=getDatabase(app);
// resolves to the signed-in anonymous user (session persists per browser)
export const ready=(async()=>{const c=await signInAnonymously(auth);return c.user})();
