# Cloud-Based Canteen Pre-Order System

A modern, serverless **Cloud Computing Mini-Project** designed for university curriculum presentations (3rd-year CSE/IT). This system allows students to pre-order food from the college canteen to skip long waiting queues, while canteen staff can manage the menu catalogue and process incoming orders in real-time.

---

## 🚀 Key Features

### For Students
* **Authentication**: Register and login securely using email credentials and Student ID.
* **Smart Menu**: Browse categories (Breakfast, Meals, Snacks, Beverages, Desserts, Others) with search queries updating dynamically.
* **Interactive Cart**: Add items, adjust quantities, calculate totals (in Indian Rupees ₹), and specify desired pickup times.
* **Real-time Order Status**: Track orders through live pipeline updates: `Pending` ➔ `Confirmed` ➔ `Preparing` ➔ `Ready for Pickup` ➔ `Completed`.
* **Self Cancellation**: Cancel pending orders immediately before food preparation starts.

### For Canteen Staff / Admin
* **Interactive Dashboard**: View real-time aggregated metrics: Total Revenue, Total Orders, Pending, Preparing, Ready, and Completed orders.
* **Live Order Stream**: Track incoming student requests in a table and update their status using click controls.
* **Menu catalogue CRUD**: Add new items, update prices or descriptions, upload photos to the cloud, or remove dishes.
* **Inventory Control**: Instantly toggle dishes as "Available" or "Sold Out".

---

## 🛠️ Technologies Used

1. **Frontend Core**: HTML5 (Semantic Structure) & CSS3 (Warm theme, responsive Grid/Flexbox, Custom typography, and Glassmorphism details).
2. **Logic layer**: Modern Vanilla Javascript (ES6+, DOM manipulation, Event delegators, State manager, and error handlers).
3. **Cloud Backend (Firebase)**:
   * **Firebase Authentication**: User accounts registry & secure session token verification.
   * **Cloud Firestore**: Real-time serverless database syncing orders and menus.
   * **Firebase Storage**: Cloud blob storage for food item images.
   * **Firebase Hosting / GitHub Pages**: Fast CDN deployment.

---

## ☁️ Cloud Computing Concepts Demonstrated

This project showcases fundamental cloud computing paradigms:
* **Serverless Backend (BaaS)**: Zero backend code deployment. Database, authentication, and file storage are offloaded directly to Google Cloud services (Firebase) via SDKs.
* **Real-Time Data Synchronization**: Uses WebSockets under the hood via Firestore `onSnapshot()` to stream database changes instantly to both student and admin interfaces.
* **Cloud Security & Role-Based Access Control**: Leverages cloud-side policies (Security Rules) to restrict data reading/writing depending on the user's role token.
* **Object Cloud Storage**: Demonstrates file uploads to a distributed object storage bucket (Firebase Storage) with auto-generated public URLs.
* **Horizontal Scalability**: Firebase scales reads, writes, and auth requests automatically as concurrent users scale, without requiring manual server scaling.

---

## 💾 Database & Storage Schemas

### 1. `users` Collection
* **Document ID**: Auth User UID (`user.uid`)
```json
{
  "uid": "Wq92JhD821mNsk28P",
  "name": "Amit Kumar",
  "email": "amit.kumar@college.edu",
  "studentId": "CSE2023055",
  "role": "student", // "student" or "admin"
  "createdAt": "Server Timestamp"
}
```

### 2. `foods` Collection
* **Document ID**: Auto-generated string
```json
{
  "name": "Crispy Veg Burger",
  "description": "Crunchy vegetable patty with cheese slice, tomatoes, lettuce, and mayo.",
  "category": "Snacks",
  "price": 60,
  "imageUrl": "https://firebasestorage.googleapis.com/.../food_images%2F...",
  "available": true,
  "createdAt": "Server Timestamp"
}
```

### 3. `orders` Collection
* **Document ID**: Auto-generated string
```json
{
  "orderId": "ORD5921", // Human-friendly order number
  "userId": "Wq92JhD821mNsk28P",
  "studentName": "Amit Kumar",
  "studentId": "CSE2023055",
  "items": [
    {
      "foodId": "b8x9A2Kd0",
      "name": "Crispy Veg Burger",
      "price": 60,
      "quantity": 2
    }
  ],
  "totalAmount": 120,
  "pickupTime": "1:30 PM",
  "orderDate": "15/08/2026, 01:25:40 PM",
  "status": "Pending", // Pending | Confirmed | Preparing | Ready for Pickup | Completed | Cancelled
  "createdAt": "Server Timestamp"
}
```

---

## 🔒 Firebase Security Rules

Paste the following configurations in your Firebase Console:

### Firestore Security Rules (`firestore.rules`)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper: checks if user is logged in
    function isSignedIn() {
      return request.auth != null;
    }
    
    // Helper: checks user's role from users collection
    function getUserData() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }
    
    function isAdmin() {
      return isSignedIn() && getUserData().role == 'admin';
    }

    // Users Collection rules
    match /users/{userId} {
      allow read, write: if isSignedIn() && request.auth.uid == userId;
    }

    // Foods Collection rules
    match /foods/{foodId} {
      allow read: if true; // anyone can view menu
      allow write: if isAdmin(); // only admins can add, edit, or delete items
    }

    // Orders Collection rules
    match /orders/{orderId} {
      // Admins read all, students read only their own orders
      allow read: if isAdmin() || (isSignedIn() && resource.data.userId == request.auth.uid);
      
      // Students can create orders, Admins cannot (or can edit)
      allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
      
      // Admins can update status, Students can only update status to 'Cancelled' if current status is 'Pending'
      allow update: if isAdmin() || 
        (isSignedIn() && 
         resource.data.userId == request.auth.uid && 
         resource.data.status == 'Pending' && 
         request.resource.data.status == 'Cancelled');
         
      allow delete: if isAdmin();
    }
  }
}
```

### Storage Security Rules (`storage.rules`)
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /food_images/{allPaths=**} {
      // Anyone can read food images
      allow read: if true;
      // Only authenticated users (admins) can upload/modify images
      allow write: if request.auth != null;
    }
  }
}
```

---

## ⚙️ Step-by-Step Setup Guide

### Part 1: Firebase Project Configuration
1. Go to the [Firebase Console](https://console.firebase.google.com/) and click **Add Project**.
2. Name your project (e.g. `canteen-preorder-system`) and complete project creation.
3. Click the **Web icon (</>)** to register a web application. Give it a nickname.
4. Copy the `firebaseConfig` javascript object provided.
5. In your local project directory, open [script.js](file:///c:/Users/ASUS/OneDrive/Desktop/cloud%20based%20mini%20canteen/script.js) and paste the values into the designated section at the top of the file:
   ```javascript
   const firebaseConfig = {
       apiKey: "YOUR_API_KEY",
       authDomain: "YOUR_PROJECT.firebaseapp.com",
       projectId: "YOUR_PROJECT_ID",
       storageBucket: "YOUR_PROJECT.appspot.com",
       messagingSenderId: "YOUR_SENDER_ID",
       appId: "YOUR_APP_ID"
   };
   ```

### Part 2: Enable Services in Firebase
1. **Authentication**:
   * Navigate to **Authentication** under the Build tab.
   * Click **Get Started**, choose **Email/Password** as the Sign-in Provider, and **Enable** it.
2. **Cloud Firestore**:
   * Navigate to **Firestore Database** and click **Create Database**.
   * Choose start in **Production Mode** or Test Mode. Choose location.
   * Go to the **Rules** tab, paste the **Firestore Security Rules** listed in this README, and click **Publish**.
3. **Firebase Storage**:
   * Navigate to **Storage** and click **Get Started**.
   * Set up your storage bucket and go to the **Rules** tab.
   * Paste the **Storage Security Rules** listed in this README and click **Publish**.

---

## 💻 Running the Project Locally

No installation or server installation is required. This is a frontend client that communicates directly with the cloud database.

1. **Quick Open**: Double-click `index.html` to open it in your browser.
2. **Preview Mode fallback**: If you haven't configured Firebase yet, the system detects this and displays a yellow warning bar at the top, letting you experience the system instantly in **Local Demo Mode** using simulated data storage in your browser memory.
3. **Admin account creation**: 
   * When registering a new account, check the **Register as Canteen Staff / Admin** checkbox.
   * Enter the passcode: `admin123` to verify authorization.
   * This immediately tags your user account role as `'admin'` in the cloud.

---

## 📦 Deployment

### Method A: Deploy on GitHub Pages (Recommended & Free)
1. Initialize git in your project workspace:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of cloud canteen pre-order system"
   ```
2. Create a new repository on your GitHub account named `CLOUD-BASED-CANTEEN-PRE-ORDER-SYSTEM`.
3. Add the remote and push:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/CLOUD-BASED-CANTEEN-PRE-ORDER-SYSTEM.git
   git branch -M main
   git push -u origin main
   ```
4. On GitHub, go to your repository **Settings** ➔ **Pages**.
5. Set the source branch to **main / root** and click Save. Your app will be live at `https://YOUR_USERNAME.github.io/CLOUD-BASED-CANTEEN-PRE-ORDER-SYSTEM/`.

### Method B: Deploy on Firebase Hosting
1. Install Firebase CLI globally:
   ```bash
   npm install -g firebase-tools
   ```
2. Log in and initialize hosting in your folder:
   ```bash
   firebase login
   firebase init hosting
   ```
3. When asked, set public directory as `.` (current folder) and do not overwrite `index.html`.
4. Deploy the site:
   ```bash
   firebase deploy
   ```

---

## 🎓 Viva Talking Points (CSE Presentation)

Here are the most common questions asked by examiners during college mini-project presentations:

1. **Why is this project classified under Cloud Computing?**
   * *Answer*: Because it uses a serverless cloud architecture. There is no local web server or database running on our machine. All user profiles, images, and pre-orders are instantly routed over the internet directly to Firebase Cloud engines (Authentication, Firestore, and Storage buckets).

2. **What is Firestore and how does real-time synchronization work?**
   * *Answer*: Cloud Firestore is a NoSQL Document-based database that stores data in collections of documents. It does not use SQL tables or schemas. Real-time updates work via WebSockets. We register a listener on the collection (`onSnapshot()`), and the Google cloud server automatically pushes delta updates to all active clients whenever a document is modified.

3. **Why did we use Firebase Auth instead of storing passwords in our database?**
   * *Answer*: Manual storage of passwords poses security risks. Firebase Authentication handles password hashing (using Bcrypt/Scrypt), session JWT token storage, token refresh cycles, and security protocols automatically, keeping user credentials secure and compliance-friendly.

4. **How do we make sure a student doesn't edit another student's order?**
   * *Answer*: Through **Firestore Security Rules**. When a user requests to read or modify a document, the cloud database checks the incoming auth token (`request.auth.uid`) against the `userId` stored in the target order document. If they don't match, the cloud blocks the action immediately, regardless of what our javascript code requests.
