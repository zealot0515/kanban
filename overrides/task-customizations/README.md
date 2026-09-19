# Task customizations override

這是一份可重新套用的原始碼 patch，目前已套用在此工作目錄。客製程式碼與 patch 可一起保存在獨立 Git branch，也可將 patch 套用到其他官方 checkout。

## 使用功能

- 建立任務時用既有 Agent 選單選 Codex／Claude；`CLI model` 可留白使用 CLI 預設，或填入 CLI 支援的模型 ID。
- 開啟 `Use extra environment variables` 後新增名稱與值；關閉後保留設定但不注入。值直接傳入子程序，無需 shell 引號，亦不展開 `$VAR`。同名值覆蓋 Kanban 繼承的環境，僅作用於該 CLI 與它的子程序。Kanban 的 hook／terminal 內部變數仍由程式管理。
- 環境變數與模型可在 Backlog 任務的編輯表單修改，下次啟動生效；自動重啟與從 Done 還原時也會帶入。原生 Cline SDK 不使用 CLI 環境變數設定。
- 環境變數會以**未加密文字**儲存在任務資料中；密碼欄只隱藏畫面顯示。不要把含機密的任務資料分享出去。
- Settings 的 **Launch profiles** 可預先保存環境變數與 CLI 參數；值使用 AES-256-GCM 加密，macOS 優先把金鑰放在 Keychain，設定頁與 task 表單只顯示變數是否已設定，不回傳 secret。啟動 task 時 profile 變數先套用，task 變數後套用，因此 task 可以覆蓋 profile。
- CLI 參數可以在 profile 或 task 的 Additional CLI arguments 中逐行輸入，例如 Codex 的 `-c` 與 `model_context_window=100000`；程式會以 argv 傳入，不經 shell 展開。
- 新增 task 時若 prompt 留白直接按 **Start**，會建立 **New task** 卡片與自己的 worktree，並直接開啟 task 詳細頁的 Codex／Claude CLI；不送出 prompt、附件或 `/plan` 指令，可先用 `/model` 調整模型再開始對話。卡片可重新命名，profile、環境變數與 CLI 參數照常套用；重新整理後仍會保留卡片。輸入 prompt 時維持原本 Start／Start and open 的流程。
- 每一欄的卡片都可用鉛筆改名、標籤按鈕新增／移除 label。改名不改 prompt。
- 卡片模型優先顯示執行階段回報（Codex `turn_context`、Claude 主 session 的 assistant transcript），其次顯示啟動時指定的模型。CLI 尚未回報預設模型時顯示 `CLI default (not reported)`。更換 CLI 內模型後，下一次相關記錄／hook 回報會更新；顯示不保證涵蓋 CLI 自己啟動的子代理模型。

## 執行這份修改

```sh
npm ci
npm --prefix web-ui ci
npm run build
KANBAN_NO_AUTO_UPDATE=1 node dist/cli.js --skip-shutdown-cleanup
```

從這份 checkout 啟動，才能使用此修改。官方全域安裝的套件不會自動使用這裡的原始碼。

若要直接跑目前 checkout 的開發版本（runtime 與 web UI 會一起啟動），執行：

```sh
./overrides/task-customizations/run-dev.sh
```

腳本會在缺少依賴時執行 `npm ci`，停用自動更新，讓 `dev-full` 自動選擇可用的 runtime／Vite port 並開啟瀏覽器。按 `Ctrl-C` 會同時停止兩個開發程序；依賴已安裝時可用 `--skip-install`。其他參數會傳給開發 server，例如 `--no-open` 或 `--with-shutdown-cleanup`。若官方版 Kanban 正在使用預設 port，開發 server 會自動選下一個可用 port。

腳本以 `node scripts/dev-full.mjs` 直接啟動，保留 Terminal 的 PATH，讓 Kanban 使用你安裝的 Codex／Claude。不要改回 `npm run dev:full`：npm 會把 `node_modules/.bin` 放到 PATH 最前面，而 Cline SDK 的間接依賴包含另一份 Codex，可能蓋過 Homebrew 安裝的版本。若遇到 macOS 封鎖 `codex`，先確認系統記錄指出的執行檔路徑；更新此腳本後，請在原本的 Terminal 用 `Ctrl-C` 停止舊 dev server，再重新執行。

## 打包 macOS 安裝包

在 Mac 上安裝 Node.js 22+、npm、Git 及 Xcode Command Line Tools（`xcode-select --install`），然後執行：

```sh
# 預設產生與目前 Mac 相同架構的 DMG
./overrides/task-customizations/build-release.sh

# 指定 Apple Silicon、Intel，或兩種各產生一個 DMG
./overrides/task-customizations/build-release.sh --arch arm64
./overrides/task-customizations/build-release.sh --arch x64
./overrides/task-customizations/build-release.sh --arch all

# lockfile 沒變、依賴已安裝時可省略 npm ci
./overrides/task-customizations/build-release.sh --skip-install
```

腳本可從任意目錄執行，會以這份 checkout **當下的程式碼（包含未 commit 修改）**重新建置 runtime、web UI 和 Electron shell。預設使用三份 lockfile 安裝依賴、執行三部分 typecheck 與桌面測試；版本帶有 Git commit，工作目錄有變更時加 `.dirty`。首次執行需要網路下載依賴與 Electron。

輸出位於 `packages/desktop/out/custom/<版本>/`，包含 `Kanban-Custom-<版本>-arm64.dmg`／`-x64.dmg` 與 `SHA256SUMS`。腳本只建立本地檔案，不發布 GitHub Release、不啟動 Kanban、不 commit，也不改 package／lockfile。可在輸出目錄執行 `shasum -a 256 -c SHA256SUMS` 驗證。

將 DMG 複製到對應晶片的 Mac（目前 Electron 41 需要 macOS 12 以上），開啟後把 **Kanban Custom.app** 拖進 Applications。Kanban 自帶執行所需的 Node／Electron，但使用 Codex／Claude 的 Mac 仍需安裝並登入對應 CLI，也需要 Git。安裝包不含這台 Mac 的任務資料、CLI 帳號或任務環境變數。

目前為 **ad-hoc 簽署，未經 Apple 公證**的個人安裝包；若 macOS 阻擋首次開啟，先嘗試開啟 App，再到「系統設定 → 隱私權與安全性 → 強制打開」。正式對外發佈、免除這個步驟需要另設 Developer ID 簽署與公證。

客製 App 停用官方自動更新，關閉時不自動將任務移到 Done 或刪除工作樹。它仍使用既有的 Kanban 資料位置與 port 3484，請先關閉官方版，再開啟客製版，避免連到已在執行的官方 runtime。這組打包設定全部放在 override 目錄；官方更新後，保留此目錄並重套下方的原始碼 patch，即可再次打包。

## 官方更新後重新套用

先備份整個 `overrides/task-customizations/` 目錄到 checkout 外。不要在尚未重套 override 時啟動官方版讀寫任務資料：官方 schema 不認得新欄位，儲存時可能移除它們。也請先備份原有 Kanban 任務資料。

如需在目前 checkout 更新，先停止 Kanban，再移除此 patch：

```sh
node overrides/task-customizations/override.mjs remove
```

接著依平常方式更新官方程式碼（或建立乾淨的官方 checkout，再放回備份的 override 目錄）。更新後執行：

```sh
node overrides/task-customizations/override.mjs check
node overrides/task-customizations/override.mjs apply
npm ci
npm --prefix web-ui ci
npm run typecheck
npm run web:typecheck
npm run build
```

`apply` 可重複執行。它先檢查整份 patch，有衝突會停止，不會強制覆寫或留下半套修改。官方改動同一段程式時，仍需要人工合併；任何原始碼 override 都無法保證未來所有版本零衝突。`manifest.json` 記錄製作 patch 的官方 commit 及精確檔案清單。

若另外修改本功能，或手動完成新版合併，可在「HEAD 是新版官方基準、工作目錄是客製修改」時執行：

```sh
node overrides/task-customizations/override.mjs export
```

此命令只打包 manifest 指定的檔案，不會 commit、stage 或收集任務環境變數。新增檔案時先更新 manifest 清單。若已把客製內容 commit 到 HEAD，必須改用尚未含客製內容的官方基準 checkout 產生 patch。

可設定 `KANBAN_OVERRIDE_ROOT=/path/to/checkout`，將同一份 bundle 套用到其他 checkout；工具不會自動更新、發布或重啟應用程式。
