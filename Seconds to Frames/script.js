const secondsInput = document.getElementById("seconds");
const fpsSelect = document.getElementById("fps");
const framesOutput = document.getElementById("frames");
const copyBtn = document.getElementById("copyBtn");

function calculateFrames() {
  const seconds = parseFloat(secondsInput.value);
  const fps = parseFloat(fpsSelect.value);

  if (isNaN(seconds) || seconds < 0) {
    framesOutput.textContent = 0;
    return;
  }

  const totalFrames = seconds * fps;
  framesOutput.textContent = Math.round(totalFrames);
}

copyBtn.addEventListener("click", () => {
  const value = framesOutput.textContent;

  navigator.clipboard.writeText(value);

  copyBtn.textContent = "Copied!";
  copyBtn.classList.add("copied");

  setTimeout(() => {
    copyBtn.textContent = "Copy";
    copyBtn.classList.remove("copied");
  }, 500);
});

// Auto-calc on input change
secondsInput.addEventListener("input", calculateFrames);
fpsSelect.addEventListener("change", calculateFrames);
