/* ---------------------------------------------
 * 設定
 * -------------------------------------------*/
const CSV_FILES = Array.from({ length: 23 }, (_, i) =>
  `data/2025-04-${String(i + 8).padStart(2, "0")}_com.csv`
);

/* ---------------------------------------------
 * ユーティリティ
 * -------------------------------------------*/
function fetchCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      download: true,
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: ({ data, errors }) => {
        if (errors.length) console.warn(file, errors);
        resolve(data);
      },
      error: (err) => reject(err)
    });
  });
}

function mode(arr) {
  if (!arr.length) return null;
  const count = {};
  arr.forEach((v) => (count[v] = (count[v] || 0) + 1));
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
}

/* ★ 追加: HH:MM → 分数へ変換 */
const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/* ---------------------------------------------
 * メイン処理
 * -------------------------------------------*/
document
  .getElementById("search-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    /* 入力取得 */
    const hour = parseInt(document.getElementById("hour").value, 10);
    const minute = parseInt(document.getElementById("minute").value, 10);
    const weekday = parseInt(document.getElementById("weekday").value, 10);

    /* ★ submitted_at を HH:MM 文字列で保持 */
    const submitted_at = `${String(hour).padStart(2, "0")}:${String(minute).padStart(
      2,
      "0"
    )}`;

    const status = document.getElementById("status");
    status.textContent = "CSV 読み込み中…";
    status.className = "";

    try {
      /* ファイル読み込み */
      const allRows = (await Promise.all(CSV_FILES.map(fetchCsv))).flat();

      /* hour + minute でマッチ */
      const hits = allRows.filter(
        (r) => r.hour === hour && r.minute === minute && r.曜日 === weakday
      );

      if (!hits.length) {
        status.textContent = "該当データがありませんでした。";
        status.className = "error";
        document.getElementById("est-waiting-time").textContent = "—";
        document.getElementById("est-board-time").textContent = "—";
        return;
      }

      /* 推定乗車時刻 (最頻値) */
      const boardTimes = hits.map(
        (r) =>
          `${String(r.board_hour).padStart(2, "0")}:${String(
            r.board_minute
          ).padStart(2, "0")}`
      );
      const estBoardTime = mode(boardTimes);

      /* ★ 差分計算 */
      const submittedMin = toMinutes(submitted_at);
      const boardMin = toMinutes(estBoardTime);
      let diff = boardMin - submittedMin;
      if (diff < 0) diff += 24 * 60; // 日跨ぎ対応

      /* 画面反映 */
      document.getElementById("est-waiting-time").textContent = diff;
      document.getElementById("est-board-time").textContent = boardTimes;
      status.textContent = `一致した行数: ${hits.length}`;
    } catch (err) {
      console.error(err);
      status.textContent = "読み込み中にエラーが発生しました。";
      status.className = "error";
    }
  });
