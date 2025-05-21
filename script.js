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
      error: err => reject(err)
    });
  });
}

function average(nums) {
  if (!nums.length) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function mode(arr) {
  if (!arr.length) return null;
  const count = {};
  arr.forEach(v => { count[v] = (count[v] || 0) + 1; });
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
}

/* ---------------------------------------------
 * メイン処理
 * -------------------------------------------*/
document.getElementById('search-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  /* 入力取得 */
  const hour   = parseInt(document.getElementById('hour').value, 10);
  const minute = parseInt(document.getElementById('minute').value, 10);

  const status = document.getElementById('status');
  status.textContent = 'CSV 読み込み中…';
  status.className = '';

  try {
    /* 全ファイルを並列取得 → 1 つのリストへ連結 */
    const allRows = (await Promise.all(CSV_FILES.map(fetchCsv))).flat();

    /* 条件一致行を抽出（hour + minute だけでマッチ）*/
    const hits = allRows.filter(r => r.hour === hour && r.minute === minute);

    if (!hits.length) {
      status.textContent = '該当データがありませんでした。';
      status.className = 'error';
      document.getElementById('est-waiting-time').textContent = '—';
      document.getElementById('est-board-time').textContent   = '—';
      return;
    }

    /* ① 推定待ち時間 */
    const estWaitingTime = average(hits.map(r => r.time_to_board_min));
    document.getElementById('est-waiting-time').textContent =
      estWaitingTime !== null ? estWaitingTime.toFixed(1) : '—';

    /* ② 乗車時刻最頻値 */
    const boardTimes = hits.map(r => `${String(r.board_hour).padStart(2,'0')}:${String(r.board_minute).padStart(2,'0')}`);
    const estBoardTime = mode(boardTimes);
    document.getElementById('est-board-time').textContent = estBoardTime ?? '—';

    status.textContent = `一致した行数: ${hits.length}`;
  } catch (err) {
    console.error(err);
    status.textContent = '読み込み中にエラーが発生しました。';
    status.className = 'error';
  }
});
