const TOTAL_CLIPS = 1000;
const BATCH_SIZE = 60;
const MAX_ACTIVE_VIDEOS = 12;

const USERNAMES = [
  "brainrot.king", "skibidi.lord", "ohio.final.boss", "gyatt.machine", "rizz.god",
  "sigma.grindset", "fanum.tax.collector", "npc.streamer", "mewing.master", "edging.irl",
  "gigachad.cooking", "cap.or.no.cap", "deadass.fr", "sus.amongus", "bussin.recipes",
  "no.cap.vibes", "goated.takes", "ratio.machine", "based.department", "mid.curve",
];

const HOOKS = [
  "เมื่อแกงนี้ทำให้สมองไหลออกจากหู 🧠💀",
  "ถ้าไม่ดูคลิปนี้แกพลาดมาก fr fr",
  "skibidi toilet ohio rizz",
  "gyatt!! ใครเห็นด้วยยกมือ ✋",
  "sigma grindset ตื่นตี 4 ทุกวัน",
  "no cap นี่คือคลิปที่ดีที่สุดในชีวิต",
  "เอ็นพีซีพูดอะไรไม่รู้แต่ฟังละเข้าใจ",
  "fanum tax โดนยึดอีกแล้ว",
  "บอกเลยว่า bussin ระดับตำนาน 🔥",
  "ใครงงยกมือ มันคือ brainrot",
  "rizz level สูงปรี๊ด",
  "mewing maxing ก่อนนอนทุกคืน",
  "gigachad cooking ในครัวตอนตี 3",
  "deadass ไม่คิดว่าจะเจอแบบนี้",
  "ตอนนี้คือ sus amongus ชัดๆ",
];

const TOPICS = [
  "เอพิโสดที่ {n}",
  "ep.{n}",
  "ลำดับที่ {n}",
  "ตอนที่ {n} ของซีรีส์",
  "เคสที่ {n} วันนี้",
  "ความจัดที่ {n}",
  "เรื่องเล่าที่ {n}",
  "คลิปลับหมายเลข {n}",
  "เรื่องที่ {n} ของวัน",
  "ฉบับที่ {n}",
];

const SAMPLE_VIDEOS = [
  "https://www.w3schools.com/html/mov_bbb.mp4",
  "https://media.w3.org/2010/05/sintel/trailer.mp4",
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4",
  "https://download.samplelib.com/mp4/sample-5s.mp4",
  "https://download.samplelib.com/mp4/sample-10s.mp4",
  "https://download.samplelib.com/mp4/sample-15s.mp4",
  "https://download.samplelib.com/mp4/sample-20s.mp4",
  "https://media.w3.org/2010/05/bunny/movie.mp4",
  "https://media.w3.org/2010/05/video/movie_300.mp4",
];

function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function formatCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function generateMockData(total, seedOffset = 0) {
  const items = [];
  for (let i = 1; i <= total; i++) {
    const rand = seededRandom(i * 9973 + 17 + seedOffset * 104729);
    const username = USERNAMES[Math.floor(rand() * USERNAMES.length)];
    const hook = HOOKS[Math.floor(rand() * HOOKS.length)];
    const topic = TOPICS[Math.floor(rand() * TOPICS.length)].replace("{n}", i);
    items.push({
      id: i,
      username: `${username}${Math.floor(rand() * 999)}`,
      caption: `${hook} — ${topic}`,
      thumbnail: `https://picsum.photos/seed/brainrot${seedOffset}_${i}/300/533`,
      video: SAMPLE_VIDEOS[Math.floor(rand() * SAMPLE_VIDEOS.length)],
      hue: Math.floor(rand() * 360),
      views: Math.floor(rand() * 5_000_000) + 1000,
      likes: Math.floor(rand() * 900_000) + 100,
      comments: Math.floor(rand() * 20_000),
      shares: Math.floor(rand() * 8_000),
    });
  }
  return items;
}

let allItems = generateMockData(TOTAL_CLIPS);

let filteredItems = allItems;
let loadedCount = 0;

const gridEl = document.getElementById("grid");
const sentinelEl = document.getElementById("sentinel");
const loadedCountEl = document.getElementById("loadedCount");
const totalCountEl = document.getElementById("totalCount");
const searchInputEl = document.getElementById("searchInput");
const refreshBtnEl = document.getElementById("refreshBtn");

totalCountEl.textContent = TOTAL_CLIPS;

let activeVideos = new Set();
let waitingVideos = new Set();

function tryPlayVideo(video) {
  if (activeVideos.size >= MAX_ACTIVE_VIDEOS) {
    waitingVideos.add(video);
    return;
  }
  waitingVideos.delete(video);
  activeVideos.add(video);
  if (!video.src) video.src = video.dataset.src;
  video.play().catch(() => {});
}

function releaseVideo(video) {
  const wasActive = activeVideos.delete(video);
  waitingVideos.delete(video);
  video.pause();
  if (video.src) {
    video.removeAttribute("src");
    video.load();
  }
  if (wasActive) {
    const next = waitingVideos.values().next().value;
    if (next) tryPlayVideo(next);
  }
}

const videoObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        tryPlayVideo(entry.target);
      } else {
        releaseVideo(entry.target);
      }
    });
  },
  { rootMargin: "100px 0px", threshold: 0.25 }
);

function cardTemplate(item) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.id = item.id;
  card.innerHTML = `
    <video class="card-media" style="filter: hue-rotate(${item.hue}deg) saturate(1.2)" muted loop playsinline preload="none" poster="${item.thumbnail}" data-src="${item.video}"></video>
    <div class="card-overlay">
      <div class="card-caption">${item.caption}</div>
      <div class="card-views">▶ ${formatCount(item.views)}</div>
    </div>
  `;
  card.addEventListener("click", () => openModal(item.id));
  videoObserver.observe(card.querySelector(".card-media"));
  return card;
}

function loadNextBatch() {
  if (loadedCount >= filteredItems.length) return;
  const nextBatch = filteredItems.slice(loadedCount, loadedCount + BATCH_SIZE);
  const fragment = document.createDocumentFragment();
  nextBatch.forEach((item) => fragment.appendChild(cardTemplate(item)));
  gridEl.appendChild(fragment);
  loadedCount += nextBatch.length;
  loadedCountEl.textContent = loadedCount;
}

function resetGrid(items) {
  videoObserver.disconnect();
  activeVideos = new Set();
  waitingVideos = new Set();
  filteredItems = items;
  loadedCount = 0;
  gridEl.innerHTML = "";
  loadedCountEl.textContent = 0;
  loadNextBatch();
}

const scrollObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) loadNextBatch();
    });
  },
  { rootMargin: "600px" }
);
scrollObserver.observe(sentinelEl);

let searchDebounce;
searchInputEl.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    const query = searchInputEl.value.trim().toLowerCase();
    if (!query) {
      resetGrid(allItems);
      return;
    }
    const filtered = allItems.filter(
      (item) =>
        item.username.toLowerCase().includes(query) ||
        item.caption.toLowerCase().includes(query)
    );
    resetGrid(filtered);
  }, 200);
});

refreshBtnEl.addEventListener("click", () => {
  allItems = generateMockData(TOTAL_CLIPS, Date.now());
  searchInputEl.value = "";
  resetGrid(allItems);
});

const modalOverlayEl = document.getElementById("modalOverlay");
const modalVideoEl = document.getElementById("modalVideo");
const modalUsernameEl = document.getElementById("modalUsername");
const modalCaptionEl = document.getElementById("modalCaption");
const modalLikesEl = document.getElementById("modalLikes");
const modalCommentsEl = document.getElementById("modalComments");
const modalSharesEl = document.getElementById("modalShares");
const closeModalBtn = document.getElementById("closeModal");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");

let currentModalId = null;

function openModal(id) {
  currentModalId = id;
  const item = allItems.find((i) => i.id === id);
  if (!item) return;
  modalVideoEl.src = item.video;
  modalVideoEl.currentTime = 0;
  modalVideoEl.play().catch(() => {});
  modalUsernameEl.textContent = item.username;
  modalCaptionEl.textContent = item.caption;
  modalLikesEl.textContent = formatCount(item.likes);
  modalCommentsEl.textContent = formatCount(item.comments);
  modalSharesEl.textContent = formatCount(item.shares);
  modalOverlayEl.classList.remove("hidden");
}

function closeModal() {
  modalOverlayEl.classList.add("hidden");
  modalVideoEl.pause();
  modalVideoEl.src = "";
  currentModalId = null;
}

function navigateModal(direction) {
  if (currentModalId === null) return;
  const newId = currentModalId + direction;
  if (newId < 1 || newId > TOTAL_CLIPS) return;
  openModal(newId);
}

closeModalBtn.addEventListener("click", closeModal);
prevBtn.addEventListener("click", () => navigateModal(-1));
nextBtn.addEventListener("click", () => navigateModal(1));
modalOverlayEl.addEventListener("click", (e) => {
  if (e.target === modalOverlayEl) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (modalOverlayEl.classList.contains("hidden")) return;
  if (e.key === "Escape") closeModal();
  if (e.key === "ArrowRight") navigateModal(1);
  if (e.key === "ArrowLeft") navigateModal(-1);
});

loadNextBatch();
