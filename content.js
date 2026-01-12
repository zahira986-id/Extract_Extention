// Utilisation de var pour permettre la re-déclaration sans SyntaxError en cas de ré-injection
var isEmailExtractorInjected = isEmailExtractorInjected || true;

// On utilise un bloc pour isoler les variables tout en gardant l'état si déjà injecté
if (typeof contentScriptLoaded === 'undefined') {
    var contentScriptLoaded = true;

    var isExtracting = false;
    var foundEmails = [];
    var foundPhones = [];
    var foundSocials = [];
    var emailElements = [];

    // Écouter les messages de la popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'startExtraction') {
            startExtraction();
        } else if (message.action === 'stopExtraction') {
            stopExtraction();
        } else if (message.action === 'scrollToEmail' || message.action === 'scrollToItem') {
            highlightItem(message.type || 'email', message.index);
        }
    });

    // ... le reste du script sera déplacé à l'intérieur de ce bloc ...

    function startExtraction() {
        if (isExtracting) return;
        isExtracting = true;
        foundEmails = [];
        foundPhones = [];
        foundSocials = [];
        emailElements = [];
        chrome.runtime.sendMessage({ action: 'extractionProgress', progress: 10 });
        extractDataFromPage();
        simulateExtractionProgress();
    }

    function extractDataFromPage() {
        const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
        const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{1,4}?\)?[-.\s]?)?\d{1,5}(?:[-.\s]?\d{1,5}){2,8}/g;
        // Détection des liens de réseaux sociaux
        const socialRegex = /(https?:\/\/(www\.)?(facebook|instagram|linkedin|twitter|x|youtube|tiktok)\.com\/[a-zA-Z0-9._%-]+)/g;

        // Sélecteur pour ignorer les balises non textuelles
        const ignoreTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'CANVAS', 'SVG'];

        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    if (ignoreTags.includes(node.parentNode.tagName)) return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                }
            },
            false
        );

        let node;
        const nodesToProcess = [];

        // Un seul passage pour collecter les nœuds valides
        while (node = walker.nextNode()) nodesToProcess.push(node);
        const totalNodes = nodesToProcess.length;

        nodesToProcess.forEach((node, index) => {
            if (!isExtracting) return;
            const text = node.textContent;

            // On cherche tous les types dans le texte
            const matches = [
                ...[...text.matchAll(emailRegex)].map(m => ({ type: 'email', val: m[0], index: m.index, color: 'rgba(255,255,0,0.3)' })),
                ...[...text.matchAll(phoneRegex)].map(m => {
                    // Filtrage basique pour éviter les faux positifs (comme les dates ou versions)
                    if (m[0].replace(/[-.\s]/g, '').length < 8) return null;
                    return { type: 'phone', val: m[0], index: m.index, color: 'rgba(0,255,123,0.3)' };
                }).filter(m => m),
                ...[...text.matchAll(socialRegex)].map(m => ({ type: 'social', val: m[0], index: m.index, color: 'rgba(123,0,255,0.3)' }))
            ].sort((a, b) => a.index - b.index);

            if (matches.length > 0) {
                const fragment = document.createDocumentFragment();
                let lastIndex = 0;

                matches.forEach(match => {
                    if (match.index < lastIndex) return; // Éviter les chevauchements

                    const val = match.val;
                    const list = match.type === 'email' ? foundEmails : (match.type === 'phone' ? foundPhones : foundSocials);

                    if (!list.includes(val)) {
                        list.push(val);
                        fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
                        const span = document.createElement('span');
                        span.className = 'extracted-item-highlight';
                        span.style.cssText = `background-color:${match.color};border-bottom:2px solid #ff6b6b;padding:2px 0;transition:all 0.3s ease;cursor:pointer;`;
                        span.textContent = val;
                        span.dataset.val = val;
                        span.dataset.type = match.type;
                        span.dataset.index = list.length - 1;

                        span.addEventListener('mouseenter', () => span.style.backgroundColor = 'rgba(255,107,107,0.5)');
                        span.addEventListener('mouseleave', () => span.style.backgroundColor = match.color);
                        span.addEventListener('click', (e) => {
                            e.stopPropagation();
                            highlightItem(match.type, parseInt(span.dataset.index));
                        });

                        fragment.appendChild(span);
                        emailElements.push(span); // On garde la même liste pour le scroll par simplicité pour l'instant
                        lastIndex = match.index + val.length;
                    }
                });

                if (lastIndex < text.length) fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
                if (fragment.childNodes.length > 0) node.parentNode.replaceChild(fragment, node);
            }

            // Notification de progression toutes les 10 itérations pour économiser des messages
            if (index % 10 === 0 || index === totalNodes - 1) {
                const progress = Math.min(95, Math.floor((index / totalNodes) * 95));
                chrome.runtime.sendMessage({ action: 'extractionProgress', progress });
            }
        });

        // Extraction aussi depuis les liens (href) pour les réseaux sociaux
        const links = document.querySelectorAll('a[href]');
        links.forEach(link => {
            const href = link.href;
            if (socialRegex.test(href) && !foundSocials.includes(href)) {
                foundSocials.push(href);
            }
        });

        if (isExtracting) {
            const resultData = {
                action: 'dataFound',
                emails: foundEmails,
                phones: foundPhones,
                socials: foundSocials,
                url: window.location.href,
                timestamp: new Date().toISOString()
            };
            chrome.runtime.sendMessage(resultData);
            chrome.runtime.sendMessage({ ...resultData, action: 'allDataExtracted' });
        }
        isExtracting = false;
    }

    function highlightItem(type, index) {
        // Pour l'instant on garde une gestion simple, on pourra affiner si besoin
        // par type si on sépare les emailElements
        const item = document.querySelector(`.extracted-item-highlight[data-type="${type}"][data-index="${index}"]`);
        if (item) {
            item.style.backgroundColor = '#ff6b6b';
            item.style.color = 'white';
            item.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
                const color = type === 'email' ? 'rgba(255,255,0,0.3)' : (type === 'phone' ? 'rgba(0,255,123,0.3)' : 'rgba(123,0,255,0.3)');
                item.style.backgroundColor = color;
                item.style.color = 'inherit';
            }, 2000);
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
