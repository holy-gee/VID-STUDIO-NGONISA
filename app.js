import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBPdGAZT_U8xNBsU-S4NnC7WUQI8zM1LWI",
  authDomain: "vidfind-77a6a.firebaseapp.com",
  projectId: "vidfind-77a6a",
  storageBucket: "vidfind-77a6a.appspot.com",
  messagingSenderId: "813301438270",
  appId: "1:813301438270:web:2ebe4dec657167c5403e6f",
  measurementId: "G-N4NTHY2230",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);
const storage = getStorage(app);

// DOM elements
const splashScreen = document.getElementById("splash-screen");
const appContainer = document.getElementById("app");

const signInBtn = document.getElementById("sign-in");
const signOutBtn = document.getElementById("sign-out");
const profilePic = document.getElementById("profile-pic");
const usernameSpan = document.getElementById("username");

const videoFileInput = document.getElementById("video-file");
const thumbnailFileInput = document.getElementById("thumbnail-file");
const videoTitleInput = document.getElementById("video-title");
const uploadBtn = document.getElementById("upload-btn");
const uploadStatus = document.getElementById("upload-status");

const searchBox = document.getElementById("search-box");
const searchBtn = document.getElementById("search-btn");
const searchLoader = document.getElementById("search-loader");

const videoFeed = document.getElementById("video-feed");

// Show splash screen for 5 seconds, then show app UI
function showSplashThenApp() {
  splashScreen.style.display = "flex";
  appContainer.classList.add("hidden");
  setTimeout(() => {
    splashScreen.style.display = "none";
    appContainer.classList.remove("hidden");
  }, 5000);
}

// Initialize UI and event listeners
function init() {
  showSplashThenApp();

  // Sign in button
  signInBtn.addEventListener("click", () => {
    signInWithPopup(auth, provider)
      .then((result) => {
        // Signed in
        console.log("Signed in as", result.user.displayName);
      })
      .catch((error) => {
        console.error("Sign-in error:", error);
        alert("Failed to sign in: " + error.message);
      });
  });

  // Sign out button
  signOutBtn.addEventListener("click", () => {
    signOut(auth).catch((error) => {
      console.error("Sign-out error:", error);
    });
  });

  // Enable upload button only when files and title are selected
  function updateUploadBtnState() {
    uploadBtn.disabled =
      !videoFileInput.files.length ||
      !thumbnailFileInput.files.length ||
      !videoTitleInput.value.trim();
  }

  videoFileInput.addEventListener("change", updateUploadBtnState);
  thumbnailFileInput.addEventListener("change", updateUploadBtnState);
  videoTitleInput.addEventListener("input", updateUploadBtnState);

  uploadBtn.addEventListener("click", async () => {
    if (!auth.currentUser) {
      alert("Please sign in first.");
      return;
    }
    uploadBtn.disabled = true;
    uploadStatus.textContent = "Uploading...";
    try {
      const videoFile = videoFileInput.files[0];
      const thumbFile = thumbnailFileInput.files[0];
      const title = videoTitleInput.value.trim();
      const uid = auth.currentUser.uid;
      const username = auth.currentUser.displayName || "Anonymous";
      const userPhotoURL = auth.currentUser.photoURL || "";

      // Upload video
      const videoRef = ref(storage, `videos/${uid}/${Date.now()}_${videoFile.name}`);
      await uploadBytes(videoRef, videoFile);
      const videoURL = await getDownloadURL(videoRef);

      // Upload thumbnail
      const thumbRef = ref(storage, `thumbnails/${uid}/${Date.now()}_${thumbFile.name}`);
      await uploadBytes(thumbRef, thumbFile);
      const thumbnailURL = await getDownloadURL(thumbRef);

      // Save metadata in Firestore
      const videosCol = collection(db, "videos");
      await addDoc(videosCol, {
        title,
        videoURL,
        thumbnailURL,
        uploaderUID: uid,
        uploaderName: username,
        uploaderPhoto: userPhotoURL,
        createdAt: Date.now(),
      });

      uploadStatus.textContent = "Upload successful!";
      // Clear inputs
      videoFileInput.value = "";
      thumbnailFileInput.value = "";
      videoTitleInput.value = "";
      updateUploadBtnState();

      // Refresh video feed to include new video
      await loadVideos();

    } catch (error) {
      console.error("Upload failed:", error);
      uploadStatus.textContent = "Upload failed: " + error.message;
    } finally {
      uploadBtn.disabled = false;
      setTimeout(() => (uploadStatus.textContent = ""), 4000);
    }
  });

  searchBtn.addEventListener("click", () => {
    loadVideos(searchBox.value.trim());
  });

  // Listen to auth state change to update UI
  onAuthStateChanged(auth, (user) => {
    if (user) {
      profilePic.src = user.photoURL || "";
      profilePic.classList.remove("hidden");
      usernameSpan.textContent = user.displayName || "User";
      signInBtn.classList.add("hidden");
      signOutBtn.classList.remove("hidden");
      uploadBtn.disabled = !videoFileInput.files.length || !thumbnailFileInput.files.length || !videoTitleInput.value.trim();
    } else {
      profilePic.src = "";
      profilePic.classList.add("hidden");
      usernameSpan.textContent = "";
      signInBtn.classList.remove("hidden");
      signOutBtn.classList.add("hidden");
      uploadBtn.disabled = true;
    }
  });

  // Load initial videos (all)
  loadVideos();
}

// Load videos from Firestore, optionally filter by search term
async function loadVideos(searchTerm = "") {
  searchLoader.classList.remove("hidden");
  videoFeed.innerHTML = "";

  try {
    const videosCol = collection(db, "videos");

    // Query: search by title containing searchTerm (case-insensitive)
    // Firestore doesn't support contains / like queries easily,
    // so here we just fetch last 50 videos and filter locally.
    // For production, consider a better search strategy or Algolia.

    let q = query(videosCol, orderBy("createdAt", "desc"), limit(50));
    const snapshot = await getDocs(q);

    let videos = [];
    snapshot.forEach((doc) => {
      videos.push({ id: doc.id, ...doc.data() });
    });

    if (searchTerm) {
      const lowered = searchTerm.toLowerCase();
      videos = videos.filter((v) => v.title.toLowerCase().includes(lowered));
    }

    if (videos.length === 0) {
      videoFeed.innerHTML = `<p>No videos found${searchTerm ? ` for "${searchTerm}"` : ""}.</p>`;
      return;
    }

    // Render videos
    for (const video of videos) {
      const card = document.createElement("div");
      card.className = "video-card";

      // Thumbnail clickable to play video below
      const thumb = document.createElement("img");
      thumb.src = video.thumbnailURL;
      thumb.alt = video.title;
      thumb.className = "video-thumb";
      thumb.title = "Click to play video";
      card.appendChild(thumb);

      const titleEl = document.createElement("h3");
      titleEl.className = "video-title";
      titleEl.textContent = video.title;
      card.appendChild(titleEl);

      // Uploader info
      const uploaderDiv = document.createElement("div");
      uploaderDiv.className = "video-uploader";
      const uploaderImg = document.createElement("img");
      uploaderImg.className = "avatar";
      uploaderImg.src = video.uploaderPhoto || "";
      uploaderImg.alt = video.uploaderName;
      uploaderDiv.appendChild(uploaderImg);
      const uploaderNameSpan = document.createElement("span");
      uploaderNameSpan.textContent = video.uploaderName || "Anonymous";
      uploaderDiv.appendChild(uploaderNameSpan);
      card.appendChild(uploaderDiv);

      // Video player hidden initially, plays when thumbnail clicked
      const videoPlayer = document.createElement("video");
      videoPlayer.src = video.videoURL;
      videoPlayer.controls = true;
      videoPlayer.className = "video-player hidden";
      card.appendChild(videoPlayer);

      thumb.addEventListener("click", () => {
        if (videoPlayer.classList.contains("hidden")) {
          videoPlayer.classList.remove("hidden");
          videoPlayer.play();
          // Scroll video into view
          videoPlayer.scrollIntoView({ behavior: "smooth" });
        } else {
          videoPlayer.pause();
          videoPlayer.classList.add("hidden");
        }
      });

      videoFeed.appendChild(card);
    }
  } catch (error) {
    console.error("Error loading videos:", error);
    videoFeed.innerHTML = `<p>Error loading videos: ${error.message}</p>`;
  } finally {
    searchLoader.classList.add("hidden");
  }
}

window.addEventListener("DOMContentLoaded", init);