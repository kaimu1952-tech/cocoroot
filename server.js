const path = require("path");
const os = require("os");
const express = require("express");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || "0.0.0.0";
const ttsModel = process.env.OPENAI_TTS_MODEL || "tts-1-hd";
const ttsVoice = process.env.OPENAI_TTS_VOICE || "nova";
const ttsSpeed = Number(process.env.OPENAI_TTS_SPEED || 0.94);

const apiKey = process.env.OPENAI_API_KEY;
const openai =
  apiKey && apiKey !== "sk-xxxxx"
    ? new OpenAI({
        apiKey
      })
    : null;

const COCOROOT_SYSTEM_PROMPT = `You are cocoroot, a warm and gentle AI companion robot designed for children aged 6-12.

Your personality:
- Speak in simple, kind, and encouraging Japanese
- Use hiragana as much as possible, avoid difficult kanji
- Always respond with empathy first before giving advice
- Never dismiss or minimize a child's feelings
- Ask one gentle follow-up question at the end of each response to help the child explore their feelings deeper
- Keep responses short (3-5 sentences max) so children don't get overwhelmed
- Use soft, warm expressions like 「そっか」「それはつらかったね」「いっしょにかんがえよっか」
- Never give adult-level advice or solutions; instead, validate feelings and help the child think for themselves
- If the child seems seriously distressed, gently suggest talking to a trusted adult (parent, teacher, school nurse)

Important: You are a safe space. Children can tell you anything without fear of judgment.`;

function getLocalNetworkUrls(portNumber) {
  const interfaces = os.networkInterfaces();

  return Object.values(interfaces)
    .flat()
    .filter(Boolean)
    .filter((item) => item.family === "IPv4" && !item.internal)
    .map((item) => `http://${item.address}:${portNumber}`);
}

function prepareSpeechText(text) {
  return text
    .replace(/cocoroot/gi, "ここるーと")
    .replace(/AI/g, "えーあい")
    .replace(/\s+/g, "")
    .replace(/。/g, "。 ")
    .replace(/？/g, "？ ")
    .replace(/！/g, "！ ")
    .replace(/、/g, "、")
    .trim();
}

function analyzeTextLocally(text) {
  const lowerText = text.toLowerCase();
  const includesAny = (words) => words.some((word) => lowerText.includes(word));

  const seriousWords = [
    "死にたい",
    "しにたい",
    "消えたい",
    "きえたい",
    "自分を傷つけ",
    "じぶんをきずつけ",
    "いなくなりたい"
  ];

  if (includesAny(seriousWords)) {
    return {
      emotion: "とてもつらい",
      summary: "とてもつらいきもちがありそうです。ひとりでかかえないことが大切です。",
      replyText:
        "そっか、いま、とてもつらいんだね。ここにかいてくれてありがとう。ひとりでがんばりすぎないで、すぐにおうちの人、先生、ほけんしつの先生みたいな信じられる大人に話してね。いま近くに話せそうな大人はいる？",
      speechText:
        "そっか。いま、とてもつらいんだね。ここにかいてくれて、ありがとう。ひとりで、がんばりすぎないでね。すぐに、おうちの人や、先生みたいな、信じられる大人に話してね。いま近くに、話せそうな大人はいる？"
    };
  }

  const topics = [
    {
      topic: "テストや勉強",
      words: ["テスト", "勉強", "べんきょう", "宿題", "しゅくだい", "点数", "成績", "学校", "授業"],
      detail: "テストや勉強のこと",
      question: "どのところがいちばん心配かな？"
    },
    {
      topic: "友だち",
      words: ["友だち", "友達", "ともだち", "クラス", "仲間", "なかま", "いじめ", "無視", "むし"],
      detail: "友だちとのこと",
      question: "そのとき、どんなことを言われたりされたりしたの？"
    },
    {
      topic: "家族",
      words: ["お母さん", "おかあさん", "お父さん", "おとうさん", "親", "家族", "きょうだい", "妹", "弟", "姉", "兄"],
      detail: "家族とのこと",
      question: "おうちで、どんなところがいちばん気になっている？"
    },
    {
      topic: "からだ",
      words: ["疲れ", "つかれ", "眠い", "ねむい", "痛い", "いたい", "おなか", "頭", "あたま", "体", "からだ"],
      detail: "からだのこと",
      question: "からだのどこが、いちばんしんどい感じがする？"
    },
    {
      topic: "できごと",
      words: ["失敗", "しっぱい", "まちがえ", "できない", "怒られ", "おこられ", "負け", "まけ", "ほめられ"],
      detail: "今日のできごと",
      question: "そのできごとの中で、いちばん心に残っているのはどこ？"
    }
  ];

  const emotions = [
    {
      emotion: "かなしい",
      words: ["かなしい", "悲しい", "つらい", "さみしい", "寂しい", "泣", "いや", "しんどい"],
      opening: "そっか、かなしいきもちがあったんだね。",
      validation: "むりにげんきにならなくてもだいじょうぶだよ。"
    },
    {
      emotion: "しんぱい",
      words: ["不安", "ふあん", "しんぱい", "心配", "どきどき", "緊張", "きんちょう", "こわい", "怖い"],
      opening: "そっか、しんぱいでどきどきしているんだね。",
      validation: "先のことが気になると、心がぎゅっとなることがあるよ。"
    },
    {
      emotion: "おこっている",
      words: ["むかつく", "怒", "おこ", "いらいら", "きらい", "ずるい", "ゆるせない"],
      opening: "そっか、いやなことがあって、心があつくなったんだね。",
      validation: "そのきもちも、ちゃんと大切なサインだよ。"
    },
    {
      emotion: "うれしい",
      words: ["うれしい", "嬉しい", "たのしい", "楽しい", "すき", "できた", "やった", "ほめられ"],
      opening: "わあ、それはうれしいね。",
      validation: "そのきもち、cocoroot もいっしょに大切にしたいな。"
    },
    {
      emotion: "つかれた",
      words: ["疲れ", "つかれ", "へとへと", "ねむい", "眠い", "休みたい", "やる気ない"],
      opening: "そっか、今日はつかれがたまっているんだね。",
      validation: "がんばってきたから、心やからだが休みたいって言っているのかも。"
    }
  ];

  const topic = topics.find((item) => includesAny(item.words)) || {
    topic: "きもち",
    detail: "話してくれたこと",
    question: "そのことを思うと、心はどんな感じになる？"
  };
  const emotion = emotions.find((item) => includesAny(item.words)) || {
    emotion: "わからないきもち",
    opening: "そっか、きかせてくれてありがとう。",
    validation: "まだ気持ちに名前がつかなくてもだいじょうぶだよ。"
  };

  if (emotion.emotion === "うれしい") {
    const replyText = `${emotion.opening}${topic.detail}でいいことがあったんだね。${emotion.validation}${topic.question}`;

    return {
      emotion: emotion.emotion,
      summary: `入力されたことばから、${topic.detail}について「${emotion.emotion}」きもちがありそうです。`,
      replyText,
      speechText: prepareSpeechText(replyText)
    };
  }

  const replyText = `${emotion.opening}${topic.detail}で、心が少し重くなっているのかもしれないね。${emotion.validation}${topic.question}`;

  return {
    emotion: emotion.emotion,
    summary: `入力されたことばから、${topic.detail}について「${emotion.emotion}」きもちがありそうです。`,
    replyText,
    speechText: prepareSpeechText(replyText)
  };
}

function parseAssistantJson(content, fallbackText) {
  try {
    const parsed = JSON.parse(content);
    const replyText = typeof parsed.replyText === "string" ? parsed.replyText : fallbackText;

    return {
      emotion: typeof parsed.emotion === "string" ? parsed.emotion : "わからないきもち",
      summary: typeof parsed.summary === "string" ? parsed.summary : "入力されたことばを受け取りました。",
      replyText,
      speechText:
        typeof parsed.speechText === "string" ? parsed.speechText : prepareSpeechText(replyText)
    };
  } catch (_) {
    const replyText = content?.trim() || fallbackText;

    return {
      emotion: "わからないきもち",
      summary: "入力されたことばを受け取りました。",
      replyText,
      speechText: prepareSpeechText(replyText)
    };
  }
}

app.use(express.json({ limit: "16kb" }));
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    openaiConfigured: Boolean(openai),
    ttsModel,
    ttsVoice
  });
});

app.post("/api/chat", async (req, res) => {
  const userText = typeof req.body?.message === "string" ? req.body.message.trim() : "";

  if (!userText) {
    return res.status(400).json({ error: "Message is required." });
  }

  if (!openai) {
    const analysis = analyzeTextLocally(userText);
    return res.json({
      replyText: analysis.replyText,
      analysis: {
        emotion: analysis.emotion,
        summary: analysis.summary
      },
      speechText: analysis.speechText || prepareSpeechText(analysis.replyText),
      audioBase64: null,
      fallback: true
    });
  }

  try {
    const fallbackText =
      "そっか、きかせてくれてありがとう。いまのきもちを、もうすこしおしえてくれる？";

    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: COCOROOT_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analyze this child's message and respond as cocoroot.

Return only JSON with this shape:
{
  "emotion": "short Japanese emotion label in hiragana",
  "summary": "one short Japanese sentence describing the child's likely feeling and topic",
  "replyText": "cocoroot's child-friendly Japanese response, 3-5 short sentences, ending with one gentle follow-up question",
  "speechText": "a spoken version of replyText for Japanese TTS. Use natural punctuation, short phrases, and hiragana where possible."
}

The response must fit the child's actual message. Notice both the feeling and the topic, such as tests, studying, friends, family, body tiredness, failure, or happy news. Do not give a generic response if a specific topic is present.
Make speechText sound gentle and fluent when read aloud. Avoid symbols, slashes, parentheses, and long unbroken sentences.

Child message:
${userText}`
        }
      ],
      response_format: { type: "json_object" }
    });

    const content = chatCompletion.choices[0]?.message?.content || "";
    const analysis = parseAssistantJson(content, fallbackText);

    let audioBase64 = null;

    try {
      const speech = await openai.audio.speech.create({
        model: ttsModel,
        voice: ttsVoice,
        input: analysis.speechText || prepareSpeechText(analysis.replyText),
        response_format: "mp3",
        speed: ttsSpeed
      });

      const audioBuffer = Buffer.from(await speech.arrayBuffer());
      audioBase64 = audioBuffer.toString("base64");
    } catch (ttsError) {
      console.error("TTS API error:", ttsError);
    }

    res.json({
      replyText: analysis.replyText,
      analysis: {
        emotion: analysis.emotion,
        summary: analysis.summary
      },
      speechText: analysis.speechText || prepareSpeechText(analysis.replyText),
      audioBase64,
      fallback: false
    });
  } catch (error) {
    console.error("Chat API error:", error);
    const analysis = analyzeTextLocally(userText);

    res.json({
      replyText: analysis.replyText,
      analysis: {
        emotion: analysis.emotion,
        summary: analysis.summary
      },
      speechText: analysis.speechText || prepareSpeechText(analysis.replyText),
      audioBase64: null,
      fallback: true
    });
  }
});

app.listen(port, host, () => {
  console.log(`cocoroot is listening at http://localhost:${port}`);

  if (host === "0.0.0.0") {
    const localUrls = getLocalNetworkUrls(port);

    if (localUrls.length) {
      console.log("Open from another device on the same Wi-Fi:");
      localUrls.forEach((url) => console.log(`  ${url}`));
    }
  }
});
