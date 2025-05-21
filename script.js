document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const datePicker = document.getElementById('date-picker');
    const aggregationAvg = document.getElementById('data-avg');
    const aggregationRecent = document.getElementById('data-recent');
    const modeFit = document.getElementById('mode-fit');
    const modeAvg = document.getElementById('mode-avg');
    const usePrevWaitTimeCheckbox = document.getElementById('use-prev-wait-time');
    const prevDeficitMThresholdInput = document.getElementById('prev-deficit-m-threshold');
    const showQueueLengthCheckbox = document.getElementById('show-queue-length');
    const showBusDetailsCheckbox = document.getElementById('show-bus-details');
    const intervalButtons = document.querySelectorAll('.interval-btn');
    const timeInput = document.getElementById('time-input');
    const reflectSettingsButton = document.getElementById('reflect-settings');
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorMessageDiv = document.getElementById('error-message');
    const resultsContainer = document.getElementById('results-container');

    // Constants and Config
    const DATA_PATH = 'data/'; // Assumes CSVs are in a 'data' folder
    const OPEN_METEO_API_URL = 'https://api.open-meteo.com/v1/forecast';
    const LATITUDE = 35.4437;
    const LONGITUDE = 139.6380;
    const WEATHER_CODE_MAP = {
        0: "晴れ", 1: "主に晴れ", 2: "曇りがち", 3: "曇り",
        45: "霧", 48: "霧（霧氷あり）",
        51: "小雨", 53: "中程度の霧雨", 55: "強い霧雨",
        56: "凍える霧雨（弱）", 57: "凍える霧雨（強）",
        61: "小雨", 63: "中程度の雨", 65: "強い雨",
        66: "凍える雨（弱）", 67: "凍える雨（強）",
        71: "小雪", 73: "中程度の雪", 75: "強い雪",
        77: "霧雪",
        80: "にわか雨", 81: "激しいにわか雨", 82: "非常に激しいにわか雨",
        85: "にわか雪（弱）", 86: "にわか雪（強）",
        95: "雷雨", 96: "雷雨（弱雹）", 99: "雷雨（強雹）" // Added some common ones
    };
    let currentDisplayInterval = 0; // 0 for specific time search, otherwise 5, 10, 30, 60

    // --- Initialization ---
    function initialize() {
        const today = new Date();
        datePicker.value = today.toISOString().split('T')[0];
        // Set default interval button state (e.g., specific time)
        setActiveIntervalButton(document.querySelector('.interval-btn[data-interval="0"]'));
        reflectSettingsButton.addEventListener('click', loadAndProcessData);
        intervalButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                currentDisplayInterval = parseInt(e.target.dataset.interval);
                setActiveIntervalButton(e.target);
                if (currentDisplayInterval !== 0) { // If interval selected, clear specific time
                    timeInput.value = "";
                }
                loadAndProcessData(); // Or maybe just process if data is already loaded for the day
            });
        });
        datePicker.addEventListener('change', loadAndProcessData);
        timeInput.addEventListener('input', () => { // When user types in time, switch to specific time search
            currentDisplayInterval = 0;
            setActiveIntervalButton(document.querySelector('.interval-btn[data-interval="0"]'));
        });
        loadAndProcessData(); // Initial load for today
    }

    function setActiveIntervalButton(activeButton) {
        intervalButtons.forEach(btn => btn.classList.remove('active'));
        if (activeButton) {
            activeButton.classList.add('active');
        }
    }

    // --- Data Fetching and Processing ---
    async function loadAndProcessData() {
        showLoading(true);
        showError(null);
        resultsContainer.innerHTML = ''; // Clear previous results

        const selectedDate = new Date(datePicker.value + "T00:00:00"); // Ensure it's local midnight
        const yyyymmdd = selectedDate.toISOString().split('T')[0];
        const dayOfWeekJST = getDayOfWeekJapanese(selectedDate);
        const selectedMode = modeFit.checked ? 'fit' : 'avg';
        const csvFileName = `${yyyymmdd}_${selectedMode === 'fit' ? 'com2' : 'com'}.csv`;
        
        try {
            // 1. Fetch Weather Data (only for today/future, or always if preferred)
            let currentWeatherData = null;
            const today = new Date();
            today.setHours(0,0,0,0);
            selectedDate.setHours(0,0,0,0);

            // Fetch API weather if selected date is today or in the future
            // For past dates, we will rely on CSV weather
            if (selectedDate >= today) {
                 currentWeatherData = await fetchWeatherData(yyyymmdd);
            }

            // 2. Fetch CSV Data
            const csvData = await fetchCSVData(`${DATA_PATH}${csvFileName}`);
            if (!csvData || csvData.length === 0) {
                showError(`データファイル ${csvFileName} が見つからないか、空です。`);
                showLoading(false);
                return;
            }
            
            // 3. Process and Display
            processAndDisplay(csvData, dayOfWeekJST, currentWeatherData, selectedDate);

        } catch (error) {
            console.error("Error loading data:", error);
            showError(`データの読み込み中にエラーが発生しました: ${error.message}`);
        } finally {
            showLoading(false);
        }
    }

    async function fetchWeatherData(dateString) { // dateString as YYYY-MM-DD
        const url = `${OPEN_METEO_API_URL}?latitude=${LATITUDE}&longitude=${LONGITUDE}&hourly=weather_code&start_date=${dateString}&end_date=${dateString}&timezone=Asia%2FTokyo`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`天気APIエラー: ${response.statusText}`);
            }
            const data = await response.json();
            return data.hourly; // Contains weather_code array and time array
        } catch (error) {
            console.warn("天気情報の取得に失敗:", error);
            showError("天気情報の取得に失敗しました。CSVの天気情報を使用します。", true); // Non-fatal error
            return null;
        }
    }

    function getWeatherForHour(apiWeatherData, hour) {
        if (!apiWeatherData || !apiWeatherData.time || !apiWeatherData.weather_code) {
            return null;
        }
        // API time is like "2025-04-08T10:00"
        const targetApiTime = `${datePicker.value}T${String(hour).padStart(2, '0')}:00`;
        const timeIndex = apiWeatherData.time.indexOf(targetApiTime);

        if (timeIndex !== -1) {
            const weatherCode = apiWeatherData.weather_code[timeIndex];
            return WEATHER_CODE_MAP[weatherCode] || `コード ${weatherCode}`;
        }
        return null;
    }


    function fetchCSVData(filePath) {
        return new Promise((resolve, reject) => {
            Papa.parse(filePath, {
                download: true,
                header: true,
                skipEmptyLines: true,
                dynamicTyping: true, // Automatically convert numbers, booleans
                complete: (results) => {
                    if (results.errors.length > 0) {
                        console.error("CSV parsing errors:", results.errors);
                        // Try to resolve with data anyway if some rows are valid
                        // reject(new Error(`CSV解析エラー: ${results.errors[0].message}`));
                    }
                    resolve(results.data);
                },
                error: (error) => {
                    reject(new Error(`CSV読み込みエラー: ${error.message}`));
                }
            });
        });
    }

    function processAndDisplay(allCsvData, targetDayOfWeek, apiWeatherData, selectedFullDate) {
        const aggregationMethod = aggregationAvg.checked ? 'average' : 'recent';
        const deficitThreshold = parseFloat(prevDeficitMThresholdInput.value);
        const usePrevWait = usePrevWaitTimeCheckbox.checked;
        const showQueue = showQueueLengthCheckbox.checked;
        const showBusInfo = showBusDetailsCheckbox.checked;

        let filteredDataPoints = [];
        const today = new Date();
        today.setHours(0,0,0,0);
        const isQueryingPastDate = selectedFullDate < today;


        if (currentDisplayInterval > 0) { // Interval display
            for (let hour = 0; hour < 24; hour++) {
                for (let minute = 0; minute < 60; minute += currentDisplayInterval) {
                    const searchTime = { hour, minute, second: 0 };
                    const matchedRows = findMatchingRows(allCsvData, targetDayOfWeek, searchTime);
                    if (matchedRows.length > 0) {
                        const processedPoint = processSingleTimePoint(matchedRows, aggregationMethod);
                        if (processedPoint) filteredDataPoints.push(processedPoint);
                    }
                }
            }
        } else { // Specific time search (from timeInput)
            if (timeInput.value) {
                const [hourStr, minuteStr, secondStr] = timeInput.value.split(':');
                const searchHour = parseInt(hourStr);
                const searchMinute = parseInt(minuteStr);
                const searchSecond = parseInt(secondStr);

                if (!isNaN(searchHour) && !isNaN(searchMinute)) {
                     const searchTime = { hour: searchHour, minute: searchMinute, second: searchSecond};
                     const matchedRows = findMatchingRows(allCsvData, targetDayOfWeek, searchTime);
                     if (matchedRows.length > 0) {
                        const processedPoint = processSingleTimePoint(matchedRows, aggregationMethod);
                        if (processedPoint) filteredDataPoints.push(processedPoint);
                    } else {
                        showError(`指定時刻 ${String(searchHour).padStart(2,'0')}:${String(searchMinute).padStart(2,'0')} のデータは見つかりませんでした。`);
                    }
                }
            } else {
                 showError("時刻が指定されていません。", true); // Non-fatal, just an info
            }
        }
        
        if (filteredDataPoints.length === 0 && !errorMessageDiv.textContent.includes("データは見つかりませんでした") && !errorMessageDiv.textContent.includes("時刻が指定されていません")) {
             showError("表示できるデータがありません。");
        }


        // Render the boxes
        filteredDataPoints.forEach(point => {
            let waitTime = point.times_to_board_min;
            if (usePrevWait && point.prev_deficit_m <= deficitThreshold) {
                waitTime = point.prev_wait_min;
            }

            // Determine weather string
            let weatherDisplay = point.weather; // From CSV by default
            if (!isQueryingPastDate && apiWeatherData) { // Use API for today/future
                const apiWeather = getWeatherForHour(apiWeatherData, point.hour);
                if (apiWeather) weatherDisplay = apiWeather;
            }


            const box = document.createElement('div');
            box.classList.add('result-box');
            let busDetailsHTML = '';
            if (showBusInfo && point.bus_count > 0) {
                busDetailsHTML = `<p class="detail-item"><strong>乗車までに来たバス (${point.bus_count}台):</strong> `;
                let kinds = [];
                for (let i = 1; i <= point.bus_count; i++) {
                    if (point[`bus${i}_kind`]) kinds.push(point[`bus${i}_kind`]);
                }
                busDetailsHTML += kinds.join(', ') || '情報なし';
                busDetailsHTML += `</p>`;
            }

            box.innerHTML = `
                <h3>${String(point.hour).padStart(2, '0')}:${String(point.minute).padStart(2, '0')} 発</h3>
                <p class="wait-time">待ち時間: 約 ${waitTime !== null && !isNaN(waitTime) ? Math.round(waitTime) : 'N/A'} 分</p>
                <p class="detail-item"><strong>天気:</strong> ${weatherDisplay || '情報なし'}</p>
                ${showQueue ? `<p class="detail-item"><strong>現在のバス列:</strong> ${point.seg_vals !== null && !isNaN(point.seg_vals) ? point.seg_vals : 'N/A'} m</p>` : ''}
                ${busDetailsHTML}
                ${(usePrevWait && point.prev_deficit_m <= deficitThreshold) ? `<p class="meta-info"><em>先行バス状況により prev_wait_min (${Math.round(point.prev_wait_min)}分) を表示中</em></p>` : ''}
                <p class="meta-info"><sub>データ時刻: ${String(point.hour).padStart(2, '0')}:${String(point.minute).padStart(2, '0')}:${String(point.second).padStart(2, '0')}</sub></p>
            `;
            resultsContainer.appendChild(box);
        });
    }

    function findMatchingRows(csvData, targetDayOfWeek, targetTime) {
        // targetTime = { hour, minute, second (initial search starts at 0) }
        let matchedRows = [];

        for (let sec = targetTime.second; sec < 60; sec++) {
            const currentSearchTime = { ...targetTime, second: sec };
            const rowsThisSecond = csvData.filter(row => {
                return row['曜日'] === targetDayOfWeek &&
                       row.hour === currentSearchTime.hour &&
                       row.minute === currentSearchTime.minute &&
                       row.second === currentSearchTime.second;
            });
            if (rowsThisSecond.length > 0) {
                matchedRows.push(...rowsThisSecond);
                // If "recent" is chosen, we might stop after first find, or collect all for averaging.
                // For now, collect all within the minute for the specified second.
                // If we want strictly the first second that has data:
                // if (aggregationMethod === 'recent' && matchedRows.length > 0) break; 
                break; // Found data for this HH:MM at second `sec`, so stop searching further seconds.
            }
        }
        return matchedRows;
    }

    function processSingleTimePoint(rows, aggregationMethod) {
        if (rows.length === 0) return null;

        if (aggregationMethod === 'average' && rows.length > 1) {
            const avgPoint = {
                hour: rows[0].hour, // Times should be same for this group
                minute: rows[0].minute,
                second: rows[0].second, // Or avg of seconds? For now, first row's sec
                weather: rows[0].weather, // Assuming weather is consistent for this exact time
                times_to_board_min: rows.reduce((sum, r) => sum + (r.times_to_board_min || 0), 0) / rows.length,
                prev_deficit_m: rows.reduce((sum, r) => sum + (r.prev_deficit_m || 0), 0) / rows.length,
                prev_wait_min: rows.reduce((sum, r) => sum + (r.prev_wait_min || 0), 0) / rows.length,
                seg_vals: rows.reduce((sum, r) => sum + (r.seg_vals || 0), 0) / rows.length,
                bus_count: rows.reduce((sum, r) => sum + (r.bus_count || 0), 0) / rows.length, // Avg bus count might be weird
                // bus_kind would be tricky to average, take first row's for simplicity
                bus1_kind: rows[0].bus1_kind, bus2_kind: rows[0].bus2_kind, bus3_kind: rows[0].bus3_kind, bus4_kind: rows[0].bus4_kind, bus5_kind: rows[0].bus5_kind,
            };
            // Round averages
            for (const key in avgPoint) {
                if (typeof avgPoint[key] === 'number' && key !== 'hour' && key !== 'minute' && key !== 'second' && key !== 'bus_count') {
                    avgPoint[key] = parseFloat(avgPoint[key].toFixed(2));
                }
            }
             avgPoint.bus_count = Math.round(avgPoint.bus_count);
            return avgPoint;

        } else { // 'recent' or only one row
            return rows[rows.length - 1]; // Take the last one if multiple, assuming sorted by time if not averaging
        }
    }


    // --- UI Helpers ---
    function showLoading(isLoading) {
        loadingIndicator.style.display = isLoading ? 'block' : 'none';
    }

    function showError(message, isWarning = false) {
        errorMessageDiv.innerHTML = ''; // Clear previous
        if (message) {
            errorMessageDiv.innerHTML = `<p>${message}</p>`;
            errorMessageDiv.style.display = 'block';
            errorMessageDiv.classList.toggle('error', !isWarning); // Red for error
            errorMessageDiv.classList.toggle('warning', isWarning); // Yellow/Orange for warning (add CSS for .warning)
        } else {
            errorMessageDiv.style.display = 'none';
        }
    }

    function getDayOfWeekJapanese(date) {
        const days = ["日", "月", "火", "水", "木", "金", "土"];
        return days[date.getDay()];
    }

    // --- Start the application ---
    initialize();
});
