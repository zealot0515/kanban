# Task customizations override

這是一份可重新套用的原始碼 patch，目前已套用在此工作目錄。客製程式碼與 patch 可一起保存在獨立 Git branch，也可將 patch 套用到其他官方 checkout。

## 使用功能

- 建立任務時用既有 Agent 選單選 Codex／Claude；`CLI model` 可留白使用 CLI 預設，或填入 CLI 支援的模型 ID。
- 開啟 `Use extra environment variables` 後新增名稱與值；關閉後保留設定但不注入。值直接傳入子程序，無需 shell 引號，亦不展開 `$VAR`。同名值覆蓋 Kanban 繼承的環境，僅作用於該 CLI 與它的子程序。Kanban 的 hook／terminal 內部變數仍由程式管理。
- 環境變數與模型可在 Backlog 任務的編輯表單修改，下次啟動生效；自動重啟與從 Done 還原時也會帶入。原生 Cline SDK 不使用 CLI 環境變數設定。
- 環境變數會以**未加密文字**儲存在任務資料中；密碼欄只隱藏畫面顯示。不要把含機密的任務資料分享出去。
- 每一欄的卡片都可用鉛筆改名、標籤按鈕新增／移除 label。改名不改 prompt。
- 卡片模型優先顯示執行階段回報（Codex `turn_context`、Claude 主 session 的 assistant transcript），其次顯示啟動時指定的模型。CLI 尚未回報預設模型時顯示 `CLI default (not reported)`。更換 CLI 內模型後，下一次相關記錄／hook 回報會更新；顯示不保證涵蓋 CLI 自己啟動的子代理模型。

## 執行這份修改

```sh
npm ci
npm --prefix web-ui ci
npm run build
node dist/cli.js
```

從這份 checkout 啟動，才能使用此修改。官方全域安裝的套件不會自動使用這裡的原始碼。

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
