# md2pdf

將 Markdown（`.md`）依照**網頁上（GitHub）顯示的排版**，完整轉換成 PDF。紙張預設 A4，也可以改選其他尺寸。

有兩種用法，排版規則相同（共用 `src/markdown.mjs`）：

| | 網頁版 | 指令列（CLI） |
|---|---|---|
| 適用 | **Windows、Android**、macOS、Linux（任何現代瀏覽器） | Windows、macOS、Linux（需要 Node.js） |
| 開啟 | <https://yunyanliu261.github.io/md2pdf/> | `md2pdf 檔案.md` |
| 批次轉整個資料夾 | — | ✅ |
| PDF 文字可選取、搜尋 | 用「列印 → 另存為 PDF」時可以 | ✅ |

兩種用法都只在你的裝置上處理，**文件內容不會上傳**（只有文件裡引用的遠端圖片會被下載）。

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
| PDF | 依標題產生書籤（目錄）、可選深色主題；CLI 可加頁碼 |
| 中文 | 使用系統字型（Windows 的微軟正黑體、Android 的 Noto Sans CJK 都可以） |

## 網頁版（Windows / Android）

1. 開啟 <https://yunyanliu261.github.io/md2pdf/>。
   - Android Chrome：選單 →「加到主畫面」／「安裝應用程式」，之後可離線使用。
   - Windows Chrome / Edge：網址列右側的「安裝」圖示。安裝後，瀏覽器支援的話可以在檔案總管把 md2pdf 設為 `.md` 的開啟方式（此功能未經實機驗證）。
2. 按 **開啟檔案** 選擇 `.md`。文件裡有相對路徑的圖片時，**同時選取那些圖片**（Windows 也可以直接把檔案拖進視窗）。也可以在「編輯」裡直接貼上 Markdown。
3. 在 **輸出設定** 選紙張（預設 A4）、方向、邊距、網頁寬度、主題。
4. 輸出：
   - **輸出 PDF 檔案**：直接產生 PDF 並存檔，不經過列印對話框。
     - 「每次詢問儲存位置」：Windows 的 Chrome / Edge 會跳出存檔視窗讓你選位置。
     - 「直接存到下載資料夾」：存到瀏覽器的下載位置；Android 一律存到「下載」（Download）資料夾。
     - 這種 PDF 的每一頁是高解析度影像（桌面 300 dpi、Android 200 dpi），連結與書籤可以點，但**文字無法選取或搜尋**。
   - **列印**：開啟系統列印，可以接印表機，或選「另存為 PDF」得到**文字可選取**的 PDF。
     - Android 的列印對話框有自己的紙張選項，若預設不是 A4，請在對話框中改成 A4。

網頁版的設定和最後一份草稿會記在瀏覽器裡（localStorage），下次開啟會還原。

## 指令列（CLI）

### 安裝

需要 Node.js 20 以上。

```bash
git clone https://github.com/yunyanliu261/md2pdf.git
cd md2pdf
npm install
npm run install-browser   # 下載 puppeteer 用的無頭 Chrome（約 200MB，放在使用者目錄的 .cache/puppeteer）
npm link                  # 選用：讓 md2pdf 成為全域指令
```

Windows：在 PowerShell 或「命令提示字元」執行同樣的指令即可，不需要 `--no-sandbox`。

### 使用

```bash
md2pdf README.md                      # 輸出 README.pdf（同資料夾，A4）
md2pdf README.md -o out/readme.pdf    # 指定輸出檔
md2pdf docs/ -o pdf/                  # 遞迴轉換整個資料夾，保留目錄結構
md2pdf a.md b.md -f Letter -p -t dark # 多個檔案、Letter 紙張、加頁碼、深色主題
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
| `--no-sandbox` | 否 | 停用 Chrome sandbox，見下方說明（只有 Linux 需要） |

`--width`（網頁版的「網頁寬度」）是「依照網頁排版」的關鍵：預設 830px 約等於 GitHub README 的內容寬度，所以換行位置、表格與圖片的比例都會和網頁上看到的一樣。

在程式中使用：

```js
import { convertFile } from 'md2pdf/src/pdf.mjs';
await convertFile('README.md', 'README.pdf', { format: 'A4', pageNumbers: true });
```

強制換頁：在 Markdown 中插入 `<div style="break-after: page"></div>`（CLI 與網頁版的「列印」有效；「輸出 PDF 檔案」會自動找段落之間分頁）。

### Ubuntu 23.10+ 無法啟動 Chrome

錯誤訊息若出現 `No usable sandbox!`，是 AppArmor 限制了非特權 user namespace。擇一處理：

1. **建議**：為 Chrome 加上 AppArmor 設定檔（需要 sudo），參考
   <https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md>
2. 加上 `--no-sandbox`（或設定環境變數 `MD2PDF_NO_SANDBOX=1`）。只在轉換自己信任的 Markdown 時使用，因為 `.md` 裡可以夾帶 HTML。

## 開發

```bash
npm run dev:web                  # 打包網頁版並在 http://localhost:8080 執行
npm run build:web                # 只打包到 dist/
npm test                         # 打包網頁版 + 全部測試（CLI、網頁版、分頁演算法）
MD2PDF_NO_SANDBOX=1 npm test     # Ubuntu 23.10+ 未設定 AppArmor 時
```

| 路徑 | 內容 |
|---|---|
| `src/markdown.mjs` | 共用的 Markdown → HTML 規則與紙張計算（瀏覽器與 Node 都可用） |
| `src/render.mjs`、`src/pdf.mjs`、`bin/` | CLI：組成 HTML，交給無頭 Chrome 輸出 PDF |
| `web/` | 網頁版：介面、`export.mjs`（直接產生 PDF）、`paginate.mjs`（分頁演算法） |
| `scripts/` | 網頁版打包與本機伺服器 |
| `.github/workflows/` | CI（Ubuntu + Windows）與 GitHub Pages 部署 |
