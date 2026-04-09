document.addEventListener('DOMContentLoaded', () => {
    // Modes
    const toggleTopic = document.getElementById('toggle-topic');
    const togglePdf = document.getElementById('toggle-pdf');
    const modeTopic = document.getElementById('mode-topic');
    const modePdf = document.getElementById('mode-pdf');

    // Inputs
    const topicInput = document.getElementById('topic-input');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileList = document.getElementById('file-list');
    const synthesizeBtn = document.getElementById('synthesize-btn');
    const errorMsg = document.getElementById('error-msg');

    // Screens
    const uploadScreen = document.getElementById('upload-screen');
    const processingScreen = document.getElementById('processing-screen');
    const resultsScreen = document.getElementById('results-screen');
    const reportContent = document.getElementById('report-content');
    
    // Status list
    const statusList = document.getElementById('status-list');

    let currentMode = 'topic';
    let selectedFiles = [];

    // --- Mode Toggling ---
    toggleTopic.addEventListener('click', () => {
        currentMode = 'topic';
        toggleTopic.classList.add('active');
        togglePdf.classList.remove('active');
        modeTopic.classList.add('active-section');
        modeTopic.classList.remove('hidden-section');
        modePdf.classList.add('hidden-section');
        modePdf.classList.remove('active-section');
        validateInputs();
    });

    togglePdf.addEventListener('click', () => {
        currentMode = 'pdf';
        togglePdf.classList.add('active');
        toggleTopic.classList.remove('active');
        modePdf.classList.add('active-section');
        modePdf.classList.remove('hidden-section');
        modeTopic.classList.add('hidden-section');
        modeTopic.classList.remove('active-section');
        validateInputs();
    });

    // --- File Handling (PDF Mode) ---
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', () => {
        handleFiles(fileInput.files);
    });

    function handleFiles(files) {
        for (let file of files) {
            if (file.type === "application/pdf" && !selectedFiles.some(f => f.name === file.name)) {
                selectedFiles.push(file);
            }
        }
        renderFileList();
        validateInputs();
    }

    function renderFileList() {
        fileList.innerHTML = '';
        selectedFiles.forEach((file, index) => {
            const el = document.createElement('div');
            el.className = 'file-item';
            el.innerHTML = `<span>${file.name}</span><button class="remove" data-idx="${index}">✕</button>`;
            fileList.appendChild(el);
        });

        document.querySelectorAll('.remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = e.target.getAttribute('data-idx');
                selectedFiles.splice(idx, 1);
                renderFileList();
                validateInputs();
            });
        });
    }

    // --- Input Validation ---
    topicInput.addEventListener('input', validateInputs);

    function validateInputs() {
        errorMsg.textContent = "";
        if (currentMode === 'topic' && topicInput.value.trim().length > 2) {
            synthesizeBtn.disabled = false;
        } else if (currentMode === 'pdf' && selectedFiles.length > 0) {
            synthesizeBtn.disabled = false;
        } else {
            synthesizeBtn.disabled = true;
        }
    }

    // --- Processing Animation Sequence ---
    const statuses = [
        "Gathering raw context from specified sources...",
        "Scouring global scholarly networks...",
        "Vectorizing literature and passing to Summarization Agent...",
        "Identifying crucial methods & compressing abstracts...",
        "Citation Agent mapping API links...",
        "Discovering contiguous research domains for Related Works...",
        "Final Synthesis Agent compiling structural logic..."
    ];

    let statusInterval;

    function startProcessingAnimations() {
        uploadScreen.classList.remove('active');
        processingScreen.classList.add('active');
        
        statusList.innerHTML = `<li class="status-item active-status">${statuses[0]}</li>`;
        let step = 1;

        statusInterval = setInterval(() => {
            if (step < statuses.length) {
                // Dim previous
                const prev = statusList.querySelector('.active-status');
                if (prev) {
                    prev.classList.remove('active-status');
                    prev.style.opacity = '0.3';
                }
                
                // Add new
                const li = document.createElement('li');
                li.className = 'status-item active-status';
                li.textContent = statuses[step];
                statusList.appendChild(li);
                step++;
            } else {
                clearInterval(statusInterval);
            }
        }, 15000); // Because backend takes minutes on free tier
    }


    // --- API Submission ---
    synthesizeBtn.addEventListener('click', async () => {
        startProcessingAnimations();

        const formData = new FormData();
        
        if (currentMode === 'topic') {
            formData.append('topic', topicInput.value.trim());
        } else {
            selectedFiles.forEach(f => {
                formData.append('files', f);
            });
        }

        try {
            const response = await fetch('/api/synthesize', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            
            clearInterval(statusInterval);

            if (response.ok) {
                // Render markdown to HTML
                reportContent.innerHTML = marked.parse(data.report);
                
                // Switch Screens
                processingScreen.classList.remove('active');
                resultsScreen.classList.add('active');
            } else {
                throw new Error(data.detail || "Encountered an unknown error processing files.");
            }
        } catch (err) {
            clearInterval(statusInterval);
            processingScreen.classList.remove('active');
            uploadScreen.classList.add('active');
            errorMsg.textContent = err.message;
        }
    });

    // --- Results Actions ---
    document.getElementById('back-btn').addEventListener('click', () => {
        resultsScreen.classList.remove('active');
        uploadScreen.classList.add('active');
        topicInput.value = '';
        selectedFiles = [];
        renderFileList();
        validateInputs();
        reportContent.innerHTML = '';
    });

    document.getElementById('download-pdf-btn').addEventListener('click', () => {
        const element = document.getElementById('report-content');
        const opt = {
            margin:       1,
            filename:     'Agentic_Research_Synthesis.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2 },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(element).save();
    });
});
