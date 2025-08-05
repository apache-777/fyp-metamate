// Import the functions you need from the SDKs you need
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';


// TODO: Replace the following with your app's Firebase project configuration
const firebaseConfig = {
    apiKey: "AIzaSyDMCcOCxtq3RWE88g8zwXMn3WQgMR0IglM",
    authDomain: "metamate-74048.firebaseapp.com",
    projectId: "metamate-74048",
    storageBucket: "metamate-74048.firebasestorage.app",
    messagingSenderId: "871200315905",
    appId: "1:871200315905:web:7410e614f7e7fceb83fe00",
    measurementId: "G-BNYCD0J9SG"
  };

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app); 