// popup.js

document.addEventListener('DOMContentLoaded', function () {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const loader = document.querySelector('.loader');
    const results = document.getElementById('results');
    const emailList = document.getElementById('emailList');
    const copyBtn = document.getElementById('copyBtn');
    const totalCount = document.getElementById('totalCount');
    const foundCount = document.getElementById('foundCount');
    const progressFill = document.querySelector('.progress-fill');
    const notification = document.getElementById('notification');

    let selectedEmails = new Set();
    let extractionActive = false;

    // Récupérer les statistiques depuis le background
    chrome.runtime.sendMessage({ action: 'getStats' }, (data) => {
        if (data && data.totalEmailsFound) {
            totalCount.textContent = `Total: ${data.totalEmailsFound}`;
        }
    });

    // Bouton Start
    startBtn.addEventListener('click', async () => {
        startBtn.style.display = 'none';
        stopBtn.style.display = 'block';
        loader.style.display = 'block';
        progressFill.style.width = '0%';
        extractionActive = true;

        // Récupérer l'onglet actif
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Vérifier si le content script est déjà injecté
        let alreadyInjected = false;
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => window.isEmailExtractorInjected
            });
            alreadyInjected = results[0]?.result;
        } catch (e) {
            console.log("Could not check injection status", e);
        }

        if (!alreadyInjected) {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
            } catch (e) {
                console.error("Injection failed", e);
            }
        }

        // Demander l'extraction des emails
        chrome.tabs.sendMessage(tab.id, { action: 'startExtraction' });

        // Simuler une progression
        simulateProgress();
    });

    // Bouton Stop
    stopBtn.addEventListener('click', () => {
        stopExtraction();
    });

    // Bouton Copy
    copyBtn.addEventListener('click', () => {
        const emailsToCopy = Array.from(selectedEmails);
        if (emailsToCopy.length > 0) {
            navigator.clipboard.writeText(emailsToCopy.join('\n'))
                .then(() => {
                    showNotification(`${emailsToCopy.length} email(s) copied to clipboard!`);
                })
                .catch(err => {
                    showNotification('Failed to copy emails');
                    console.error('Copy failed:', err);
                });
        } else {
            showNotification('No emails selected!');
        }
    });

    // Écouter les messages du content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'extractionProgress') {
            const progress = message.progress;
            progressFill.style.width = `${progress}%`;

            if (progress >= 100) {
                loader.querySelector('p').textContent = 'Extraction complete!';
            }
        }

        if (message.action === 'emailsFound') {
            loader.style.display = 'none';
            results.style.display = 'block';
            displayEmails(message.emails);
            foundCount.textContent = `Found: ${message.emails.length}`;

            // Mettre à jour le total
            chrome.runtime.sendMessage({ action: 'getStats' }, (data) => {
                if (data && data.totalEmailsFound) {
                    totalCount.textContent = `Total: ${data.totalEmailsFound}`;
                }
            });

            if (extractionActive) {
                stopExtraction();
            }
        }

        if (message.action === 'emailHighlighted') {
            // Scroll vers l'email sur la page
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'scrollToEmail',
                    index: message.index
                });
            });
        }
    });

    function displayEmails(emails) {
        emailList.innerHTML = '';
        selectedEmails.clear();

        emails.forEach((email, index) => {
            const emailElement = document.createElement('div');
            emailElement.className = 'email-item';
            emailElement.innerHTML = `
                <input type="checkbox" id="email-${index}" style="margin-right: 10px;">
                <label for="email-${index}" style="cursor: pointer;">
                    ${email}
                    <button class="highlight-btn" data-index="${index}" 
                            style="float: right; padding: 2px 8px; font-size: 11px; background: #667eea; color: white; border: none; border-radius: 3px;">
                        🔍 Highlight
                    </button>
                </label>
            `;

            emailElement.addEventListener('click', (e) => {
                if (e.target.type === 'checkbox') {
                    const checkbox = e.target;
                    const emailText = email;

                    if (checkbox.checked) {
                        selectedEmails.add(emailText);
                        emailElement.classList.add('selected');
                    } else {
                        selectedEmails.delete(emailText);
                        emailElement.classList.remove('selected');
                    }
                }
            });

            // Bouton Highlight
            const highlightBtn = emailElement.querySelector('.highlight-btn');
            highlightBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                chrome.runtime.sendMessage({
                    action: 'highlightEmail',
                    index: index,
                    email: email
                });
            });

            emailList.appendChild(emailElement);
        });
    }

    function simulateProgress() {
        let progress = 0;
        const interval = setInterval(() => {
            if (progress >= 100 || !extractionActive) {
                clearInterval(interval);
                return;
            }

            progress += Math.random() * 15;
            if (progress > 100) progress = 100;

            progressFill.style.width = `${progress}%`;

            if (progress >= 100) {
                loader.querySelector('p').textContent = 'Processing emails...';
            }
        }, 200);
    }

    function stopExtraction() {
        extractionActive = false;
        startBtn.style.display = 'block';
        stopBtn.style.display = 'none';
        loader.style.display = 'none';
        progressFill.style.width = '100%';

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'stopExtraction' });
            }
        });
    }

    function showNotification(message) {
        notification.textContent = message;
        notification.style.display = 'block';
        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }

    // Gérer la déconnexion de l'onglet
    chrome.tabs.onRemoved.addListener(() => {
        stopExtraction();
    });
});