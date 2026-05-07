document.addEventListener('DOMContentLoaded', () => {
    // --- Advanced GSAP & Canvas Visuals ---
    // Custom Cursor
    const cursorGlow = document.querySelector('.cursor-glow');
    const cursorDot = document.querySelector('.cursor-dot');
    
    if (cursorGlow && cursorDot) {
        window.addEventListener('mousemove', (e) => {
            gsap.to(cursorDot, { x: e.clientX, y: e.clientY, duration: 0.1, ease: "power2.out" });
            gsap.to(cursorGlow, { x: e.clientX, y: e.clientY, duration: 0.6, ease: "power2.out" });
        });
    }

    // Neural Network Canvas
    const canvas = document.getElementById('neural-bg');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let width, height;
        let particles = [];
        
        function resize() {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        }
        window.addEventListener('resize', resize);
        resize();
        
        class Particle {
            constructor() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.vx = (Math.random() - 0.5) * 0.5;
                this.vy = (Math.random() - 0.5) * 0.5;
                this.radius = Math.random() * 2 + 1;
            }
            update() {
                this.x += this.vx;
                this.y += this.vy;
                if(this.x < 0 || this.x > width) this.vx *= -1;
                if(this.y < 0 || this.y > height) this.vy *= -1;
            }
            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(124, 58, 237, 0.4)';
                ctx.fill();
            }
        }
        
        for(let i=0; i<80; i++) particles.push(new Particle());
        
        function animateCanvas() {
            ctx.clearRect(0, 0, width, height);
            particles.forEach(p => { p.update(); p.draw(); });
            
            for(let i=0; i<particles.length; i++) {
                for(let j=i+1; j<particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if(dist < 150) {
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.strokeStyle = `rgba(6, 182, 212, ${(1 - dist/150) * 0.5})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
            }
            requestAnimationFrame(animateCanvas);
        }
        animateCanvas();
    }

    // Magnetic Buttons (Apply slightly after DOM load)
    setTimeout(() => {
        document.querySelectorAll('.btn, .icon-btn, .feature-card, .history-item').forEach(el => {
            el.addEventListener('mousemove', (e) => {
                const rect = el.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;
                gsap.to(el, { x: x * 0.2, y: y * 0.2, duration: 0.3, ease: "power2.out" });
            });
            el.addEventListener('mouseleave', () => {
                gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1, 0.3)" });
            });
        });
    }, 1000);

    // --- Core Logic ---
    // DOM Elements
    const chatInput = document.getElementById('chat-input');
    const chatForm = document.getElementById('chat-form');
    const sendBtn = document.getElementById('send-btn');
    const chatMessages = document.getElementById('chat-messages');
    
    const fileUpload = document.getElementById('file-upload');
    const attachmentPreview = document.getElementById('attachment-preview');
    
    let processedEvents = 0;
    
    const researchPanel = document.getElementById('research-panel');
    const reportContent = document.getElementById('report-content');
    const closePanelBtn = document.getElementById('close-panel-btn');
    const exportPdfBtn = document.getElementById('export-pdf-btn');
    
    const themeToggle = document.getElementById('theme-toggle');
    const newChatBtn = document.getElementById('new-chat-btn');
    const historyList = document.getElementById('history-list');

    let selectedFiles = [];
    let pollInterval = null;

    let currentTaskId = null;

    async function loadHistory() {
        try {
            const res = await fetch('/api/history');
            if (!res.ok) return;
            const historyData = await res.json();
            
            historyList.innerHTML = '';
            historyData.forEach((item, idx) => {
                const li = document.createElement('li');
                li.className = `history-item ${idx === 0 ? 'active' : ''}`;
                const dateStr = new Date(item.timestamp).toLocaleDateString();
                li.innerHTML = `<i class="fa-regular fa-message"></i> <span>${item.topic}</span> <span style="font-size: 0.7rem; margin-left: auto;">${dateStr}</span>`;
                
                li.addEventListener('click', () => {
                    document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));
                    li.classList.add('active');
                    loadHistoryItem(item.task_id);
                });
                
                historyList.appendChild(li);
            });
        } catch(e) {
            console.error("Failed to load history", e);
        }
    }
    loadHistory();

    async function loadHistoryItem(taskId) {
        try {
            showLoadingIndicator();
            const res = await fetch(`/api/history/${taskId}`);
            if (!res.ok) throw new Error("Failed to load history item");
            const data = await res.json();
            
            removeLoadingIndicator();
            
            // Hide landing hero if exists
            const landingHero = document.getElementById('landing-hero');
            if (landingHero) {
                gsap.to(landingHero, { opacity: 0, height: 0, duration: 0.5, onComplete: () => landingHero.remove() });
            }
            
            finishSynthesis(data);
        } catch(e) {
            handleError(e.message);
        }
    }

    // --- Theme Toggle ---
    themeToggle.addEventListener('click', () => {
        const html = document.documentElement;
        if (html.getAttribute('data-theme') === 'dark') {
            html.setAttribute('data-theme', 'light');
            themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i> Dark Mode';
        } else {
            html.setAttribute('data-theme', 'dark');
            themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i> Light Mode';
        }
    });

    // --- New Chat ---
    newChatBtn.addEventListener('click', () => {
        location.reload();
    });

    // --- Chat Input & Textarea Auto-Resize ---
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        validateInput();
    });

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!sendBtn.disabled) {
                chatForm.dispatchEvent(new Event('submit'));
            }
        }
    });

    // --- File Handling ---
    fileUpload.addEventListener('change', () => {
        const files = Array.from(fileUpload.files);
        files.forEach(file => {
            if (file.type === "application/pdf" && !selectedFiles.some(f => f.name === file.name)) {
                selectedFiles.push(file);
            }
        });
        renderAttachments();
        validateInput();
        fileUpload.value = ''; // reset
    });

    function renderAttachments() {
        attachmentPreview.innerHTML = '';
        if (selectedFiles.length > 0) {
            attachmentPreview.classList.remove('hidden');
            selectedFiles.forEach((file, index) => {
                const chip = document.createElement('div');
                chip.className = 'file-chip';
                chip.innerHTML = `<i class="fa-solid fa-file-pdf"></i> ${file.name} 
                                  <button type="button" data-idx="${index}"><i class="fa-solid fa-xmark"></i></button>`;
                attachmentPreview.appendChild(chip);
            });
            
            attachmentPreview.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = e.currentTarget.getAttribute('data-idx');
                    selectedFiles.splice(idx, 1);
                    renderAttachments();
                    validateInput();
                });
            });
        } else {
            attachmentPreview.classList.add('hidden');
        }
    }

    function validateInput() {
        const text = chatInput.value.trim();
        if (text.length > 0 || selectedFiles.length > 0) {
            sendBtn.disabled = false;
        } else {
            sendBtn.disabled = true;
        }
    }

    // --- Chat DOM Manipulation ---
    function appendUserMessage(text, files) {
        let content = '';
        if (text) content += `<p>${text}</p>`;
        if (files && files.length > 0) {
            content += `<div style="margin-top: 8px; font-size: 0.9em; opacity: 0.9;">
                            <i class="fa-solid fa-paperclip"></i> Attached ${files.length} PDF(s)
                        </div>`;
        }

        const msgHTML = `
            <div class="message user-message">
                <div class="avatar user-avatar"><i class="fa-solid fa-user"></i></div>
                <div class="message-content">
                    ${content}
                </div>
            </div>
        `;
        chatMessages.insertAdjacentHTML('beforeend', msgHTML);
        scrollToBottom();
    }

    function appendAIMessage(htmlContent) {
        const msgHTML = `
            <div class="message ai-message">
                <div class="avatar ai-avatar"><i class="fa-solid fa-robot"></i></div>
                <div class="message-content bubble-glass">
                    ${htmlContent}
                </div>
            </div>
        `;
        chatMessages.insertAdjacentHTML('beforeend', msgHTML);
        scrollToBottom();
    }

    function scrollToBottom() {
        chatMessages.scrollTo({
            top: chatMessages.scrollHeight,
            behavior: 'smooth'
        });
    }

    function showLoadingIndicator() {
        const loadingId = 'loading-indicator-bubble';
        if (document.getElementById(loadingId)) return;
        processedEvents = 0;
        
        const loadingHtml = `
            <div id="${loadingId}" class="message ai-message">
                <div class="avatar ai-avatar active" id="loading-avatar"><i id="loading-icon" class="fa-solid fa-microchip fa-spin"></i></div>
                <div class="message-content bubble-glass">
                    <div class="dynamic-loader">
                        <span id="loading-text">Initializing Intellectra AI...</span>
                    </div>
                </div>
            </div>
        `;
        chatMessages.insertAdjacentHTML('beforeend', loadingHtml);
        scrollToBottom();
    }

    function processEvent(event) {
        const iconEl = document.getElementById('loading-icon');
        const textEl = document.getElementById('loading-text');
        const avatarEl = document.getElementById('loading-avatar');
        if (!iconEl || !textEl || !avatarEl) return;

        if (event.type === 'start') {
            avatarEl.className = 'avatar ai-avatar active';
            if (event.agent === 'SearchAgent') {
                iconEl.className = 'fa-solid fa-magnifying-glass fa-spin';
                textEl.textContent = 'Searching knowledge bases...';
            } else if (event.agent === 'SummarizerAgent') {
                iconEl.className = 'fa-solid fa-compress fa-fade';
                textEl.textContent = 'Summarizing corpus...';
            } else if (event.agent === 'MethodologyAnalyzer') {
                iconEl.className = 'fa-solid fa-flask fa-beat';
                textEl.textContent = 'Comparing methodologies...';
            } else if (event.agent === 'CrossReferenceAgent') {
                iconEl.className = 'fa-solid fa-network-wired fa-pulse';
                textEl.textContent = 'Finding thematic relationships...';
            } else if (event.agent === 'TrendAnalyzer') {
                iconEl.className = 'fa-solid fa-chart-line fa-bounce';
                textEl.textContent = 'Detecting industry trends...';
            } else if (event.agent === 'ContradictionDetector') {
                iconEl.className = 'fa-solid fa-code-compare fa-flip';
                textEl.textContent = 'Detecting contradictions...';
            } else if (event.agent === 'ResearchGapFinder') {
                iconEl.className = 'fa-solid fa-binoculars fa-shake';
                textEl.textContent = 'Identifying research gaps...';
            } else if (event.agent === 'CitationAgent') {
                iconEl.className = 'fa-solid fa-quote-right fa-bounce';
                textEl.textContent = 'Formatting citations...';
            } else if (event.agent === 'LiteratureReviewAgent') {
                iconEl.className = 'fa-solid fa-pen-nib fa-beat-fade';
                textEl.textContent = 'Synthesizing final literature review...';
            }
        } else if (event.type === 'log') {
            const msg = event.message.toLowerCase();
            if (msg.includes('rate limit') || msg.includes('429')) {
                avatarEl.className = 'avatar ai-avatar danger-flash';
                iconEl.className = 'fa-solid fa-triangle-exclamation';
                textEl.textContent = 'API Rate limit hit. Waiting...';
            } else if (msg.includes('sleeping')) {
                 textEl.textContent = event.message;
            } else {
                if (avatarEl.classList.contains('danger-flash')) {
                    avatarEl.className = 'avatar ai-avatar active';
                    iconEl.className = 'fa-solid fa-microchip fa-spin';
                }
            }
        }
    }

    function removeLoadingIndicator() {
        const el = document.getElementById('loading-indicator-bubble');
        if (el) el.remove();
    }

    // --- API & Synthesis Flow ---
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const topic = chatInput.value.trim();
        const filesToUpload = [...selectedFiles];
        
        if (!topic && filesToUpload.length === 0) return;

        // Hide landing hero if exists
        const landingHero = document.getElementById('landing-hero');
        if (landingHero) {
            gsap.to(landingHero, { opacity: 0, height: 0, duration: 0.5, onComplete: () => landingHero.remove() });
        }

        // 1. UI Updates
        appendUserMessage(topic, filesToUpload);
        
        chatInput.value = '';
        chatInput.style.height = 'auto';
        selectedFiles = [];
        renderAttachments();
        validateInput();
        
        chatInput.disabled = true;
        fileUpload.disabled = true;
        
        showLoadingIndicator();

        // 2. Submit to API
        const formData = new FormData();
        if (topic) formData.append('topic', topic);
        filesToUpload.forEach(f => formData.append('files', f));

        try {
            const response = await fetch('/api/synthesize', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            
            if (!response.ok) throw new Error(data.detail || "Failed to start synthesis.");
            
            const taskId = data.task_id;
            
            // 3. Poll Status
            pollInterval = setInterval(async () => {
                try {
                    const statusRes = await fetch(`/api/status/${taskId}`);
                    const statusData = await statusRes.json();
                    
                    if (statusData.events) {
                        for (let i = processedEvents; i < statusData.events.length; i++) {
                            processEvent(statusData.events[i]);
                        }
                        processedEvents = statusData.events.length;
                    }
                    
                    if (statusData.status === "completed") {
                        clearInterval(pollInterval);
                        loadHistory(); // refresh history list
                        finishSynthesis(statusData);
                    } else if (statusData.status === "error") {
                        clearInterval(pollInterval);
                        handleError(statusData.detail);
                    }
                } catch(err) {
                    console.error("Polling error", err);
                }
            }, 3000);

        } catch (err) {
            handleError(err.message);
        }
    });

    function finishSynthesis(data) {
        removeLoadingIndicator();
        chatInput.disabled = false;
        fileUpload.disabled = false;
        
        currentTaskId = data.task_id;
        
        // Chat Message
        appendAIMessage(`
            <p><i class="fa-solid fa-circle-check" style="color: #10b981;"></i> Synthesis Complete!</p>
            <p style="margin-top: 10px;">I've gathered the research, analyzed the documents, and compiled a comprehensive literature review. I've opened it in the Research Panel for you.</p>
        `);

        // Populate Right Panel
        reportContent.innerHTML = marked.parse(data.report);
        
        // Render Citations
        const citationsSection = document.getElementById('citations-section');
        const citationsList = document.getElementById('citations-list');
        citationsList.innerHTML = '';
        if (data.citations && data.citations.length > 0) {
            data.citations.forEach(cit => {
                citationsList.innerHTML += `<div style="background: rgba(255,255,255,0.05); padding: 0.8rem; border-radius: 4px; border-left: 3px solid var(--accent);"><i class="fa-solid fa-quote-left" style="margin-right: 0.5rem; opacity: 0.5;"></i> ${cit}</div>`;
            });
            citationsSection.classList.remove('hidden');
        } else {
            citationsSection.classList.add('hidden');
        }
        
        // Render Counter-Questions
        const cqSection = document.getElementById('counter-questions-section');
        const cqList = document.getElementById('cq-list');
        cqList.innerHTML = '';
        if (data.counter_questions && data.counter_questions.length > 0) {
            data.counter_questions.forEach(cq => appendCQ(cq.question, cq.answer));
        }
        cqSection.classList.remove('hidden');
        
        // Render Mermaid Diagrams
        const mermaidBlocks = reportContent.querySelectorAll('.language-mermaid');
        if (mermaidBlocks.length > 0) {
            mermaidBlocks.forEach((block) => {
                const tempDiv = document.createElement('div');
                tempDiv.className = 'mermaid';
                tempDiv.textContent = block.textContent;
                // Replace the parent <pre> with the new div
                block.parentNode.replaceWith(tempDiv);
            });
            // Initialize mermaid on the newly added divs
            try {
                mermaid.init(undefined, reportContent.querySelectorAll('.mermaid'));
            } catch (e) {
                console.error("Mermaid initialization error", e);
            }
        }
        
        researchPanel.classList.remove('collapsed');
        gsap.fromTo(researchPanel, { opacity: 0, x: 50 }, { opacity: 1, x: 0, duration: 0.6, ease: "power2.out" });
    }

    const cqForm = document.getElementById('cq-form');
    const cqInput = document.getElementById('cq-input');
    const cqList = document.getElementById('cq-list');

    function appendCQ(question, answer) {
        const html = `
            <div style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: var(--radius-sm);">
                <div style="font-weight: bold; margin-bottom: 0.5rem; color: var(--text-primary);"><i class="fa-solid fa-user"></i> ${question}</div>
                <div style="color: var(--text-sec); font-size: 0.95rem;">${marked.parse(answer)}</div>
            </div>
        `;
        cqList.insertAdjacentHTML('beforeend', html);
    }

    if (cqForm) {
        cqForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentTaskId) return;
            const q = cqInput.value.trim();
            if (!q) return;
            
            cqInput.value = '';
            cqInput.disabled = true;
            cqForm.querySelector('button').disabled = true;
            
            try {
                const res = await fetch('/api/counter_question', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ task_id: currentTaskId, question: q })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || "Error asking counter question");
                appendCQ(data.question, data.answer);
            } catch(e) {
                console.error(e);
                appendCQ(q, "Error: " + e.message);
            } finally {
                cqInput.disabled = false;
                cqForm.querySelector('button').disabled = false;
                cqInput.focus();
            }
        });
    }

    function handleError(errorMsg) {
        removeLoadingIndicator();
        chatInput.disabled = false;
        fileUpload.disabled = false;
        
        appendAIMessage(`
            <p><i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i> An error occurred during synthesis:</p>
            <p style="margin-top: 10px; color: #ef4444;">${errorMsg}</p>
        `);
    }

    // --- Right Panel Actions ---
    closePanelBtn.addEventListener('click', () => {
        researchPanel.classList.add('collapsed');
    });

    exportPdfBtn.addEventListener('click', () => {
        const element = document.getElementById('report-content');
        if(element.querySelector('.empty-state')) return; // nothing to export
        
        // Apply temporary styling and footer for PDF export
        element.classList.add('pdf-export-mode');
        const footer = document.createElement('div');
        footer.id = 'pdf-temp-footer';
        footer.className = 'pdf-footer';
        footer.innerHTML = '&copy; Intellectra AI - Copyright Issues';
        element.appendChild(footer);

        const opt = {
            margin:       0.5,
            filename:     'Agentic_Research_Synthesis.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2 },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
            pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
        };
        
        html2pdf().set(opt).from(element).save().then(() => {
            // Remove temporary styling and footer after export
            element.classList.remove('pdf-export-mode');
            const f = document.getElementById('pdf-temp-footer');
            if (f) f.remove();
        });
    });
});
