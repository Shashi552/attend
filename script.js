document.addEventListener('DOMContentLoaded', () => {
    // --- DOM References ---
    const allIDs = {
        clock: 'real-time-clock', dateInput: 'recordDate', courseCodeSelect: 'courseCode', sessionIDInput: 'sessionID', startTimeInput: 'startTime', 
        logDurationInput: 'logDuration', toggleBtn: 'toggleBtn', resultsContainer: 'results', resultsHeader: 'results-header', plainResultEl: 'plainResult',
        base64ResultEl: 'base64Result', copyBtn: 'copyBtn', qrcodeContainer: 'qrcode-container', progressBar: 'progress-bar', formFieldset: 'form-fieldset',
        manualFields: 'manual-entry-fields', manualCourseName: 'manualCourseName', manualCourseCode: 'manualCourseCode',
        scanBtn: 'scan-btn', cloneScanBtn: 'clone-scan-btn', scannerModal: 'scanner-modal', scannerTitle: 'scanner-title', closeScannerModalBtn: 'close-scanner-modal-btn', 
        startCameraBtn: 'start-camera-btn', uploadFileBtn: 'upload-file-btn', qrFileInput: 'qr-file-input', qrReaderContainer: 'qr-reader-container', 
        qrReaderDiv: 'qr-reader', cameraControls: 'camera-controls', torchBtn: 'torch-btn', zoomSlider: 'zoom-slider',
        scanResultContainer: 'scan-result-container', scanResultDisplay: 'scan-result-display',
        decodeBtn: 'decode-btn', decoderModal: 'decoder-modal', closeDecoderModalBtn: 'close-decoder-modal-btn',
        base64Input: 'base64-input', decodeStringBtn: 'decode-string-btn', decodeResultContainer: 'decode-result-container',
        decodeResultDisplay: 'decode-result-display', apiStatus: 'api-status', apiResponseContainer: 'api-response-container', 
        apiResponseDisplay: 'api-response-display'
    };
    const el = Object.entries(allIDs).reduce((acc, [key, id]) => ({ ...acc, [key]: document.getElementById(id) }), {});

    // --- State & Config ---
    let mainInterval = null; let torchOn = false; let timeOffset = 0;
    const html5QrCode = new Html5Qrcode("qr-reader");
    const DETAIL_LABELS = ["Subject Code", "Class Start", "Class End", "Session ID", "Date", "Log Start", "Log End"];
    const RETRY_TIMEOUT = 2 * 60 * 1000;
    const DIAGNOSTIC_THRESHOLD = 8;
    const timetable = {
        1: { '09:00': 'EECE1071', '10:00': 'MECH3121', '11:00': 'CSEN2091', '14:00': 'CSEN2091P', '15:00': 'CSEN2091P' },
        2: { '09:00': 'CSEN3321', '10:00': 'MECH3121', '14:00': 'EECE1071' },
        3: { '08:00': '24CSEN2371', '09:00': '24CSEN2371', '10:00': 'MECH3121', '14:00': 'CSEN3321', '15:00': 'EECE3121' },
        4: { '10:00': 'EECE3121', '13:00': 'CSEN2091', '14:00': 'EECE1071' },
        5: { '08:00': 'CSEN2091', '09:00': 'CSEN3321', '10:00': 'EECE3121', '11:00': 'INTN3444', '12:00': 'INTN3444' }
    };
    
    const pad = (num) => String(num).padStart(2, '0');
    function updateClock() { el.clock.textContent = new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

    async function postAttendance(base64data) {
        const url = 'http://shashank:3001/PostAttendance'; // Points to your local proxy
        el.apiResponseContainer.classList.remove('hidden');
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ "qrdata": base64data })
            });
            if (!response.ok) throw new Error(`Proxy server responded with status: ${response.status}`);
            const responseData = await response.json();
            el.apiResponseDisplay.textContent = JSON.stringify(responseData, null, 2);
            return responseData;
        } catch (error) {
            el.apiResponseDisplay.textContent = `Request to local proxy failed. Is your proxy server running?\n\nError: ${error.message}`;
            return { status: "proxy_error", message: "Failed to connect to local proxy" };
        }
    }

    function generateRecord({ cloneData = null, timeSyncOffset = 0 } = {}) {
        const isManual = el.courseCodeSelect.value === 'manual';
        const courseCode = isManual ? el.manualCourseCode.value : el.courseCodeSelect.value;
        const [startH, startM] = el.startTimeInput.value.split(':').map(Number);
        const startDate = new Date(); startDate.setHours(startH, startM, 0, 0);
        const endDate = new Date(startDate.getTime() + 50 * 60000);
        const endTime = `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
        const dateObj = new Date(el.dateInput.value + 'T00:00:00');
        const formattedDate = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
        
        let logInTime, logOutTime;
        if (cloneData) {
            logInTime = cloneData.logInTime; logOutTime = cloneData.logOutTime;
        } else {
            const now = new Date(new Date().getTime() + 1000 + timeSyncOffset);
            logInTime = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
            const logOutDate = new Date(now.getTime() + parseInt(el.logDurationInput.value, 10) * 1000);
            logOutTime = `${pad(logOutDate.getHours())}:${pad(logOutDate.getMinutes())}:${pad(logOutDate.getSeconds())}`;
        }
        const plainRecord = [courseCode, el.startTimeInput.value, endTime, el.sessionIDInput.value, formattedDate, logInTime, logOutTime].join('#');
        return btoa(plainRecord);
    }

    function updateUIAfterGeneration(base64Record) {
        el.plainResultEl.textContent = atob(base64Record);
        el.base64ResultEl.textContent = base64Record;
        el.qrcodeContainer.innerHTML = '';
        new QRCode(el.qrcodeContainer, { text: base64Record, width: 200, height: 200 });
        el.resultsContainer.classList.remove('hidden');
    }

    async function runTimeSyncDiagnostic() {
        el.apiStatus.textContent = 'Syncing Time...';
        for (let i = 1; i <= 5; i++) {
            const offset = (i % 2 === 0 ? i : -i) * 1000;
            const base64Record = generateRecord({ timeSyncOffset: offset });
            updateUIAfterGeneration(base64Record);
            const response = await postAttendance(base64Record);
            if (response && (response.message?.includes("already taken") || response.message?.includes("sent") || response.status === "success")) {
                timeOffset = offset; return true;
            }
        }
        return false;
    }

    async function runSubmissionCycle({ initialData = null } = {}) {
        if (!mainInterval && !initialData) return;
        let success = false;
        const retryStartTime = Date.now();
        let attempts = 0;
        let diagnosticDone = false;

        while (!success && (Date.now() - retryStartTime < RETRY_TIMEOUT) && (mainInterval || initialData)) {
            attempts++;
            el.apiStatus.textContent = `Submitting (Attempt ${attempts})...`;
            el.apiStatus.className = 'submitting';
            
            const base64Record = initialData ? generateRecord({ cloneData: initialData }) : generateRecord({ timeSyncOffset: timeOffset });
            updateUIAfterGeneration(base64Record);
            
            const response = await postAttendance(base64Record);
            
            if (response && (response.message?.includes("already taken") || response.message?.includes("sent") || response.status === "success")) {
                success = true;
                el.apiStatus.textContent = 'Success!';
                el.apiStatus.className = 'success';
            } else if (response && response.message?.includes("invalid / expired")) {
                if (attempts > DIAGNOSTIC_THRESHOLD && !diagnosticDone) {
                    diagnosticDone = true;
                    if (await runTimeSyncDiagnostic()) continue;
                    else break;
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            } else {
                break;
            }
            if (initialData) initialData = null;
        }

        if (!success) {
            el.apiStatus.textContent = 'Failed: Stopped!';
            el.apiStatus.className = 'error';
            stopAutoUpdate();
        }
    }

    function startAutoUpdate() {
        if (mainInterval) return;
        const durationSeconds = parseInt(el.logDurationInput.value, 10);
        if (isNaN(durationSeconds) || durationSeconds <= 0) { alert('Invalid duration.'); return; }
        const intervalMs = durationSeconds * 1000;

        el.resultsHeader.textContent = `Live Record (Updates every ${durationSeconds}s)`;
        el.toggleBtn.textContent = 'Stop Auto-Update';
        el.toggleBtn.classList.add('stop-btn');
        el.formFieldset.disabled = true;

        mainInterval = setInterval(() => runSubmissionCycle(), intervalMs);
        runSubmissionCycle();
    }

    function stopAutoUpdate() {
        clearInterval(mainInterval); mainInterval = null;
        el.toggleBtn.textContent = 'Start Auto-Update';
        el.toggleBtn.classList.remove('stop-btn');
        el.formFieldset.disabled = false;
    }
    
    function displayDecodedDetails(detailsArray, displayElement) {
        displayElement.innerHTML = '';
        detailsArray.forEach((detail, index) => {
            const item = document.createElement('div'); item.className = 'detail-item';
            const label = document.createElement('span'); label.className = 'detail-label'; label.textContent = DETAIL_LABELS[index] || `Field ${index + 1}`;
            const value = document.createElement('span'); value.className = 'detail-value'; value.textContent = detail || 'N/A';
            item.appendChild(label); item.appendChild(value); displayElement.appendChild(item);
        });
    }

    function autoSelectUpcomingClass() {
        const now = new Date(), today = now.getDay(), todaysClasses = timetable[today];
        if (!todaysClasses) return;
        const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
        let upcomingClassCode = null; let bestTimeDiff = Infinity;
        for (const time in todaysClasses) {
            const [h, m] = time.split(':').map(Number);
            const classTimeInMinutes = h * 60 + m;
            if (currentTimeInMinutes >= classTimeInMinutes && currentTimeInMinutes < classTimeInMinutes + 50) { upcomingClassCode = todaysClasses[time]; break; }
            const timeDiff = classTimeInMinutes - currentTimeInMinutes;
            if (timeDiff > 0 && timeDiff < bestTimeDiff) { bestTimeDiff = timeDiff; upcomingClassCode = todaysClasses[time]; }
        }
        if (upcomingClassCode) { el.courseCodeSelect.value = upcomingClassCode; el.courseCodeSelect.dispatchEvent(new Event('change')); }
    }

    el.toggleBtn.addEventListener('click', () => {
        if (mainInterval) {
            stopAutoUpdate();
        } else {
            const course = el.courseCodeSelect.value === 'manual' ? el.manualCourseCode.value : el.courseCodeSelect.value;
            if (!course || !el.sessionIDInput.value || !el.startTimeInput.value) { alert('Please fill in Subject, Session ID, and Start Time.'); return; }
            startAutoUpdate();
        }
    });

    el.copyBtn.addEventListener('click', () => { if (!el.base64ResultEl.textContent) return; navigator.clipboard.writeText(el.base64ResultEl.textContent).then(() => { el.copyBtn.textContent = 'Copied!'; setTimeout(() => { el.copyBtn.textContent = 'Copy'; }, 2000); }); });
    el.courseCodeSelect.addEventListener('change', () => {
        const selectedCode = el.courseCodeSelect.value;
        el.manualFields.classList.toggle('hidden', selectedCode !== 'manual');
        el.sessionIDInput.readOnly = false; el.sessionIDInput.value = '';
        if (selectedCode === 'manual') { el.startTimeInput.value = ''; } 
        else {
            const today = new Date().getDay(), todaysClasses = timetable[today];
            let timeFound = false;
            if (todaysClasses) { for (const time in todaysClasses) { if (todaysClasses[time] === selectedCode) { el.startTimeInput.value = time; timeFound = true; break; } } }
            if (!timeFound) { el.startTimeInput.value = ''; }
        }
    });
    
    const stopCamera = () => { if (html5QrCode && html5QrCode.isScanning) { html5QrCode.stop().catch(err => {}); } el.cameraControls.classList.add('hidden'); };
    const onScanSuccess = (decodedText, isCloneMode = false) => {
        stopCamera();
        try {
            const plainText = atob(decodedText);
            const details = plainText.split('#');
            if (details.length < 7) throw new Error("Invalid QR data format");

            if (isCloneMode) {
                el.scannerModal.classList.add('hidden');
                el.courseCodeSelect.value = details[0];
                el.startTimeInput.value = details[1];
                el.sessionIDInput.value = details[3];
                el.dateInput.value = new Date(details[4].split('-').reverse().join('-')).toISOString().split('T')[0];
                
                const [h, m, s] = details[5].split(':').map(Number);
                const logStart = new Date(); logStart.setHours(h, m, s, 0);
                const [eh, em, es] = details[6].split(':').map(Number);
                const logEnd = new Date(); logEnd.setHours(eh, em, es, 0);

                const duration = (logEnd - logStart) / 1000;
                el.logDurationInput.value = duration > 0 ? duration : 15;

                const remainingTime = logEnd.getTime() - new Date().getTime();
                if (remainingTime > 0) {
                    startClonedSession({ logInTime: details[5], logOutTime: details[6] }, remainingTime);
                } else {
                    el.resultsContainer.classList.remove('hidden');
                    el.apiStatus.textContent = 'Expired QR Scanned';
                    el.apiStatus.className = 'error';
                    el.apiResponseDisplay.textContent = 'The scanned QR code has already expired. You can start a new session manually.';
                }
            } else {
                el.scanResultContainer.classList.remove('hidden');
                displayDecodedDetails(details, el.scanResultDisplay);
            }
        } catch (e) {
            alert(`Error processing QR Code: ${e.message}`);
        }
    };
    
    function startClonedSession(cloneData, remainingTime) {
        if (mainInterval) stopAutoUpdate();
        el.resultsHeader.textContent = `Cloned Session (Updates in ${Math.round(remainingTime/1000)}s)`;
        el.toggleBtn.textContent = 'Stop Auto-Update';
        el.toggleBtn.classList.add('stop-btn');
        el.formFieldset.disabled = true;
        mainInterval = 'cloning';

        runSubmissionCycle({ initialData: cloneData });
        setTimeout(() => {
            if (mainInterval) {
                mainInterval = null; 
                startAutoUpdate();
            }
        }, remainingTime);
    }
    
    const openScanner = (isCloneMode = false) => {
        el.scannerTitle.textContent = isCloneMode ? "Clone Session from QR" : "Scan QR Code";
        el.scannerModal.classList.remove('hidden');
        el.scanResultContainer.classList.add('hidden');
        el.scannerModal.querySelector('#scanner-options').classList.remove('hidden');
        el.qrReaderContainer.classList.add('hidden');
        el.startCameraBtn.onclick = () => {
            el.scannerModal.querySelector('#scanner-options').classList.add('hidden');
            el.qrReaderContainer.classList.remove('hidden');
            html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, (text) => onScanSuccess(text, isCloneMode), () => {})
            .then(() => {
                const videoElement = document.getElementById('qr-reader').querySelector('video');
                if (!videoElement || !videoElement.srcObject) return;
                const track = videoElement.srcObject.getVideoTracks()[0];
                const capabilities = track.getCapabilities();
                if (capabilities.torch || capabilities.zoom) {
                    el.cameraControls.classList.remove('hidden');
                    el.torchBtn.classList.toggle('hidden', !capabilities.torch);
                    el.torchBtn.onclick = () => { torchOn = !torchOn; track.applyConstraints({ advanced: [{ torch: torchOn }] }); };
                    el.zoomSlider.classList.toggle('hidden', !capabilities.zoom);
                    if (capabilities.zoom) { el.zoomSlider.min = capabilities.zoom.min; el.zoomSlider.max = capabilities.zoom.max; el.zoomSlider.step = capabilities.zoom.step; el.zoomSlider.oninput = () => track.applyConstraints({ advanced: [{ zoom: el.zoomSlider.value }] }); }
                }
            }).catch(err => alert(`Camera Error: ${err}.`));
        };
        el.uploadFileBtn.onclick = () => el.qrFileInput.click();
        el.qrFileInput.onchange = e => { if (e.target.files.length > 0) html5QrCode.scanFile(e.target.files[0], true).then((text) => onScanSuccess(text, isCloneMode)).catch(err => alert(`QR Error: ${err}`)); };
    };

    el.scanBtn.addEventListener('click', () => openScanner(false));
    el.cloneScanBtn.addEventListener('click', () => openScanner(true));
    el.closeScannerModalBtn.addEventListener('click', () => { el.scannerModal.classList.add('hidden'); stopCamera(); });
    
    el.decodeBtn.addEventListener('click', () => { el.decoderModal.classList.remove('hidden'); el.decodeResultContainer.classList.add('hidden'); el.base64Input.value = ''; });
    el.closeDecoderModalBtn.addEventListener('click', () => el.decoderModal.classList.add('hidden'));
    el.decodeStringBtn.addEventListener('click', () => { const base64String = el.base64Input.value.trim(); if (!base64String) { alert('Input cannot be empty.'); return; } el.decodeResultContainer.classList.remove('hidden'); try { displayDecodedDetails(atob(base64String).split('#'), el.decodeResultDisplay); } catch (e) { el.decodeResultDisplay.innerHTML = `<div class="detail-item"><span class="detail-label" style="color: red;">Error</span><span class="detail-value">Invalid Base64 string.</span></div>`; } });
    
    // --- Initial Setup ---
    updateClock(); setInterval(updateClock, 1000);
    el.dateInput.value = new Date().toISOString().split('T')[0];
    autoSelectUpcomingClass();

});
