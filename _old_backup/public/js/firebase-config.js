/**
 * PLD BDU v2 - Firebase Configuration
 * Initialize Firebase services
 */

const firebaseConfig = {
    apiKey: "AIzaSyBvTwfl3C5cuXQxd3iaO3I0cuA8nIbIu1Y",
    authDomain: "pld-bdu.firebaseapp.com",
    projectId: "pld-bdu",
    storageBucket: "pld-bdu.firebasestorage.app",
    messagingSenderId: "776119551243",
    appId: "1:776119551243:web:ac90329a6c8047ec4b8e0e",
    measurementId: "G-R1R2ZJE0RK"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const firebaseAuth = firebase.auth();
const firestore = firebase.firestore();

// Export for use in other modules
window.firebaseAuth = firebaseAuth;
window.firestore = firestore;

console.log('🔥 Firebase initialized');

