const frames = [
  "./assets/frame-1.png",
  "./assets/frame-2.png",
  "./assets/frame-3.png",
  "./assets/frame-4.png",
  "./assets/frame-5.png",
  "./assets/frame-6.png",
];

const frameElement = document.querySelector("#animationFrame");
const frameDelay = 180;
let frameIndex = 0;
let timer = null;

function preloadFrames() {
  for (const frame of frames) {
    const image = new Image();
    image.src = frame;
  }
}

function showFrame(index) {
  frameIndex = index % frames.length;
  frameElement.src = frames[frameIndex];
}

function play() {
  if (timer) return;
  document.body.classList.add("is-playing");
  timer = window.setInterval(() => {
    showFrame(frameIndex + 1);
  }, frameDelay);
}

function pause() {
  if (!timer) return;
  window.clearInterval(timer);
  timer = null;
  document.body.classList.remove("is-playing");
}

function togglePlayback() {
  if (timer) {
    pause();
  } else {
    play();
  }
}

window.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || event.repeat) return;
  event.preventDefault();
  togglePlayback();
});

preloadFrames();
showFrame(0);
