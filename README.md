# 単語3000 — 英単語学習アプリ

給日本國中生使用的 3000 個高頻英文單字背誦網頁。手機優先設計，純靜態網站，不需要後端。

## 功能

- **新しい単語**：依使用頻率順序，每次學習 5~30 個新單字（翻卡＋自動發音）
- **復習テスト**：Leitner 間隔重複（1 → 2 → 4 → 7 → 15 → 30 天），到期單字以四選一測驗複習，答錯自動降級重排
- **スペル練習**：看日文意思＋聽發音，輸入英文拼寫
- **単語リスト**：3000 字可搜尋、依等級（每 500 字一級）瀏覽、點擊發音
- **進度紀錄**：習得／學習中／未學習統計、連續學習天數（streak），資料存在瀏覽器 `localStorage`，設定頁可匯出／匯入備份
- **發音**：使用瀏覽器內建 Web Speech API，免費、離線也能用

## 使用方式

本機測試（`fetch` 需要經由 HTTP，直接點開 `index.html` 不行）：

```bash
python3 -m http.server 8000
# 打開 http://localhost:8000
```

部署：到 GitHub repo 的 **Settings → Pages**，Source 選擇分支根目錄即可，網址會是 `https://<帳號>.github.io/English_word/`。

## 單字資料來源（皆可自由使用）

| 來源 | 用途 | 授權 |
|---|---|---|
| [NGSL 1.01](http://www.newgeneralservicelist.org/)（New General Service List） | 核心 2,801 字＋補充 47 字（月份、星期、數字），並以同語料庫頻率排名補足至 3,000 字 | CC BY 3.0 |
| [ejdict-hand](https://github.com/kujirahand/EJDict) | 日文釋義 | Public Domain |

### 重新產生 words.json

```bash
pip install openpyxl
# 1. 下載 NGSL xlsx 與 ejdict 全部字母檔（合併為 all.txt）
# 2. 執行：
python3 tools/build_words.py ngsl.xlsx ejdict-all.txt > data/words.json
```

要調整選字（增刪單字、改補充釋義），編輯 `tools/build_words.py` 內的 `MANUAL_JA` 與 `SKIP`，或直接編輯 `data/words.json`（格式：`[{"w": "單字", "ja": "日文釋義（以 / 分隔多義）"}]`，順序即頻率排名）。
