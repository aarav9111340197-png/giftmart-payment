// Firebase Authentication Logic
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signInWithPopup, 
    GoogleAuthProvider, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Initialize Firebase
const app = initializeApp(window.firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Export Auth functions to window for global access
window.authLogic = {
    signUp: async (email, password) => {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            return { success: true, user: userCredential.user };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    login: async (email, password) => {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            return { success: true, user: userCredential.user };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    loginWithGoogle: async () => {
        try {
            const result = await signInWithPopup(auth, googleProvider);
            return { success: true, user: result.user };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    logout: async () => {
        try {
            await signOut(auth);
            localStorage.removeItem('giftmart_logged_in');
            localStorage.removeItem('giftmart_user');
            window.location.reload(); // Reload current page to update UI
        } catch (error) {
            console.error("Logout Error:", error);
        }
    },

    onAuthChange: (callback) => {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                localStorage.setItem('giftmart_logged_in', 'true');
                localStorage.setItem('giftmart_user', JSON.stringify({
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName || user.email.split('@')[0],
                    photoURL: user.photoURL
                }));
            } else {
                localStorage.removeItem('giftmart_logged_in');
                localStorage.removeItem('giftmart_user');
            }
            callback(user);
        });
    }
};
