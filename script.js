/* ==========================================================================
   Cloud Canteen Pre-Order System Logic
   Author: 3rd-Year CSE Student (Mini-Project)
   Core Stack: Vanilla JavaScript, Firebase (Auth, Firestore, Storage)
   ========================================================================== */

// ==========================================================================
// 1. FIREBASE CONFIGURATION (PASTE YOUR CONFIG HERE)
// ==========================================================================
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// ==========================================================================
// 2. STATE & GLOBALS
// ==========================================================================
let db = null;
let auth = null;
let storage = null;
let useFirebase = false;

// Application State
let currentUser = null; // Stored user details { uid, name, email, studentId, role }
let cart = [];          // Cart items: { foodId, name, price, quantity, imageUrl }
let foods = [];         // Master list of menu items from database
let orders = [];        // Master list of orders from database
let activeView = 'home-view';
let activeCategory = 'all';
let searchKeyword = '';
let currentImageSourceType = 'url'; // 'url' or 'file'

// Active listeners references (for unsubscribe when logging out)
let foodsUnsubscribe = null;
let ordersUnsubscribe = null;

// ==========================================================================
// 3. APP INITIALIZATION & FALLBACK DETECTION
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    checkFirebaseSetup();
    initApp();
});

// Check if user has pasted real Firebase credentials
function checkFirebaseSetup() {
    const isConfigured = 
        firebaseConfig.apiKey && 
        firebaseConfig.apiKey !== "YOUR_API_KEY" &&
        firebaseConfig.projectId && 
        firebaseConfig.projectId !== "YOUR_PROJECT_ID";
    
    if (isConfigured) {
        try {
            // Initialize Firebase Compat
            firebase.initializeApp(firebaseConfig);
            db = firebase.firestore();
            auth = firebase.auth();
            storage = firebase.storage();
            useFirebase = true;
            console.log("🔥 Firebase initialized successfully. Connected to real Cloud Canteen.");
        } catch (error) {
            console.error("❌ Firebase initialization error:", error);
            showDemoAlert("Firebase connection failed. Running in Local Demo Mode.");
            useFirebase = false;
        }
    } else {
        useFirebase = false;
        showDemoAlert();
    }
}

// Show a header alert banner if running in Demo Mode
function showDemoAlert(message) {
    const alertBanner = document.createElement('div');
    alertBanner.className = 'demo-banner';
    alertBanner.style.cssText = `
        background: linear-gradient(90deg, #f59e0b, #d97706);
        color: white;
        text-align: center;
        padding: 0.6rem;
        font-size: 0.85rem;
        font-weight: 600;
        width: 100%;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    `;
    
    const bannerMsg = message || `⚠️ Running in Offline Demo Mode. Paste your Firebase credentials in script.js to connect to the cloud.`;
    alertBanner.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> <span>${bannerMsg}</span>`;
    document.body.insertBefore(alertBanner, document.body.firstChild);
}

// Main initializations
function initApp() {
    setupEventListeners();
    setupAuthListener();
    loadMenu();
    updateCartCount();
}

// ==========================================================================
// 4. AUTHENTICATION CONTROLS
// ==========================================================================

// Setup listener for User auth state
function setupAuthListener() {
    if (useFirebase) {
        auth.onAuthStateChanged(user => {
            if (user) {
                // User logged in, fetch role & details from Firestore
                db.collection('users').doc(user.uid).get()
                    .then(doc => {
                        if (doc.exists) {
                            handleUserSignIn(doc.data());
                        } else {
                            // Document not found in users, sign out
                            showToast("Auth Error", "User profile not found in cloud database.", "error");
                            auth.signOut();
                        }
                    })
                    .catch(err => {
                        console.error("Error loading user profile:", err);
                        showToast("Cloud Connection Error", "Unable to retrieve profile details.", "error");
                    });
            } else {
                handleUserSignOut();
            }
        });
    } else {
        // Offline / Local Auth Simulation from LocalStorage
        const savedUser = localStorage.getItem('demo_canteen_user');
        if (savedUser) {
            handleUserSignIn(JSON.parse(savedUser));
        } else {
            handleUserSignOut();
        }
    }
}

// Handle Sign In state changes
function handleUserSignIn(userData) {
    currentUser = userData;
    
    // UI adjustments
    document.getElementById('login-nav-btn').classList.add('hidden');
    document.getElementById('register-nav-btn').classList.add('hidden');
    document.getElementById('user-profile-menu').classList.remove('hidden');
    document.getElementById('user-display-name').textContent = currentUser.name;
    
    // Role based visibility
    if (currentUser.role === 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
        document.querySelectorAll('.student-only').forEach(el => el.classList.add('hidden'));
        // If current active view is restricted, redirect
        if (activeView === 'orders-view') switchView('admin-view');
    } else {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.student-only').forEach(el => el.classList.remove('hidden'));
        // If current active view is admin, redirect
        if (activeView === 'admin-view') switchView('home-view');
    }
    
    // Start listening to orders data
    listenToOrders();
    
    // Close authentication modals
    closeModal('auth-modal');
    showToast("Welcome Back", `Successfully logged in as ${currentUser.name}!`, "success");
}

// Handle Sign Out state changes
function handleUserSignOut() {
    currentUser = null;
    cart = [];
    updateCartCount();
    
    // Unsubscribe from live listeners
    if (ordersUnsubscribe) {
        ordersUnsubscribe();
        ordersUnsubscribe = null;
    }
    
    // Reset Navigation & Profile visibility
    document.getElementById('login-nav-btn').classList.remove('hidden');
    document.getElementById('register-nav-btn').classList.remove('hidden');
    document.getElementById('user-profile-menu').classList.add('hidden');
    
    document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.student-only').forEach(el => el.classList.add('hidden'));
    
    // Reset student stats
    document.getElementById('student-stat-total').textContent = '0';
    document.getElementById('student-stat-pending').textContent = '0';
    document.getElementById('student-stat-completed').textContent = '0';
    document.getElementById('student-orders-tbody').innerHTML = `
        <tr>
            <td colspan="7" class="empty-table-message">
                <i class="fa-regular fa-folder-open"></i>
                <p>No orders found. Go to the menu to place your first pre-order!</p>
            </td>
        </tr>`;
        
    // Reset admin stats
    document.getElementById('admin-stat-revenue').textContent = '₹0';
    document.getElementById('admin-stat-total').textContent = '0';
    document.getElementById('admin-stat-pending').textContent = '0';
    document.getElementById('admin-stat-preparing').textContent = '0';
    document.getElementById('admin-stat-ready').textContent = '0';
    document.getElementById('admin-stat-completed').textContent = '0';
    
    // Redirect to home if in dashboard
    if (activeView === 'orders-view' || activeView === 'admin-view') {
        switchView('home-view');
    }
    
    showToast("Signed Out", "You have successfully signed out.", "info");
}

// Sign up handling
function handleRegistration(e) {
    e.preventDefault();
    
    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const studentId = document.getElementById('register-studentid').value.trim();
    const isAdmin = document.getElementById('register-isadmin').checked;
    
    let role = 'student';
    
    if (isAdmin) {
        const adminCode = document.getElementById('register-admincode').value.trim();
        if (adminCode !== 'admin123') {
            showToast("Invalid Credentials", "Incorrect admin secret verification code.", "error");
            return;
        }
        role = 'admin';
    }
    
    setButtonLoading('register-form', true);
    
    if (useFirebase) {
        auth.createUserWithEmailAndPassword(email, password)
            .then(cred => {
                const uid = cred.user.uid;
                const newUser = {
                    uid: uid,
                    name: name,
                    email: email,
                    studentId: studentId,
                    role: role,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                return db.collection('users').doc(uid).set(newUser).then(() => newUser);
            })
            .then((userData) => {
                setButtonLoading('register-form', false);
                // Auth listener handles the login triggers
            })
            .catch(err => {
                setButtonLoading('register-form', false);
                console.error("Registration failed:", err);
                showToast("Registration Failed", err.message, "error");
            });
    } else {
        // Local Registration Simulation
        setTimeout(() => {
            const uid = 'demo_' + Date.now();
            const newUser = {
                uid: uid,
                name: name,
                email: email,
                studentId: studentId,
                role: role,
                createdAt: new Date().toISOString()
            };
            
            // Save in localStorage users array
            let demoUsers = JSON.parse(localStorage.getItem('demo_canteen_users') || '[]');
            if (demoUsers.find(u => u.email === email)) {
                setButtonLoading('register-form', false);
                showToast("Account Exists", "Email is already registered in local database.", "error");
                return;
            }
            demoUsers.push(newUser);
            localStorage.setItem('demo_canteen_users', JSON.stringify(demoUsers));
            localStorage.setItem('demo_canteen_user', JSON.stringify(newUser));
            
            setButtonLoading('register-form', false);
            handleUserSignIn(newUser);
        }, 800);
    }
}

// Log In Handling
function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    setButtonLoading('login-form', true);
    
    if (useFirebase) {
        auth.signInWithEmailAndPassword(email, password)
            .then(cred => {
                setButtonLoading('login-form', false);
                // Handled by onAuthStateChanged
            })
            .catch(err => {
                setButtonLoading('login-form', false);
                console.error("Login failed:", err);
                showToast("Authentication Failed", "Invalid email or password.", "error");
            });
    } else {
        // Local Login Simulation
        setTimeout(() => {
            const demoUsers = JSON.parse(localStorage.getItem('demo_canteen_users') || '[]');
            const userMatch = demoUsers.find(u => u.email === email);
            
            if (userMatch) {
                // Simulating password validation (accepting any password since it's local demo)
                localStorage.setItem('demo_canteen_user', JSON.stringify(userMatch));
                setButtonLoading('login-form', false);
                handleUserSignIn(userMatch);
            } else {
                // Check default admin fallback
                if (email === 'admin@canteen.com') {
                    const defaultAdmin = {
                        uid: 'demo_admin_default',
                        name: 'Head Chef (Admin)',
                        email: 'admin@canteen.com',
                        studentId: 'STAFF001',
                        role: 'admin',
                        createdAt: new Date().toISOString()
                    };
                    localStorage.setItem('demo_canteen_user', JSON.stringify(defaultAdmin));
                    setButtonLoading('login-form', false);
                    handleUserSignIn(defaultAdmin);
                } else {
                    setButtonLoading('login-form', false);
                    showToast("User Not Found", "User details do not exist. Please Register.", "error");
                }
            }
        }, 800);
    }
}

// Log Out Handling
function handleLogout() {
    if (useFirebase) {
        auth.signOut().catch(err => {
            console.error("Error signing out:", err);
            showToast("Error", "Logout failed.", "error");
        });
    } else {
        localStorage.removeItem('demo_canteen_user');
        handleUserSignOut();
    }
}

// ==========================================================================
// 5. FOOD MENU MANAGEMENT (Firestore CRUD)
// ==========================================================================

// Load menu items
function loadMenu() {
    const foodGrid = document.getElementById('food-menu-grid');
    const adminFoodGrid = document.getElementById('admin-food-grid');
    
    if (useFirebase) {
        // Enable live synchronization of products
        foodsUnsubscribe = db.collection('foods').orderBy('createdAt', 'desc')
            .onSnapshot(snapshot => {
                foods = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    data.foodId = doc.id;
                    foods.push(data);
                });
                renderMenu();
                renderAdminMenu();
            }, error => {
                console.error("Firestore loading menu failed:", error);
                foodGrid.innerHTML = `<div class="empty-state text-danger"><i class="fa-solid fa-cloud-arrow-down"></i><h3>Error Syncing Menu</h3><p>Cloud connection failed.</p></div>`;
            });
    } else {
        // Load default mock items or localStorage mocks
        let localFoods = JSON.parse(localStorage.getItem('demo_canteen_foods'));
        
        if (!localFoods || localFoods.length === 0) {
            // Seed default values
            localFoods = [
                {
                    foodId: "mock_1",
                    name: "Burgers & Fries Combo",
                    description: "Crispy grilled veg patty topped with slice of cheese, fresh onions and dressing. Served with french fries.",
                    category: "Snacks",
                    price: 110,
                    imageUrl: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=300&auto=format&fit=crop",
                    available: true,
                    createdAt: new Date().toISOString()
                },
                {
                    foodId: "mock_2",
                    name: "Butter Masala Dosa",
                    description: "Crispy rice-lentil crepe filled with spiced potato mash, served with aromatic sambar and coconut chutney.",
                    category: "Breakfast",
                    price: 70,
                    imageUrl: "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?q=80&w=300&auto=format&fit=crop",
                    available: true,
                    createdAt: new Date().toISOString()
                },
                {
                    foodId: "mock_3",
                    name: "North Indian Lunch Meals",
                    description: "Full thali with butter paneer curry, dal tadka, jeera rice, 2 hot rotis, papad, curd and sweet dessert.",
                    category: "Meals",
                    price: 160,
                    imageUrl: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?q=80&w=300&auto=format&fit=crop",
                    available: true,
                    createdAt: new Date().toISOString()
                },
                {
                    foodId: "mock_4",
                    name: "Fresh Orange Juice",
                    description: "Chilled pure juice extracted from fresh oranges. No added artificial flavors or preservatives.",
                    category: "Beverages",
                    price: 50,
                    imageUrl: "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?q=80&w=300&auto=format&fit=crop",
                    available: true,
                    createdAt: new Date().toISOString()
                },
                {
                    foodId: "mock_5",
                    name: "Samosa (Plate of 2)",
                    description: "Classic triangular pastries stuffed with spiced potato and peas mixture, served with sweet tamarind chutney.",
                    category: "Snacks",
                    price: 30,
                    imageUrl: "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?q=80&w=300&auto=format&fit=crop",
                    available: true,
                    createdAt: new Date().toISOString()
                },
                {
                    foodId: "mock_6",
                    name: "Choco Fudge Brownie",
                    description: "Rich chocolate brownie loaded with walnut chunks, served warm with a drizzle of premium hot chocolate sauce.",
                    category: "Desserts",
                    price: 90,
                    imageUrl: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?q=80&w=300&auto=format&fit=crop",
                    available: false,
                    createdAt: new Date().toISOString()
                }
            ];
            localStorage.setItem('demo_canteen_foods', JSON.stringify(localFoods));
        }
        
        foods = localFoods;
        renderMenu();
        renderAdminMenu();
    }
}

// Render dynamic HTML items for Student Menu View
function renderMenu() {
    const foodGrid = document.getElementById('food-menu-grid');
    
    // Filter matching active category and search keyword
    const filteredFoods = foods.filter(item => {
        const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
        const matchesSearch = item.name.toLowerCase().includes(searchKeyword.toLowerCase()) || 
                              item.category.toLowerCase().includes(searchKeyword.toLowerCase());
        return matchesCategory && matchesSearch;
    });
    
    if (filteredFoods.length === 0) {
        foodGrid.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-pizza-slice"></i>
                <h3>No Items Found</h3>
                <p>We couldn't find any dishes matching "${searchKeyword || activeCategory}". Try searching something else!</p>
            </div>`;
        return;
    }
    
    foodGrid.innerHTML = filteredFoods.map(item => {
        const isAvail = item.available;
        const statusBadge = isAvail 
            ? `<span class="food-badge badge-available"><i class="fa-solid fa-circle-check"></i> Available</span>`
            : `<span class="food-badge badge-unavailable"><i class="fa-solid fa-circle-xmark"></i> Sold Out</span>`;
            
        const btnAttr = isAvail 
            ? `onclick="addToCart('${item.foodId}')"`
            : `disabled`;
            
        const cardClass = isAvail ? 'food-card' : 'food-card unavailable';
        const imgUrl = item.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=300&auto=format&fit=crop';
        
        return `
            <article class="${cardClass}">
                <div class="food-card-img-wrapper">
                    ${statusBadge}
                    <img src="${imgUrl}" alt="${item.name}" class="food-card-img" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=300&auto=format&fit=crop'">
                </div>
                <div class="food-card-body">
                    <h3 class="food-card-title">${item.name}</h3>
                    <p class="food-card-desc">${item.description}</p>
                    <div class="food-card-footer">
                        <span class="food-card-price">₹${item.price}</span>
                        <button class="btn btn-primary btn-sm" ${btnAttr}>
                            <i class="fa-solid fa-cart-plus"></i> Add to Cart
                        </button>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

// Render dynamic items list in Admin Management tab
function renderAdminMenu() {
    const adminFoodGrid = document.getElementById('admin-food-grid');
    if (!adminFoodGrid) return;
    
    if (foods.length === 0) {
        adminFoodGrid.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-folder-plus"></i>
                <h3>No Foods in Canteen Database</h3>
                <p>Click "Add New Food Item" above to add dishes to your cloud list.</p>
            </div>`;
        return;
    }
    
    adminFoodGrid.innerHTML = foods.map(item => {
        const toggleIcon = item.available ? 'fa-toggle-on text-green' : 'fa-toggle-off text-muted';
        const statusText = item.available ? 'Available' : 'Unavailable';
        const imgUrl = item.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=300&auto=format&fit=crop';
        
        return `
            <div class="admin-food-card">
                <img src="${imgUrl}" alt="${item.name}" class="admin-food-card-img" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=300&auto=format&fit=crop'">
                <div class="admin-food-card-details">
                    <span class="admin-food-card-category">${item.category}</span>
                    <h4 class="admin-food-card-name">${item.name}</h4>
                    <span class="admin-food-card-price">₹${item.price}</span>
                    <div class="admin-food-card-actions">
                        <button class="btn btn-outline btn-sm" onclick="openEditFoodModal('${item.foodId}')" title="Edit Item"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
                        <button class="btn btn-outline btn-sm" onclick="toggleFoodAvailability('${item.foodId}', ${item.available})" title="Toggle Availability">
                            <i class="fa-solid ${toggleIcon}"></i> ${statusText}
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="triggerDeleteFood('${item.foodId}')" title="Delete Item"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Add/Update Food item controller
function handleFoodSubmit(e) {
    e.preventDefault();
    
    const foodId = document.getElementById('food-id-field').value;
    const name = document.getElementById('food-name').value.trim();
    const category = document.getElementById('food-category').value;
    const price = parseInt(document.getElementById('food-price').value);
    const description = document.getElementById('food-desc').value.trim();
    const available = document.getElementById('food-available').checked;
    
    setButtonLoading('food-form', true);
    
    // Process image file or URL
    let imagePromise;
    const imageFile = document.getElementById('food-imagefile').files[0];
    const imageUrl = document.getElementById('food-imageurl').value.trim();
    
    if (currentImageSourceType === 'file' && imageFile) {
        if (useFirebase) {
            // Upload to Firebase Storage
            const storageRef = storage.ref('food_images/' + Date.now() + '_' + imageFile.name);
            imagePromise = storageRef.put(imageFile)
                .then(snapshot => snapshot.ref.getDownloadURL())
                .catch(err => {
                    console.error("Storage upload failed:", err);
                    showToast("Storage Error", "Failed to upload file to Firebase Storage. Using default placeholder.", "warning");
                    return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=300&auto=format&fit=crop';
                });
        } else {
            // Local mockup file storage simulation (using object URL or data URL)
            imagePromise = new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(imageFile);
            });
        }
    } else {
        // Image URL provided or fallback to default placeholder
        const fallbackUrl = imageUrl || getCategoryPlaceholder(category);
        imagePromise = Promise.resolve(fallbackUrl);
    }
    
    imagePromise.then(finalImageUrl => {
        const foodObject = {
            name,
            category,
            price,
            description,
            available,
            imageUrl: finalImageUrl,
            createdAt: useFirebase ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString()
        };
        
        if (foodId) {
            // Updating existing food
            if (useFirebase) {
                // Remove createdAt field to avoid resetting it on update
                delete foodObject.createdAt;
                return db.collection('foods').doc(foodId).update(foodObject);
            } else {
                const idx = foods.findIndex(f => f.foodId === foodId);
                if (idx !== -1) {
                    foods[idx] = { ...foods[idx], ...foodObject };
                    localStorage.setItem('demo_canteen_foods', JSON.stringify(foods));
                }
                return Promise.resolve();
            }
        } else {
            // Adding new food
            if (useFirebase) {
                return db.collection('foods').add(foodObject);
            } else {
                const newId = 'mock_' + Date.now();
                foods.push({ foodId: newId, ...foodObject });
                localStorage.setItem('demo_canteen_foods', JSON.stringify(foods));
                return Promise.resolve();
            }
        }
    })
    .then(() => {
        setButtonLoading('food-form', false);
        closeModal('food-modal');
        showToast("Success", foodId ? "Food item updated successfully!" : "Food item added successfully!", "success");
        if (!useFirebase) {
            renderMenu();
            renderAdminMenu();
        }
    })
    .catch(err => {
        setButtonLoading('food-form', false);
        console.error("Failed to save food:", err);
        showToast("Error", "Failed to save food details to database.", "error");
    });
}

// Toggle Availability status from Admin Dashboard list
function toggleFoodAvailability(foodId, currentStatus) {
    if (useFirebase) {
        db.collection('foods').doc(foodId).update({
            available: !currentStatus
        })
        .then(() => {
            showToast("Database Updated", `Availability set to ${!currentStatus}`, "success");
        })
        .catch(err => {
            console.error("Availability update failed:", err);
            showToast("Failed to Update", err.message, "error");
        });
    } else {
        const idx = foods.findIndex(f => f.foodId === foodId);
        if (idx !== -1) {
            foods[idx].available = !currentStatus;
            localStorage.setItem('demo_canteen_foods', JSON.stringify(foods));
            renderMenu();
            renderAdminMenu();
            showToast("Database Updated", `Availability set to ${!currentStatus}`, "success");
        }
    }
}

// Show edit details in modal
function openEditFoodModal(foodId) {
    const item = foods.find(f => f.foodId === foodId);
    if (!item) return;
    
    document.getElementById('food-modal-title').textContent = "Edit Food Item";
    document.getElementById('food-id-field').value = item.foodId;
    document.getElementById('food-name').value = item.name;
    document.getElementById('food-category').value = item.category;
    document.getElementById('food-price').value = item.price;
    document.getElementById('food-desc').value = item.description;
    document.getElementById('food-available').checked = item.available;
    document.getElementById('food-imageurl').value = item.imageUrl.startsWith('data:') ? '' : item.imageUrl;
    
    setImageSource('url'); // default tab view in edit
    openModal('food-modal');
}

// Trigger popup deletion dialog
let itemToDeleteId = null;
function triggerDeleteFood(foodId) {
    itemToDeleteId = foodId;
    document.getElementById('confirm-title').textContent = "Delete Food Item?";
    document.getElementById('confirm-description').textContent = "This will permanently delete this food item from the canteen database catalog.";
    openModal('confirm-modal');
}

// Run actual deletion from Firestore or LocalStorage
function deleteFoodItem() {
    if (!itemToDeleteId) return;
    
    if (useFirebase) {
        db.collection('foods').doc(itemToDeleteId).delete()
            .then(() => {
                showToast("Deleted", "Food item has been deleted.", "info");
                closeModal('confirm-modal');
                itemToDeleteId = null;
            })
            .catch(err => {
                console.error("Deletion failed:", err);
                showToast("Error", "Unable to delete food item.", "error");
            });
    } else {
        foods = foods.filter(f => f.foodId !== itemToDeleteId);
        localStorage.setItem('demo_canteen_foods', JSON.stringify(foods));
        renderMenu();
        renderAdminMenu();
        showToast("Deleted", "Food item has been deleted.", "info");
        closeModal('confirm-modal');
        itemToDeleteId = null;
    }
}

// Helper to provide placeholders based on selection category
function getCategoryPlaceholder(cat) {
    const placeholders = {
        'Breakfast': 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?q=80&w=300&auto=format&fit=crop',
        'Meals': 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?q=80&w=300&auto=format&fit=crop',
        'Snacks': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=300&auto=format&fit=crop',
        'Beverages': 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?q=80&w=300&auto=format&fit=crop',
        'Desserts': 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?q=80&w=300&auto=format&fit=crop'
    };
    return placeholders[cat] || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=300&auto=format&fit=crop';
}

// ==========================================================================
// 6. SHOPPING CART LOGIC
// ==========================================================================

// Add food to cart array
function addToCart(foodId) {
    if (!currentUser) {
        showToast("Access Denied", "Please login or register to add food items to cart.", "warning");
        openModal('auth-modal');
        return;
    }
    
    if (currentUser.role === 'admin') {
        showToast("Action Forbidden", "Admin staff cannot place orders.", "warning");
        return;
    }
    
    const dish = foods.find(f => f.foodId === foodId);
    if (!dish) return;
    
    // Check if food is already in cart
    const existingIndex = cart.findIndex(c => c.foodId === foodId);
    if (existingIndex > -1) {
        cart[existingIndex].quantity += 1;
    } else {
        cart.push({
            foodId: dish.foodId,
            name: dish.name,
            price: dish.price,
            imageUrl: dish.imageUrl,
            quantity: 1
        });
    }
    
    updateCartCount();
    renderCart();
    showToast("Added to Cart", `${dish.name} added to your basket.`, "success");
}

// Change Quantity handler (+ / -)
function updateCartQuantity(foodId, delta) {
    const idx = cart.findIndex(c => c.foodId === foodId);
    if (idx === -1) return;
    
    cart[idx].quantity += delta;
    if (cart[idx].quantity <= 0) {
        cart.splice(idx, 1);
        showToast("Item Removed", "Dish removed from basket.", "info");
    }
    
    updateCartCount();
    renderCart();
}

// Remove fully from cart
function removeFromCart(foodId) {
    cart = cart.filter(c => c.foodId !== foodId);
    updateCartCount();
    renderCart();
    showToast("Item Removed", "Dish removed from basket.", "info");
}

// Calculate badge totals on headers
function updateCartCount() {
    const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('cart-count').textContent = totalCount;
}

// Draw cart item DOM entries
function renderCart() {
    const cartContainer = document.getElementById('cart-items-container');
    const cartFooter = document.getElementById('cart-footer');
    
    if (cart.length === 0) {
        cartContainer.innerHTML = `
            <div class="cart-empty-state">
                <i class="fa-solid fa-cart-shopping"></i>
                <p>Your cart is empty.</p>
                <button class="btn btn-outline btn-sm" onclick="closeCart(); switchView('menu-view')">Browse Menu</button>
            </div>`;
        cartFooter.classList.add('hidden');
        return;
    }
    
    cartContainer.innerHTML = cart.map(item => {
        const imgUrl = item.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=300&auto=format&fit=crop';
        return `
            <div class="cart-item">
                <img src="${imgUrl}" alt="${item.name}" class="cart-item-img" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=300&auto=format&fit=crop'">
                <div class="cart-item-details">
                    <h4 class="cart-item-title">${item.name}</h4>
                    <span class="cart-item-price">₹${item.price}</span>
                </div>
                <div class="cart-item-controls">
                    <button class="qty-btn" onclick="updateCartQuantity('${item.foodId}', -1)"><i class="fa-solid fa-minus"></i></button>
                    <span class="cart-item-qty">${item.quantity}</span>
                    <button class="qty-btn" onclick="updateCartQuantity('${item.foodId}', 1)"><i class="fa-solid fa-plus"></i></button>
                </div>
                <button class="cart-item-remove-btn" onclick="removeFromCart('${item.foodId}')" title="Remove"><i class="fa-regular fa-trash-can"></i></button>
            </div>
        `;
    }).join('');
    
    // Calculations
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = subtotal; // 0% taxes for canteen
    
    document.getElementById('cart-subtotal').textContent = `₹${subtotal}`;
    document.getElementById('cart-total').textContent = `₹${total}`;
    cartFooter.classList.remove('hidden');
}

// ==========================================================================
// 7. PRE-ORDER PLACEMENT & REAL-TIME TRACKING (Firestore Sync)
// ==========================================================================

// Handle Pre-order Checkout Submission
function placePreOrder() {
    if (!currentUser) return;
    
    const pickupTimeSelect = document.getElementById('pickup-time-select');
    const pickupTime = pickupTimeSelect.value;
    
    if (!pickupTime) {
        showToast("Missing Detail", "Please select a preferred pickup time.", "warning");
        pickupTimeSelect.focus();
        return;
    }
    
    const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Short unique ID generation for presentations
    const shortId = 'ORD' + Math.floor(1000 + Math.random() * 9000);
    
    const orderObject = {
        orderId: shortId,
        userId: currentUser.uid,
        studentName: currentUser.name,
        studentId: currentUser.studentId,
        items: cart.map(c => ({
            foodId: c.foodId,
            name: c.name,
            price: c.price,
            quantity: c.quantity
        })),
        totalAmount: totalAmount,
        pickupTime: pickupTime,
        orderDate: new Date().toLocaleDateString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        status: 'Pending',
        createdAt: useFirebase ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString()
    };
    
    setButtonLoading('place-order-btn', true, "Placing...");
    
    if (useFirebase) {
        db.collection('orders').add(orderObject)
            .then(() => {
                handleOrderSuccess(shortId, pickupTime, totalAmount);
            })
            .catch(err => {
                console.error("Placing order failed Firestore:", err);
                showToast("Order Failed", "Firestore failed to store order data.", "error");
                setButtonLoading('place-order-btn', false);
            });
    } else {
        // Local simulation
        setTimeout(() => {
            let localOrders = JSON.parse(localStorage.getItem('demo_canteen_orders') || '[]');
            localOrders.unshift(orderObject); // Add to top
            localStorage.setItem('demo_canteen_orders', JSON.stringify(localOrders));
            
            handleOrderSuccess(shortId, pickupTime, totalAmount);
            
            // Trigger offline sync update
            listenToOrders();
        }, 1000);
    }
}

// Complete checkout cleanup triggers
function handleOrderSuccess(orderId, time, total) {
    setButtonLoading('place-order-btn', false);
    cart = [];
    updateCartCount();
    closeCart();
    
    // Clear pickup selector selection
    document.getElementById('pickup-time-select').selectedIndex = 0;
    
    // Display custom congratulations overlay success alert box
    const modalAlertHtml = `
        <div class="confirm-icon bg-green text-green" style="background-color: var(--success-light); font-size: 3rem;"><i class="fa-solid fa-circle-check"></i></div>
        <h3 class="form-title" style="margin-bottom: 0.5rem; color: var(--success);">Order Placed Successfully!</h3>
        <p class="form-desc" style="font-size: 0.95rem;">Skip the queue! Your order is registered in the cloud.</p>
        <div style="background-color: var(--bg-light); padding: 1rem; border-radius: var(--radius-md); text-align: left; margin: 1.5rem 0; border: 1px solid var(--border-color);">
            <div style="display:flex; justify-content:space-between; margin-bottom: 0.4rem;"><span>Order ID:</span><strong>${orderId}</strong></div>
            <div style="display:flex; justify-content:space-between; margin-bottom: 0.4rem;"><span>Pickup Time:</span><strong>${time}</strong></div>
            <div style="display:flex; justify-content:space-between;"><span>Total:</span><strong class="text-orange">₹${total}</strong></div>
        </div>
        <button class="btn btn-primary btn-block" onclick="closeModal('confirm-modal'); switchView('orders-view')">Track Order Status</button>
    `;
    
    const confirmCard = document.querySelector('#confirm-modal .modal-card');
    const oldHtml = confirmCard.innerHTML;
    
    confirmCard.innerHTML = modalAlertHtml;
    openModal('confirm-modal');
    
    // Restore confirm card content after closing
    document.getElementById('confirm-modal').addEventListener('click', function restoreConfirm(e) {
        if (e.target.id === 'confirm-modal' || e.target.classList.contains('modal-close') || e.target.tagName === 'BUTTON') {
            setTimeout(() => {
                confirmCard.innerHTML = oldHtml;
                // Rebind listener actions
                document.getElementById('confirm-cancel-btn').onclick = () => closeModal('confirm-modal');
                document.getElementById('confirm-approve-btn').onclick = () => deleteFoodItem();
            }, 300);
            document.getElementById('confirm-modal').removeEventListener('click', restoreConfirm);
        }
    });
}

// Set up orders database listener
function listenToOrders() {
    if (!currentUser) return;
    
    // Clear old listener
    if (ordersUnsubscribe) {
        ordersUnsubscribe();
    }
    
    if (useFirebase) {
        // Query dependent on user role
        let ordersQuery = db.collection('orders');
        
        if (currentUser.role === 'student') {
            ordersQuery = ordersQuery.where('userId', '==', currentUser.uid);
        }
        
        // Listen live
        ordersUnsubscribe = ordersQuery.orderBy('createdAt', 'desc')
            .onSnapshot(snapshot => {
                orders = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    data.docId = doc.id; // doc reference for updates
                    orders.push(data);
                });
                
                if (currentUser.role === 'student') {
                    renderStudentOrders();
                } else {
                    renderAdminOrders();
                    calculateAdminStats();
                }
            }, error => {
                console.error("Firestore loading orders failed:", error);
            });
    } else {
        // Local simulation polling trigger
        const localOrders = JSON.parse(localStorage.getItem('demo_canteen_orders') || '[]');
        
        // Filter based on user profile
        if (currentUser.role === 'student') {
            orders = localOrders.filter(o => o.userId === currentUser.uid);
            renderStudentOrders();
        } else {
            orders = localOrders;
            renderAdminOrders();
            calculateAdminStats();
        }
    }
}

// Render student pre-order history
function renderStudentOrders() {
    const tbody = document.getElementById('student-orders-tbody');
    
    // Update student stats cards
    const totalOrdersCount = orders.length;
    const activeOrdersCount = orders.filter(o => ['Pending', 'Confirmed', 'Preparing', 'Ready for Pickup'].includes(o.status)).length;
    const completedOrdersCount = orders.filter(o => o.status === 'Completed').length;
    
    document.getElementById('student-stat-total').textContent = totalOrdersCount;
    document.getElementById('student-stat-pending').textContent = activeOrdersCount;
    document.getElementById('student-stat-completed').textContent = completedOrdersCount;
    
    if (orders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-table-message">
                    <i class="fa-regular fa-folder-open"></i>
                    <p>No orders found. Go to the menu to place your first pre-order!</p>
                </td>
            </tr>`;
        return;
    }
    
    tbody.innerHTML = orders.map(order => {
        const itemsList = order.items.map(it => `<li><strong>${it.quantity}x</strong> ${it.name}</li>`).join('');
        const statusClass = order.status.toLowerCase().replace(/\s+/g, '-');
        const cancelBtnAttr = order.status === 'Pending' 
            ? `<button class="btn btn-danger btn-sm" onclick="cancelStudentOrder('${order.docId || order.orderId}')"><i class="fa-solid fa-ban"></i> Cancel</button>`
            : `<button class="btn btn-outline btn-sm" disabled title="Only pending orders can be cancelled.">Cancel</button>`;
            
        return `
            <tr>
                <td><span class="order-id-badge">${order.orderId}</span></td>
                <td><ul class="order-cell-items">${itemsList}</ul></td>
                <td><strong>₹${order.totalAmount}</strong></td>
                <td><i class="fa-regular fa-clock"></i> ${order.pickupTime}</td>
                <td>${order.orderDate}</td>
                <td><span class="status-badge ${statusClass}">${order.status}</span></td>
                <td>${cancelBtnAttr}</td>
            </tr>
        `;
    }).join('');
}

// Student cancel pre-order logic
function cancelStudentOrder(orderKey) {
    if (confirm("Are you sure you want to cancel this pre-order?")) {
        if (useFirebase) {
            db.collection('orders').doc(orderKey).update({
                status: 'Cancelled'
            })
            .then(() => {
                showToast("Order Cancelled", "Your order has been cancelled successfully.", "info");
            })
            .catch(err => {
                console.error("Cancellation failed Firestore:", err);
                showToast("Failed", err.message, "error");
            });
        } else {
            // Local cancel
            const localOrders = JSON.parse(localStorage.getItem('demo_canteen_orders') || '[]');
            const idx = localOrders.findIndex(o => o.orderId === orderKey);
            if (idx > -1 && localOrders[idx].status === 'Pending') {
                localOrders[idx].status = 'Cancelled';
                localStorage.setItem('demo_canteen_orders', JSON.stringify(localOrders));
                listenToOrders();
                showToast("Order Cancelled", "Your order has been cancelled successfully.", "info");
            }
        }
    }
}

// ==========================================================================
// 8. ADMIN DASHBOARD OPERATIONS (Stats & Status modifiers)
// ==========================================================================

// Render all system orders in admin panel
function renderAdminOrders() {
    const tbody = document.getElementById('admin-orders-tbody');
    
    if (orders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-table-message">
                    <i class="fa-solid fa-inbox"></i>
                    <p>No orders placed yet.</p>
                </td>
            </tr>`;
        return;
    }
    
    tbody.innerHTML = orders.map(order => {
        const itemsList = order.items.map(it => `<li><strong>${it.quantity}x</strong> ${it.name}</li>`).join('');
        const statusClass = order.status.toLowerCase().replace(/\s+/g, '-');
        
        // Status transition button triggers
        let actionButtons = '';
        const orderKey = order.docId || order.orderId;
        
        if (order.status === 'Pending') {
            actionButtons = `
                <button class="btn btn-outline btn-sm" onclick="updateOrderStatus('${orderKey}', 'Confirmed')" title="Confirm Order"><i class="fa-solid fa-check text-green"></i> Confirm</button>
                <button class="btn btn-danger btn-sm" onclick="updateOrderStatus('${orderKey}', 'Cancelled')" title="Cancel Order"><i class="fa-solid fa-xmark"></i></button>`;
        } else if (order.status === 'Confirmed') {
            actionButtons = `
                <button class="btn btn-primary btn-sm" onclick="updateOrderStatus('${orderKey}', 'Preparing')" title="Start Preparing"><i class="fa-solid fa-fire-burner"></i> Cook</button>`;
        } else if (order.status === 'Preparing') {
            actionButtons = `
                <button class="btn btn-primary btn-sm" onclick="updateOrderStatus('${orderKey}', 'Ready for Pickup')" style="background-color: var(--purple);" title="Mark Ready"><i class="fa-solid fa-circle-exclamation"></i> Set Ready</button>`;
        } else if (order.status === 'Ready for Pickup') {
            actionButtons = `
                <button class="btn btn-primary btn-sm" onclick="updateOrderStatus('${orderKey}', 'Completed')" style="background-color: var(--success);" title="Serve Order"><i class="fa-solid fa-circle-check"></i> Complete</button>`;
        } else {
            // Completed or Cancelled - No actions
            actionButtons = `<span class="text-light">No action needed</span>`;
        }
        
        return `
            <tr>
                <td><span class="order-id-badge">${order.orderId}</span></td>
                <td>
                    <div class="student-details-cell">
                        <span class="std-name">${order.studentName}</span>
                        <span class="std-id">${order.studentId}</span>
                    </div>
                </td>
                <td><ul class="order-cell-items">${itemsList}</ul></td>
                <td><strong>₹${order.totalAmount}</strong></td>
                <td><i class="fa-regular fa-clock"></i> ${order.pickupTime}</td>
                <td>${order.orderDate}</td>
                <td><span class="status-badge ${statusClass}">${order.status}</span></td>
                <td><div class="action-cell">${actionButtons}</div></td>
            </tr>
        `;
    }).join('');
}

// Modify order status inside cloud/local database
function updateOrderStatus(orderKey, nextStatus) {
    if (useFirebase) {
        db.collection('orders').doc(orderKey).update({
            status: nextStatus
        })
        .then(() => {
            showToast("Status Updated", `Order marked as "${nextStatus}".`, "success");
        })
        .catch(err => {
            console.error("Status update error Firestore:", err);
            showToast("Failed", err.message, "error");
        });
    } else {
        const localOrders = JSON.parse(localStorage.getItem('demo_canteen_orders') || '[]');
        const idx = localOrders.findIndex(o => o.orderId === orderKey);
        if (idx > -1) {
            localOrders[idx].status = nextStatus;
            localStorage.setItem('demo_canteen_orders', JSON.stringify(localOrders));
            listenToOrders();
            showToast("Status Updated", `Order marked as "${nextStatus}".`, "success");
        }
    }
}

// Calculate Admin statistics and display in dashboard cards
function calculateAdminStats() {
    const totalCount = orders.length;
    const pendingCount = orders.filter(o => o.status === 'Pending').length;
    const preparingCount = orders.filter(o => o.status === 'Preparing').length;
    const readyCount = orders.filter(o => o.status === 'Ready for Pickup').length;
    const completedCount = orders.filter(o => o.status === 'Completed').length;
    
    // Revenue calculations (only from Completed orders)
    const revenue = orders.filter(o => o.status === 'Completed').reduce((sum, item) => sum + item.totalAmount, 0);
    
    document.getElementById('admin-stat-revenue').textContent = `₹${revenue}`;
    document.getElementById('admin-stat-total').textContent = totalCount;
    document.getElementById('admin-stat-pending').textContent = pendingCount;
    document.getElementById('admin-stat-preparing').textContent = preparingCount;
    document.getElementById('admin-stat-ready').textContent = readyCount;
    document.getElementById('admin-stat-completed').textContent = completedCount;
}

// ==========================================================================
// 9. CLIENT ROUTING, VIEW SWITCHING & UI HELPERS
// ==========================================================================

// Global Single Page View Routing
function switchView(viewId) {
    // Hide all views
    document.querySelectorAll('.view-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Show active view
    const targetSection = document.getElementById(viewId);
    if (targetSection) {
        targetSection.classList.add('active');
        activeView = viewId;
    }
    
    // Adjust active states in navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.getAttribute('data-view') === viewId) {
            link.classList.add('active');
        } else {
            link.classList.remove('remove'); // cleanup
            link.classList.remove('active');
        }
    });
    
    // Scroll view to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Modal open helper
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
    document.body.style.overflow = 'hidden'; // Lock background scroll
}

// Modal close helper
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    document.body.style.overflow = ''; // Unlock scroll
}

// Cart Sidebar controls
function openCart() {
    document.getElementById('cart-sidebar').classList.add('active');
    document.getElementById('cart-overlay').classList.add('active');
}

function closeCart() {
    document.getElementById('cart-sidebar').classList.remove('active');
    document.getElementById('cart-overlay').classList.remove('active');
}

// Auth modal tabs toggling
function switchAuthTab(tabType) {
    const tabLogin = document.getElementById('auth-tab-login');
    const tabRegister = document.getElementById('auth-tab-register');
    const formLogin = document.getElementById('login-form');
    const formRegister = document.getElementById('register-form');
    
    if (tabType === 'login') {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        formLogin.classList.add('active');
        formRegister.classList.remove('active');
    } else {
        tabLogin.classList.remove('active');
        tabRegister.classList.add('active');
        formLogin.classList.remove('active');
        formRegister.classList.add('active');
    }
}

// Admin tab selector toggles
function switchAdminTab(tabName) {
    const btnOrders = document.getElementById('admin-tab-orders');
    const btnMenu = document.getElementById('admin-tab-menu');
    const contentOrders = document.getElementById('admin-orders-content');
    const contentMenu = document.getElementById('admin-menu-content');
    
    if (tabName === 'orders') {
        btnOrders.classList.add('active');
        btnMenu.classList.remove('active');
        contentOrders.classList.add('active');
        contentMenu.classList.remove('active');
    } else {
        btnOrders.classList.remove('active');
        btnMenu.classList.add('active');
        contentOrders.classList.remove('active');
        contentMenu.classList.add('active');
    }
}

// Toggle field display for Admin image inputs
function setImageSource(srcType) {
    currentImageSourceType = srcType;
    const btnUrl = document.getElementById('toggle-url-source');
    const btnFile = document.getElementById('toggle-file-source');
    const grpUrl = document.getElementById('image-url-group');
    const grpFile = document.getElementById('image-file-group');
    
    if (srcType === 'url') {
        btnUrl.classList.add('active');
        btnFile.classList.remove('active');
        grpUrl.classList.remove('hidden');
        grpFile.classList.add('hidden');
    } else {
        btnUrl.classList.remove('active');
        btnFile.classList.add('active');
        grpUrl.classList.add('hidden');
        grpFile.classList.remove('hidden');
    }
}

// UI Loading indicators
function setButtonLoading(formIdOrBtnId, isLoading, text = '') {
    const selector = formIdOrBtnId.includes('-') && !formIdOrBtnId.includes('form') 
        ? document.getElementById(formIdOrBtnId) 
        : document.querySelector(`#${formIdOrBtnId} button[type="submit"]`);
        
    if (!selector) return;
    
    if (isLoading) {
        selector.disabled = true;
        selector.dataset.originalHtml = selector.innerHTML;
        selector.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${text || 'Please wait...'}`;
    } else {
        selector.disabled = false;
        selector.innerHTML = selector.dataset.originalHtml || selector.innerHTML;
    }
}

// Dynamic feedback notifier toast creator
function showToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Choose icon based on toast type
    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    if (type === 'error') iconClass = 'fa-circle-xmark';
    if (type === 'warning') iconClass = 'fa-triangle-exclamation';
    
    toast.innerHTML = `
        <i class="fa-solid ${iconClass} toast-icon"></i>
        <div class="toast-body">
            <h4 class="toast-title">${title}</h4>
            <p class="toast-message">${message}</p>
        </div>
        <button class="toast-close" aria-label="Close Toast"><i class="fa-solid fa-xmark"></i></button>
    `;
    
    container.appendChild(toast);
    
    // Bind click to dismiss immediately
    toast.querySelector('.toast-close').onclick = () => removeToast(toast);
    
    // Auto-remove after 4.5 seconds
    setTimeout(() => {
        removeToast(toast);
    }, 4500);
}

function removeToast(toast) {
    if (toast.classList.contains('removing')) return;
    toast.classList.add('removing');
    setTimeout(() => {
        toast.remove();
    }, 300);
}

// ==========================================================================
// 10. EVENT LISTENERS SETUP
// ==========================================================================
function setupEventListeners() {
    // 1. Navigation clicks
    document.querySelectorAll('.nav-link').forEach(link => {
        link.onclick = (e) => {
            e.preventDefault();
            const viewId = link.getAttribute('data-view');
            switchView(viewId);
            document.getElementById('nav-links')?.classList.remove('mobile-active'); // hide mobile drawer
            document.getElementById('nav-menu').classList.remove('mobile-active');
        };
    });
    
    // Home button actions
    document.getElementById('nav-logo-btn').onclick = (e) => {
        e.preventDefault();
        switchView('home-view');
    };
    
    // Mobile menu toggle click
    document.getElementById('mobile-toggle').onclick = () => {
        document.getElementById('nav-menu').classList.toggle('mobile-active');
    };
    
    // 2. Auth nav triggers
    document.getElementById('login-nav-btn').onclick = () => {
        switchAuthTab('login');
        openModal('auth-modal');
    };
    document.getElementById('register-nav-btn').onclick = () => {
        switchAuthTab('register');
        openModal('auth-modal');
    };
    
    // Auth Forms Submission
    document.getElementById('login-form').onsubmit = handleLogin;
    document.getElementById('register-form').onsubmit = handleRegistration;
    document.getElementById('logout-btn').onclick = handleLogout;
    
    // Admin secret credentials toggle
    document.getElementById('register-isadmin').onchange = (e) => {
        const codeField = document.getElementById('admin-code-group');
        if (e.target.checked) {
            codeField.classList.remove('hidden');
            document.getElementById('register-admincode').required = true;
        } else {
            codeField.classList.add('hidden');
            document.getElementById('register-admincode').required = false;
        }
    };
    
    // Modal Overlay click dismissals (Dismiss when clicking outside cards)
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                closeModal(overlay.id);
            }
        };
    });
    
    // Modal Close Button actions
    document.getElementById('auth-modal-close').onclick = () => closeModal('auth-modal');
    document.getElementById('food-modal-close').onclick = () => closeModal('food-modal');
    
    // Confirmation dialog close triggers
    document.getElementById('confirm-cancel-btn').onclick = () => closeModal('confirm-modal');
    document.getElementById('confirm-approve-btn').onclick = deleteFoodItem;
    
    // 3. Cart Slide drawers triggers
    document.getElementById('cart-toggle-btn').onclick = openCart;
    document.getElementById('cart-close-btn').onclick = closeCart;
    document.getElementById('cart-overlay').onclick = closeCart;
    
    // Cart Pre-order place checkout action
    document.getElementById('place-order-btn').onclick = placePreOrder;
    
    // 4. Food Menu Category tabs clicks
    document.getElementById('category-tabs-container').onclick = (e) => {
        const btn = e.target.closest('.category-pill');
        if (!btn) return;
        
        // Toggle active style
        document.querySelectorAll('.category-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Refresh selection
        activeCategory = btn.getAttribute('data-category');
        renderMenu();
    };
    
    // Food Menu search input keyup
    document.getElementById('menu-search-input').oninput = (e) => {
        searchKeyword = e.target.value;
        renderMenu();
    };
    
    // 5. Admin Menu management triggers
    document.getElementById('add-food-btn').onclick = () => {
        document.getElementById('food-modal-title').textContent = "Add New Food Item";
        document.getElementById('food-id-field').value = '';
        document.getElementById('food-form').reset();
        setImageSource('url');
        openModal('food-modal');
    };
    
    document.getElementById('food-form').onsubmit = handleFoodSubmit;
    
    // File upload label change helper
    document.getElementById('food-imagefile').onchange = (e) => {
        const file = e.target.files[0];
        const label = document.getElementById('file-label');
        if (file) {
            label.textContent = `Selected: ${file.name} (${Math.round(file.size/1024)} KB)`;
        } else {
            label.textContent = 'Choose file or drag here';
        }
    };
}
