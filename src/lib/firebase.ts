import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDCvscD4J6OzUN3SwHPUwKUPqKNi8gDtcE",
  authDomain: "ltc-intern-system.firebaseapp.com",
  projectId: "ltc-intern-system",
  storageBucket: "ltc-intern-system.firebasestorage.app",
  messagingSenderId: "261708166872",
  appId: "1:261708166872:web:c94bc91241acb71a2489ad"
};

// Initialize Firebase (ປ້ອງກັນການ Initialize ຊ້ຳຊ້ອນໃນ Next.js)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// ສ້າງ Object ເພື່ອເອົາໄປໃຊ້ໃນໜ້າອື່ນ
const auth = getAuth(app);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export { auth, db };