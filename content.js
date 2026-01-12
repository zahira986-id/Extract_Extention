// Utilisation de var pour permettre la re-déclaration sans SyntaxError en cas de ré-injection
var isEmailExtractorInjected = isEmailExtractorInjected || true;

// On utilise un bloc pour isoler les variables tout en gardant l'état si déjà injecté
if (typeof contentScriptLoaded === 'undefined') {
    var contentScriptLoaded = true;

    var isExtracting = false;
    var foundEmails = [];
    var emailElements = [];

    // Écouter les messages de la popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'startExtraction') {
            startExtraction();
        } else if (message.action === 'stopExtraction') {
            stopExtraction();
        } else if (message.action === 'scrollToEmail') {
            scrollToEmail(message.index);
        }
    });

    // ... le reste du script sera déplacé à l'intérieur de ce bloc ...

    function startExtraction() {
        if (isExtracting) return;

        isExtracting = true;
        foundEmails = [];
        emailElements = [];

        // Envoyer un signal de début d'extraction
        chrome.runtime.sendMessage({
            action: 'extractionProgress',
            progress: 10
        });

        // Extraction des emails
        extractEmailsFromPage();

        // Simuler la progression
        simulateExtractionProgress();
    }

    function extractEmailsFromPage() {
        // Regex amélioré pour une meilleure précision
        const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

        // Sélecteur pour ignorer les balises non textuelles
        const ignoreTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'CANVAS', 'SVG'];

        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    if (ignoreTags.includes(node.parentNode.tagName)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            },
            false
        );

        let node;
        const nodesToProcess = [];

        // Un seul passage pour collecter les nœuds valides
        while (node = walker.nextNode()) {
            nodesToProcess.push(node);
        }

        const totalNodes = nodesToProcess.length;

        nodesToProcess.forEach((node, index) => {
            if (!isExtracting) return;

            const text = node.textContent;
            const matches = [...text.matchAll(emailRegex)];

            if (matches.length > 0) {
                const fragment = document.createDocumentFragment();
                let lastIndex = 0;

                matches.forEach(match => {
                    const email = match[0];
                    if (!foundEmails.includes(email)) {
                        foundEmails.push(email);

                        // Création du texte avant l'email
                        fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));

                        // Création du span de surbrillance
                        const span = document.createElement('span');
                        span.className = 'extracted-email-highlight';
                        span.style.cssText = `
                        background-color: rgba(255, 255, 0, 0.3);
                        border-bottom: 2px solid #ff6b6b;
                        padding: 2px 0;
                        transition: all 0.3s ease;
                        cursor: pointer;
                    `;
                        span.textContent = email;
                        span.dataset.email = email;
                        span.dataset.index = foundEmails.length - 1;

                        span.addEventListener('mouseenter', () => {
                            span.style.backgroundColor = 'rgba(255, 107, 107, 0.5)';
                            span.style.boxShadow = '0 0 0 2px rgba(255, 107, 107, 0.3)';
                        });

                        span.addEventListener('mouseleave', () => {
                            span.style.backgroundColor = 'rgba(255, 255, 0, 0.3)';
                            span.style.boxShadow = 'none';
                        });

                        span.addEventListener('click', (e) => {
                            e.stopPropagation();
                            highlightEmail(parseInt(span.dataset.index));
                        });

                        fragment.appendChild(span);
                        emailElements.push(span);
                        lastIndex = match.index + email.length;
                    }
                });

                // Texte restant après le dernier match
                if (lastIndex < text.length) {
                    fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
                }

                if (fragment.childNodes.length > 0) {
                    node.parentNode.replaceChild(fragment, node);
                }
            }

            // Notification de progression toutes les 10 itérations pour économiser des messages
            if (index % 10 === 0 || index === totalNodes - 1) {
                const progress = Math.min(95, Math.floor((index / totalNodes) * 95));
                chrome.runtime.sendMessage({ action: 'extractionProgress', progress });
            }
        });

        if (isExtracting) {
            const resultData = {
                action: 'emailsFound',
                emails: foundEmails,
                url: window.location.href,
                timestamp: new Date().toISOString()
            };
            chrome.runtime.sendMessage(resultData);
            chrome.runtime.sendMessage({ ...resultData, action: 'emailsExtracted' });
        }

        isExtracting = false;
    }

    function highlightEmail(index) {
        if (emailElements[index]) {
            // Animation de surbrillance
            const element = emailElements[index];
            element.style.backgroundColor = '#ff6b6b';
            element.style.color = 'white';
            element.style.transition = 'all 0.3s ease';

            // Scroll vers l'élément
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Restaurer la couleur après 2 secondes
            setTimeout(() => {
                element.style.backgroundColor = 'rgba(255, 255, 0, 0.3)';
                element.style.color = 'inherit';
            }, 2000);

            // Notifier la popup
            chrome.runtime.sendMessage({
                action: 'emailHighlighted',
                index: index,
                email: element.dataset.email
            });
        }
    }

    function scrollToEmail(index) {
        highlightEmail(index);
    }

    function simulateExtractionProgress() {
        let progress = 10;
        const interval = setInterval(() => {
            if (!isExtracting || progress >= 90) {
                clearInterval(interval);
                return;
            }

            progress += Math.random() * 5;
            chrome.runtime.sendMessage({
                action: 'extractionProgress',
                progress: Math.min(90, progress)
            });
        }, 200);
    }

    function stopExtraction() {
        isExtracting = false;

        // Retirer les surlignages
        document.querySelectorAll('.extracted-email-highlight').forEach(el => {
            el.style.backgroundColor = 'transparent';
            el.style.borderBottom = 'none';
        });
    }
}
