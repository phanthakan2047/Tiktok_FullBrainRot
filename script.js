const BATCH_VIDEO_RESULTS = 50;
const MAX_ACTIVE_VIDEOS = 16;

let ytApiReady = false;
const ytApiQueue = [];
window.onYouTubeIframeAPIReady = () => {
  ytApiReady = true;
  while (ytApiQueue.length) ytApiQueue.shift()();
};
function whenYtApiReady(fn) {
  if (ytApiReady) fn();
  else ytApiQueue.push(fn);
}

const YT_QUERIES = [
  "skibidi toilet shorts",
  "ohio rizz shorts",
  "sigma grindset shorts",
  "brainrot meme shorts",
  "funny fail shorts",
  "oddly satisfying shorts",
  "amazing life hack shorts",
  "cute animals shorts",
];

const REDDIT_SUBS = [
  "ContagiousLaughter",
  "Unexpected",
  "nextfuckinglevel",
  "tiktokcringe",
];

function formatCount(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let ytQueryIndex = 0;
const ytPageTokens = {};
const ytExhausted = new Set();

async function fetchYouTubeBatch() {
  if (!CONFIG.YOUTUBE_API_KEY || CONFIG.YOUTUBE_API_KEY.startsWith("YOUR_")) {
    throw new Error("ยังไม่ได้ตั้งค่า YOUTUBE_API_KEY ใน config.js");
  }
  if (ytExhausted.size >= YT_QUERIES.length) return [];

  const query = YT_QUERIES[ytQueryIndex % YT_QUERIES.length];
  ytQueryIndex++;
  if (ytExhausted.has(query)) return [];

  const searchParams = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoDuration: "short",
    maxResults: String(BATCH_VIDEO_RESULTS),
    q: query,
    key: CONFIG.YOUTUBE_API_KEY,
  });
  if (ytPageTokens[query]) searchParams.set("pageToken", ytPageTokens[query]);

  const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams}`);
  if (!searchRes.ok) {
    const body = await searchRes.json().catch(() => null);
    const msg = body?.error?.message || `HTTP ${searchRes.status}`;
    throw new Error(`YouTube: ${msg}`);
  }
  const searchData = await searchRes.json();

  if (searchData.nextPageToken) {
    ytPageTokens[query] = searchData.nextPageToken;
  } else {
    ytExhausted.add(query);
  }

  const videoIds = searchData.items.map((it) => it.id.videoId).filter(Boolean);
  if (videoIds.length === 0) return [];

  const statsParams = new URLSearchParams({
    part: "statistics",
    id: videoIds.join(","),
    key: CONFIG.YOUTUBE_API_KEY,
  });
  const statsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?${statsParams}`);
  const statsData = statsRes.ok ? await statsRes.json() : { items: [] };
  const statsById = new Map(statsData.items.map((it) => [it.id, it.statistics]));

  return searchData.items
    .filter((it) => it.id.videoId)
    .map((it) => {
      const stats = statsById.get(it.id.videoId) || {};
      return {
        id: `yt-${it.id.videoId}`,
        source: "youtube",
        videoId: it.id.videoId,
        username: it.snippet.channelTitle,
        caption: it.snippet.title,
        thumbnail: it.snippet.thumbnails?.high?.url || it.snippet.thumbnails?.default?.url,
        views: Number(stats.viewCount) || 0,
        likes: Number(stats.likeCount) || 0,
        comments: Number(stats.commentCount) || 0,
      };
    });
}

// Disabled: Reddit's June 2026 "Responsible Builder Policy" change requires
// an approved app before API access is granted — self-serve key creation no
// longer works. Re-enable by setting this to true once approved.
const redditAfter = {};
const redditExhausted = new Set();
let redditAvailable = false;
let redditSubIndex = 0;

async function fetchRedditBatch() {
  if (!redditAvailable) return [];
  if (redditExhausted.size >= REDDIT_SUBS.length) return [];

  const sub = REDDIT_SUBS[redditSubIndex % REDDIT_SUBS.length];
  redditSubIndex++;
  if (redditExhausted.has(sub)) return [];

  const params = new URLSearchParams({ limit: "50" });
  if (redditAfter[sub]) params.set("after", redditAfter[sub]);

  let res;
  try {
    res = await fetch(`/api/reddit/${sub}?${params}`);
  } catch (e) {
    redditAvailable = false;
    throw new Error(`เข้า Reddit proxy ไม่ได้: ${e.message}`);
  }
  if (!res.ok) {
    redditAvailable = false;
    throw new Error(`Reddit บล็อกการเข้าถึง (HTTP ${res.status}) — อาจเป็นเพราะ IP/เครือข่ายนี้`);
  }
  const data = await res.json();

  if (data.data.after) {
    redditAfter[sub] = data.data.after;
  } else {
    redditExhausted.add(sub);
  }

  return data.data.children
    .map((c) => c.data)
    .filter((d) => d.is_video && d.media?.reddit_video?.fallback_url)
    .map((d) => ({
      id: `rd-${d.id}`,
      source: "reddit",
      videoUrl: d.media.reddit_video.fallback_url,
      username: d.author,
      caption: d.title,
      thumbnail: d.thumbnail && d.thumbnail.startsWith("http") ? d.thumbnail : null,
      views: 0,
      likes: d.ups || 0,
      comments: d.num_comments || 0,
    }));
}

let allItems = [];
let filteredItems = [];
let loadedCount = 0;
let loading = false;

const gridEl = document.getElementById("grid");
const sentinelEl = document.getElementById("sentinel");
const loadedCountEl = document.getElementById("loadedCount");
const statusTextEl = document.getElementById("statusText");
const searchInputEl = document.getElementById("searchInput");
const refreshBtnEl = document.getElementById("refreshBtn");

let activeVideos = new Set();
let waitingVideos = new Set();

function setupYtPlayer(slot) {
  if (slot._ytSetup) return;
  slot._ytSetup = true;
  whenYtApiReady(() => {
    if (!slot.isConnected) return;
    new YT.Player(slot, {
      videoId: slot.dataset.videoId,
      width: "100%",
      height: "100%",
      playerVars: {
        autoplay: 1,
        mute: 1,
        controls: 0,
        playsinline: 1,
        modestbranding: 1,
        rel: 0,
      },
      events: {
        onReady: (e) => {
          const iframe = e.target.getIframe();
          iframe.classList.add("card-media");
          iframe._ytPlayer = e.target;
          videoObserver.unobserve(slot);
          videoObserver.observe(iframe);
          if (activeVideos.delete(slot)) activeVideos.add(iframe);
          if (waitingVideos.delete(slot)) waitingVideos.add(iframe);
          e.target.playVideo();
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.ENDED) {
            e.target.seekTo(0);
            e.target.playVideo();
          }
        },
      },
    });
  });
}

function tryPlayMedia(media) {
  if (activeVideos.size >= MAX_ACTIVE_VIDEOS) {
    waitingVideos.add(media);
    return;
  }
  waitingVideos.delete(media);
  activeVideos.add(media);

  if (media.tagName === "VIDEO") {
    if (!media.src) media.src = media.dataset.src;
    media.play().catch(() => {});
  } else if (media._ytPlayer) {
    media._ytPlayer.playVideo();
  } else {
    setupYtPlayer(media);
  }
}

function releaseMedia(media) {
  const wasActive = activeVideos.delete(media);
  waitingVideos.delete(media);

  if (media.tagName === "VIDEO") {
    media.pause();
    if (media.src) {
      media.removeAttribute("src");
      media.load();
    }
  } else if (media._ytPlayer) {
    media._ytPlayer.pauseVideo();
  }

  if (wasActive) {
    const next = waitingVideos.values().next().value;
    if (next) tryPlayMedia(next);
  }
}

const releaseTimers = new WeakMap();
const RELEASE_GRACE_MS = 1200;

function cancelScheduledRelease(media) {
  const timer = releaseTimers.get(media);
  if (timer) {
    clearTimeout(timer);
    releaseTimers.delete(media);
  }
}

function scheduleRelease(media) {
  cancelScheduledRelease(media);
  releaseTimers.set(
    media,
    setTimeout(() => {
      releaseTimers.delete(media);
      releaseMedia(media);
    }, RELEASE_GRACE_MS)
  );
}

const videoObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        cancelScheduledRelease(entry.target);
        tryPlayMedia(entry.target);
      } else {
        scheduleRelease(entry.target);
      }
    });
  },
  { rootMargin: "100px 0px", threshold: 0.25 }
);

function cardTemplate(item) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.id = item.id;

  const badge = item.source === "youtube" ? "▶️ YouTube" : "👽 Reddit";
  const media =
    item.source === "reddit"
      ? `<video class="card-media" muted loop playsinline preload="none" data-src="${item.videoUrl}"></video>`
      : `<div class="card-media" data-video-id="${item.videoId}"></div>`;

  if (item.thumbnail) card.style.backgroundImage = `url("${item.thumbnail}")`;
  card.style.backgroundSize = "cover";
  card.style.backgroundPosition = "center";

  card.innerHTML = `
    ${media}
    <div class="source-badge">${badge}</div>
    <div class="card-overlay">
      <div class="card-caption">${item.caption}</div>
      <div class="card-views">▶ ${formatCount(item.views || item.likes)}</div>
    </div>
  `;
  card.addEventListener("click", () => openModal(item.id));
  videoObserver.observe(card.querySelector(".card-media"));
  return card;
}

function appendItems(items) {
  allItems = allItems.concat(items);
  filteredItems = filteredItems.concat(items);
  const fragment = document.createDocumentFragment();
  items.forEach((item) => fragment.appendChild(cardTemplate(item)));
  gridEl.appendChild(fragment);
  loadedCount += items.length;
  loadedCountEl.textContent = loadedCount;
}

async function loadMore() {
  if (loading) return;
  loading = true;
  statusTextEl.textContent = "กำลังโหลด...";
  try {
    const [ytResult, rdResult] = await Promise.allSettled([fetchYouTubeBatch(), fetchRedditBatch()]);
    const newItems = [];
    const problems = [];

    if (ytResult.status === "fulfilled") newItems.push(...ytResult.value);
    else problems.push(ytResult.reason.message);

    if (rdResult.status === "fulfilled") newItems.push(...rdResult.value);
    else problems.push(rdResult.reason.message);

    shuffle(newItems);
    if (newItems.length > 0) appendItems(newItems);

    if (problems.length > 0) {
      statusTextEl.textContent = problems.join(" | ");
    } else if (newItems.length === 0) {
      statusTextEl.textContent = "ไม่มีคลิปใหม่แล้ว";
    } else {
      statusTextEl.textContent = "พร้อมแล้ว";
    }
  } finally {
    loading = false;
  }
}

function resetGrid() {
  videoObserver.disconnect();
  activeVideos = new Set();
  waitingVideos = new Set();
  allItems = [];
  filteredItems = [];
  loadedCount = 0;
  ytQueryIndex = 0;
  redditSubIndex = 0;
  Object.keys(ytPageTokens).forEach((k) => delete ytPageTokens[k]);
  Object.keys(redditAfter).forEach((k) => delete redditAfter[k]);
  ytExhausted.clear();
  redditExhausted.clear();
  gridEl.innerHTML = "";
  loadedCountEl.textContent = 0;
  loadMore();
}

const scrollObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) loadMore();
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
    videoObserver.disconnect();
    activeVideos = new Set();
    waitingVideos = new Set();
    gridEl.innerHTML = "";
    const visible = query
      ? allItems.filter(
          (item) =>
            item.username.toLowerCase().includes(query) ||
            item.caption.toLowerCase().includes(query)
        )
      : allItems;
    filteredItems = visible;
    const fragment = document.createDocumentFragment();
    visible.forEach((item) => fragment.appendChild(cardTemplate(item)));
    gridEl.appendChild(fragment);
  }, 200);
});

refreshBtnEl.addEventListener("click", () => {
  searchInputEl.value = "";
  resetGrid();
});

const modalOverlayEl = document.getElementById("modalOverlay");
const modalVideoEl = document.getElementById("modalVideo");
const modalIframeEl = document.getElementById("modalIframe");
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
  const item = allItems.find((i) => i.id === id);
  if (!item) return;
  currentModalId = id;

  if (item.source === "youtube") {
    modalVideoEl.pause();
    modalVideoEl.src = "";
    modalVideoEl.classList.add("hidden");
    modalIframeEl.src = `https://www.youtube.com/embed/${item.videoId}?autoplay=1&playsinline=1`;
    modalIframeEl.classList.remove("hidden");
  } else {
    modalIframeEl.src = "";
    modalIframeEl.classList.add("hidden");
    modalVideoEl.classList.remove("hidden");
    modalVideoEl.src = item.videoUrl;
    modalVideoEl.currentTime = 0;
    modalVideoEl.play().catch(() => {});
  }

  modalUsernameEl.textContent = item.username;
  modalCaptionEl.textContent = item.caption;
  modalLikesEl.textContent = formatCount(item.likes);
  modalCommentsEl.textContent = formatCount(item.comments);
  modalSharesEl.textContent = formatCount(item.views);
  modalOverlayEl.classList.remove("hidden");
}

function closeModal() {
  modalOverlayEl.classList.add("hidden");
  modalVideoEl.pause();
  modalVideoEl.src = "";
  modalIframeEl.src = "";
  currentModalId = null;
}

function navigateModal(direction) {
  if (currentModalId === null) return;
  const idx = filteredItems.findIndex((i) => i.id === currentModalId);
  if (idx === -1) return;
  const nextIdx = idx + direction;
  if (nextIdx < 0 || nextIdx >= filteredItems.length) return;
  openModal(filteredItems[nextIdx].id);
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

loadMore();
