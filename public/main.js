const robot = document.getElementById("robot");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const statusText = document.getElementById("statusText");
const statusLabel = statusText.querySelector(".status-label");
const replyText = document.getElementById("replyText");
const analysisText = document.getElementById("analysisText");
const promptButtons = [...document.querySelectorAll(".prompt-button")];

let activeAudio;
let preferredVoice = null;
let isComposingText = false;

const stateLabels = {
  idle: "ここにいるよ",
  listening: "よんでいるよ",
  thinking: "いっしょにかんがえてるよ",
  speaking: "おはなししてるよ"
};

function setState(state, message = stateLabels[state]) {
  robot.classList.remove("idle", "listening", "thinking", "speaking");
  robot.classList.add(state);
  statusText.classList.remove("state-idle", "state-listening", "state-thinking", "state-speaking");
  statusText.classList.add(`state-${state}`);
  statusLabel.textContent = message;
}

function setControlsDisabled(disabled) {
  sendButton.disabled = disabled;
  messageInput.disabled = disabled;
  promptButtons.forEach((button) => {
    button.disabled = disabled;
  });
}

function showError(message) {
  setState("idle", message);
  setControlsDisabled(false);
  messageInput.focus();
}

function base64ToBlob(base64, type) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type });
}

function normalizeSpeechText(text) {
  return text
    .replace(/cocoroot/gi, "ここるーと")
    .replace(/AI/g, "えーあい")
    .replace(/[「」『』]/g, "")
    .replace(/\s+/g, "")
    .replace(/。/g, "。 ")
    .replace(/？/g, "？ ")
    .replace(/！/g, "！ ")
    .replace(/、/g, "、")
    .trim();
}

function selectJapaneseVoice() {
  if (!window.speechSynthesis) {
    return null;
  }

  const voices = window.speechSynthesis.getVoices();
  const preferredNames = [
    "Kyoko",
    "Otoya",
    "Google 日本語",
    "Google Japanese",
    "Microsoft Nanami",
    "Microsoft Haruka"
  ];

  preferredVoice =
    preferredNames
      .map((name) => voices.find((voice) => voice.name.includes(name)))
      .find(Boolean) ||
    voices.find((voice) => voice.lang === "ja-JP") ||
    voices.find((voice) => voice.lang?.startsWith("ja")) ||
    null;

  return preferredVoice;
}

function waitForVoices() {
  return new Promise((resolve) => {
    const voice = selectJapaneseVoice();

    if (voice || !window.speechSynthesis) {
      resolve(voice);
      return;
    }

    const timer = window.setTimeout(() => {
      resolve(selectJapaneseVoice());
    }, 500);

    window.speechSynthesis.addEventListener(
      "voiceschanged",
      () => {
        window.clearTimeout(timer);
        resolve(selectJapaneseVoice());
      },
      { once: true }
    );
  });
}

async function speakWithBrowser(text) {
  const speechText = normalizeSpeechText(text);

  return new Promise((resolve) => {
    if (!window.speechSynthesis || !speechText) {
      resolve();
      return;
    }

    waitForVoices().then((voice) => {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(speechText);
      utterance.lang = "ja-JP";
      utterance.voice = voice;
      utterance.rate = 0.9;
      utterance.pitch = 1.02;
      utterance.volume = 1;
      utterance.onend = resolve;
      utterance.onerror = resolve;
      window.speechSynthesis.speak(utterance);
    });
  });
}

function resetControls() {
  setControlsDisabled(false);
  messageInput.focus();
  setState("idle");
}

function resizeMessageInput() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 170)}px`;
}

function describeEmotion(emotion) {
  if (!emotion) {
    return "";
  }

  if (emotion === "わからないきもち") {
    return "まだことばにならなくてもいいよ";
  }

  return `「${emotion}」ってかんじなのかも`;
}

async function sendMessage(message) {
  const userMessage = message.trim();

  if (!userMessage) {
    showError("ことばをかいてね");
    return;
  }

  try {
    if (activeAudio) {
      activeAudio.pause();
      activeAudio = null;
    }

    replyText.textContent = "ことばをうけとったよ。";
    analysisText.textContent = "";
    setControlsDisabled(true);
    setState("thinking");

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message: userMessage })
    });

    if (!response.ok) {
      let errorMessage = "いまはおへんじできないみたい";
      try {
        const payload = await response.json();
        if (payload.error) {
          errorMessage = payload.error;
        }
      } catch (_) {
        // The server may return a non-JSON error body.
      }
      throw new Error(errorMessage);
    }

    const payload = await response.json();
    const cocorootReply = payload.replyText || "きかせてくれてありがとう。";
    const cocorootSpeech = payload.speechText || cocorootReply;
    const emotion = payload.analysis?.emotion;

    replyText.textContent = cocorootReply;
    analysisText.textContent = describeEmotion(emotion);
    setState("speaking");
    messageInput.value = "";
    resizeMessageInput();

    if (payload.audioBase64) {
      const mp3Blob = base64ToBlob(payload.audioBase64, "audio/mpeg");
      const audioUrl = URL.createObjectURL(mp3Blob);
      activeAudio = new Audio(audioUrl);

      activeAudio.addEventListener("ended", () => {
        URL.revokeObjectURL(audioUrl);
        activeAudio = null;
        resetControls();
      });

      activeAudio.addEventListener("error", () => {
        URL.revokeObjectURL(audioUrl);
        activeAudio = null;
        showError("音をながせなかったよ");
      });

      await activeAudio.play();
    } else {
      await speakWithBrowser(cocorootSpeech);
      resetControls();
    }
  } catch (error) {
    console.error("Chat request error:", error);
    showError(error.message || "いまはおへんじできないみたい");
  }
}

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(messageInput.value);
});

messageInput.addEventListener("compositionstart", () => {
  isComposingText = true;
});

messageInput.addEventListener("compositionend", () => {
  isComposingText = false;
});

messageInput.addEventListener("input", resizeMessageInput);

messageInput.addEventListener("keydown", (event) => {
  const isConfirmingJapaneseText = event.isComposing || isComposingText || event.keyCode === 229;

  if (event.key === "Enter" && !event.shiftKey && !isConfirmingJapaneseText) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

promptButtons.forEach((button) => {
  button.addEventListener("click", () => {
    messageInput.value = button.dataset.prompt || "";
    resizeMessageInput();
    messageInput.focus();
    messageInput.setSelectionRange(messageInput.value.length, messageInput.value.length);
  });
});

setState("idle");

if (window.speechSynthesis) {
  selectJapaneseVoice();
  window.speechSynthesis.addEventListener("voiceschanged", selectJapaneseVoice);
}
