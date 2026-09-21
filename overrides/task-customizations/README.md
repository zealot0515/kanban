# Task customizations override

這是一份可重新套用的原始碼 patch，目前已套用在此工作目錄。客製程式碼與 patch 可一起保存在獨立 Git branch，也可將 patch 套用到其他官方 checkout。

## 使用功能

- 建立任務時用既有 Agent 選單選 Codex／Claude；`CLI model` 可留白使用 CLI 預設，或填入 CLI 支援的模型 ID。
- 開啟 `Use extra environment variables` 後新增名稱與值；關閉後保留設定但不注入。值直接傳入子程序，無需 shell 引號，亦不展開 `$VAR`。同名值覆蓋 Kanban 繼承的環境，僅作用於該 CLI 與它的子程序。Kanban 的 hook／terminal 內部變數仍由程式管理。
- 環境變數與模型可在 Backlog 任務的編輯表單修改，下次啟動生效；自動重啟與從 Done 還原時也會帶入。原生 Cline SDK 不使用 CLI 環境變數設定。
- 環境變數會以**未加密文字**儲存在任務資料中；密碼欄只隱藏畫面顯示。不要把含機密的任務資料分享出去。
- Settings 的 **Launch profiles** 可預先保存環境變數與 CLI 參數；值使用 AES-256-GCM 加密，macOS 優先把金鑰放在 Keychain，設定頁與 task 表單只顯示變數是否已設定，不回傳 secret。啟動 task 時 profile 變數先套用，task 變數後套用，因此 task 可以覆蓋 profile。
- Profile 與 task 的 CLI arguments 欄位提供 **Command line** 與 **One argument per line** 兩種格式。Command line 可以直接貼 `-c 'model_provider="cliproxy"' -c 'model_context_window=272000'`，不要包含開頭的 `codex`。支援引號分組、跳脫與換行續接，保留 `$VAR` 原文，不執行 shell 指令。舊設定維持逐行格式，每個 `-c` 和它的值各佔一行；TOML 本身的雙引號不會被移除。畫面顯示解析後參數數量，未關閉引號會阻止儲存或建立 task。
- Codex profile 可選 **Custom provider / CLIProxy**，明確覆蓋 `model_provider`、API base URL 與 API key 變數。只設定 `OPENAI_API_KEY` 不會自動把本機 `openai` provider 切到 proxy；環境變數與 provider 設定是不同項目。
- 新增 task 時若 prompt 留白直接按 **Start**，會建立 **New task** 卡片與自己的 worktree，並直接開啟 task 詳細頁的 Codex／Claude CLI；不送出 prompt、附件或 `/plan` 指令，可先用 `/model` 調整模型再開始對話。主名稱會隨對話自動更新，profile、環境變數與 CLI 參數照常套用；重新整理後仍會保留卡片。輸入 prompt 時維持原本 Start／Start and open 的流程。
- 卡片主名稱會跟隨 Codex／Claude 主 session、Cline SDK 的進度與完整回覆更新：取第一句／行，最多 80 字，不額外呼叫 AI。空白 task 送出第一個有效 prompt 或收到 agent 訊息後就不再停在 **New task**；`/model` 和工具指令不會成為名稱。Claude 於後續 hook 讀取主 transcript 時更新，Codex 隨 rollout／hook 更新；其他 CLI 未提供文字事件時保留原名稱。
- 原本改名按鈕改為 **Add note / Edit note**。Note 是自己的註記，可多行、最多 2000 字，不改 prompt、不送給 agent，也不會被自動名稱覆蓋；建立／編輯任務也有 Note 欄。舊版手動改過、與初始 prompt 名稱不同的標題，會在首次自動更新時保留到尚未設定的 Note。
- 每一欄（含 In Progress、Review、Done）的卡片都可以隨時增刪 label；建立過的 label 會出現在其他卡片的快速選取清單，也可以輸入文字搜尋或新增。
- **Settings → Labels** 管理目前專案的共用 label，可新增、重新命名、刪除，立即儲存；重新命名／刪除會同步修改該專案所有卡片。從單張卡片移除 label 不會刪掉共用清單，即使已無卡片使用仍可再次選取。既有卡片上的 label 會自動加入清單。
- 看板上方 **Labels: All** 預設顯示所有卡片（包含無 label 的卡片）。選一個 label 即只顯示該 label，繼續選其他 label 則顯示符合任一選取項目的卡片；**Show all tasks** 恢復全部。篩選只影響顯示，不會刪除任務；篩選中的 **Start all** 只啟動顯示的卡片，清空 Done 功能在顯示全部時使用。
- 卡片模型優先顯示執行階段回報（Codex `turn_context`、Claude 主 session 的 assistant transcript），其次顯示啟動時指定的模型。CLI 尚未回報預設模型時顯示 `CLI default (not reported)`。更換 CLI 內模型後，下一次相關記錄／hook 回報會更新；顯示不保證涵蓋 CLI 自己啟動的子代理模型。
- Codex 狀態依主對話的原生 hook 更新：輸入新指示／執行工具回到 In Progress；完成回覆、等待手動核准／回答問題或中斷後進入 Review。依當前 turn 的 `approvals_reviewer` 區分自動審核，審核與執行長命令期間維持 In Progress。空白 Enter 或 `/model` 的閒置畫面重繪不會被當成執行新任務；只有待手動核准時，才保留 Enter 後恢復執行的偵測。完成訊息只讀取對應主 session／turn，排除 guardian 等內部代理，避免卡片出現 `risk_level` JSON。更新 desktop 後需完全退出舊 App，再以新版啟動／恢復 CLI session，才能套用新的 hooks。

### 設定 Codex 使用 CLIProxy

1. 在 **Settings → Launch profiles** 編輯既有 profile，Agent 選 **OpenAI Codex**（或 All agents）。
2. **Codex provider** 選 **Custom provider / CLIProxy**，Provider ID 填 `cliproxy`，API base URL 填你的 proxy 位址，例如 `http://127.0.0.1:8317/v1`。此欄直接填 URL，不使用 `$VAR`。
3. **API key variable name** 填 `OPENAI_API_KEY`，在下方環境變數中使用相同名稱保存 proxy 的 key。已保存的 key 留白即可保留，不用再貼一次。
4. 儲存後建立新 task，選用該 profile。Codex 的 `/status` 應顯示 `Model provider: cliproxy`。已在執行的 CLI 不會因修改 profile 立即換 provider。

啟動時以 Codex `-c` 參數指定 Responses API provider、`env_key` 與 `requires_openai_auth=false`，只透過環境變數傳入 key；不修改 `~/.codex/config.toml` 或 `auth.json`。缺少 profile/task 指定的 key 時會回報錯誤。自訂 provider 欄位會覆蓋本機預設；profile 的額外 CLI 參數可再覆蓋這些欄位，task 額外參數最後套用。若仍指定了 `model_provider="openai"` 等舊參數，請先移除。

舊 profile 會保留原行為；若要使用專用 provider 欄位，需明確選用 custom provider。Provider ID、URL 與 key 的變數名稱會顯示於設定頁，只有變數的值不回傳；不要把 key 放進 URL 或 CLI 參數。相關 Codex 設定見 [官方 provider 文件](https://developers.openai.com/codex/config-advanced#custom-model-providers)。

也可完全透過 CLI 參數設定 provider，不必使用上面的 custom provider 欄位。將 **CLI arguments format** 改成 **Command line**，清除舊內容，再貼上以下參數（URL 換成你的 proxy 位址）；應顯示 **8 arguments**：

```sh
-c 'model_provider="cliproxy"' -c 'model_providers.cliproxy={ name="CLIProxyAPI", base_url="https://proxy.example/v1", env_key="OPENAI_API_KEY", wire_api="responses", requires_openai_auth=false }' -c 'model_context_window=272000' -c 'model_auto_compact_token_limit=240000'
```

若看到 `unexpected argument 'model_providers...'`，代表設定字串沒有正確接到 `-c`；這通常是把 shell 指令格式貼進逐行欄位，或漏掉某個 `-c`。新版會在啟動前回報可修正的錯誤。舊的逐行參數不會被自動重新解讀，請切換格式後重新貼上原文。

## 執行這份修改

Desktop 終端中的 HTTP／HTTPS 連結（包含 CLI 輸出的 OSC 8 超連結）會直接交給系統預設瀏覽器。修正後需重新打包並安裝新版 App，既有安裝包不會自動套用原始碼變更。

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
