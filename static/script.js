document.addEventListener('DOMContentLoaded', () => {
    // --- Advanced GSAP & Visuals ---
    // Custom Cursor
    const cursorGlow = document.querySelector('.cursor-glow');
    const cursorDot = document.querySelector('.cursor-dot');
    
    if (cursorGlow && cursorDot) {
        window.addEventListener('mousemove', (e) => {
            gsap.to(cursorDot, { x: e.clientX, y: e.clientY, duration: 0.1, ease: "power2.out" });
            gsap.to(cursorGlow, { x: e.clientX, y: e.clientY, duration: 0.6, ease: "power2.out" });
        });
    }

    // Magnetic Buttons
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
    
    let processedEvents = 0;
    
    const researchPanel = document.getElementById('research-panel');
    const reportContent = document.getElementById('report-content');
    const closePanelBtn = document.getElementById('close-panel-btn');
    const exportPdfBtn = document.getElementById('export-pdf-btn');
    
    const themeToggle = document.getElementById('theme-toggle');
    const newChatBtn = document.getElementById('new-chat-btn');
    const historyList = document.getElementById('history-list');

    let pollInterval = null;
    let currentTaskId = null;
    let activeAgentBubble = null; // Track current agent's chat bubble

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
            showGlobalLoadingIndicator();
            const res = await fetch(`/api/history/${taskId}`);
            if (!res.ok) throw new Error("Failed to load history item");
            const data = await res.json();
            
            removeGlobalLoadingIndicator();
            hideLandingHero();
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

    function validateInput() {
        const text = chatInput.value.trim();
        sendBtn.disabled = text.length === 0;
    }

    function hideLandingHero() {
        const landingHero = document.getElementById('landing-hero');
        if (landingHero) {
            gsap.to(landingHero, { opacity: 0, height: 0, duration: 0.5, onComplete: () => landingHero.remove() });
        }
    }

    // --- Chat DOM Manipulation ---
    function appendUserMessage(text) {
        const msgHTML = `
            <div class="message user-message">
                <div class="avatar user-avatar"><i class="fa-solid fa-user"></i></div>
                <div class="message-content">
                    <p>${text}</p>
                </div>
            </div>
        `;
        chatMessages.insertAdjacentHTML('beforeend', msgHTML);
        scrollToBottom();
    }

    function appendAIMessage(htmlContent, customClass = '') {
        const msgHTML = `
            <div class="message ai-message">
                <div class="avatar ai-avatar"><i class="fa-solid fa-robot"></i></div>
                <div class="message-content bubble-glass ${customClass}">
                    ${htmlContent}
                </div>
            </div>
        `;
        chatMessages.insertAdjacentHTML('beforeend', msgHTML);
        scrollToBottom();
        return chatMessages.lastElementChild;
    }

    function scrollToBottom() {
        chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
    }

    // Global loading spinner used during initial history fetch
    function showGlobalLoadingIndicator() {
        const loadingId = 'global-loading';
        if (document.getElementById(loadingId)) return;
        
        const loadingHtml = `
            <div id="${loadingId}" class="message ai-message">
                <div class="avatar ai-avatar"><i class="fa-solid fa-microchip"></i></div>
                <div class="message-content bubble-glass">
                    <div class="dna-spinner">
                        <div class="dna-strand"></div>
                        <div class="dna-strand"></div>
                        <div class="dna-strand"></div>
                        <div class="dna-strand"></div>
                    </div>
                </div>
            </div>
        `;
        chatMessages.insertAdjacentHTML('beforeend', loadingHtml);
        scrollToBottom();
    }

    function removeGlobalLoadingIndicator() {
        const el = document.getElementById('global-loading');
        if (el) el.remove();
    }

    // Multi-Agent Event Processing
    const agentIcons = {
        'SearchAgent': 'fa-magnifying-glass',
        'SummarizationAgent': 'fa-compress',
        'CitationAgent': 'fa-quote-right',
        'SimilarityAgent': 'fa-network-wired',
        'SynthesisAgent': 'fa-pen-nib'
    };
    
    const agentColors = {
        'SearchAgent': 'ai-bubble-search',
        'SummarizationAgent': 'ai-bubble-summary',
        'CitationAgent': 'ai-bubble-citation',
        'SimilarityAgent': 'ai-bubble-similarity',
        'SynthesisAgent': 'ai-bubble-synthesis'
    };

    function processEvent(event) {
        if (event.type === 'start') {
            const iconClass = agentIcons[event.agent] || 'fa-robot';
            const colorClass = agentColors[event.agent] || '';
            const agentTitle = event.agent.replace('Agent', ' Agent');

            const msgHTML = `
                <div class="message ai-message" id="bubble-${event.agent}">
                    <div class="avatar ai-avatar active"><i class="fa-solid ${iconClass}"></i></div>
                    <div class="message-content bubble-glass ${colorClass}">
                        <div style="font-size: 0.8rem; font-weight: bold; margin-bottom: 5px; opacity: 0.8; text-transform: uppercase;">
                            ${agentTitle}
                        </div>
                        <div class="agent-logs" style="font-size: 0.95rem; line-height: 1.5; color: var(--text-sec);">
                            <div class="dna-spinner" style="justify-content: flex-start; margin-top: 10px;">
                                <div class="dna-strand"></div><div class="dna-strand"></div>
                                <div class="dna-strand"></div><div class="dna-strand"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            chatMessages.insertAdjacentHTML('beforeend', msgHTML);
            activeAgentBubble = document.getElementById(`bubble-${event.agent}`);
            scrollToBottom();
        } 
        else if (event.type === 'log') {
            if (activeAgentBubble) {
                const logsContainer = activeAgentBubble.querySelector('.agent-logs');
                // Remove spinner if it exists
                const spinner = logsContainer.querySelector('.dna-spinner');
                if (spinner) spinner.remove();

                const logLine = document.createElement('div');
                logLine.className = 'typewriter-text';
                logLine.textContent = event.message;
                logsContainer.appendChild(logLine);
                
                // Typing effect animation
                gsap.fromTo(logLine, 
                    { opacity: 0, y: 5 }, 
                    { opacity: 1, y: 0, duration: 0.4 }
                );
                
                scrollToBottom();
            }
        }
        else if (event.type === 'end') {
            if (activeAgentBubble) {
                const avatar = activeAgentBubble.querySelector('.avatar');
                avatar.classList.remove('active');
                
                const icon = avatar.querySelector('i');
                icon.className = 'fa-solid fa-check';
                
                // Optional: remove typing spinners if any remain
                const logsContainer = activeAgentBubble.querySelector('.agent-logs');
                const spinner = logsContainer.querySelector('.dna-spinner');
                if (spinner) spinner.remove();

                activeAgentBubble = null;
            }
        }
    }

    // --- API & Synthesis Flow ---
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const topic = chatInput.value.trim();
        if (!topic) return;

        hideLandingHero();

        // 1. UI Updates
        appendUserMessage(topic);
        
        chatInput.value = '';
        chatInput.style.height = 'auto';
        validateInput();
        
        chatInput.disabled = true;

        // 2. Submit to API
        const formData = new FormData();
        formData.append('topic', topic);

        processedEvents = 0;

        try {
            const response = await fetch('/api/synthesize', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            
            if (!response.ok) throw new Error(data.detail || "Failed to start synthesis.");
            
            currentTaskId = data.task_id;
            
            // 3. Poll Status
            pollInterval = setInterval(async () => {
                try {
                    const statusRes = await fetch(`/api/status/${currentTaskId}`);
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
        removeGlobalLoadingIndicator();
        chatInput.disabled = false;
        
        currentTaskId = data.task_id;
        
        // Chat Message
        appendAIMessage(`
            <p><i class="fa-solid fa-circle-check" style="color: #10b981;"></i> Synthesis Complete!</p>
            <p style="margin-top: 10px;">The multi-agent pipeline has finished processing. I've opened the comprehensive literature review in the Research Panel.</p>
        `, 'ai-bubble-synthesis');

        // Populate Right Panel
        try {
            reportContent.innerHTML = marked.parse(data.report || "*No synthesis report generated.*");
        } catch (e) {
            console.error("Markdown parsing error", e);
            reportContent.innerHTML = "<p>Error displaying report.</p>";
        }
        
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
                block.parentNode.replaceWith(tempDiv);
            });
            try {
                mermaid.init(undefined, reportContent.querySelectorAll('.mermaid'));
            } catch (e) {
                console.error("Mermaid initialization error", e);
            }
        }
        
        gsap.fromTo(reportContent, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" });
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
        removeGlobalLoadingIndicator();
        if (activeAgentBubble) {
            const logsContainer = activeAgentBubble.querySelector('.agent-logs');
            if (logsContainer) {
                const spinner = logsContainer.querySelector('.dna-spinner');
                if (spinner) spinner.remove();
            }
            activeAgentBubble = null;
        }
        chatInput.disabled = false;
        
        appendAIMessage(`
            <p><i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i> An error occurred during synthesis:</p>
            <p style="margin-top: 10px; color: #ef4444;">${errorMsg}</p>
        `);
    }

    // --- Right Panel Actions ---
    if (closePanelBtn) {
        closePanelBtn.addEventListener('click', () => {
            // Panel is permanently visible in 3-panel layout, do nothing or just clear content
            reportContent.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-microscope" style="margin-bottom: 1rem;"></i>
                    <h4 style="color: var(--text-primary); margin-bottom: 0.5rem;">Awaiting Research Query</h4>
                    <p style="font-size: 0.9rem;">Submit a topic in the chat to generate a comprehensive literature review.</p>
                </div>
            `;
            document.getElementById('citations-section').classList.add('hidden');
            document.getElementById('counter-questions-section').classList.add('hidden');
        });
    }

    exportPdfBtn.addEventListener('click', () => {
        const element = document.getElementById('report-content');
        if(element.querySelector('.empty-state')) return;
        
        element.classList.add('pdf-export-mode');
        const footer = document.createElement('div');
        footer.id = 'pdf-temp-footer';
        footer.className = 'pdf-footer';
        footer.innerHTML = '&copy; Research Synthesizer';
        element.appendChild(footer);

        const opt = {
            margin:       0.5,
            filename:     'Research_Synthesis.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2 },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
            pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
        };
        
        html2pdf().set(opt).from(element).save().then(() => {
            element.classList.remove('pdf-export-mode');
            const f = document.getElementById('pdf-temp-footer');
            if (f) f.remove();
        });
    });
});
