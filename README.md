# cocoroot

cocoroot は、こどもがテキストを入力すると、やさしい日本語で音声返答する AI コンパニオンロボットの Web アプリです。

## 起動方法

```bash
npm install
# .env ファイルに OPENAI_API_KEY=sk-xxxxx を記載
node server.js
```

ブラウザで http://localhost:3000 にアクセスしてください。

## 同じWi-Fiの別端末から開く

```bash
npm run start:lan
```

起動ログに表示される `http://192.168.x.x:3000` のようなURLを、同じWi-Fiにつながっている他の端末のブラウザで開いてください。

macOS のファイアウォールが確認を出した場合は、Node.js の受信接続を許可してください。

## インターネット上に公開する

Render / Railway / Fly.io など、Node.js サーバーを動かせるサービスにデプロイしてください。

Render の場合:

1. GitHub にこの `cocoroot` フォルダを含むリポジトリを push します。
2. Render で New Web Service を作ります。
3. Build Command は `npm install`、Start Command は `npm start` にします。
4. Environment Variables に `OPENAI_API_KEY` を設定します。
5. デプロイ後に発行される `https://...onrender.com` のURLを共有します。

この版はログイン機能なしです。URLを知っている人はそのまま使えます。

## 注意

- API キーは `.env` にのみ保存してください。フロントエンドのコードには入れないでください。
- `.env` は `.gitignore` に追加済みです。

## API

`POST /api/chat`

1. JSON の `message` テキストを受け取ります。
2. `gpt-4o` に cocoroot のシステムプロンプト付きで送信します。
3. 返答テキストと簡単な気持ち分析を JSON で受け取ります。
4. TTS API `tts-1-hd`、voice `nova` で MP3 音声を生成します。
5. `replyText`、`analysis`、`audioBase64` をフロントエンドに返します。

`OPENAI_API_KEY` が未設定の場合は、開発用の簡易テキスト分析で返答し、ブラウザの読み上げ機能を使います。
`OPENAI_TTS_MODEL` と `OPENAI_TTS_VOICE` を `.env` に追加すると、音声モデルと声を変更できます。
`OPENAI_TTS_SPEED=0.94` のように指定すると、OpenAI TTS の読み上げ速度も調整できます。
