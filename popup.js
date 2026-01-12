document.addEventListener('DOMContentLoaded', async () => {
    // Éléments UI
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const extractionProgress = document.getElementById('extractionProgress');
    const progressBarFill = document.getElementById('progressBarFill');
    const progressText = document.getElementById('progressText');
    const resultsContainer = document.getElementById('resultsContainer');

    const emailList = document.getElementById('emailList');
    const phoneList = document.getElementById('phoneList');
    const socialList = document.getElementById('socialList');

    const countEmails = document.getElementById('countEmails');
    const countPhones = document.getElementById('countPhones');
    const countSocials = document.getElementById('countSocials');
    const totalItems = document.getElementById('totalItems');

    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    // État local
    let currentData = { emails: [], phones: [], socials: [] };

    // Initialisation
    loadStoredData();

    // Gestion des Onglets
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.id.replace('tab', 'content');
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(target).classList.add('active');
        });
    });

    // Start Extraction
    startBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Protection contre injection multiple
        let alreadyInjected = false;
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => window.contentScriptLoaded
            });
            alreadyInjected = results[0]?.result;
        } catch (e) { }

        if (!alreadyInjected) {
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        }

        chrome.tabs.sendMessage(tab.id, { action: 'startExtraction' });

        startBtn.style.display = 'none';
        stopBtn.style.display = 'block';
        extractionProgress.style.display = 'block';
    });

    // Stop Extraction
    stopBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        chrome.tabs.sendMessage(tab.id, { action: 'stopExtraction' });
        resetUI();
    });

    // Écouter les messages de progression et résultats
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'extractionProgress') {
            progressBarFill.style.width = `${message.progress}%`;
            progressText.textContent = `${Math.floor(message.progress)}%`;
        }

        if (message.action === 'dataFound' || message.action === 'allDataExtracted') {
            currentData.emails = message.emails || [];
            currentData.phones = message.phones || [];
            currentData.socials = message.socials || [];
            updateDisplay();

            if (message.action === 'allDataExtracted') {
                resetUI();
            }
        }
    });

    // Copie
    document.getElementById('copyEmails').addEventListener('click', (e) => copyToClipboard(currentData.emails, e.target));
    document.getElementById('copyPhones').addEventListener('click', (e) => copyToClipboard(currentData.phones, e.target));
    document.getElementById('copySocials').addEventListener('click', (e) => copyToClipboard(currentData.socials, e.target));

    // Effacer
    document.getElementById('clearData').addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'clearData' }, () => {
            currentData = { emails: [], phones: [], socials: [] };
            updateDisplay();
            totalItems.textContent = '0';
        });
    });

    function updateDisplay() {
        resultsContainer.style.display = 'block';

        renderList(emailList, currentData.emails, 'email');
        renderList(phoneList, currentData.phones, 'phone');
        renderList(socialList, currentData.socials, 'social');

        countEmails.textContent = currentData.emails.length;
        countPhones.textContent = currentData.phones.length;
        countSocials.textContent = currentData.socials.length;

        totalItems.textContent = currentData.emails.length + currentData.phones.length + currentData.socials.length;
    }

    function renderList(container, items, type) {
        container.innerHTML = '';
        if (items.length === 0) {
            container.innerHTML = '<p style="text-align:center; font-style:italic; color:#999;">Aucun résultat</p>';
            return;
        }

        items.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = `${type}-item`;
            div.textContent = item;
            div.style.cursor = 'pointer';
            div.addEventListener('click', () => {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'scrollToItem', type, index });
                });
            });
            container.appendChild(div);
        });
    }

    function resetUI() {
        startBtn.style.display = 'block';
        stopBtn.style.display = 'none';
        extractionProgress.style.display = 'none';
    }

    async function loadStoredData() {
        const data = await chrome.storage.local.get(['extractedEmails', 'extractedPhones', 'extractedSocials', 'totalItemsFound']);
        currentData.emails = data.extractedEmails || [];
        currentData.phones = data.extractedPhones || [];
        currentData.socials = data.extractedSocials || [];
        if (currentData.emails.length || currentData.phones.length || currentData.socials.length) {
            updateDisplay();
        }
        totalItems.textContent = data.totalItemsFound || '0';
    }

    function copyToClipboard(items, btn) {
        if (items.length === 0) return;
        const text = items.join('\n');
        navigator.clipboard.writeText(text).then(() => {
            const originalText = btn.textContent;
            btn.textContent = 'Copié !';
            setTimeout(() => btn.textContent = originalText, 2000);
        });
    }
});