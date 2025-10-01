document.addEventListener('DOMContentLoaded', () => {
    // --- DOM References ---
    const allIDs = {
        clock: 'real-time-clock', dateInput: 'recordDate', courseCodeSelect: 'courseCode', sessionIDInput: 'sessionID', startTimeInput: 'startTime', 
        logDurationInput: 'logDuration', toggleBtn: 'toggleBtn', resultsContainer: 'results', resultsHeader: 'results-header', plainResultEl: 'plainResult',
        base64ResultEl: 'base64Result', copyBtn: 'copyBtn', qrcodeContainer: 'qrcode-container', progressBar: 'progress-bar', formFieldset: 'form-fieldset',
        manualFields: 'manual-entry-fields', manualCourseName: 'manualCourseName', manualCourseCode: 'manualCourseCode',
        scanBtn: 'scan-btn', scannerModal: 'scanner-modal', closeScannerModalBtn: 'close-scanner-modal-btn', startCameraBtn: 'start-camera-btn', 
        uploadFileBtn: 'upload-file-btn', qrFileInput: 'qr-file-input', qrReaderContainer: 'qr-reader-container', qrReaderDiv: 'qr-reader', 
        cameraControls: 'camera-controls', torchBtn: 'torch-btn', zoomSlider: 'zoom-slider',
        scanResultContainer: 'scan-result-container', scanResultDisplay: 'scan-result-display',
        decodeBtn: 'decode-btn', decoderModal: 'decoder-modal', closeDecoderModalBtn: 'close-decoder-modal-btn',
        base64Input: 'base64-input', decodeStringBtn: 'decode-string-btn', decodeResultContainer: 'decode-result-container',
        decodeResultDisplay: 'decode-result-display'
    };
    const el = Object.entries(allIDs).reduce((acc, [key, id]) => ({ ...acc, [key]: document.getElementById(id) }), {});

    // --- State & Config ---
    let autoUpdateInterval = null;
    let torchOn = false;
    const html5QrCode = new Html5Qrcode("qr-reader");
    const DETAIL_LABELS = ["Subject Code", "Class Start", "Class End", "Session ID", "Date", "Log Start", "Log End"];
    const timetable = {
        1: { '09:00': 'EECE1071', '10:00': 'MECH3121', '11:00': 'CSEN2091', '14:00': 'CSEN2091P', '15:00': 'CSEN2091P' }, // Monday
        2: { '09:00': 'CSEN3321', '10:00': 'MECH3121', '14:00': 'EECE1071' }, // Tuesday
        3: { '08:00': '24CSEN2371', '09:00': '24CSEN2371', '10:00': 'MECH3121', '14:00': 'CSEN3321', '15:00': 'EECE3121' }, // Wednesday
        4: { '10:00': 'EECE3121', '13:00': 'CSEN2091', '14:00': 'EECE1071' }, // Thursday
        5: { '08:00': 'CSEN2091', '09:00': 'CSEN3321', '10:00': 'EECE3121', '11:00': 'INTN3444', '12:00': 'INTN3444' }  // Friday
    };
    
    const pad = (num) => String(num).padStart(2, '0');

    function updateClock() {
        el.clock.textContent = new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
        el.plainResultEl.textContent = plainRecord;
        el.base64ResultEl.textContent = btoa(plainRecord);
        el.qrcodeContainer.innerHTML = '';
        new QRCode(el.qrcodeContainer, { text: btoa(plainRecord), width: 200, height: 200 });
        el.resultsContainer.classList.remove('hidden');
    }
    
    function startProgressBar(durationMs) {
        el.progressBar.style.transition = 'none'; el.progressBar.style.width = '0%';
        setTimeout(() => { el.progressBar.style.transition = `width ${durationMs / 1000}s linear`; el.progressBar.style.width = '100%'; }, 50);
    }

    function startAutoUpdate(intervalMs) {
        generateRecord(); startProgressBar(intervalMs);
        autoUpdateInterval = setInterval(() => { generateRecord(); startProgressBar(intervalMs); }, intervalMs);
        el.toggleBtn.textContent = 'Stop Auto-Update'; el.toggleBtn.classList.add('stop-btn'); el.formFieldset.disabled = true;
    }

    function stopAutoUpdate() {
        clearInterval(autoUpdateInterval); autoUpdateInterval = null;
        el.toggleBtn.textContent = 'Start Auto-Update'; el.toggleBtn.classList.remove('stop-btn'); el.formFieldset.disabled = false;
        el.progressBar.style.transition = 'width 0.2s ease'; el.progressBar.style.width = '0%';
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
        let upcomingClassCode = null, bestTimeDiff = Infinity;
        for (const time in todaysClasses) {
            const [h, m] = time.split(':').map(Number);
            const classTimeInMinutes = h * 60 + m;
            if (currentTimeInMinutes >= classTimeInMinutes && currentTimeInMinutes < classTimeInMinutes + 50) { upcomingClassCode = todaysClasses[time]; break; }
            const timeDiff = classTimeInMinutes - currentTimeInMinutes;
            if (timeDiff > 0 && timeDiff < bestTimeDiff) { bestTimeDiff = timeDiff; upcomingClassCode = todaysClasses[time]; }
        }
        if (upcomingClassCode) { el.courseCodeSelect.value = upcomingClassCode; el.courseCodeSelect.dispatchEvent(new Event('change')); }
    }

    // --- Event Listeners ---
    el.toggleBtn.addEventListener('click', () => {
        if (autoUpdateInterval) { stopAutoUpdate(); } 
        else {
            const durationSeconds = parseInt(el.logDurationInput.value, 10);
            if (isNaN(durationSeconds) || durationSeconds <= 0) { alert('Invalid duration.'); return; }
            const course = el.courseCodeSelect.value === 'manual' ? el.manualCourseCode.value : el.courseCodeSelect.value;
            if (!course || !el.sessionIDInput.value || !el.startTimeInput.value) { alert('Please fill in Subject, Session ID, and Start Time.'); return; }
            startAutoUpdate(durationSeconds * 1000);
        }
    });

    el.copyBtn.addEventListener('click', () => {
        if (!el.base64ResultEl.textContent) return;
        navigator.clipboard.writeText(el.base64ResultEl.textContent).then(() => {
            el.copyBtn.textContent = 'Copied!'; setTimeout(() => { el.copyBtn.textContent = 'Copy'; }, 2000);
        });
    });
    
    el.courseCodeSelect.addEventListener('change', () => {
        const selectedCode = el.courseCodeSelect.value;
        el.manualFields.classList.toggle('hidden', selectedCode !== 'manual');
        el.sessionIDInput.readOnly = false; el.sessionIDInput.value = '';
        if (selectedCode === 'manual') { el.startTimeInput.value = ''; } 
        else {
            const today = new Date().getDay(), todaysClasses = timetable[today];
            let timeFound = false;
            if (todaysClasses) {
                for (const time in todaysClasses) { if (todaysClasses[time] === selectedCode) { el.startTimeInput.value = time; timeFound = true; break; } }
            }
            if (!timeFound) { el.startTimeInput.value = ''; }
        }
    });
    
    // --- Scanner Modal & Camera Controls ---
    const onScanSuccess = (decodedText) => {
        stopCamera();
        el.scanResultContainer.classList.remove('hidden');
        try { displayDecodedDetails(atob(decodedText).split('#'), el.scanResultDisplay); } 
        catch (e) { el.scanResultDisplay.innerHTML = `<div class="detail-item"><span class="detail-label" style="color: red;">Error</span><span class="detail-value">Invalid Base64 QR Code.</span></div>`; }
    };
    
    const stopCamera = () => {
        if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().catch(err => console.error("Error stopping camera:", err));
        }
        el.cameraControls.classList.add('hidden');
    };

    el.scanBtn.addEventListener('click', () => { el.scannerModal.classList.remove('hidden'); el.scanResultContainer.classList.add('hidden'); el.scannerModal.querySelector('#scanner-options').classList.remove('hidden'); el.qrReaderContainer.classList.add('hidden'); });
    el.closeScannerModalBtn.addEventListener('click', () => { el.scannerModal.classList.add('hidden'); stopCamera(); });
    
    el.startCameraBtn.addEventListener('click', () => {
        el.scannerModal.querySelector('#scanner-options').classList.add('hidden');
        el.qrReaderContainer.classList.remove('hidden');
        const config = { fps: 10, qrbox: { width: 250, height: 250 } };
        
        html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, () => {})
        .then(() => {
            // CORRECTED METHOD: This is a robust way to check capabilities and apply constraints
            const videoElement = document.getElementById('qr-reader').querySelector('video');
            if (!videoElement || !videoElement.srcObject) return;
            const track = videoElement.srcObject.getVideoTracks()[0];
            const capabilities = track.getCapabilities();

            if (capabilities.torch || capabilities.zoom) {
                el.cameraControls.classList.remove('hidden');
                
                // Torch Control
                el.torchBtn.classList.toggle('hidden', !capabilities.torch);
                el.torchBtn.onclick = () => {
                    torchOn = !torchOn;
                    track.applyConstraints({ advanced: [{ torch: torchOn }] });
                };

                // Zoom Control
                el.zoomSlider.classList.toggle('hidden', !capabilities.zoom);
                if (capabilities.zoom) {
                    el.zoomSlider.min = capabilities.zoom.min; el.zoomSlider.max = capabilities.zoom.max; el.zoomSlider.step = capabilities.zoom.step;
                    el.zoomSlider.oninput = () => {
                        track.applyConstraints({ advanced: [{ zoom: el.zoomSlider.value }] });
                    };
                }
            }
        }).catch(err => alert(`Camera Error: ${err}. Ensure you have given camera permissions.`));
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
        try { displayDecodedDetails(atob(base64String).split('#'), el.decodeResultDisplay); } 
        catch (e) { el.decodeResultDisplay.innerHTML = `<div class="detail-item"><span class="detail-label" style="color: red;">Error</span><span class="detail-value">Invalid Base64 string.</span></div>`; }
    });
    
    // --- Initial Setup ---
    updateClock();
    setInterval(updateClock, 1000);
    el.dateInput.value = new Date().toISOString().split('T')[0];
    autoSelectUpcomingClass();
});