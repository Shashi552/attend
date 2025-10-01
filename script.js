document.addEventListener('DOMContentLoaded', () => {
    // --- DOM References ---
    const allIDs = {
        clock: 'real-time-clock', dateInput: 'recordDate', courseCodeSelect: 'courseCode',
        sessionIDInput: 'sessionID', startTimeInput: 'startTime', logDurationInput: 'logDuration',
        toggleBtn: 'toggleBtn', resultsContainer: 'results', resultsHeader: 'results-header',
        plainResultEl: 'plainResult', base64ResultEl: 'base64Result', copyBtn: 'copyBtn',
        qrcodeContainer: 'qrcode-container', progressBar: 'progress-bar', formFieldset: 'form-fieldset',
        manualFields: 'manual-entry-fields', manualCourseName: 'manualCourseName', manualCourseCode: 'manualCourseCode',
        scanBtn: 'scan-btn', scannerModal: 'scanner-modal', closeScannerModalBtn: 'close-scanner-modal-btn',
        startCameraBtn: 'start-camera-btn', uploadFileBtn: 'upload-file-btn', qrFileInput: 'qr-file-input',
        qrReaderDiv: 'qr-reader', scanResultContainer: 'scan-result-container', scanResultDisplay: 'scan-result-display',
        decodeBtn: 'decode-btn', decoderModal: 'decoder-modal', closeDecoderModalBtn: 'close-decoder-modal-btn',
        base64Input: 'base64-input', decodeStringBtn: 'decode-string-btn',
        decodeResultContainer: 'decode-result-container', decodeResultDisplay: 'decode-result-display'
    };
    const el = Object.entries(allIDs).reduce((acc, [key, id]) => ({ ...acc, [key]: document.getElementById(id) }), {});

    // --- State & Config ---
    let autoUpdateInterval = null;
    const html5QrCode = new Html5Qrcode("qr-reader");
    // REMOVED: PRESET_SESSION_IDS constant is no longer needed.
    const DETAIL_LABELS = ["Subject Code", "Class Start", "Class End", "Session ID", "Date", "Log Start", "Log End"];
    const timetable = {
        1: { '09:00': 'EECE1071', '10:00': 'MECH3121', '11:00': 'CSEN2091', '14:00': 'CSEN2091P', '15:00': 'CSEN2091P' }, // Monday
        2: { '09:00': 'CSEN3321', '10:00': 'MECH3121', '14:00': 'EECE1071' }, // Tuesday
        3: { '08:00': '24CSEN2371', '09:00': '24CSEN2371', '10:00': 'MECH3121', '14:00': 'CSEN3321', '15:00': 'EECE3121' }, // Wednesday
        4: { '10:00': 'EECE3121', '13:00': 'CSEN2091', '14:00': 'EECE1071' }, // Thursday
        5: { '08:00': 'CSEN2091', '09:00': 'CSEN3321', '10:00': 'EECE3121', '11:00': 'INTN3444', '12:00': 'INTN3444' }  // Friday
    };
    
    // --- Core Functions ---
    const pad = (num) => String(num).padStart(2, '0');

    function updateClock() {
        el.clock.textContent = new Date().toLocaleString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    }

    function generateRecord() {
        const isManual = el.courseCodeSelect.value === 'manual';
        const courseCode = isManual ? el.manualCourseCode.value : el.courseCodeSelect.value;
        const [startH, startM] = el.startTimeInput.value.split(':').map(Number);
        const startDate = new Date(); startDate.setHours(startH, startM, 0, 0);
        const endDate = new Date(startDate.getTime() + 50 * 60000);
        const endTime = `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
        const dateObj = new Date(el.dateInput.value + 'T00:00:00');
        const formattedDate = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
        const now = new Date(new Date().getTime() + 1000);
        const logInTime = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        const logOutDate = new Date(now.getTime() + parseInt(el.logDurationInput.value, 10) * 1000);
        const logOutTime = `${pad(logOutDate.getHours())}:${pad(logOutDate.getMinutes())}:${pad(logOutDate.getSeconds())}`;

        const plainRecord = [courseCode, el.startTimeInput.value, endTime, el.sessionIDInput.value, formattedDate, logInTime, logOutTime].join('#');
        const base64Record = btoa(plainRecord);

        el.plainResultEl.textContent = plainRecord;
        el.base64ResultEl.textContent = base64Record;
        el.qrcodeContainer.innerHTML = '';
        new QRCode(el.qrcodeContainer, { text: base64Record, width: 200, height: 200 });
        el.resultsContainer.classList.remove('hidden');
    }
    
    // --- UI & State Management ---
    function startProgressBar(durationMs) {
        el.progressBar.style.transition = 'none';
        el.progressBar.style.width = '0%';
        setTimeout(() => {
            el.progressBar.style.transition = `width ${durationMs / 1000}s linear`;
            el.progressBar.style.width = '100%';
        }, 50);
    }

    function startAutoUpdate(intervalMs) {
        generateRecord();
        startProgressBar(intervalMs);
        autoUpdateInterval = setInterval(() => { generateRecord(); startProgressBar(intervalMs); }, intervalMs);
        el.toggleBtn.textContent = 'Stop Auto-Update';
        el.toggleBtn.classList.add('stop-btn');
        el.formFieldset.disabled = true;
    }

    function stopAutoUpdate() {
        clearInterval(autoUpdateInterval);
        autoUpdateInterval = null;
        el.toggleBtn.textContent = 'Start Auto-Update';
        el.toggleBtn.classList.remove('stop-btn');
        el.formFieldset.disabled = false;
        el.progressBar.style.transition = 'width 0.2s ease';
        el.progressBar.style.width = '0%';
    }
    
    function displayDecodedDetails(detailsArray, displayElement) {
        displayElement.innerHTML = ''; // Clear previous results
        detailsArray.forEach((detail, index) => {
            const item = document.createElement('div');
            item.className = 'detail-item';
            const label = document.createElement('span');
            label.className = 'detail-label';
            label.textContent = DETAIL_LABELS[index] || `Field ${index + 1}`;
            const value = document.createElement('span');
            value.className = 'detail-value';
            value.textContent = detail || 'N/A';
            item.appendChild(label);
            item.appendChild(value);
            displayElement.appendChild(item);
        });
    }

    function autoSelectUpcomingClass() {
        const now = new Date();
        const today = now.getDay();
        const todaysClasses = timetable[today];
        if (!todaysClasses) return;

        const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
        let upcomingClassCode = null;
        let bestTimeDiff = Infinity;

        for (const time in todaysClasses) {
            const [h, m] = time.split(':').map(Number);
            const classTimeInMinutes = h * 60 + m;

            if (currentTimeInMinutes >= classTimeInMinutes && currentTimeInMinutes < classTimeInMinutes + 50) {
                upcomingClassCode = todaysClasses[time];
                break;
            }

            const timeDiff = classTimeInMinutes - currentTimeInMinutes;
            if (timeDiff > 0 && timeDiff < bestTimeDiff) {
                bestTimeDiff = timeDiff;
                upcomingClassCode = todaysClasses[time];
            }
        }
        
        if (upcomingClassCode) {
            el.courseCodeSelect.value = upcomingClassCode;
            el.courseCodeSelect.dispatchEvent(new Event('change'));
        }
    }

    // --- Event Listeners ---
    el.toggleBtn.addEventListener('click', () => {
        if (autoUpdateInterval) { stopAutoUpdate(); } 
        else {
            const durationSeconds = parseInt(el.logDurationInput.value, 10);
            if (isNaN(durationSeconds) || durationSeconds <= 0) { alert('Invalid duration.'); return; }
            const course = el.courseCodeSelect.value === 'manual' ? el.manualCourseCode.value : el.courseCodeSelect.value;
            if (!course) { alert('Please select or enter a subject.'); return; }
            if (!el.sessionIDInput.value) { alert('Please enter a Session ID.'); return; } // Added check for session ID
            if (!el.startTimeInput.value) { alert('Please enter a class start time.'); return; }
            
            const updateIntervalMs = durationSeconds * 1000;
            el.resultsHeader.textContent = `Live Record (Updates every ${durationSeconds}s)`;
            startAutoUpdate(updateIntervalMs);
        }
    });

    el.copyBtn.addEventListener('click', () => {
        if (!el.base64ResultEl.textContent) return;
        navigator.clipboard.writeText(el.base64ResultEl.textContent).then(() => {
            el.copyBtn.textContent = 'Copied!';
            setTimeout(() => { el.copyBtn.textContent = 'Copy'; }, 2000);
        });
    });
    
    el.courseCodeSelect.addEventListener('change', () => {
        const selectedCode = el.courseCodeSelect.value;
        el.manualFields.classList.toggle('hidden', selectedCode !== 'manual');
        
        // MODIFIED: Session ID is always manual and cleared on subject change.
        el.sessionIDInput.readOnly = false;
        el.sessionIDInput.value = '';
        
        if (selectedCode === 'manual') {
            el.startTimeInput.value = '';
        } else {
            // Autofill Time from Timetable
            const today = new Date().getDay();
            const todaysClasses = timetable[today];
            let timeFound = false;
            if (todaysClasses) {
                for (const time in todaysClasses) {
                    if (todaysClasses[time] === selectedCode) {
                        el.startTimeInput.value = time;
                        timeFound = true;
                        break;
                    }
                }
            }
            if (!timeFound) {
                el.startTimeInput.value = '';
            }
        }
    });
    
    // REMOVED: Event listener for remembering session ID is no longer needed.

    // Scanner Modal
    const onScanSuccess = (decodedText) => {
        try { html5QrCode.stop(); } catch (e) {}
        el.scannerModal.querySelector('#scanner-options').classList.add('hidden');
        el.scanResultContainer.classList.remove('hidden');
        try {
            const plainText = atob(decodedText);
            displayDecodedDetails(plainText.split('#'), el.scanResultDisplay);
        } catch (e) {
            el.scanResultDisplay.innerHTML = `<div class="detail-item"><span class="detail-label" style="color: red;">Error</span><span class="detail-value">Invalid Base64 QR Code.</span></div>`;
        }
    };
    el.scanBtn.addEventListener('click', () => { el.scannerModal.classList.remove('hidden'); el.scanResultContainer.classList.add('hidden'); el.scannerModal.querySelector('#scanner-options').classList.remove('hidden'); el.qrReaderDiv.classList.add('hidden'); });
    el.closeScannerModalBtn.addEventListener('click', () => { el.scannerModal.classList.add('hidden'); try { html5QrCode.stop(); } catch (e) {} });
    el.startCameraBtn.addEventListener('click', () => {
        el.scannerModal.querySelector('#scanner-options').classList.add('hidden');
        el.qrReaderDiv.classList.remove('hidden');
        html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, onScanSuccess, () => {});
    });
    el.uploadFileBtn.addEventListener('click', () => el.qrFileInput.click());
    el.qrFileInput.addEventListener('change', e => { if (e.target.files.length > 0) html5QrCode.scanFile(e.target.files[0], true).then(onScanSuccess).catch(err => alert(`QR Error: ${err}`)); });
    
    // Decoder Modal
    el.decodeBtn.addEventListener('click', () => { el.decoderModal.classList.remove('hidden'); el.decodeResultContainer.classList.add('hidden'); el.base64Input.value = ''; });
    el.closeDecoderModalBtn.addEventListener('click', () => el.decoderModal.classList.add('hidden'));
    el.decodeStringBtn.addEventListener('click', () => {
        const base64String = el.base64Input.value.trim();
        if (!base64String) { alert('Input cannot be empty.'); return; }
        el.decodeResultContainer.classList.remove('hidden');
        try {
            const plainText = atob(base64String);
            displayDecodedDetails(plainText.split('#'), el.decodeResultDisplay);
        } catch (e) {
            el.decodeResultDisplay.innerHTML = `<div class="detail-item"><span class="detail-label" style="color: red;">Error</span><span class="detail-value">Invalid Base64 string.</span></div>`;
        }
    });
    
    // --- Initial Setup ---
    updateClock();
    setInterval(updateClock, 1000);
    el.dateInput.value = new Date().toISOString().split('T')[0];
    autoSelectUpcomingClass();
});