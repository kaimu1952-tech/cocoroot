const robot = document.getElementById("robot");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const statusText = document.getElementById("statusText");
const replyText = document.getElementById("replyText");
const analysisText = document.getElementById("analysisText");

let activeAudio;
let preferredVoice = null;

const stateLabels = {
  idle: "かいておくってね",
  listening: "よんでるよ",
  thinking: "かんがえてるよ",
  speaking: "はなしてるよ"
};

function setState(state, message = stateLabels[state]) {
  robot.classList.remove("idle", "listening", "thinking", "speaking");
  robot.classList.add(state);
  statusText.textContent = message;
}

function showError(message) {
  setState("idle", message);
  sendButton.disabled = false;
  messageInput.disabled = false;
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
  sendButton.disabled = false;
  messageInput.disabled = false;
  messageInput.focus();
  setState("idle");
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
    sendButton.disabled = true;
    messageInput.disabled = true;
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
    const summary = payload.analysis?.summary;

    replyText.textContent = cocorootReply;
    analysisText.textContent = emotion && summary ? `きもち: ${emotion} / ${summary}` : "";
    setState("speaking");
    messageInput.value = "";

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

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

setState("idle");

if (window.speechSynthesis) {
  selectJapaneseVoice();
  window.speechSynthesis.addEventListener("voiceschanged", selectJapaneseVoice);
}
