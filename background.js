// background.js - Service Worker pour l'extension Email Extractor

// Initialisation du stockage
chrome.runtime.onInstalled.addListener(() => {
    console.log('Email Extractor extension installed');

    // Initialisation des données dans le stockage local
    chrome.storage.local.set({
        extractedEmails: [],
        totalEmailsFound: 0,
        extractionHistory: []
    });
});

// Écoute les messages du content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'emailsExtracted':
            handleEmailsExtracted(message.emails, message.url, message.timestamp);
            sendResponse({ status: 'success' });
            break;

        case 'getStats':
            chrome.storage.local.get(['totalEmailsFound', 'extractionHistory'], (data) => {
                sendResponse(data);
            });
            return true; // Indique qu'on va appeler sendResponse de façon asynchrone

        case 'clearData':
            chrome.storage.local.set({
                extractedEmails: [],
                totalEmailsFound: 0,
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

// Gestion des emails extraits
function handleEmailsExtracted(emails, url, timestamp) {
    if (!emails || emails.length === 0) return;

    chrome.storage.local.get(['extractedEmails', 'totalEmailsFound', 'extractionHistory'], (data) => {
        const existingEmails = new Set(data.extractedEmails || []);
        const newEmails = emails.filter(email => !existingEmails.has(email));

        if (newEmails.length === 0) return;

        // Mise à jour des emails
        const allEmails = [...(data.extractedEmails || []), ...newEmails];

        // Création de l'entrée d'historique
        const historyEntry = {
            url,
            timestamp,
            count: newEmails.length,
            emails: newEmails
        };

        // Garder seulement les 10 dernières entrées d'historique pour l'optimisation
        const currentHistory = data.extractionHistory || [];
        const updatedHistory = [...currentHistory, historyEntry].slice(-10);

        // Sauvegarde des données
        chrome.storage.local.set({
            extractedEmails: allEmails,
            totalEmailsFound: (data.totalEmailsFound || 0) + newEmails.length,
            extractionHistory: updatedHistory
        });

        // Notification à l'utilisateur
        showNotification(newEmails.length, url);
    });
}

// Affichage de notification
function showNotification(emailCount, url) {
    const domain = new URL(url).hostname;

    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'images/icon128.png',
        title: 'Emails trouvés !',
        message: `${emailCount} nouveau(x) email(s) extrait(s) depuis ${domain}`,
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
