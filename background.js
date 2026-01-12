// background.js - Service Worker pour l'extension Email Extractor

// Initialisation du stockage
chrome.runtime.onInstalled.addListener(() => {
    console.log('Multi-Extractor extension installed');

    // Initialisation des données dans le stockage local
    chrome.storage.local.set({
        extractedEmails: [],
        extractedPhones: [],
        extractedSocials: [],
        totalItemsFound: 0,
        extractionHistory: []
    });
});

// Écoute les messages du content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'allDataExtracted':
            handleDataExtracted(message);
            sendResponse({ status: 'success' });
            break;

        case 'getStats':
            chrome.storage.local.get(['totalItemsFound', 'extractionHistory'], (data) => {
                sendResponse(data);
            });
            return true; // Indique qu'on va appeler sendResponse de façon asynchrone

        case 'clearData':
            chrome.storage.local.set({
                extractedEmails: [],
                extractedPhones: [],
                extractedSocials: [],
                totalItemsFound: 0,
                extractionHistory: []
            });
            sendResponse({ status: 'cleared' });
            break;

        case 'highlightEmail':
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'scrollToEmail',
                        index: message.index
                    });
                }
            });
            sendResponse({ status: 'highlighting' });
            break;

        default:
            sendResponse({ error: 'Action inconnue' });
    }
    return true; // Garde le canal ouvert pour sendResponse
});

// Gestion des données extraites
function handleDataExtracted(message) {
    const { emails, phones, socials, url, timestamp } = message;

    chrome.storage.local.get(['extractedEmails', 'extractedPhones', 'extractedSocials', 'totalItemsFound', 'extractionHistory'], (data) => {
        const existingEmails = new Set(data.extractedEmails || []);
        const existingPhones = new Set(data.extractedPhones || []);
        const existingSocials = new Set(data.extractedSocials || []);

        const newEmails = emails.filter(e => !existingEmails.has(e));
        const newPhones = phones.filter(p => !existingPhones.has(p));
        const newSocials = socials.filter(s => !existingSocials.has(s));

        const totalNew = newEmails.length + newPhones.length + newSocials.length;
        if (totalNew === 0) return;

        // Mise à jour
        const allEmails = [...(data.extractedEmails || []), ...newEmails];
        const allPhones = [...(data.extractedPhones || []), ...newPhones];
        const allSocials = [...(data.extractedSocials || []), ...newSocials];

        const historyEntry = {
            url,
            timestamp,
            counts: { emails: emails.length, phones: phones.length, socials: socials.length },
            newCounts: { emails: newEmails.length, phones: newPhones.length, socials: newSocials.length }
        };

        const updatedHistory = [...(data.extractionHistory || []), historyEntry].slice(-10);

        chrome.storage.local.set({
            extractedEmails: allEmails,
            extractedPhones: allPhones,
            extractedSocials: allSocials,
            totalItemsFound: (data.totalItemsFound || 0) + totalNew,
            extractionHistory: updatedHistory
        });

        // Notification
        showNotification(totalNew, url);
    });
}

// Affichage de notification
function showNotification(itemCount, url) {
    const domain = new URL(url).hostname;
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'images/icon128.png',
        title: 'Données trouvées !',
        message: `${itemCount} nouvelle(s) donnée(s) extraite(s) depuis ${domain}`,
        priority: 2
    });
}

// Gestion des onglets (optionnel)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Vous pourriez déclencher automatiquement l'extraction ici
        // Mais c'est généralement fait via le content script
    }
});
