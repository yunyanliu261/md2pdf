# md2pdf

將 Markdown（`.md`）依照**網頁上（GitHub）顯示的排版**，完整轉換成 PDF。

流程：Markdown →（markdown-it + GitHub 風格外掛）→ HTML + `github-markdown-css` →（無頭 Chrome）→ PDF。
整個流程都在本機執行，文件內容不會送到外部服務（只有文件裡引用的遠端圖片會被下載）。

## 支援的內容

| 項目 | 說明 |
|---|---|
| GFM | 表格（含對齊）、刪除線、任務清單、自動連結、註腳、emoji `:rocket:` |
| GitHub 提示框 | `> [!NOTE]`、`[!TIP]`、`[!IMPORTANT]`、`[!WARNING]`、`[!CAUTION]` |
| 程式碼 | highlight.js 語法上色（GitHub 配色）；過長的行會自動換行，不會被裁切 |
| 數學式 | `$...$`、`$$...$$`、```` ```math ````（KaTeX） |
| 圖表 | ```` ```mermaid ```` |
| 圖片 | 相對路徑以 `.md` 所在資料夾為基準 |
| 錨點 | 標題 id 與 GitHub 相同（例如 `#表格`），PDF 內連結可點擊 |
| PDF | 依標題產生書籤（目錄）、可選頁碼、可選深色主題 |
| 中文 | 使用系統字型（建議安裝 Noto Sans CJK） |

## 安裝

需要 Node.js 20 以上。

```bash
npm install
npm run install-browser   # 下載 puppeteer 用的無頭 Chrome（約 200MB，放在 ~/.cache/puppeteer）
npm link                  # 選用：讓 md2pdf 成為全域指令
```

## 使用

```bash
md2pdf README.md                      # 輸出 README.pdf（同資料夾）
md2pdf README.md -o out/readme.pdf    # 指定輸出檔
md2pdf docs/ -o pdf/                  # 遞迴轉換整個資料夾，保留目錄結構
md2pdf a.md b.md -p -t dark           # 多個檔案、加頁碼、深色主題
```

| 參數 | 預設 | 說明 |
|---|---|---|
| `-o, --output` | 與 `.md` 同位置 | 單一檔案時可給 `.pdf` 路徑，否則視為輸出資料夾 |
| `-f, --format` | `A4` | `A3`、`A4`、`A5`、`Letter`、`Legal` |
| `-l, --landscape` | 否 | 橫向 |
| `-m, --margin` | `15mm` | 頁邊距（`mm`、`cm`、`in`、`px`） |
| `-w, --width` | `830` | 以多寬（px）的網頁排版，再等比例縮放到紙張寬度；`0` 表示直接用紙張寬度排版 |
| `-t, --theme` | `light` | `light` 或 `dark` |
| `-p, --page-numbers` | 否 | 頁尾顯示「頁碼 / 總頁數」 |
| `--no-sandbox` | 否 | 停用 Chrome sandbox，見下方說明 |

`--width` 是「依照網頁排版」的關鍵：預設 830px 約等於 GitHub README 的內容寬度，所以換行位置、表格與圖片的比例都會和網頁上看到的一樣。

在程式中使用：

```js
import { convertFile } from 'md2pdf/src/pdf.mjs';
await convertFile('README.md', 'README.pdf', { format: 'A4', pageNumbers: true });
```

分頁：在 Markdown 中插入 `<div style="break-after: page"></div>` 可強制換頁。

## Ubuntu 23.10+ 無法啟動 Chrome

錯誤訊息若出現 `No usable sandbox!`，是 AppArmor 限制了非特權 user namespace。擇一處理：

1. **建議**：為 Chrome 加上 AppArmor 設定檔（需要 sudo），參考
   <https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md>
2. 加上 `--no-sandbox`（或設定環境變數 `MD2PDF_NO_SANDBOX=1`）。只在轉換自己信任的 Markdown 時使用，因為 `.md` 裡可以夾帶 HTML。

## 開發

```bash
npm test                         # 單元測試 + 實際產生 PDF 的整合測試
MD2PDF_NO_SANDBOX=1 npm test     # Ubuntu 23.10+ 未設定 AppArmor 時
```
