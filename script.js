// Firebase Authentication and User Management
let currentUser = null;
let userCoins = 10000;

// Get numeric value for sum calculations - moved to top for online multiplayer access
function getCardNumericValue(value) {
    if (value === 'A') return 1;
    if (['J', 'Q', 'K'].includes(value)) return 0; // Face cards can't be used in sums
    return parseInt(value);
}

// Create shuffled deck - moved to top for online multiplayer access
function createShuffledDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const deck = [];
    
    for (let suit of suits) {
        for (let value of values) {
            deck.push({
                suit: suit,
                value: value,
                color: (suit === '♥' || suit === '♦') ? 'red' : 'black',
                numericValue: getCardNumericValue(value)
            });
        }
    }
    
    // Shuffle deck
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    
    return deck;
}

// Image cache to prevent duplicate network requests
const imageCache = new Map();

// Game logic variables - moved to top for accessibility
let selectedPlayerCard = null;
let selectedTableCards = [];

// Game state variables - moved to top for accessibility  
let deck = [];
let originalDeck = [];
let _playerHand = [];
let opponentHand = [];
let _tableCards = [];
let playerCapturedCards = [];
let opponentCapturedCards = [];
let currentPlayer = 0;

// Debug wrapper for playerHand
Object.defineProperty(window, 'playerHand', {
    get: function() {
        return _playerHand;
    },
    set: function(value) {
        console.log('=== PLAYER HAND CHANGED ===');
        console.log('From:', _playerHand.length, 'cards');
        console.log('To:', value ? value.length : 'null/undefined', 'cards');
        console.trace('Changed by:');
        _playerHand = value || [];
    }
});

// Debug wrapper for tableCards
Object.defineProperty(window, 'tableCards', {
    get: function() {
        return _tableCards;
    },
    set: function(value) {
        console.log('=== TABLE CARDS CHANGED ===');
        console.log('From:', _tableCards.length, 'cards');
        console.log('To:', value ? value.length : 'null/undefined', 'cards');
        console.trace('Changed by:');
        _tableCards = value || [];
    }
});

let gameScore = { player: 0, opponent: 0 };
let currentRound = 1;
let currentDeal = 1;
let lastCapturer = null;
let lastAction = null;

// Helper functions for game logic - moved up for accessibility
function canCapture(playerCard, tableCards) {
    if (!playerCard || !tableCards || tableCards.length === 0) {
        return false;
    }
    const tableSum = tableCards.reduce((sum, card) => sum + card.numericValue, 0);
    return tableSum === playerCard.numericValue;
}

// selectTableCard function - moved to top for global accessibility
function selectTableCard(cardIndex) {
    if (selectedPlayerCard === null) return; // Must select hand card first
    
    const tableCardIndex = selectedTableCards.indexOf(cardIndex);
    if (tableCardIndex > -1) {
        // Deselect table card
        selectedTableCards.splice(tableCardIndex, 1);
    } else {
        // Select table card
        selectedTableCards.push(cardIndex);
        
        // Check if current selection is a valid capture and auto-execute
        const playedCard = window.playerHand[selectedPlayerCard];
        const isValidCapture = isValidCaptureSelection(playedCard, selectedTableCards);
        
        if (isValidCapture) {
            console.log('Auto-executing capture with valid selection');
            console.log('DEBUG: playerHand before executeAction:', playerHand.length, 'cards');
            console.log('DEBUG: About to call executeAction...');
            executeAction('capture');
            return; // Exit early since capture is executed
        }
    }
    
    updateCardVisuals();
}

function isValidCaptureSelection(playedCard, selectedIndices) {
    if (selectedIndices.length === 0) return false;
    
    // Jack captures ALL table cards
    if (playedCard.value === 'J') {
        return selectedIndices.length === tableCards.length;
    }
    
    // Check rank capture (single card, exact match)
    if (selectedIndices.length === 1) {
        const tableCard = tableCards[selectedIndices[0]];
        return tableCard.value === playedCard.value;
    }
    
    // Check sum capture (multiple cards, must be number cards)
    if (playedCard.numericValue === 0) return false; // Face cards (except Jack) can't do sum captures
    
    const selectedCards = selectedIndices.map(index => tableCards[index]);
    const allAreNumbers = selectedCards.every(card => card.numericValue > 0);
    if (!allAreNumbers) return false;
    
    const sum = selectedCards.reduce((total, card) => total + card.numericValue, 0);
    return sum === playedCard.numericValue;
}

// Player card throwing animations - moved up for accessibility
function showPlayerCaptureMove(playerCardIndex, tableCardIndices, callback) {
    const playedCard = playerHand[playerCardIndex];
    const playerCardElements = document.querySelectorAll('#player-cards .card');
    const playerCardElement = playerCardElements[playerCardIndex];
    
    if (!playerCardElement) {
        callback();
        return;
    }
    
    // Create a visual copy of the player card to animate (like the bot does)
    const cardCopy = createCardElement(playedCard, true, 0, 1);
    cardCopy.style.position = 'absolute';
    cardCopy.style.zIndex = '1000';
    cardCopy.style.pointerEvents = 'none';
    
    // Position it at the player card location
    const playerCardRect = playerCardElement.getBoundingClientRect();
    const gameAreaRect = document.getElementById('game-area').getBoundingClientRect();
    
    cardCopy.style.left = (playerCardRect.left - gameAreaRect.left) + 'px';
    cardCopy.style.top = (playerCardRect.top - gameAreaRect.top) + 'px';
    cardCopy.style.width = playerCardRect.width + 'px';
    cardCopy.style.height = playerCardRect.height + 'px';
    
    document.getElementById('game-area').appendChild(cardCopy);
    
    // Hide the original player card
    gsap.set(playerCardElement, { opacity: 0 });
    
    // Create animation timeline - same style as AI
    const playerMoveTimeline = gsap.timeline({
        onComplete: () => {
            // Clean up and execute the actual move
            if (cardCopy.parentNode) {
                cardCopy.parentNode.removeChild(cardCopy);
            }
            callback();
        }
    });
    
    // Step 1: Move card to center
    const centerArea = document.querySelector('.center-area');
    const centerRect = centerArea.getBoundingClientRect();
    const targetX = (centerRect.left - gameAreaRect.left) + centerRect.width / 2 - playerCardRect.width / 2;
    const targetY = (centerRect.top - gameAreaRect.top) + centerRect.height / 2 - playerCardRect.height / 2;
    
    // Calculate scale to match table card size (make it smaller)
    const tableCardWidth = 140; // Smaller target size to match table cards better
    const playerCardWidth = playerCardRect.width;
    const targetScale = tableCardWidth / playerCardWidth;
    
    playerMoveTimeline.to(cardCopy, {
        duration: 0.2, // Much faster
        x: targetX - (playerCardRect.left - gameAreaRect.left),
        y: targetY - (playerCardRect.top - gameAreaRect.top),
        rotation: 0,
        scale: targetScale, // Scale down to match table card size
        ease: "power2.out"
    });
   
   // Step 2: Very brief pause at center
   playerMoveTimeline.to({}, { duration: 0.1 }); // Much shorter pause
    
    // Step 3: Animate capture - table cards fly to the player card
    const tableCardElements = document.querySelectorAll('#table-cards .card');
    const targetCards = tableCardIndices.map(index => tableCardElements[index]).filter(el => el);
    
    if (targetCards.length > 0) {
        playerMoveTimeline.call(() => {
            // Animate target cards flying to the player card - ultra fast
            targetCards.forEach((targetCard, index) => {
                if (targetCard) {
                    gsap.to(targetCard, {
                        duration: 0.15, // Ultra fast
                        x: targetX - (targetCard.getBoundingClientRect().left - gameAreaRect.left) + index * 2,
                        y: targetY - (targetCard.getBoundingClientRect().top - gameAreaRect.top) + index * 2,
                        rotation: (Math.random() - 0.5) * 20,
                        scale: 0.8,
                        ease: "power2.in",
                        delay: index * 0.02 // Shorter stagger
                    });
                }
            });
            
            // Animate the player card and captured cards disappearing
            const allCardsToHide = [cardCopy, ...targetCards].filter(el => el);
            if (allCardsToHide.length > 0) {
                gsap.to(allCardsToHide, {
                    duration: 0.1, // Ultra fast
                    opacity: 0,
                    scale: 0.5,
                    delay: 0.2
                });
            }
        }, 0.2); // Start capture animation sooner
        
        // Total timeline duration - ultra short
        playerMoveTimeline.to({}, { duration: 0.5 }); // Much shorter total time
    } else {
        // No cards to capture, just hide the played card
        playerMoveTimeline.to(cardCopy, {
            duration: 0.2,
            opacity: 0,
            scale: 0.8,
            delay: 0.2
        });
    }
 }

// Player lay move animation - moved up for accessibility
function showPlayerLayMove(playerCardIndex, callback) {
    const playedCard = playerHand[playerCardIndex];
    const playerCardElements = document.querySelectorAll('#player-cards .card');
    const playerCardElement = playerCardElements[playerCardIndex];
    
    if (!playerCardElement) {
        callback();
        return;
    }
    
    // Create a visual copy of the player card to animate
    const cardCopy = createCardElement(playedCard, true, 0, 1);
    cardCopy.style.position = 'absolute';
    cardCopy.style.zIndex = '1000';
    cardCopy.style.pointerEvents = 'none';
    
    // Position it at the player card location
    const playerCardRect = playerCardElement.getBoundingClientRect();
    const gameAreaRect = document.getElementById('game-area').getBoundingClientRect();
    
    cardCopy.style.left = (playerCardRect.left - gameAreaRect.left) + 'px';
    cardCopy.style.top = (playerCardRect.top - gameAreaRect.top) + 'px';
    cardCopy.style.width = playerCardRect.width + 'px';
    cardCopy.style.height = playerCardRect.height + 'px';
    
    document.getElementById('game-area').appendChild(cardCopy);
    
    // Hide the original player card
    gsap.set(playerCardElement, { opacity: 0 });
    
    // Create animation timeline
    const playerLayTimeline = gsap.timeline({
        onComplete: () => {
            // Clean up and execute the actual move
            if (cardCopy.parentNode) {
                cardCopy.parentNode.removeChild(cardCopy);
            }
            callback();
        }
    });
    
    // Step 1: Move card to center
    const centerArea = document.querySelector('.center-area');
    const centerRect = centerArea.getBoundingClientRect();
    const targetX = (centerRect.left - gameAreaRect.left) + centerRect.width / 2 - playerCardRect.width / 2;
    const targetY = (centerRect.top - gameAreaRect.top) + centerRect.height / 2 - playerCardRect.height / 2;
    
    // Calculate scale to match table card size (make it smaller)
    const tableCardWidth = 140; // Smaller target size to match table cards better
    const playerCardWidth = playerCardRect.width;
    const targetScale = tableCardWidth / playerCardWidth;
    
    playerLayTimeline.to(cardCopy, {
        duration: 0.2, // Much faster
        x: targetX - (playerCardRect.left - gameAreaRect.left),
        y: targetY - (playerCardRect.top - gameAreaRect.top),
        rotation: (Math.random() - 0.5) * 15,
        scale: targetScale, // Scale down to match table card size
        ease: "power2.out"
    });
   
   // Step 2: Very brief pause and then settle on table
   playerLayTimeline.to(cardCopy, {
       duration: 0.15, // Much faster
       y: targetY - (playerCardRect.top - gameAreaRect.top) + 20,
       scale: targetScale, // Keep the same small scale, don't expand
       ease: "power2.out",
       delay: 0.1 // Shorter delay
   });
   
   // Step 3: Fade out quickly
   playerLayTimeline.to(cardCopy, {
       duration: 0.1, // Much faster
       opacity: 0,
       delay: 0.1 // Shorter delay
   });
 }

// Animate lay card function - moved up for accessibility
function animateLayCard(playerCardIndex, callback) {
    const playerCardElement = document.querySelectorAll('#player-cards .card')[playerCardIndex];
    const tableCenter = document.getElementById('table-cards');
    
    // Safety checks
    if (!playerCardElement || !tableCenter) {
        console.log('Missing elements for lay animation, skipping');
        callback();
        return;
    }
    
    const tableBounds = tableCenter.getBoundingClientRect();
    const cardBounds = playerCardElement.getBoundingClientRect();
    const gameAreaRect = document.getElementById('game-area').getBoundingClientRect();
    
    // Calculate table center position
    const targetX = (tableBounds.left - gameAreaRect.left) + tableBounds.width / 2 - cardBounds.width / 2;
    const targetY = (tableBounds.top - gameAreaRect.top) + tableBounds.height / 2 - cardBounds.height / 2;
    
    // Create lay animation timeline
    const layTimeline = gsap.timeline({
        onComplete: callback
    });
    
    // Step 1: Lift card up slightly
    layTimeline.to(playerCardElement, {
        duration: 0.1,
        y: '-=20',
        scale: 1.1,
        ease: "power2.out"
    });
    
    // Step 2: Arc motion to table center
    layTimeline.to(playerCardElement, {
        duration: 0.3,
        x: targetX - (cardBounds.left - gameAreaRect.left),
        y: targetY - (cardBounds.top - gameAreaRect.top),
        rotation: (Math.random() - 0.5) * 30, // Random rotation for natural look
        scale: 1,
        ease: "power2.inOut",
        transformOrigin: "center"
    });
    
    // Step 3: Gentle bounce when landing
    layTimeline.to(playerCardElement, {
        duration: 0.1,
        scale: 0.95,
        ease: "power2.out"
    });
    
    // Step 4: Return to normal scale
    layTimeline.to(playerCardElement, {
        duration: 0.1,
        scale: 1,
        ease: "power2.out"
    });
}
 
// Helper functions for card creation - moved to top for online multiplayer access
function getCardImagePath(card) {
    // Convert suit symbols to standard names
    const suitNames = {
        '♠': 'spades',
        '♥': 'hearts', 
        '♦': 'diamonds',
        '♣': 'clubs'
    };
    
    const suitName = suitNames[card.suit];
    if (!suitName) return null;
    
    // Convert card values to standard names
    let valueName = card.value.toLowerCase();
    if (valueName === 'a') valueName = 'ace';
    if (valueName === 'j') valueName = 'jack';
    if (valueName === 'q') valueName = 'queen'; 
    if (valueName === 'k') valueName = 'king';
    
    // Create a cache key for this specific card
    const cacheKey = `${valueName}_of_${suitName}`;
    
    // Check if we already have a cached URL for this card
    if (imageCache.has(cacheKey)) {
        return imageCache.get(cacheKey);
    }
    
    // Create new URL with timestamp only once per card type
    const timestamp = Date.now();
    const imageUrl = `assets/cards/${valueName}_of_${suitName}.png?v=${timestamp}`;
    
    // Cache this URL for future use
    imageCache.set(cacheKey, imageUrl);
    
    return imageUrl;
}

function getFaceCardDisplay(value, suit) {
    if (['J', 'Q', 'K'].includes(value)) {
        return value; // Show J/Q/K instead of suit for face cards
    }
    if (value === 'A') {
        return 'A'; // Show A for Aces
    }
    return suit; // Show suit for number cards
}

function getCardFallbackHTML(value, suit, color) {
    return `
        <div class="card-inner">
            <div class="card-value ${color}" style="position: absolute; top: 8px; left: 8px; font-size: 24px; font-weight: bold; text-shadow: 0 1px 2px rgba(0,0,0,0.3);">${value}</div>
            <div class="card-suit ${color}" style="position: absolute; top: 36px; left: 8px; font-size: 22px; text-shadow: 0 1px 2px rgba(0,0,0,0.3);">${suit}</div>
            <div class="card-center ${color}" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 48px; font-weight: bold; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">${getFaceCardDisplay(value, suit)}</div>
            <div class="card-value ${color}" style="position: absolute; bottom: 8px; right: 8px; font-size: 24px; font-weight: bold; transform: rotate(180deg); text-shadow: 0 1px 2px rgba(0,0,0,0.3);">${value}</div>
            <div class="card-suit ${color}" style="position: absolute; bottom: 36px; right: 8px; font-size: 22px; transform: rotate(180deg); text-shadow: 0 1px 2px rgba(0,0,0,0.3);">${suit}</div>
        </div>
    `;
}

function createCardElement(card, faceUp, index, totalCards) {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'card';
    cardDiv.dataset.index = index;
    
    if (faceUp && card) {
        // Face up card with enhanced styling and custom graphics support
        cardDiv.classList.add('card-front');
        
        // Check if we have custom graphics for this card
        const cardImagePath = getCardImagePath(card);
        
        if (cardImagePath) {
            // Use custom card image
            cardDiv.innerHTML = `
                <div class="card-inner custom-card">
                    <img src="${cardImagePath}" alt="${card.value} of ${card.suit}" class="card-image" 
                         onerror="this.parentElement.innerHTML = getCardFallbackHTML('${card.value}', '${card.suit}', '${card.color}');">
                </div>
            `;
        } else {
            // Use original text-based design as fallback
            cardDiv.innerHTML = getCardFallbackHTML(card.value, card.suit, card.color);
        }
    } else {
        // Face down card with pattern
        cardDiv.classList.add('card-back');
        cardDiv.innerHTML = `
            <div class="card-back-pattern" style="
                width: 100%;
                height: 100%;
                background: linear-gradient(45deg, #1e40af 25%, #3b82f6 25%, #3b82f6 50%, #1e40af 50%, #1e40af 75%, #3b82f6 75%);
                background-size: 8px 8px;
                border-radius: 8px;
                position: relative;
                overflow: hidden;
            ">
                <div style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    color: white;
                    font-size: 24px;
                    font-weight: bold;
                    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
                ">🂠</div>
            </div>
        `;
    }
    
    // Add subtle entrance animation class
    cardDiv.classList.add('card-entering');
    
    return cardDiv;
}

// createAndAnimateCards function - moved to top for online multiplayer access
function createAndAnimateCards() {
    const playerCardsContainer = document.getElementById('player-cards');
    const opponentCardsContainer = document.getElementById('opponent-cards');
    let tableCardsDiv = document.getElementById('table-cards');
    
    // Safety check - if basic containers don't exist, skip animation
    if (!playerCardsContainer || !opponentCardsContainer) {
        console.log('Basic card containers not found, skipping createAndAnimateCards');
        console.log('Player container:', !!playerCardsContainer);
        console.log('Opponent container:', !!opponentCardsContainer);
        return;
    }
    
    // Create table-cards element if it doesn't exist (needed for online multiplayer)
    if (!tableCardsDiv) {
        console.log('Table cards container not found, creating it...');
        const centerArea = document.querySelector('.center-area');
        if (centerArea) {
            // Create the table-cards container
            centerArea.innerHTML = '<div class="table-cards" id="table-cards"></div>';
            tableCardsDiv = document.getElementById('table-cards');
            console.log('Table cards container created successfully');
        } else {
            console.log('Center area not found, cannot create table cards container');
            return;
        }
    }
    
    // Clear containers first to prevent duplicate cards
    playerCardsContainer.innerHTML = '';
    opponentCardsContainer.innerHTML = '';
    tableCardsDiv.innerHTML = '';
    
    const playerCardElements = [];
    const opponentCardElements = [];
    const tableCardElements = [];
    
    // Create player cards (face up) - start from deck position
    playerHand.forEach((card, i) => {
        const cardElement = createCardElement(card, true, i, playerHand.length);
        cardElement.style.opacity = '0';
        cardElement.style.transform = 'translate(-50px, -200px) rotate(0deg) scale(0.8)';
        cardElement.addEventListener('click', () => playCard(i));
        playerCardsContainer.appendChild(cardElement);
        playerCardElements.push(cardElement);
    });
    
    // Create opponent cards (face down) - start from deck position
    opponentHand.forEach((card, i) => {
        const cardElement = createCardElement(null, false, i, opponentHand.length);
        cardElement.style.opacity = '0';
        cardElement.style.transform = 'translate(-50px, 200px) rotate(0deg) scale(0.8)';
        opponentCardsContainer.appendChild(cardElement);
        opponentCardElements.push(cardElement);
    });
    
    // Create table cards (face up) - start from deck position  
    tableCards.forEach((card, i) => {
        const cardElement = createCardElement(card, true, i, tableCards.length);
        cardElement.style.opacity = '0';
        cardElement.style.transform = 'translate(-50px, 0px) rotate(0deg) scale(0.8)';
        cardElement.classList.add('table-card');
        cardElement.addEventListener('click', () => selectTableCard(i));
        tableCardsDiv.appendChild(cardElement);
        tableCardElements.push(cardElement);
    });
    
    // SIMPLIFIED ANIMATION - No complex GSAP timeline to avoid errors
    try {
        console.log('Starting simplified card dealing animation...');
        
        // Animate player cards - faster
        playerCardElements.forEach((card, index) => {
            setTimeout(() => {
                if (card && card.parentNode) {
                    gsap.to(card, {
                        duration: 0.15, // Much faster
                        opacity: 1,
                        x: 0,
                        y: 0,
                        rotation: 0,
                        scale: 1,
                        ease: "power2.out"
                    });
                }
            }, index * 25); // Shorter delay
        });
        
        // Animate opponent cards - faster
        opponentCardElements.forEach((card, index) => {
            setTimeout(() => {
                if (card && card.parentNode) {
                    gsap.to(card, {
                        duration: 0.15, // Much faster
                        opacity: 1,
                        x: 0,
                        y: 0,
                        rotation: 0,
                        scale: 1,
                        ease: "power2.out"
                    });
                }
            }, (index + playerCardElements.length) * 25); // Shorter delay
        });
        
        // Animate table cards - faster
        tableCardElements.forEach((card, index) => {
            setTimeout(() => {
                if (card && card.parentNode) {
                    gsap.to(card, {
                        duration: 0.15, // Much faster
                        opacity: 1,
                        x: 0,
                        y: 0,
                        rotation: 0,
                        scale: 1,
                        ease: "power2.out"
                    });
                }
            }, (index + playerCardElements.length + opponentCardElements.length) * 25); // Shorter delay
        });
        
    } catch (error) {
        console.error('Animation error, falling back to immediate display:', error);
        // Fallback: Just show cards immediately
        [...playerCardElements, ...opponentCardElements, ...tableCardElements].forEach(card => {
            if (card) {
                card.style.opacity = '1';
                card.style.transform = 'translate(0, 0) rotate(0deg) scale(1)';
            }
        });
    }
    
    // Position cards in hand formation
    positionCardsInHand(playerCardElements, true);
    positionCardsInHand(opponentCardElements, false);
    positionTableCards(tableCardElements);
    
    // Update game UI after cards are positioned
    setTimeout(() => {
        console.log('About to call updateGameUI and updateCardVisuals...');
        console.log('Player hand length:', playerHand.length);
        console.log('Opponent hand length:', opponentHand.length);
        console.log('Table cards length:', tableCards.length);
        
        updateGameUI();
        updateCardVisuals();
        updatePlayerAvatarInGameUI();
        updateOpponentAvatarInGameUI();
        
        console.log('Checking if cards are in DOM...');
        const playerCards = document.querySelectorAll('#player-cards .card');
        const opponentCards = document.querySelectorAll('#opponent-cards .card');
        const tableCardsInDOM = document.querySelectorAll('#table-cards .card');
        console.log('Player cards in DOM:', playerCards.length);
        console.log('Opponent cards in DOM:', opponentCards.length);
        console.log('Table cards in DOM:', tableCardsInDOM.length);
        
        console.log(`=== DEAL ${currentDeal} COMPLETE ===`);
        console.log(`Deck integrity: ${deck.length + tableCards.length + playerHand.length + opponentHand.length} = 52? ${deck.length + tableCards.length + playerHand.length + opponentHand.length === 52}`);
    }, 2000);
}

// showGameArea function - moved to top for online multiplayer access
function showGameArea() {
    console.log('=== SHOW GAME AREA CALLED ===');
    console.log('Setting display styles...');
    
    // Hide all other screens
    const authScreen = document.getElementById('auth-screen');
    const userDashboard = document.getElementById('user-dashboard');
    const winningScreen = document.getElementById('winning-screen');
    const loadingScreen = document.getElementById('loading-screen');
    const mainMenu = document.getElementById('main-menu');
    const difficultyMenu = document.getElementById('difficulty-menu');
    const gameArea = document.getElementById('game-area');
    
    if (authScreen) authScreen.style.setProperty('display', 'none', 'important');
    if (userDashboard) userDashboard.style.setProperty('display', 'none', 'important');
    if (mainMenu) mainMenu.style.setProperty('display', 'none', 'important');
    if (difficultyMenu) difficultyMenu.style.setProperty('display', 'none', 'important');
    if (loadingScreen) loadingScreen.style.setProperty('display', 'none', 'important');
    if (winningScreen) winningScreen.style.setProperty('display', 'none', 'important');
    
    // Show game area
    if (gameArea) {
        gameArea.style.setProperty('display', 'flex', 'important');
        gameArea.style.setProperty('visibility', 'visible', 'important');
        gameArea.style.setProperty('opacity', '1', 'important');
    }
    
    // Prevent scrolling on mobile during game
    if (window.innerWidth <= 768) {
        document.body.classList.add('game-active');
    }
    
    console.log('Game area display set to flex');
    console.log('All screen elements checked and forced');
    console.log('Game area final display:', gameArea ? gameArea.style.display : 'gameArea not found');
}

// playCard function - moved to top for online multiplayer access
function playCard(cardIndex) {
    console.log('=== PLAY CARD CALLED ===');
    console.log('Card index:', cardIndex);
    console.log('isOnlineGame:', window.isOnlineGame);
    console.log('playerHand length:', playerHand.length);
    console.log('currentPlayer:', currentPlayer);
    
    if (selectedPlayerCard === cardIndex) {
        // Deselect card
        selectedPlayerCard = null;
        updateCardVisuals();
        return;
    }
    
    const playedCard = window.playerHand[cardIndex];
    console.log(`Selected card: ${playedCard.value}${playedCard.suit}`);
    console.log('Played card object:', playedCard);
    console.log('Played card numericValue:', playedCard.numericValue);
    
    // Set selected card
    selectedPlayerCard = cardIndex;
    selectedTableCards = [];
    
    // Auto-execute for Jack (captures all table cards)
    if (playedCard.value === 'J' && tableCards.length > 0) {
        selectedTableCards = tableCards.map((_, index) => index);
        executeAction('capture');
        return;
    }
    
    // Check for exact rank matches
    const exactMatches = [];
    tableCards.forEach((tableCard, index) => {
        if (tableCard.value === playedCard.value) {
            exactMatches.push(index);
        }
    });
    
    // Check for sum captures
    const validCaptures = getValidCaptures(playedCard);
    const sumCaptures = validCaptures.filter(capture => capture.type === 'sum');
    
    // Debug: Log all capture information
    console.log(`DEBUG - Card: ${playedCard.value}${playedCard.suit}`);
    console.log(`DEBUG - Exact matches: ${exactMatches.length}`, exactMatches);
    console.log(`DEBUG - All valid captures: ${validCaptures.length}`, validCaptures);
    console.log(`DEBUG - Sum captures: ${sumCaptures.length}`, sumCaptures);
    console.log(`DEBUG - Table cards:`, tableCards.map(c => c.value + c.suit));
    
    // If only one capture option exists, auto-execute it
    if (exactMatches.length === 1 && sumCaptures.length === 0) {
        // Single exact match only
        selectedTableCards = exactMatches;
        executeAction('capture');
        return;
    } else if (exactMatches.length === 0 && sumCaptures.length === 1) {
        // Single sum capture only
        selectedTableCards = sumCaptures[0].cards;
        executeAction('capture');
        return;
    } else if (exactMatches.length === 0 && sumCaptures.length === 0) {
        // NO CAPTURES POSSIBLE - auto-lay the card
        console.log(`No captures possible for ${playedCard.value}${playedCard.suit} - auto-laying card`);
        executeAction('lay');
        return;
    }
    
    // Multiple capture options - show manual selection interface
    updateCardVisuals();
    
    // Highlight suggested captures
    if (exactMatches.length > 0) {
        const tableCardElements = document.querySelectorAll('#table-cards .card');
        exactMatches.forEach(index => {
            if (tableCardElements[index]) {
                tableCardElements[index].classList.add('suggested');
            }
        });
    }
}

// positionCardsInHand function - moved to top for online multiplayer access
function positionCardsInHand(cards, isPlayer) {
    if (!cards || cards.length === 0) return;
    
    const containerWidth = 400;
    const cardWidth = 60;
    const maxOverlap = 40;
    
    let overlapAmount = Math.min(maxOverlap, (containerWidth - cardWidth) / Math.max(1, cards.length - 1));
    if (cards.length === 1) overlapAmount = 0;
    
    const totalWidth = cardWidth + (cards.length - 1) * overlapAmount;
    const centerOffset = totalWidth / 2 - cardWidth / 2;
    
    cards.forEach((card, index) => {
        const x = (index * overlapAmount) - centerOffset;
        const y = 0;
        
        // Add slight rotation for more natural hand appearance
        const rotation = isPlayer ? (index - (cards.length - 1) / 2) * 3 : 0;
        
        const originalTransform = {
            x: x,
            y: y,
            rotation: rotation,
            scale: 1,
            zIndex: index + 1
        };
        
        card._originalTransform = originalTransform;
        
        gsap.killTweensOf(card);
        
        gsap.set(card, {
            x: originalTransform.x,
            y: originalTransform.y,
            rotation: originalTransform.rotation,
            scale: originalTransform.scale,
            zIndex: originalTransform.zIndex,
            transformOrigin: "bottom center"
        });
    });
}

// positionTableCards function - moved to top for online multiplayer access
function positionTableCards(cards) {
    if (!cards || cards.length === 0) return;
    
    const containerWidth = 400;
    const cardWidth = 60;
    const maxOverlap = 50;
    
    let overlapAmount = Math.min(maxOverlap, (containerWidth - cardWidth) / Math.max(1, cards.length - 1));
    if (cards.length === 1) overlapAmount = 0;
    
    const totalWidth = cardWidth + (cards.length - 1) * overlapAmount;
    const centerOffset = totalWidth / 2 - cardWidth / 2;
    
    cards.forEach((card, index) => {
        const x = (index * overlapAmount) - centerOffset;
        const y = 0;
        
        const originalTransform = {
            x: x,
            y: y,
            rotation: 0,
            scale: 1,
            zIndex: index + 1
        };
        
        card._originalTransform = originalTransform;
        
        gsap.killTweensOf(card);
        
        gsap.set(card, {
            x: originalTransform.x,
            y: originalTransform.y,
            rotation: originalTransform.rotation,
            scale: originalTransform.scale,
            zIndex: originalTransform.zIndex,
            transformOrigin: "center"
        });
        
        // Add hover effects with stored transform reference
        const currentOriginalTransform = { ...originalTransform };
        
        card._tableMouseEnterHandler = () => {
            gsap.killTweensOf(card);
            gsap.to(card, {
                duration: 0.05,
                x: currentOriginalTransform.x,
                y: currentOriginalTransform.y - 8,
                rotation: currentOriginalTransform.rotation,
                scale: currentOriginalTransform.scale,
                ease: "power2.out"
            });
            
            card.style.boxShadow = '0 3px 12px rgba(34, 197, 94, 0.25), 0 0 0 1px rgba(34, 197, 94, 0.15)';
        };
        
        card._tableMouseLeaveHandler = () => {
            if (!card.classList.contains('selected')) {
                gsap.killTweensOf(card);
                gsap.to(card, {
                    duration: 0.05,
                    x: currentOriginalTransform.x,
                    y: currentOriginalTransform.y,
                    rotation: currentOriginalTransform.rotation,
                    scale: currentOriginalTransform.scale,
                    ease: "power2.out"
                });
                
                card.style.boxShadow = '';
            }
        };
        
        card.addEventListener('mouseenter', card._tableMouseEnterHandler);
        card.addEventListener('mouseleave', card._tableMouseLeaveHandler);
    });
}

// Create game UI panel function
function createGameUI() {
    // Remove existing game UI if it exists
    const existingGameUI = document.getElementById('game-ui');
    if (existingGameUI) {
        existingGameUI.remove();
    }
    
    // Create the game UI container
    const gameUI = document.createElement('div');
    gameUI.id = 'game-ui';
    gameUI.className = 'game-ui';
    
    // Create the game info panel
    const gameInfo = document.createElement('div');
    gameInfo.className = 'game-info';
    gameInfo.innerHTML = `
        <div class="game-info-header">
            <h3>Konchina</h3>
            <div class="deal-indicator">Deal ${currentDeal}</div>
        </div>
        
        <div class="score-section">
            <div class="score-title">Score</div>
            <div class="score-display">
                <div class="player-score">
                    <div class="score-avatar player-avatar-small" id="game-player-avatar">👤</div>
                    <div class="score-info">
                        <div class="score-label">You</div>
                        <div class="score-value" id="player-score">${gameScore.player}</div>
                    </div>
                </div>
                <div class="score-divider">-</div>
                                 <div class="opponent-score">
                     <div class="score-avatar opponent-avatar-small" id="game-opponent-avatar">
                         <svg viewBox="0 0 24 24" fill="currentColor">
                             <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 7V9C15 11.8 12.8 14 10 14S5 11.8 5 9V7L3 7V9C3 12.5 5.6 15.4 9 15.9V22H11V15.9C14.4 15.4 17 12.5 17 9H21Z"/>
                         </svg>
                     </div>
                     <div class="score-info">
                         <div class="score-label" id="opponent-label">AI</div>
                         <div class="score-value" id="opponent-score">${gameScore.opponent}</div>
                     </div>
                 </div>
            </div>
        </div>
        
        <div class="cards-info">
            <div class="card-count-row">
                <div class="card-count-item">
                    <div class="count-label">Your Cards</div>
                    <div class="count-value" id="player-card-count">${playerHand.length}</div>
                </div>
                <div class="card-count-item">
                    <div class="count-label">Table</div>
                    <div class="count-value" id="table-card-count">${tableCards.length}</div>
                </div>
                <div class="card-count-item">
                    <div class="count-label">AI Cards</div>
                    <div class="count-value" id="opponent-card-count">${opponentHand.length}</div>
                </div>
            </div>
        </div>
        
        <div class="action-buttons" id="action-buttons" style="display: none;">
            <button class="action-btn primary" id="capture-btn" onclick="executeAction('capture')">Capture</button>
            <button class="action-btn" id="lay-btn" onclick="executeAction('lay')">Lay Card</button>
        </div>
    `;
    
    gameUI.appendChild(gameInfo);
    
    // Add to game area
    const gameArea = document.getElementById('game-area');
    if (gameArea) {
        gameArea.appendChild(gameUI);
    }
    
    // Update player avatar if available
    updatePlayerAvatarInGameUI();
}

// Essential UI functions moved to top for online multiplayer access
function updateGameUI() {
    const currentPlayerElement = document.getElementById('current-player');
    const playerScoreElement = document.getElementById('player-score');
    const opponentScoreElement = document.getElementById('opponent-score');
    const roundElement = document.getElementById('current-round');
    const dealElement = document.getElementById('current-deal');
    const playerCardCountElement = document.getElementById('player-card-count');
    const tableCardCountElement = document.getElementById('table-card-count');
    const opponentCardCountElement = document.getElementById('opponent-card-count');
    const dealIndicator = document.querySelector('.deal-indicator');
    
    if (currentPlayerElement) {
        currentPlayerElement.textContent = currentPlayer === 0 ? "Your Turn" : "Opponent's Turn";
        currentPlayerElement.style.color = currentPlayer === 0 ? '#10b981' : '#f59e0b';
    }
    
    if (playerScoreElement) playerScoreElement.textContent = gameScore.player;
    if (opponentScoreElement) opponentScoreElement.textContent = gameScore.opponent;
    if (roundElement) roundElement.textContent = currentRound;
    if (dealElement) dealElement.textContent = currentDeal;
    if (playerCardCountElement) playerCardCountElement.textContent = playerHand.length;
    if (tableCardCountElement) tableCardCountElement.textContent = tableCards.length;
    if (opponentCardCountElement) opponentCardCountElement.textContent = opponentHand.length;
    if (dealIndicator) dealIndicator.textContent = `Deal ${currentDeal}`;
}

// Update player avatar in game UI
function updatePlayerAvatarInGameUI() {
    const gamePlayerAvatar = document.getElementById('game-player-avatar');
    if (gamePlayerAvatar && window.currentUserData?.profilePicture) {
        gamePlayerAvatar.style.setProperty('--avatar-url', `url(${window.currentUserData.profilePicture})`);
        gamePlayerAvatar.classList.add('has-image');
        gamePlayerAvatar.textContent = '';
    }
}

// Update opponent avatar and info in game UI
function updateOpponentAvatarInGameUI() {
    const gameOpponentAvatar = document.getElementById('game-opponent-avatar');
    const opponentLabel = document.getElementById('opponent-label');
    
    // Check if we're in an online game and have opponent data
    if (isOnlineGame && window.opponentData) {
        // Update opponent avatar
        if (gameOpponentAvatar && window.opponentData.profilePicture) {
            gameOpponentAvatar.style.setProperty('--avatar-url', `url(${window.opponentData.profilePicture})`);
            gameOpponentAvatar.classList.add('has-image');
            gameOpponentAvatar.textContent = '';
        } else if (gameOpponentAvatar) {
            // Fallback to emoji if no profile picture
            gameOpponentAvatar.classList.remove('has-image');
            gameOpponentAvatar.textContent = '🤖';
        }
        
        // Update opponent name
        if (opponentLabel) {
            opponentLabel.textContent = window.opponentData.username || 'Opponent';
        }
    } else {
        // Offline game - show AI
        if (gameOpponentAvatar) {
            gameOpponentAvatar.classList.remove('has-image');
            gameOpponentAvatar.textContent = '🤖';
        }
        if (opponentLabel) {
            opponentLabel.textContent = 'AI';
        }
    }
}

// updateGameDisplay function - moved to top for online multiplayer access
function updateGameDisplay() {
    // Get existing containers
    const playerCardsContainer = document.getElementById('player-cards');
    const opponentCardsContainer = document.getElementById('opponent-cards');
    const tableCardsContainer = document.getElementById('table-cards');
    
    // Only update if the number of cards has changed to avoid unnecessary DOM manipulation
    const currentPlayerCards = playerCardsContainer.children.length;
    const currentOpponentCards = opponentCardsContainer.children.length;
    const currentTableCards = tableCardsContainer.children.length;
    
    // Only recreate player cards if count changed
    if (currentPlayerCards !== playerHand.length) {
        playerCardsContainer.innerHTML = '';
        const playerCardElements = [];
        playerHand.forEach((card, index) => {
            const cardElement = createCardElement(card, true, index, playerHand.length);
            cardElement.addEventListener('click', () => playCard(index));
            playerCardsContainer.appendChild(cardElement);
            playerCardElements.push(cardElement);
        });
        positionCardsInHand(playerCardElements, true);
    }
    
    // Only recreate opponent cards if count changed
    if (currentOpponentCards !== opponentHand.length) {
        opponentCardsContainer.innerHTML = '';
        const opponentCardElements = [];
        opponentHand.forEach((card, index) => {
            const cardElement = createCardElement(null, false, index, opponentHand.length);
            opponentCardsContainer.appendChild(cardElement);
            opponentCardElements.push(cardElement);
        });
        positionCardsInHand(opponentCardElements, false);
    }
    
    // Only recreate table cards if count changed
    if (currentTableCards !== tableCards.length) {
        tableCardsContainer.innerHTML = '';
        const tableCardElements = [];
        tableCards.forEach((card, index) => {
            const cardElement = createCardElement(card, true, index, tableCards.length);
            cardElement.classList.add('table-card');
            cardElement.addEventListener('click', () => selectTableCard(index));
            tableCardsContainer.appendChild(cardElement);
            tableCardElements.push(cardElement);
        });
        positionTableCards(tableCardElements);
    }
    
    // Update UI elements
    updateGameUI();
    updateCardVisuals();
    updatePlayerAvatarInGameUI();
    updateOpponentAvatarInGameUI();
}

// updateCardVisuals function - moved to top for online multiplayer access
function updateCardVisuals() {
    const playerCards = document.querySelectorAll('#player-cards .card');
    const tableCards = document.querySelectorAll('#table-cards .card');
    
    // Update player cards - remove all turn-based restrictions
    playerCards.forEach((card, index) => {
        card.classList.remove('selected', 'disabled');
        card.removeAttribute('disabled');
        
        if (selectedPlayerCard === index) {
            card.classList.add('selected');
        }
    });
    
    // Update table cards
    tableCards.forEach((card, index) => {
        card.classList.remove('selected', 'capturable');
        
        if (selectedTableCards.includes(index)) {
            card.classList.add('selected');
        }
        
        if (selectedPlayerCard !== null) {
            const playerCard = playerHand[selectedPlayerCard];
            const tableCard = tableCards[index];
            
            if (playerCard && canCapture(playerCard, [tableCard])) {
                card.classList.add('capturable');
            }
        }
    });
}

// getValidCaptures function - moved to top for online multiplayer access
function getValidCaptures(playedCard) {
    const validCaptures = [];
    
    // Jack captures ALL table cards
    if (playedCard.value === 'J') {
        if (tableCards.length > 0) {
            validCaptures.push({
                type: 'jack',
                cards: tableCards.map((_, index) => index),
                description: `Jack captures all ${tableCards.length} table cards`
            });
        }
        return validCaptures; // Jack can only capture all or nothing
    }
    
    // Capture by rank (exact match)
    tableCards.forEach((tableCard, index) => {
        if (tableCard.value === playedCard.value) {
            validCaptures.push({
                type: 'rank',
                cards: [index],
                description: `Capture ${tableCard.value} with ${playedCard.value}`
            });
        }
    });
    
    // Capture by sum (only for number cards)
    if (playedCard.numericValue > 0) {
        const sumCaptures = findSumCaptures(playedCard.numericValue);
        validCaptures.push(...sumCaptures);
    }
    
    return validCaptures;
}

// findSumCaptures helper function
function findSumCaptures(targetSum) {
    const captures = [];
    const numericTableCards = tableCards.map((card, index) => ({
        index,
        value: card.numericValue,
        card
    })).filter(item => item.value > 0); // Only number cards can be used in sums
    
    // Find all combinations that sum to target
    function findCombinations(cards, target, current = [], start = 0) {
        if (target === 0 && current.length > 1) { // Need at least 2 cards for sum capture
            captures.push({
                type: 'sum',
                cards: current.map(item => item.index),
                description: `Capture ${current.map(item => item.card.value).join('+')} = ${targetSum}`
            });
            return;
        }
        
        for (let i = start; i < cards.length; i++) {
            const card = cards[i];
            if (card.value <= target) {
                findCombinations(cards, target - card.value, [...current, card], i + 1);
            }
        }
    }
    
    findCombinations(numericTableCards, targetSum);
    return captures;
}

// Authentication state listener
document.addEventListener('DOMContentLoaded', function() {
    // Check if Firebase is loaded
    if (typeof window.auth === 'undefined') {
        console.log('Firebase not loaded, using demo mode');
        showAuthScreen();
        return;
    }

    // Listen for authentication state changes
    window.onAuthStateChanged(window.auth, (user) => {
        if (user) {
            currentUser = user;
            loadUserData(user.uid);
        } else {
            currentUser = null;
            showAuthScreen();
        }
    });
});

// Show authentication screen
function showAuthScreen() {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('user-dashboard').style.display = 'none';
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('game-area').style.display = 'none';
}

// Show user dashboard
function showUserDashboard() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('user-dashboard').style.display = 'flex';
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('game-area').style.display = 'none';
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('winning-screen').style.display = 'none';
    
    // Always scroll to top when dashboard loads (especially important on mobile)
    window.scrollTo(0, 0);
    document.body.scrollTop = 0; // For Safari
    document.documentElement.scrollTop = 0; // For Chrome, Firefox, IE and Opera
    
    // Re-enable scrolling when returning to dashboard
    document.body.classList.remove('game-active');
    
    // Update user info in dashboard
    if (currentUser) {
        document.getElementById('user-name').textContent = currentUser.displayName || 'Player';
        document.getElementById('user-coin-count').textContent = userCoins.toLocaleString();
        updateAvatarDisplay();
        updatePlayerInfoInGame();
        
        // Check for pending coin reward and show animation
        if (window.pendingCoinReward && window.pendingCoinReward > 0) {
            // Temporarily show the balance before the reward for animation
            const rewardAmount = window.pendingCoinReward;
            const currentBalance = userCoins;
            const previousBalance = currentBalance - rewardAmount;
            
            // Show previous balance first
            const coinCountElement = document.getElementById('user-coin-count');
            if (coinCountElement) {
                coinCountElement.textContent = previousBalance.toLocaleString();
            }
            
            setTimeout(() => {
                showCoinAdditionAnimation(rewardAmount);
                window.pendingCoinReward = 0; // Clear the pending reward
            }, 500); // Small delay to let dashboard load
        }
    }
}

// Authentication form handlers
document.addEventListener('click', function(event) {
    // Show signup form
    if (event.target.id === 'show-signup') {
        event.preventDefault();
        document.getElementById('login-form').classList.remove('active');
        document.getElementById('signup-form').classList.add('active');
        // Toggle account switching messages
        document.getElementById('login-switch').style.display = 'none';
        document.getElementById('signup-switch').style.display = 'block';
    }
    
    // Show login form
    if (event.target.id === 'show-login') {
        event.preventDefault();
        document.getElementById('signup-form').classList.remove('active');
        document.getElementById('login-form').classList.add('active');
        // Toggle account switching messages
        document.getElementById('login-switch').style.display = 'block';
        document.getElementById('signup-switch').style.display = 'none';
    }
    
    // Removed start game button handler
    
    // Logout
    if (event.target.id === 'logout-btn' || event.target.closest('#logout-btn')) {
        logout();
    }
    
    // Game mode selection
    if (event.target.closest('.mode-card')) {
        const modeCard = event.target.closest('.mode-card');
        if (modeCard.querySelector('h4').textContent.includes('Practice')) {
            selectGameMode('practice');
        } else if (modeCard.querySelector('h4').textContent.includes('Ranked')) {
            selectGameMode('ranked');
        } else if (modeCard.querySelector('h4').textContent.includes('Play Online')) {
            // Check if Firebase is available for online play
            if (!window.db) {
                showGameEndMessage('Online play requires Firebase. Please check your connection.', 'error');
                return;
            }
            selectGameMode('online');
        }
    }
    
    // Profile picture edit button
    if (event.target.id === 'avatar-edit-btn' || event.target.closest('#avatar-edit-btn')) {
        event.preventDefault();
        document.getElementById('avatar-upload').click();
    }
    
    // Game score window player avatar click
    if (event.target.id === 'game-player-avatar' || event.target.closest('#game-player-avatar')) {
        event.preventDefault();
        event.stopPropagation();
        toggleGameStatsPanel();
    }
    
    // Dashboard avatar click
    if (event.target.id === 'user-avatar' || event.target.closest('#user-avatar')) {
        event.preventDefault();
        event.stopPropagation();
        // Only show stats if not clicking the edit button
        if (!event.target.closest('#avatar-edit-btn')) {
            showDashboardStatsPanel();
        }
    }
    
    // Close dashboard stats panel when clicking overlay
    if (event.target.id === 'dashboard-stats-overlay') {
        hideDashboardStatsPanel();
    }
    
    // Close game stats panel when clicking elsewhere
    const gameStatsPanel = document.getElementById('game-stats-panel');
    if (gameStatsPanel && gameStatsPanel.style.display === 'block') {
        if (!event.target.closest('.game-stats-panel') && !event.target.closest('#game-player-avatar')) {
            closeGameStatsPanel();
        }
    }
    
    // Exit game button
    if (event.target.id === 'exit-game-btn' || event.target.closest('#exit-game-btn')) {
        event.preventDefault();
        exitGame();
    }
});

// Profile picture upload handler
document.addEventListener('change', function(event) {
    if (event.target.id === 'avatar-upload') {
        const file = event.target.files[0];
        if (file) {
            handleProfilePictureUpload(file);
        }
    }
});

// Form submission handlers
document.addEventListener('submit', function(event) {
    if (event.target.id === 'login-form-element') {
        event.preventDefault();
        handleLogin();
    }
    
    if (event.target.id === 'signup-form-element') {
        event.preventDefault();
        handleSignup();
    }
});

// Handle login
async function handleLogin() {
    console.log('=== LOGIN ATTEMPT ===');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const loginBtn = document.querySelector('#login-form .auth-btn');
    const btnText = loginBtn.querySelector('.btn-text');
    const btnLoading = loginBtn.querySelector('.btn-loading');
    
    console.log('Firebase auth object:', window.auth);
    console.log('Firebase db object:', window.db);
    
    // Clear previous errors
    const existingError = document.querySelector('.auth-error');
    if (existingError) {
        existingError.remove();
    }
    
    // Basic validation
    if (!email || !password) {
        showAuthError('Please fill in all fields.');
        return;
    }
    
    if (!validateEmail(email)) {
        showAuthError('Please enter a valid email address.');
        return;
    }
    
    // Show loading state
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';
    loginBtn.disabled = true;
    
    try {
        if (window.auth && window.signInWithEmailAndPassword) {
            // Real Firebase login
            await window.signInWithEmailAndPassword(window.auth, email, password);
        } else {
            // Demo mode - simulate login
            setTimeout(() => {
                // Check if demo user exists in localStorage
                const demoUserId = 'demo-user-' + btoa(email).replace(/[^a-zA-Z0-9]/g, '');
                const existingUser = localStorage.getItem(`user_${demoUserId}`);
                
                if (existingUser) {
                    currentUser = { uid: demoUserId, email: email, displayName: email.split('@')[0] };
                    loadUserData(demoUserId);
                } else {
                    throw new Error('User not found in demo mode');
                }
            }, 1000);
        }
    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'Login failed. Please try again.';
        let errorDetails = [];
        
        if (error.code === 'auth/user-not-found') {
            errorMessage = 'No account found with this email.';
            errorDetails.push('Check your email or create a new account');
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = 'Incorrect password.';
            errorDetails.push('Please check your password and try again');
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address.';
            errorDetails.push('Please check your email format');
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = 'Too many failed attempts.';
            errorDetails.push('Please wait a moment before trying again');
        } else if (error.code === 'auth/network-request-failed') {
            errorMessage = 'Network error.';
            errorDetails.push('Please check your internet connection');
        } else if (error.message === 'User not found in demo mode') {
            errorMessage = 'Account not found.';
            errorDetails.push('This email is not registered in demo mode. Please sign up first.');
        }
        
        showAuthError(errorMessage, errorDetails);
    } finally {
        // Reset button state
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
        loginBtn.disabled = false;
    }
}

// Handle signup
async function handleSignup() {
    console.log('=== SIGNUP ATTEMPT ===');
    const username = document.getElementById('signup-username').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const signupBtn = document.querySelector('#signup-form .auth-btn');
    const btnText = signupBtn.querySelector('.btn-text');
    const btnLoading = signupBtn.querySelector('.btn-loading');
    
    console.log('Firebase auth object:', window.auth);
    console.log('Firebase db object:', window.db);
    
    // Clear previous errors
    const existingError = document.querySelector('.auth-error');
    if (existingError) {
        existingError.remove();
    }
    
    // Comprehensive validation
    const emailValidation = validateEmail(email);
    const passwordValidation = validatePassword(password);
    const usernameValidation = validateUsername(username);
    
    const allErrors = [];
    if (!emailValidation) {
        allErrors.push('Please enter a valid email address');
    }
    if (!passwordValidation.isValid) {
        allErrors.push(...passwordValidation.errors);
    }
    if (!usernameValidation.isValid) {
        allErrors.push(...usernameValidation.errors);
    }
    
    if (allErrors.length > 0) {
        showAuthError('Please fix the following issues:', allErrors);
        return;
    }
    
    // Show loading state
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';
    signupBtn.disabled = true;
    
    try {
        if (window.auth && window.createUserWithEmailAndPassword) {
            // Real Firebase signup
            const userCredential = await window.createUserWithEmailAndPassword(window.auth, email, password);
            await window.updateProfile(userCredential.user, { displayName: username });
            await createUserData(userCredential.user.uid, username, email);
        } else {
            // Demo mode - simulate signup
            setTimeout(() => {
                currentUser = { uid: 'demo-user-' + Date.now(), email: email, displayName: username };
                createUserData(currentUser.uid, username, email);
            }, 1000);
        }
    } catch (error) {
        console.error('Signup error:', error);
        let errorMessage = 'Failed to create account. Please try again.';
        let errorDetails = [];
        
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'This email is already registered.';
            errorDetails.push('Try signing in instead, or use a different email address');
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password is too weak.';
            errorDetails.push('Use a mix of letters, numbers, and symbols');
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address.';
            errorDetails.push('Please check your email format');
        } else if (error.code === 'auth/network-request-failed') {
            errorMessage = 'Network error.';
            errorDetails.push('Please check your internet connection and try again');
        }
        
        showAuthError(errorMessage, errorDetails);
    } finally {
        // Reset button state
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
        signupBtn.disabled = false;
    }
}

// Create user data in database
async function createUserData(uid, username, email) {
    const userData = {
        username: username,
        email: email,
        coins: 10000,
        gamesPlayed: 0,
        gamesWon: 0,
        gamesLost: 0,
        profilePicture: null,
        createdAt: new Date(),
        lastLogin: new Date()
    };
    
    try {
        if (window.db && window.setDoc) {
            // Real Firestore
            await window.setDoc(window.doc(window.db, 'users', uid), userData);
        } else {
            // Demo mode - store in localStorage
            localStorage.setItem(`user_${uid}`, JSON.stringify(userData));
        }
        
        userCoins = 10000;
        showUserDashboard();
    } catch (error) {
        console.error('Error creating user data:', error);
        showAuthError('Account created but failed to initialize user data.');
    }
}

// Load user data from database
async function loadUserData(uid) {
    try {
        if (window.db && window.getDoc) {
            // Real Firestore
            const userDoc = await window.getDoc(window.doc(window.db, 'users', uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                userCoins = userData.coins !== undefined ? userData.coins : 10000;
                window.currentUserData = userData; // Store user data globally
                
                // Update last login
                await window.updateDoc(window.doc(window.db, 'users', uid), {
                    lastLogin: new Date()
                });
            } else {
                // Create new user data if doesn't exist
                await createUserData(uid, currentUser.displayName || 'Player', currentUser.email);
                return;
            }
        } else {
            // Demo mode - load from localStorage
            const userData = localStorage.getItem(`user_${uid}`);
            if (userData) {
                const data = JSON.parse(userData);
                userCoins = data.coins !== undefined ? data.coins : 10000;
                window.currentUserData = data; // Store user data globally
            } else {
                // New demo user gets 10000 coins
                userCoins = 10000;
                window.currentUserData = { coins: 10000, profilePicture: null };
            }
        }
        
        showUserDashboard();
    } catch (error) {
        console.error('Error loading user data:', error);
        // Don't reset coins on error - keep existing value or set to 0 if no user
        if (!currentUser) {
            userCoins = 10000;
        }
        showUserDashboard();
    }
}

// Update user coins
async function updateUserCoins(newCoinAmount) {
    userCoins = newCoinAmount;
    
    // Update in UI
    const coinCountElement = document.getElementById('user-coin-count');
    if (coinCountElement) {
        coinCountElement.textContent = userCoins.toLocaleString();
    }
    
    // Update in database
    if (currentUser) {
        try {
            if (window.db && window.updateDoc) {
                // Real Firestore
                await window.updateDoc(window.doc(window.db, 'users', currentUser.uid), {
                    coins: userCoins
                });
            } else {
                // Demo mode - update localStorage
                const userData = JSON.parse(localStorage.getItem(`user_${currentUser.uid}`) || '{}');
                userData.coins = userCoins;
                localStorage.setItem(`user_${currentUser.uid}`, JSON.stringify(userData));
            }
        } catch (error) {
            console.error('Error updating coins:', error);
        }
    }
}

// Profile Picture Functions
async function handleProfilePictureUpload(file) {
    console.log('=== PROFILE PICTURE UPLOAD ===');
    console.log('File:', file.name, file.type, file.size);
    console.log('Current user:', currentUser);
    console.log('Firebase storage available:', !!window.storage);
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        showGameEndMessage('Please select a valid image file.', 'error');
        return;
    }
    
    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
        showGameEndMessage('Image file is too large. Please select a file smaller than 5MB.', 'error');
        return;
    }
    
    // Check if user is authenticated
    if (!currentUser) {
        showGameEndMessage('You must be logged in to change your profile picture.', 'error');
        return;
    }
    
    // Show loading state
    const avatarBtn = document.getElementById('avatar-edit-btn');
    const originalContent = avatarBtn.innerHTML;
    avatarBtn.innerHTML = '<div style="width: 10px; height: 10px; border: 2px solid white; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>';
    avatarBtn.disabled = true;
    
    try {
        let profilePictureUrl;
        
        // Check if we're running on localhost - if so, skip Firebase Storage and use base64 directly
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        
        if (isLocalhost) {
            console.log('Running on localhost, using base64 fallback to avoid CORS issues');
            profilePictureUrl = await fileToBase64(file);
            console.log('Base64 conversion completed for localhost');
        } else {
            try {
                if (window.storage && window.storageRef && window.uploadBytes && window.getDownloadURL && currentUser.uid) {
                    console.log('Attempting Firebase Storage upload');
                    
                    // Delete old profile picture if it exists
                    if (window.currentUserData && window.currentUserData.profilePicture && window.currentUserData.profilePicture.includes('firebasestorage.googleapis.com')) {
                        try {
                            console.log('Deleting old profile picture');
                            const oldImageRef = window.storageRef(window.storage, `profile-pictures/${currentUser.uid}`);
                            await window.deleteObject(oldImageRef);
                            console.log('Old profile picture deleted successfully');
                        } catch (deleteError) {
                            console.log('No existing profile picture to delete or deletion failed:', deleteError);
                        }
                    }
                    
                    // Upload new profile picture
                    console.log('Uploading new profile picture to Firebase Storage');
                    const imageRef = window.storageRef(window.storage, `profile-pictures/${currentUser.uid}`);
                    console.log('Storage reference created:', imageRef);
                    
                    const snapshot = await window.uploadBytes(imageRef, file);
                    console.log('Upload successful, getting download URL');
                    profilePictureUrl = await window.getDownloadURL(snapshot.ref);
                    console.log('Download URL obtained:', profilePictureUrl);
                } else {
                    throw new Error('Firebase Storage not available, using fallback');
                }
            } catch (storageError) {
                console.log('Firebase Storage failed, falling back to base64 mode:', storageError);
                // Fallback to base64 mode - convert to base64
                profilePictureUrl = await fileToBase64(file);
                console.log('Base64 conversion completed as fallback');
            }
        }
        
        // Update user data in database
        console.log('Updating user profile picture in database');
        await updateUserProfilePicture(profilePictureUrl);
        
        // Update global user data
        if (window.currentUserData) {
            window.currentUserData.profilePicture = profilePictureUrl;
        }
        
        // Update UI
        updateAvatarDisplay();
        
        showGameEndMessage('Profile picture updated successfully!', 'success');
        console.log('Profile picture update completed successfully');
        
    } catch (error) {
        console.error('Error uploading profile picture:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        
        let errorMessage = 'Failed to update profile picture. ';
        if (error.code === 'storage/unauthorized') {
            errorMessage += 'Storage permission denied. Please check Firebase Storage rules.';
        } else if (error.code === 'storage/canceled') {
            errorMessage += 'Upload was canceled.';
        } else if (error.code === 'storage/unknown') {
            errorMessage += 'Unknown storage error occurred.';
        } else if (error.message && error.message.includes('CORS')) {
            errorMessage += 'CORS error. Please check Firebase Storage configuration.';
        } else {
            errorMessage += 'Please try again.';
        }
        
        showGameEndMessage(errorMessage, 'error');
    } finally {
        // Reset button state
        avatarBtn.innerHTML = originalContent;
        avatarBtn.disabled = false;
        
        // Clear file input
        document.getElementById('avatar-upload').value = '';
    }
}

async function updateUserProfilePicture(profilePictureUrl) {
    if (!currentUser) return;
    
    try {
        if (window.db && window.updateDoc) {
            // Real Firestore
            await window.updateDoc(window.doc(window.db, 'users', currentUser.uid), {
                profilePicture: profilePictureUrl
            });
        } else {
            // Demo mode - update localStorage
            const userData = JSON.parse(localStorage.getItem(`user_${currentUser.uid}`) || '{}');
            userData.profilePicture = profilePictureUrl;
            localStorage.setItem(`user_${currentUser.uid}`, JSON.stringify(userData));
        }
    } catch (error) {
        console.error('Error updating profile picture in database:', error);
        throw error;
    }
}

function updateAvatarDisplay() {
    const avatarElement = document.getElementById('user-avatar');
    const playerAvatarElement = document.getElementById('player-avatar');
    
    if (!avatarElement && !playerAvatarElement) return;
    
    const profilePictureUrl = window.currentUserData?.profilePicture;
    
    // Update dashboard avatar
    if (avatarElement) {
        if (profilePictureUrl) {
            avatarElement.style.setProperty('--avatar-url', `url(${profilePictureUrl})`);
            avatarElement.classList.add('has-image');
            avatarElement.textContent = ''; // Remove emoji
        } else {
            avatarElement.style.removeProperty('--avatar-url');
            avatarElement.classList.remove('has-image');
            avatarElement.textContent = '👤'; // Show default emoji
        }
    }
    
    // Update game area player avatar
    if (playerAvatarElement) {
        if (profilePictureUrl) {
            playerAvatarElement.style.setProperty('--avatar-url', `url(${profilePictureUrl})`);
            playerAvatarElement.classList.add('has-image');
            playerAvatarElement.textContent = ''; // Remove emoji
        } else {
            playerAvatarElement.style.removeProperty('--avatar-url');
            playerAvatarElement.classList.remove('has-image');
            playerAvatarElement.textContent = '👤'; // Show default emoji
        }
    }
}

function updatePlayerInfoInGame() {
    // Update the player avatar in game area
    updateAvatarDisplay();
}

function updatePlayerStatsPanel() {
    // This function is kept for compatibility but no longer used for game area
    // Stats are now shown through the score window avatar
}

function toggleGameStatsPanel() {
    const statsPanel = document.getElementById('game-stats-panel');
    if (!statsPanel) {
        createGameStatsPanel();
        return;
    }
    
    if (statsPanel.style.display === 'block') {
        closeGameStatsPanel();
    } else {
        openGameStatsPanel();
    }
}

function createGameStatsPanel() {
    // Create the stats panel overlay
    const statsOverlay = document.createElement('div');
    statsOverlay.id = 'game-stats-overlay';
    statsOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(8px);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;
    
    // Create the stats panel
    const statsPanel = document.createElement('div');
    statsPanel.id = 'game-stats-panel';
    statsPanel.className = 'game-stats-panel';
    statsPanel.style.cssText = `
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 15px;
        padding: 30px;
        min-width: 280px;
        max-width: 400px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
        transform: scale(0.8);
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        color: white;
        text-align: center;
    `;
    
    // Add content to stats panel
    updateGameStatsPanel(statsPanel);
    
    statsOverlay.appendChild(statsPanel);
    document.body.appendChild(statsOverlay);
    
    // Show with animation
    setTimeout(() => {
        statsOverlay.style.opacity = '1';
        statsPanel.style.transform = 'scale(1)';
    }, 10);
    
    // Close on overlay click
    statsOverlay.addEventListener('click', (e) => {
        if (e.target === statsOverlay) {
            closeGameStatsPanel();
        }
    });
}

function updateGameStatsPanel(panel) {
    if (!panel) panel = document.getElementById('game-stats-panel');
    if (!panel) return;
    
    const profilePictureUrl = window.currentUserData?.profilePicture;
    const wins = window.currentUserData?.gamesWon || 0;
    const losses = window.currentUserData?.gamesLost || 0;
    const totalGames = wins + losses;
    
    let winPercentage = 0;
    let ratioText = 'No games played';
    
    if (totalGames > 0) {
        winPercentage = Math.round((wins / totalGames) * 100);
        ratioText = `${winPercentage}% wins`;
    }
    
    panel.innerHTML = `
        <div style="margin-bottom: 20px;">
            <div style="width: 120px; height: 120px; margin: 0 auto 15px auto; border-radius: 50%; overflow: hidden; border: 4px solid rgba(255, 255, 255, 0.2); background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); display: flex; align-items: center; justify-content: center; font-size: 3rem; color: white; ${profilePictureUrl ? `background-image: url(${profilePictureUrl}); background-size: cover; background-position: center; font-size: 0;` : ''}">${profilePictureUrl ? '' : '👤'}</div>
            <h3 style="color: white; font-size: 1.4rem; font-weight: 600; margin-bottom: 5px;">${currentUser?.displayName || 'Player'}</h3>
            <p style="color: #64748b; font-size: 0.9rem; margin: 0;">Game Statistics</p>
        </div>
        
        <div style="display: flex; justify-content: space-around; margin-bottom: 25px;">
            <div style="text-align: center;">
                <div style="color: #10b981; font-size: 2rem; font-weight: 700; margin-bottom: 5px;">${wins}</div>
                <div style="color: #64748b; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px;">Wins</div>
            </div>
            <div style="text-align: center;">
                <div style="color: #ef4444; font-size: 2rem; font-weight: 700; margin-bottom: 5px;">${losses}</div>
                <div style="color: #64748b; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px;">Losses</div>
            </div>
        </div>
        
        <div style="margin-bottom: 15px;">
            <div style="color: #64748b; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Win/Loss Ratio</div>
            <div style="width: 100%; height: 8px; background: rgba(255, 255, 255, 0.1); border-radius: 4px; overflow: hidden; position: relative; margin-bottom: 8px;">
                <div style="height: 100%; border-radius: 4px; transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1); background: linear-gradient(90deg, #ef4444 0%, #ef4444 ${100-winPercentage}%, #10b981 ${100-winPercentage}%, #10b981 100%); width: ${totalGames > 0 ? 100 : 0}%;"></div>
            </div>
            <div style="color: white; font-size: 0.9rem; font-weight: 500;">${ratioText}</div>
        </div>
    `;
}

function openGameStatsPanel() {
    let statsOverlay = document.getElementById('game-stats-overlay');
    if (!statsOverlay) {
        createGameStatsPanel();
        return;
    }
    
    // Update stats before showing
    updateGameStatsPanel();
    
    statsOverlay.style.display = 'flex';
    setTimeout(() => {
        statsOverlay.style.opacity = '1';
        const panel = document.getElementById('game-stats-panel');
        if (panel) panel.style.transform = 'scale(1)';
    }, 10);
}

function closeGameStatsPanel() {
    const statsOverlay = document.getElementById('game-stats-overlay');
    if (!statsOverlay) return;
    
    statsOverlay.style.opacity = '0';
    const panel = document.getElementById('game-stats-panel');
    if (panel) panel.style.transform = 'scale(0.8)';
    
    setTimeout(() => {
        if (statsOverlay.parentNode) {
            statsOverlay.remove();
        }
    }, 300);
}

// Dashboard stats panel functions
function showDashboardStatsPanel() {
    const statsOverlay = document.getElementById('dashboard-stats-overlay');
    if (!statsOverlay) return;
    
    // Update stats before showing
    updateDashboardStatsPanel();
    
    // Show overlay
    statsOverlay.style.display = 'flex';
    
    // Trigger animation after a brief delay
    setTimeout(() => {
        statsOverlay.classList.add('show');
    }, 10);
}

function hideDashboardStatsPanel() {
    const statsOverlay = document.getElementById('dashboard-stats-overlay');
    if (!statsOverlay) return;
    
    // Remove show class to trigger fade out
    statsOverlay.classList.remove('show');
    
    // Hide overlay after animation completes
    setTimeout(() => {
        statsOverlay.style.display = 'none';
    }, 300);
}

 function updateDashboardStatsPanel() {
     const statsAvatar = document.getElementById('dashboard-stats-avatar');
     const statsUsername = document.getElementById('dashboard-stats-username');
     const statsWins = document.getElementById('dashboard-stats-wins');
     const statsLosses = document.getElementById('dashboard-stats-losses');
     const ratioFill = document.getElementById('dashboard-ratio-fill');
     const ratioText = document.getElementById('dashboard-ratio-text');
     
     if (currentUser && window.currentUserData) {
         // Update avatar
         if (statsAvatar) {
             const profilePictureUrl = window.currentUserData?.profilePicture;
             if (profilePictureUrl) {
                 statsAvatar.style.setProperty('--avatar-url', `url(${profilePictureUrl})`);
                 statsAvatar.classList.add('has-image');
                 statsAvatar.textContent = ''; // Remove emoji
             } else {
                 statsAvatar.style.removeProperty('--avatar-url');
                 statsAvatar.classList.remove('has-image');
                 statsAvatar.textContent = '👤'; // Show default emoji
             }
         }
         
         if (statsUsername) {
             statsUsername.textContent = currentUser.displayName || 'Player';
         }
        
        const wins = window.currentUserData.gamesWon || 0;
        const losses = window.currentUserData.gamesLost || 0;
        const totalGames = wins + losses;
        
        if (statsWins) {
            statsWins.textContent = wins;
        }
        if (statsLosses) {
            statsLosses.textContent = losses;
        }
        
        // Update win/loss ratio visualization
        if (ratioFill && ratioText) {
            if (totalGames === 0) {
                // No games played yet
                ratioFill.style.setProperty('--total-fill', '0%');
                ratioFill.style.setProperty('--loss-percent', '0%');
                ratioText.textContent = 'No games played';
            } else {
                const winPercentage = Math.round((wins / totalGames) * 100);
                const lossPercentage = Math.round((losses / totalGames) * 100);
                
                // Set the total fill to 100% (full bar)
                ratioFill.style.setProperty('--total-fill', '100%');
                
                // Set the loss percentage for the gradient split
                ratioFill.style.setProperty('--loss-percent', `${lossPercentage}%`);
                
                // Update text
                ratioText.textContent = `${winPercentage}%`;
            }
        }
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        // Create a canvas to compress the image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = () => {
            // Calculate new dimensions to keep image under 500KB when base64 encoded
            const maxWidth = 400;
            const maxHeight = 400;
            let { width, height } = img;
            
            // Scale down if necessary
            if (width > height) {
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = (width * maxHeight) / height;
                    height = maxHeight;
                }
            }
            
            // Set canvas dimensions
            canvas.width = width;
            canvas.height = height;
            
            // Draw and compress the image
            ctx.drawImage(img, 0, 0, width, height);
            
            // Convert to base64 with compression (0.7 quality for JPEG)
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
            console.log(`Image compressed from ${file.size} bytes to ~${Math.round(compressedBase64.length * 0.75)} bytes`);
            resolve(compressedBase64);
        };
        
        img.onerror = () => reject(new Error('Failed to load image for compression'));
        
        // Load the image
        const reader = new FileReader();
        reader.onload = (e) => {
            img.src = e.target.result;
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

// Logout function
async function logout() {
    try {
        if (window.auth && window.signOut) {
            await window.signOut(window.auth);
        }
        
        currentUser = null;
        userCoins = 0; // Reset to 0 instead of 10000
        showAuthScreen();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Show authentication error
function showAuthError(message) {
    // Remove existing error messages
    const existingError = document.querySelector('.auth-error');
    if (existingError) {
        existingError.remove();
    }
    
    // Create error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'auth-error';
    errorDiv.textContent = message;
    
    // Add to active form
    const activeForm = document.querySelector('.auth-form.active');
    if (activeForm) {
        activeForm.appendChild(errorDiv);
        
        // Remove error after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 5000);
    }
}

// Show main menu from dashboard (modified to work with auth)
function showMainMenuFromDashboard() {
    document.getElementById('user-dashboard').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
}

// Modified showMainMenu to go back to dashboard instead
function showMainMenu() {
    if (currentUser) {
        showUserDashboard();
    } else {
        showAuthScreen();
    }
}

// Enhanced coin management for game integration
function canAffordGame(cost = 0) {
    return userCoins >= cost;
}

async function deductCoins(amount) {
    if (userCoins >= amount) {
        await updateUserCoins(userCoins - amount);
        return true;
    }
    return false;
}

async function addCoins(amount) {
    await updateUserCoins(userCoins + amount);
}

// Game mode selection with coin costs
function selectGameMode(mode) {
    switch(mode) {
        case 'practice':
            // Free practice mode - start game immediately
            startGameDirectly('practice');
            break;
        case 'ranked':
            // Ranked mode costs 2500 coins
            if (canAffordGame(2500)) {
                showRankedConfirmation();
            } else {
                showInsufficientCoinsMessage();
            }
            break;
        case 'online':
            // Online mode costs 1000 coins
            if (canAffordGame(1000)) {
                showOnlineConfirmation();
            } else {
                showInsufficientCoinsMessage();
            }
            break;
        default:
            startGameDirectly('practice');
    }
}

function showInsufficientCoinsMessage() {
    alert('Insufficient coins! Play practice mode to improve your skills, or win ranked games to earn more coins.');
}

function showOnlineConfirmation() {
    const confirmation = document.createElement('div');
    confirmation.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        font-family: 'Inter', sans-serif;
    `;
    
    confirmation.innerHTML = `
        <div style="
            background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
            border-radius: 20px;
            padding: 40px;
            max-width: 400px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.1);
        ">
            <h3 style="color: white; font-size: 1.5rem; margin-bottom: 20px; font-weight: 700;">Play Online</h3>
            <p style="color: rgba(255, 255, 255, 0.8); margin-bottom: 30px; line-height: 1.6;">
                Entry cost: <strong style="color: #f59e0b;">1000 coins</strong><br>
                Win reward: <strong style="color: #10b981;">+3000 coins</strong><br><br>
                You'll be matched with another player online.
            </p>
            <div style="display: flex; gap: 15px; justify-content: center;">
                <button id="confirm-online" style="
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    color: white;
                    border: none;
                    border-radius: 12px;
                    padding: 12px 24px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                ">Start Matchmaking</button>
                <button id="cancel-online" style="
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                    border: none;
                    border-radius: 12px;
                    padding: 12px 24px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                ">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(confirmation);
    
    document.getElementById('confirm-online').addEventListener('click', () => {
        confirmation.remove();
        deductCoins(1000);
        startOnlineMatchmaking();
    });
    
    document.getElementById('cancel-online').addEventListener('click', () => {
        confirmation.remove();
    });
}

// Online Multiplayer System
let currentGameRoom = null;
let gameRoomListener = null;
let isHost = false;

async function startOnlineMatchmaking() {
    console.log('=== STARTING ONLINE MATCHMAKING ===');
    console.log('Current user:', currentUser);
    console.log('Firebase DB:', window.db);
    console.log('User coins:', userCoins);
    
    if (!currentUser) {
        console.log('ERROR: No current user logged in');
        showGameEndMessage('Please log in to play online.', 'error');
        return;
    }
    
    if (!window.db) {
        console.log('ERROR: Firebase database not available');
        showGameEndMessage('Firebase connection not available. Please refresh and try again.', 'error');
        return;
    }
    
    console.log('Showing matchmaking screen...');
    showMatchmakingScreen();
    
    try {
        console.log('Looking for existing waiting rooms...');
        // First, try to join an existing waiting room
        const existingRoom = await findWaitingRoom();
        
        if (existingRoom) {
            console.log('Found existing room:', existingRoom);
            // Join existing room
            await joinGameRoom(existingRoom.id);
        } else {
            console.log('No existing rooms found, creating new room...');
            // Create new room
            await createGameRoom();
        }
    } catch (error) {
        console.error('Matchmaking error:', error);
        hideMatchmakingScreen();
        showGameEndMessage('Failed to start matchmaking. Please try again.', 'error');
    }
}

function showMatchmakingScreen() {
    const matchmakingScreen = document.createElement('div');
    matchmakingScreen.id = 'matchmaking-screen';
    matchmakingScreen.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        font-family: 'Inter', sans-serif;
    `;
    
    matchmakingScreen.innerHTML = `
        <div style="text-align: center; color: white;">
            <div style="width: 80px; height: 80px; border: 4px solid rgba(59, 130, 246, 0.3); border-top: 4px solid #3b82f6; border-radius: 50%; animation: spin 2s linear infinite; margin: 0 auto 30px;"></div>
            <h2 style="font-size: 2rem; margin-bottom: 15px; font-weight: 700;">Finding Opponent...</h2>
            <p style="color: rgba(255, 255, 255, 0.7); font-size: 1.1rem; margin-bottom: 40px;">Please wait while we match you with another player</p>
            <button id="cancel-matchmaking" style="
                background: rgba(255, 255, 255, 0.1);
                color: white;
                border: none;
                border-radius: 12px;
                padding: 15px 30px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
            ">Cancel</button>
        </div>
    `;
    
    document.body.appendChild(matchmakingScreen);
    
    document.getElementById('cancel-matchmaking').addEventListener('click', () => {
        cancelMatchmaking();
    });
}

function hideMatchmakingScreen() {
    const matchmakingScreen = document.getElementById('matchmaking-screen');
    if (matchmakingScreen) {
        matchmakingScreen.remove();
    }
}

async function findWaitingRoom() {
    console.log('=== FINDING WAITING ROOM ===');
    if (!window.db) {
        console.log('No Firebase DB available');
        return null;
    }
    
    try {
        console.log('Creating Firestore query...');
        const roomsQuery = window.query(
            window.collection(window.db, 'gameRooms'),
            window.where('status', '==', 'waiting'),
            window.where('currentPlayers', '<', 2),
            window.limit(1)
        );
        
        console.log('Executing query...');
        const querySnapshot = await window.getDocs(roomsQuery);
        console.log('Query completed. Empty?', querySnapshot.empty);
        console.log('Number of docs found:', querySnapshot.docs.length);
        
        if (!querySnapshot.empty) {
            const doc = querySnapshot.docs[0];
            const roomData = { id: doc.id, ...doc.data() };
            console.log('Found waiting room:', roomData);
            return roomData;
        }
        
        console.log('No waiting rooms found');
        return null;
    } catch (error) {
        console.error('Error finding waiting room:', error);
        console.error('Error details:', error.message);
        return null;
    }
}

async function createGameRoom() {
    console.log('=== CREATING GAME ROOM ===');
    console.log('Firebase DB:', window.db);
    console.log('Current user:', currentUser);
    
    if (!window.db || !currentUser) {
        console.log('ERROR: Missing DB or user');
        return;
    }
    
    isHost = true;
    const gameRoomId = 'game_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    console.log('Generated room ID:', gameRoomId);
    
    const gameRoomData = {
        id: gameRoomId,
        status: 'waiting',
        gameMode: 'online',
        maxPlayers: 2,
        currentPlayers: 1,
        createdBy: currentUser.uid,
        createdAt: new Date(),
        players: {
            [currentUser.uid]: {
                userId: currentUser.uid,
                username: currentUser.displayName || 'Player',
                profilePicture: window.currentUserData?.profilePicture || null,
                joinedAt: new Date(),
                isReady: false,
                coins: userCoins
            }
        },
        gameState: null,
        winner: null,
        finishedAt: null
    };
    
    console.log('Game room data to create:', gameRoomData);
    
    try {
        console.log('Writing to Firestore...');
        await window.setDoc(window.doc(window.db, 'gameRooms', gameRoomId), gameRoomData);
        currentGameRoom = gameRoomId;
        console.log('Room created successfully, starting listener...');
        listenToGameRoom(gameRoomId);
        console.log('Created game room:', gameRoomId);
    } catch (error) {
        console.error('Error creating game room:', error);
        console.error('Error details:', error.message);
        throw error;
    }
}

async function joinGameRoom(roomId) {
    console.log('=== JOINING GAME ROOM ===');
    console.log('Room ID to join:', roomId);
    console.log('Firebase DB:', window.db);
    console.log('Current user:', currentUser);
    
    if (!window.db || !currentUser) {
        console.log('ERROR: Missing DB or user for joining');
        return;
    }
    
    isHost = false;
    currentGameRoom = roomId;
    
    try {
        console.log('Getting room document...');
        const roomRef = window.doc(window.db, 'gameRooms', roomId);
        const roomDoc = await window.getDoc(roomRef);
        
        if (!roomDoc.exists()) {
            console.log('ERROR: Game room not found');
            throw new Error('Game room not found');
        }
        
        const roomData = roomDoc.data();
        console.log('Found room data:', roomData);
        
        // Add current user to the room
        const updatedPlayers = {
            ...roomData.players,
            [currentUser.uid]: {
                userId: currentUser.uid,
                username: currentUser.displayName || 'Player',
                profilePicture: window.currentUserData?.profilePicture || null,
                joinedAt: new Date(),
                isReady: false,
                coins: userCoins
            }
        };
        
        console.log('Updated players object:', updatedPlayers);
        console.log('Number of players after join:', Object.keys(updatedPlayers).length);
        
        const updateData = {
            players: updatedPlayers,
            currentPlayers: Object.keys(updatedPlayers).length,
            status: Object.keys(updatedPlayers).length >= 2 ? 'ready' : 'waiting'
        };
        console.log('Update data to send:', updateData);
        
        console.log('Updating room document...');
        await window.updateDoc(roomRef, updateData);
        
        console.log('Starting room listener...');
        listenToGameRoom(roomId);
        console.log('Successfully joined game room:', roomId);
    } catch (error) {
        console.error('Error joining game room:', error);
        console.error('Error details:', error.message);
        throw error;
    }
}

function listenToGameRoom(roomId) {
    console.log('=== SETTING UP ROOM LISTENER ===');
    console.log('Room ID:', roomId);
    console.log('Firebase DB:', window.db);
    console.log('Existing listener?', gameRoomListener !== null);
    
    if (!window.db || gameRoomListener) {
        console.log('Skipping listener setup - DB missing or listener exists');
        return;
    }
    
    const roomRef = window.doc(window.db, 'gameRooms', roomId);
    console.log('Room reference created:', roomRef);
    
    console.log('Setting up onSnapshot listener...');
    gameRoomListener = window.onSnapshot(roomRef, (doc) => {
        console.log('=== ROOM UPDATE RECEIVED ===');
        console.log('Document exists?', doc.exists());
        
        if (doc.exists()) {
            const roomData = doc.data();
            console.log('Room data received:', roomData);
            console.log('Room status:', roomData.status);
            console.log('Number of players:', Object.keys(roomData.players || {}).length);
            handleGameRoomUpdate(roomData);
        } else {
            console.log('Game room deleted');
            handleGameRoomDeleted();
        }
    }, (error) => {
        console.error('Error listening to game room:', error);
        console.error('Error details:', error.message);
    });
    
    console.log('Room listener set up successfully');
}

function handleGameRoomUpdate(roomData) {
    console.log('=== HANDLING ROOM UPDATE ===');
    console.log('Room data received:', roomData);
    console.log('Room status:', roomData.status);
    console.log('Number of players:', Object.keys(roomData.players || {}).length);
    console.log('Player list:', Object.keys(roomData.players || {}));
    
    if (roomData.status === 'ready' && Object.keys(roomData.players).length >= 2) {
        console.log('Room is ready with 2+ players - showing ready screen');
        // Both players joined, show ready screen
        hideMatchmakingScreen();
        showGameReadyScreen(roomData);
    } else if (roomData.status === 'active' && roomData.gameState) {
        console.log('Game is active - starting online game');
        // Game started, hide ready screen and start game
        hideGameReadyScreen();
        startOnlineGame(roomData);
    } else if (roomData.status === 'finished') {
        console.log('Game is finished');
        // Game finished
        handleOnlineGameEnd(roomData);
    } else {
        console.log('Room update - no action taken');
        console.log('Status:', roomData.status);
        console.log('Players count:', Object.keys(roomData.players || {}).length);
    }
}

function showGameReadyScreen(roomData) {
    console.log('=== SHOWING GAME READY SCREEN ===');
    console.log('Room data received:', roomData);
    console.log('Players in room:', Object.keys(roomData.players));
    console.log('Current user ID:', currentUser?.uid);
    
    // Remove existing ready screen first
    hideGameReadyScreen();
    
    const readyScreen = document.createElement('div');
    readyScreen.id = 'game-ready-screen';
    readyScreen.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        font-family: 'Inter', sans-serif;
    `;
    
    const players = Object.values(roomData.players);
    console.log('Players array:', players);
    
    const currentPlayerData = roomData.players[currentUser.uid];
    console.log('Current player data:', currentPlayerData);
    
    // Log each player's ready status
    players.forEach((player, index) => {
        console.log(`Player ${index + 1}: ${player.username} - Ready: ${player.isReady}`);
    });
    
    readyScreen.innerHTML = `
        <div style="text-align: center; color: white; max-width: 500px;">
            <h2 style="font-size: 2.5rem; margin-bottom: 30px; font-weight: 700;">Game Ready!</h2>
            
            <div style="display: flex; justify-content: space-around; margin-bottom: 40px;">
                ${players.map(player => `
                    <div style="text-align: center;">
                        <div style="width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); display: flex; align-items: center; justify-content: center; margin: 0 auto 15px; ${player.profilePicture ? `background-image: url(${player.profilePicture}); background-size: cover; background-position: center; font-size: 0;` : 'font-size: 2rem;'}">${player.profilePicture ? '' : '👤'}</div>
                        <h3 style="font-size: 1.2rem; margin-bottom: 5px;">${player.username}</h3>
                        <div style="color: ${player.isReady ? '#10b981' : '#f59e0b'}; font-weight: 600;">
                            ${player.isReady ? '✓ Ready' : '⏳ Getting Ready...'}
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <button id="ready-button" style="
                background: ${currentPlayerData.isReady ? 'rgba(255, 255, 255, 0.1)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)'};
                color: white;
                border: none;
                border-radius: 12px;
                padding: 15px 40px;
                font-size: 1.1rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                margin-bottom: 20px;
            ">${currentPlayerData.isReady ? 'Ready!' : 'Ready Up'}</button>
            
            <p style="color: rgba(255, 255, 255, 0.7); font-size: 0.9rem;">Game will start when both players are ready</p>
        </div>
    `;
    
    document.body.appendChild(readyScreen);
    
    const readyButton = document.getElementById('ready-button');
    console.log('Setting up ready button event listener...');
    console.log('Current player ready status:', currentPlayerData.isReady);
    
    // Always add event listener, but only allow clicking if not ready
    readyButton.addEventListener('click', () => {
        console.log('Ready button clicked, current ready status:', currentPlayerData.isReady);
        if (!currentPlayerData.isReady) {
            console.log('Player not ready, calling setPlayerReady()');
            setPlayerReady();
        } else {
            console.log('Player already ready, ignoring click');
        }
    });
}

function hideGameReadyScreen() {
    const readyScreen = document.getElementById('game-ready-screen');
    if (readyScreen) {
        readyScreen.remove();
    }
}

async function setPlayerReady() {
    console.log('=== SETTING PLAYER READY ===');
    console.log('Current game room:', currentGameRoom);
    console.log('Current user:', currentUser?.uid);
    console.log('Is host:', isHost);
    
    if (!currentGameRoom || !currentUser) {
        console.log('ERROR: Missing game room or user');
        return;
    }
    
    try {
        console.log('Getting room document...');
        const roomRef = window.doc(window.db, 'gameRooms', currentGameRoom);
        const roomDoc = await window.getDoc(roomRef);
        
        if (roomDoc.exists()) {
            const roomData = roomDoc.data();
            console.log('Current room data:', roomData);
            console.log('Current players before update:', roomData.players);
            
            const updatedPlayers = {
                ...roomData.players,
                [currentUser.uid]: {
                    ...roomData.players[currentUser.uid],
                    isReady: true
                }
            };
            
            console.log('Updated players object:', updatedPlayers);
            
            console.log('Updating room document...');
            await window.updateDoc(roomRef, {
                players: updatedPlayers
            });
            console.log('Room document updated successfully');
            
            // Check if all players are ready
            const allReady = Object.values(updatedPlayers).every(player => player.isReady);
            console.log('All players ready?', allReady);
            console.log('Is host?', isHost);
            console.log('Room created by:', roomData.createdBy);
            console.log('Current user ID:', currentUser.uid);
            console.log('Am I the creator?', roomData.createdBy === currentUser.uid);
            
            // Use createdBy field to determine host, not isHost variable
            const amIHost = roomData.createdBy === currentUser.uid;
            
            if (allReady && amIHost) {
                console.log('All ready and I am the room creator - starting game...');
                // Host starts the game
                await startGameForRoom();
            } else if (allReady && !amIHost) {
                console.log('All ready but I am not the host - waiting for host to start game...');
            } else {
                console.log('Not all players ready yet');
            }
        } else {
            console.log('ERROR: Room document does not exist');
        }
    } catch (error) {
        console.error('Error setting player ready:', error);
        console.error('Error details:', error.message);
    }
}

async function startGameForRoom() {
    console.log('=== START GAME FOR ROOM CALLED ===');
    console.log('Current game room:', currentGameRoom);
    console.log('Is host:', isHost);
    console.log('Current user:', currentUser?.uid);
    
    if (!currentGameRoom) {
        console.log('ERROR: Missing game room');
        return;
    }
    
    // Get room data to verify host status
    const roomRef = window.doc(window.db, 'gameRooms', currentGameRoom);
    const roomDoc = await window.getDoc(roomRef);
    const roomData = roomDoc.data();
    const amIHost = roomData.createdBy === currentUser.uid;
    
    console.log('Room created by:', roomData.createdBy);
    console.log('Am I the creator/host?', amIHost);
    
    if (!amIHost) {
        console.log('ERROR: Not the host, cannot start game');
        return;
    }
    
    try {
        console.log('Initializing game state...');
        // Initialize game state with random starting player
        const randomStartingPlayer = Math.floor(Math.random() * 2); // 0 or 1
        console.log('Random starting player selected:', randomStartingPlayer);
        
        const gameState = {
            currentRound: 1,
            currentDeal: 1,
            currentPlayer: randomStartingPlayer,
            deck: createShuffledDeck(),
            tableCards: [],
            playerHands: {},
            capturedCards: {},
            scores: {},
            lastCapturer: null,
            lastAction: null
        };
        
        console.log('Getting room document...');
        const roomRef = window.doc(window.db, 'gameRooms', currentGameRoom);
        const roomDoc = await window.getDoc(roomRef);
        const roomData = roomDoc.data();
        const playerIds = Object.keys(roomData.players);
        
        console.log('Player IDs:', playerIds);
        console.log('Room created by:', roomData.createdBy);
        
        // Initialize player-specific data
        playerIds.forEach((playerId, index) => {
            gameState.playerHands[playerId] = [];
            gameState.capturedCards[playerId] = [];
            gameState.scores[playerId] = 0;
        });
        
        console.log('Dealing initial cards...');
        // Deal initial cards
        dealInitialCardsOnline(gameState, playerIds);
        
        console.log('Updating room to active status...');
        await window.updateDoc(roomRef, {
            status: 'active',
            gameState: gameState
        });
        
        console.log('Game started successfully!');
        
    } catch (error) {
        console.error('Error starting game:', error);
        console.error('Error details:', error.message);
    }
}

// createShuffledDeck function moved to top of file

function dealInitialCardsOnline(gameState, playerIds) {
    // Deal 4 table cards first (no Jacks allowed)
    for (let i = 0; i < 4; i++) {
        let card = gameState.deck.pop();
        while (card && card.value === 'J') {
            gameState.deck.push(card);
            // Reshuffle deck
            for (let j = gameState.deck.length - 1; j > 0; j--) {
                const k = Math.floor(Math.random() * (j + 1));
                [gameState.deck[j], gameState.deck[k]] = [gameState.deck[k], gameState.deck[j]];
            }
            card = gameState.deck.pop();
        }
        if (card) {
            gameState.tableCards.push(card);
        }
    }
    
    // Deal 4 cards to each player
    playerIds.forEach(playerId => {
        for (let i = 0; i < 4; i++) {
            const card = gameState.deck.pop();
            if (card) {
                gameState.playerHands[playerId].push(card);
            }
        }
    });
}

function startOnlineGame(roomData) {
    // Hide dashboard and show game area
    document.getElementById('user-dashboard').style.display = 'none';
    
    // Set up online game mode
    window.currentGameMode = 'online';
    window.isOnlineGame = true;
    window.onlineGameRoom = roomData;
    
    // Initialize local game state from server
    const gameState = roomData.gameState;
    const playerIds = Object.keys(roomData.players);
    const currentPlayerId = currentUser.uid;
    const opponentId = playerIds.find(id => id !== currentPlayerId);
    
    // Set opponent data for UI display
    window.opponentData = roomData.players[opponentId] || null;
    
    // Map server state to local game variables
    currentRound = gameState.currentRound;
    currentDeal = gameState.currentDeal;
    
    // Determine if current user is player 0 or 1
    const playerIndex = playerIds.indexOf(currentPlayerId);
    currentPlayer = gameState.currentPlayer;
    
    console.log('=== GAME INITIALIZATION DEBUG ===');
    console.log('Player IDs from room:', playerIds);
    console.log('Current user ID:', currentPlayerId);
    console.log('My player index:', playerIndex);
    console.log('Game state currentPlayer:', gameState.currentPlayer);
    console.log('Local currentPlayer set to:', currentPlayer);
    
    // Set up hands
    playerHand = gameState.playerHands[currentPlayerId] || [];
    opponentHand = gameState.playerHands[opponentId] || [];
    tableCards = gameState.tableCards || [];
    playerCapturedCards = gameState.capturedCards[currentPlayerId] || [];
    opponentCapturedCards = gameState.capturedCards[opponentId] || [];
    
    // Set up scores
    gameScore = {
        player: gameState.scores[currentPlayerId] || 0,
        opponent: gameState.scores[opponentId] || 0
    };
    
    lastCapturer = gameState.lastCapturer;
    lastAction = gameState.lastAction;
    
             // Show game area and start
    showGameArea();
    createGameUI(); // Create the game UI for online games
    createAndAnimateCards();
    
    // Update UI and card visuals for online game
    updateGameUI();
    updateCardVisuals();
    updatePlayerAvatarInGameUI();
    updateOpponentAvatarInGameUI();
     
     // Listen for game state changes
     listenToGameStateChanges();
     
     console.log('Online game started with state:', gameState);
}

function listenToGameStateChanges() {
    if (!currentGameRoom || !window.db) return;
    
    const roomRef = window.doc(window.db, 'gameRooms', currentGameRoom);
    
    window.onSnapshot(roomRef, (doc) => {
        if (doc.exists()) {
            const roomData = doc.data();
            
            if (roomData.status === 'active' && roomData.gameState) {
                handleGameStateUpdate(roomData.gameState);
            } else if (roomData.status === 'finished') {
                handleOnlineGameEnd(roomData);
            }
        }
    }, (error) => {
        console.error('Error listening to game state:', error);
    });
}

function handleGameStateUpdate(newGameState) {
    if (!window.isOnlineGame) return;
    
    console.log('=== HANDLE GAME STATE UPDATE CALLED ===');
    console.log('Current playerHand before update:', playerHand.length, 'cards');
    console.log('New game state playerHands:', newGameState.playerHands);
    console.log('Stack trace for game state update:');
    console.trace();
    
    const playerIds = Object.keys(window.onlineGameRoom.players);
    const currentPlayerId = currentUser.uid;
    const opponentId = playerIds.find(id => id !== currentPlayerId);
    
    // Update local game state from server
    const oldCurrentPlayer = currentPlayer;
    currentPlayer = newGameState.currentPlayer;
    
    // Update hands and table
    const newPlayerHand = newGameState.playerHands[currentPlayerId] || [];
    const newOpponentHand = newGameState.playerHands[opponentId] || [];
    const newTableCards = newGameState.tableCards || [];
    
    console.log('About to update playerHand from', playerHand.length, 'to', newPlayerHand.length);
    
    playerHand = newPlayerHand;
    opponentHand = newOpponentHand;
    tableCards = newTableCards;
    playerCapturedCards = newGameState.capturedCards[currentPlayerId] || [];
    opponentCapturedCards = newGameState.capturedCards[opponentId] || [];
    
    // Update scores
    gameScore = {
        player: newGameState.scores[currentPlayerId] || 0,
        opponent: newGameState.scores[opponentId] || 0
    };
    
    lastCapturer = newGameState.lastCapturer;
    lastAction = newGameState.lastAction;
    currentRound = newGameState.currentRound;
    currentDeal = newGameState.currentDeal;
    
    // Check if we need to deal new cards
    if (playerHand.length === 0 && opponentHand.length === 0 && newGameState.currentDeal <= 6) {
        // Both hands empty, need new deal
        if (isHost && newGameState.currentDeal < 6) {
            dealNewHandOnline();
        } else if (newGameState.currentDeal >= 6) {
            // Round over
            endRoundOnline();
        }
    }
    
    // Update visuals
    updateGameDisplay();
    createAndAnimateCards();
    updateGameUI();
    updateCardVisuals();
    
    // Check for game end
    if (gameScore.player >= 16 || gameScore.opponent >= 16) {
        endOnlineGame();
    }
    
    console.log('Game state updated from server:', newGameState);
}

async function dealNewHandOnline() {
    if (!isHost || !currentGameRoom) return;
    
    try {
        const roomRef = window.doc(window.db, 'gameRooms', currentGameRoom);
        const roomDoc = await window.getDoc(roomRef);
        
        if (roomDoc.exists()) {
            const roomData = roomDoc.data();
            const gameState = roomData.gameState;
            const playerIds = Object.keys(roomData.players);
            
            // Deal 4 new cards to each player
            playerIds.forEach(playerId => {
                for (let i = 0; i < 4; i++) {
                    const card = gameState.deck.pop();
                    if (card) {
                        gameState.playerHands[playerId].push(card);
                    }
                }
            });
            
            gameState.currentDeal++;
            
            await window.updateDoc(roomRef, {
                gameState: gameState
            });
        }
    } catch (error) {
        console.error('Error dealing new hand online:', error);
    }
}

async function endRoundOnline() {
    if (!isHost || !currentGameRoom) return;
    
    try {
        const roomRef = window.doc(window.db, 'gameRooms', currentGameRoom);
        const roomDoc = await window.getDoc(roomRef);
        
        if (roomDoc.exists()) {
            const roomData = roomDoc.data();
            const gameState = roomData.gameState;
            const playerIds = Object.keys(roomData.players);
            
            // Any remaining table cards go to last capturer
            if (gameState.tableCards.length > 0 && gameState.lastCapturer !== null) {
                const lastCapturerId = playerIds[gameState.lastCapturer];
                gameState.capturedCards[lastCapturerId].push(...gameState.tableCards);
                gameState.tableCards = [];
            }
            
            // Calculate round scores
            calculateRoundScoreOnline(gameState, playerIds);
            
            // Check if game is over
            const maxScore = Math.max(...Object.values(gameState.scores));
            if (maxScore >= 16) {
                // Game over
                const winnerId = Object.keys(gameState.scores).find(
                    playerId => gameState.scores[playerId] === maxScore
                );
                
                await window.updateDoc(roomRef, {
                    status: 'finished',
                    winner: winnerId,
                    finishedAt: new Date(),
                    gameState: gameState
                });
            } else {
                // Start new round
                gameState.currentRound++;
                gameState.currentDeal = 1;
                gameState.currentPlayer = 0;
                
                // Reset captured cards
                playerIds.forEach(playerId => {
                    gameState.capturedCards[playerId] = [];
                });
                
                // Create new deck and deal
                gameState.deck = createShuffledDeck();
                dealInitialCardsOnline(gameState, playerIds);
                
                await window.updateDoc(roomRef, {
                    gameState: gameState
                });
            }
        }
    } catch (error) {
        console.error('Error ending round online:', error);
    }
}

function calculateRoundScoreOnline(gameState, playerIds) {
    playerIds.forEach(playerId => {
        const capturedCards = gameState.capturedCards[playerId];
        const cardCount = capturedCards.length;
        
        // Most cards (2 points, or 1 each if tied)
        const otherPlayerIds = playerIds.filter(id => id !== playerId);
        const otherCounts = otherPlayerIds.map(id => gameState.capturedCards[id].length);
        const maxOtherCount = Math.max(...otherCounts);
        
        if (cardCount > maxOtherCount) {
            gameState.scores[playerId] += 2;
        } else if (cardCount === maxOtherCount) {
            gameState.scores[playerId] += 1;
        }
        
        // Most clubs (1 point)
        const clubCount = capturedCards.filter(card => card.suit === '♣').length;
        const otherClubCounts = otherPlayerIds.map(id => 
            gameState.capturedCards[id].filter(card => card.suit === '♣').length
        );
        const maxOtherClubCount = Math.max(...otherClubCounts);
        
        if (clubCount > maxOtherClubCount) {
            gameState.scores[playerId] += 1;
        }
        
        // Special cards
        const hasTwo = capturedCards.some(card => card.suit === '♣' && card.value === '2');
        const hasTen = capturedCards.some(card => card.suit === '♦' && card.value === '10');
        const hasAce = capturedCards.some(card => card.suit === '♠' && card.value === 'A');
        
        if (hasTwo) gameState.scores[playerId] += 1;
        if (hasTen) gameState.scores[playerId] += 2;
        if (hasAce) gameState.scores[playerId] += 1;
    });
}

async function endOnlineGame() {
    if (!isHost || !currentGameRoom) return;
    
    try {
        const roomRef = window.doc(window.db, 'gameRooms', currentGameRoom);
        const roomDoc = await window.getDoc(roomRef);
        
        if (roomDoc.exists()) {
            const roomData = roomDoc.data();
            const gameState = roomData.gameState;
            
            const winnerId = Object.keys(gameState.scores).find(
                playerId => gameState.scores[playerId] >= 16
            );
            
            await window.updateDoc(roomRef, {
                status: 'finished',
                winner: winnerId,
                finishedAt: new Date()
            });
        }
    } catch (error) {
        console.error('Error ending online game:', error);
    }
}

async function cancelMatchmaking() {
    try {
        if (currentGameRoom && isHost) {
            // Delete the game room if we're the host
            await window.deleteDoc(window.doc(window.db, 'gameRooms', currentGameRoom));
        }
        
        if (gameRoomListener) {
            gameRoomListener();
            gameRoomListener = null;
        }
        
        currentGameRoom = null;
        isHost = false;
        
        hideMatchmakingScreen();
        
        // Refund coins
        await addCoins(1000);
        showGameEndMessage('Matchmaking cancelled. Coins refunded.', 'info');
        
    } catch (error) {
        console.error('Error cancelling matchmaking:', error);
        hideMatchmakingScreen();
    }
}

function handleGameRoomDeleted() {
    if (gameRoomListener) {
        gameRoomListener();
        gameRoomListener = null;
    }
    
    currentGameRoom = null;
    isHost = false;
    
    hideMatchmakingScreen();
    hideGameReadyScreen();
    
    showGameEndMessage('Game room was closed. Returning to dashboard.', 'info');
    showUserDashboard();
}

function handleOnlineGameEnd(roomData) {
    const winner = roomData.winner;
    const isWinner = winner === currentUser.uid;
    
    // Handle rewards
    if (isWinner) {
        window.pendingCoinReward = 3000;
        addCoins(3000);
    }
    
    // Update stats
    updateUserStats(isWinner);
    
    // Show winning popup
    showOnlineGameEndPopup(isWinner, roomData);
    
    // Clean up
    if (gameRoomListener) {
        gameRoomListener();
        gameRoomListener = null;
    }
    
    currentGameRoom = null;
    isHost = false;
    window.isOnlineGame = false;
}

function showOnlineGameEndPopup(isWinner, roomData) {
    const popup = document.createElement('div');
    popup.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        font-family: 'Inter', sans-serif;
    `;
    
    const players = Object.values(roomData.players);
    const winner = players.find(p => p.userId === roomData.winner);
    
    popup.innerHTML = `
        <div style="
            background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
            border-radius: 20px;
            padding: 40px;
            max-width: 400px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.1);
        ">
            <div style="font-size: 4rem; margin-bottom: 20px;">
                ${isWinner ? '🏆' : '😔'}
            </div>
            <h2 style="color: white; font-size: 2rem; margin-bottom: 15px; font-weight: 700;">
                ${isWinner ? 'You Win!' : 'You Lost'}
            </h2>
            <p style="color: rgba(255, 255, 255, 0.8); margin-bottom: 20px; font-size: 1.1rem;">
                ${winner ? `${winner.username} won the game!` : 'Game completed'}
            </p>
            ${isWinner ? `
                <div style="color: #10b981; font-size: 1.2rem; font-weight: 600; margin-bottom: 30px;">
                    +3000 coins earned!
                </div>
            ` : ''}
            <button id="return-dashboard" style="
                background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
                color: white;
                border: none;
                border-radius: 12px;
                padding: 15px 30px;
                font-size: 1.1rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
            ">Return to Dashboard</button>
        </div>
    `;
    
    document.body.appendChild(popup);
    
    document.getElementById('return-dashboard').addEventListener('click', () => {
        popup.remove();
        showUserDashboard();
    });
    
    // Auto-return after 10 seconds
    setTimeout(() => {
        if (popup.parentNode) {
            popup.remove();
            showUserDashboard();
        }
    }, 10000);
}

// Online game cleanup and disconnection handling
window.addEventListener('beforeunload', () => {
    if (currentGameRoom && window.isOnlineGame) {
        // Clean up game room on page unload
        cleanupOnlineGame();
    }
});

async function cleanupOnlineGame() {
    if (!currentGameRoom) return;
    
    try {
        if (gameRoomListener) {
            gameRoomListener();
            gameRoomListener = null;
        }
        
        // If we're the host and game hasn't started, delete the room
        if (isHost && window.onlineGameRoom?.status === 'waiting') {
            await window.deleteDoc(window.doc(window.db, 'gameRooms', currentGameRoom));
        }
        
        currentGameRoom = null;
        isHost = false;
        window.isOnlineGame = false;
        window.opponentData = null; // Clear opponent data
        
    } catch (error) {
        console.error('Error cleaning up online game:', error);
    }
}

// This function is now moved inside DOMContentLoaded event listener

// Handle game rewards without interfering with winning screen
function handleGameRewards(playerWon) {
    if (currentUser && window.currentGameMode === 'ranked') {
        if (playerWon) {
            // Store the reward to show animation when returning to dashboard
            window.pendingCoinReward = 5000;
            addCoins(5000); // Add coins to database immediately
            // Removed popup - animation will show on dashboard instead
        }
        // No popup messages - keep winning screen clean
    } else if (currentUser && window.currentGameMode === 'online') {
        if (playerWon) {
            // Store the reward to show animation when returning to dashboard
            window.pendingCoinReward = 3000;
            addCoins(3000); // Add coins to database immediately
        }
        // Online game rewards are handled by the multiplayer system
    }
    
    // Update user stats
    if (currentUser) {
        updateUserStats(playerWon);
    }
}

async function updateUserStats(won) {
    if (!currentUser) return;
    
    try {
        const updates = {
            gamesPlayed: 1, // This will be incremented in the database
            gamesWon: won ? 1 : 0,
            gamesLost: won ? 0 : 1
        };
        
        if (window.db && window.updateDoc) {
            // Real Firestore - use increment
            await window.updateDoc(window.doc(window.db, 'users', currentUser.uid), {
                gamesPlayed: window.increment(1),
                gamesWon: window.increment(won ? 1 : 0),
                gamesLost: window.increment(won ? 0 : 1),
                lastGame: new Date()
            });
        } else {
            // Demo mode - update localStorage
            const userData = JSON.parse(localStorage.getItem(`user_${currentUser.uid}`) || '{}');
            userData.gamesPlayed = (userData.gamesPlayed || 0) + 1;
            userData.gamesWon = (userData.gamesWon || 0) + (won ? 1 : 0);
            userData.gamesLost = (userData.gamesLost || 0) + (won ? 0 : 1);
            userData.lastGame = new Date().toISOString();
            localStorage.setItem(`user_${currentUser.uid}`, JSON.stringify(userData));
        }
        
        // Update global user data for immediate UI updates
        if (window.currentUserData) {
            window.currentUserData.gamesPlayed = (window.currentUserData.gamesPlayed || 0) + 1;
            window.currentUserData.gamesWon = (window.currentUserData.gamesWon || 0) + (won ? 1 : 0);
            window.currentUserData.gamesLost = (window.currentUserData.gamesLost || 0) + (won ? 0 : 1);
        }
    } catch (error) {
        console.error('Error updating user stats:', error);
    }
}

function showGameEndMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: ${type === 'success' ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)'};
        color: white;
        padding: 20px 30px;
        border-radius: 12px;
        font-size: 1.2rem;
        font-weight: 600;
        z-index: 10000;
        box-shadow: 0 10px 25px rgba(0,0,0,0.3);
        animation: slideInUp 0.5s ease-out;
    `;
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.style.animation = 'fadeOut 0.5s ease-out forwards';
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.remove();
                }
            }, 500);
        }
    }, 2000);
}

// Add input validation helpers
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validatePassword(password) {
    return {
        isValid: password.length >= 6,
        errors: [
            ...(password.length < 6 ? ['Password must be at least 6 characters'] : []),
            ...(!/[A-Za-z]/.test(password) ? ['Password must contain at least one letter'] : []),
            ...(!/[0-9]/.test(password) ? [] : []) // Numbers optional but recommended
        ]
    };
}

function validateUsername(username) {
    return {
        isValid: username.length >= 3 && username.length <= 20 && /^[a-zA-Z0-9_]+$/.test(username),
        errors: [
            ...(username.length < 3 ? ['Username must be at least 3 characters'] : []),
            ...(username.length > 20 ? ['Username must be less than 20 characters'] : []),
            ...(/[^a-zA-Z0-9_]/.test(username) ? ['Username can only contain letters, numbers, and underscores'] : [])
        ]
    };
}

// Enhanced error handling
function showAuthError(message, errors = []) {
    // Remove existing error messages
    const existingError = document.querySelector('.auth-error');
    if (existingError) {
        existingError.remove();
    }
    
    // Create error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'auth-error';
    
    let errorHTML = `<div style="font-weight: 600; margin-bottom: 8px;">${message}</div>`;
    if (errors.length > 0) {
        errorHTML += '<ul style="margin: 0; padding-left: 20px; font-size: 0.85rem;">';
        errors.forEach(error => {
            errorHTML += `<li>${error}</li>`;
        });
        errorHTML += '</ul>';
    }
    
    errorDiv.innerHTML = errorHTML;
    
    // Add to active form
    const activeForm = document.querySelector('.auth-form.active');
    if (activeForm) {
        activeForm.appendChild(errorDiv);
        
        // Remove error after 7 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 7000);
    }
}

// Game state
// ... existing code ...

document.addEventListener('DOMContentLoaded', function() {
    // Testing shortcuts
    document.addEventListener('keydown', function(e) {
        const gameArea = document.getElementById('game-area');
        const isGameActive = gameArea && (gameArea.style.display === 'flex' || window.getComputedStyle(gameArea).display === 'flex');
        
        // W key - auto-win game
        if (e.key.toLowerCase() === 'w') {
            console.log('🎮 W key pressed, checking game state...');
            console.log('Game area display:', gameArea ? gameArea.style.display : 'not found');
            console.log('Game area computed display:', gameArea ? window.getComputedStyle(gameArea).display : 'not found');
            
            if (isGameActive) {
                console.log('🎮 TESTING: Auto-win activated!');
                // Set winning score and end game
                gameScore.player = 16;
                gameScore.opponent = 10;
                endGame();
            } else {
                console.log('🎮 Game not active, shortcut ignored');
            }
        }
        
        // R key - end round with random points
        if (e.key.toLowerCase() === 'r') {
            console.log('🎮 R key pressed, checking game state...');
            
            if (isGameActive) {
                console.log('🎮 TESTING: Random round end activated!');
                
                // Generate random captured cards for scoring simulation
                const totalCards = 52;
                const playerCards = Math.floor(Math.random() * 30) + 10; // 10-39 cards
                const opponentCards = totalCards - playerCards;
                
                // Clear current captured cards and simulate random captures
                playerCapturedCards = [];
                opponentCapturedCards = [];
                
                // Create fake captured cards for scoring
                for (let i = 0; i < playerCards; i++) {
                    const randomSuit = suits[Math.floor(Math.random() * suits.length)];
                    const randomValue = values[Math.floor(Math.random() * values.length)];
                    playerCapturedCards.push({ suit: randomSuit, value: randomValue });
                }
                
                for (let i = 0; i < opponentCards; i++) {
                    const randomSuit = suits[Math.floor(Math.random() * suits.length)];
                    const randomValue = values[Math.floor(Math.random() * values.length)];
                    opponentCapturedCards.push({ suit: randomSuit, value: randomValue });
                }
                
                // Add special cards randomly
                if (Math.random() < 0.5) {
                    playerCapturedCards.push({ suit: '♣', value: '2' }); // 2 of Clubs
                } else {
                    opponentCapturedCards.push({ suit: '♣', value: '2' });
                }
                
                if (Math.random() < 0.5) {
                    playerCapturedCards.push({ suit: '♦', value: '10' }); // 10 of Diamonds
                } else {
                    opponentCapturedCards.push({ suit: '♦', value: '10' });
                }
                
                console.log(`🎮 Simulated round end: Player ${playerCards} cards, Opponent ${opponentCards} cards`);
                
                // Force end the round
                endRound();
            } else {
                console.log('🎮 Game not active, shortcut ignored');
            }
        }
    });
    
    // Game state
    let selectedOpponents = 1; // Fixed to 1 opponent for proper Konchina
    let selectedDifficulty = '';
    
    // Game state variables
    let currentRound = 1;
    let currentDeal = 1;
    let currentPlayer = 0; // 0 = human player, 1 = AI opponent
    let playerHand = [];
    let opponentHand = []; // Single opponent hand
    let tableCards = [];
    let playerCapturedCards = [];
    let opponentCapturedCards = [];
    let lastCapturer = 0;
    let lastAction = ''; // Track last action: 'capture' or 'lay'
    let gameScore = { player: 0, opponent: 0 };
    let targetScore = 16;
    
    // Card deck setup - SINGLE PERSISTENT DECK
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    
    // Initialize deck ONCE at game start
    function createDeck() {
        deck = [];
        originalDeck = [];
        for (let suit of suits) {
            for (let value of values) {
                const card = {
                    suit: suit,
                    value: value,
                    color: (suit === '♥' || suit === '♦') ? 'red' : 'black',
                    numericValue: getCardNumericValue(value)
                };
                deck.push(card);
                originalDeck.push({...card}); // Keep copy for verification
            }
        }
        shuffleDeck();
        console.log(`Created deck with ${deck.length} cards`);
    }
    
    // Get numeric value for sum calculations - moved to top of file
    
    // Shuffle deck
    function shuffleDeck() {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
    }
    
    // Draw card from deck
    function drawCard() {
        if (deck.length === 0) {
            console.error('ERROR: Trying to draw from empty deck!');
            return null;
        }
        return deck.pop();
    }
    
    // DOM elements
    const mainMenu = document.getElementById('main-menu');
    const difficultyMenu = document.getElementById('difficulty-menu');
    const countdownScreen = document.getElementById('countdown-screen');
    const gameArea = document.getElementById('game-area');
    
    const playerButtons = document.querySelectorAll('.player-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const rulesBtn = document.getElementById('rules-btn');
    
    // Player selection handlers - DISABLED (no longer used)
    playerButtons.forEach(button => {
        button.addEventListener('click', function() {
            console.log('Player button clicked but disabled - game starts from dashboard now');
            // These buttons are now disabled - game starts from dashboard
        });

        // Remove hover effects since buttons are disabled
        button.style.opacity = '0.5';
        button.style.cursor = 'not-allowed';
    });
    
    // Difficulty selection handlers - DISABLED (no longer used)
    document.addEventListener('click', function(event) {
        if (event.target.classList.contains('difficulty-btn')) {
            console.log('Difficulty button clicked but disabled - using default difficulty');
            // These buttons are now disabled - using default medium difficulty
        }
        
        if (event.target.id === 'back-to-main') {
            showMainMenu();
        }
    });
    
    // Settings and Rules handlers
    settingsBtn.addEventListener('click', function() {
        showSettings();
    });

    rulesBtn.addEventListener('click', function() {
        showRules();
    });

    // Winning screen button handlers
    const playAgainBtn = document.getElementById('play-again-btn');
    const mainMenuBtn = document.getElementById('main-menu-btn');
    
    if (playAgainBtn) {
        playAgainBtn.addEventListener('click', function() {
            restartGame();
        });
    }
    
    if (mainMenuBtn) {
        mainMenuBtn.addEventListener('click', function() {
            returnToMainMenu();
        });
    }

    // Screen transition functions
    function showMainMenu() {
        // Main menu is now hidden - redirect to dashboard if user is logged in
        if (currentUser) {
            showUserDashboard();
        } else {
            showAuthScreen();
        }
    }
    
    function showDifficultyMenu() {
        // Difficulty menu is now skipped - this function is no longer used
        console.log('showDifficultyMenu called but skipped - going directly to countdown');
        startCountdown();
    }
    
    function showLoadingScreen() {
        mainMenu.style.display = 'none';
        document.getElementById('loading-screen').style.display = 'flex';
        gameArea.style.display = 'none';
    }
    
    // showGameArea function moved to top of file

window.executeAction = function(action) {
    console.log('=== EXECUTE ACTION CALLED ===');
    console.log('Action:', action);
    console.log('Selected player card:', selectedPlayerCard);
    console.log('Call stack trace:');
    console.trace();
    
    if (selectedPlayerCard === null) {
        console.log('No card selected for action:', action);
        return;
    }
    
    console.log('DEBUG executeAction - playerHand:', playerHand);
    console.log('DEBUG executeAction - selectedPlayerCard index:', selectedPlayerCard);
    console.log('DEBUG executeAction - playerHand length:', playerHand.length);
    
    const playedCard = window.playerHand[selectedPlayerCard];
    if (!playedCard) {
        console.log('No card found at selected index:', selectedPlayerCard);
        console.log('Available indices in playerHand:', Object.keys(window.playerHand));
        return;
    }
    console.log(`Executing ${action} with card:`, playedCard.value + playedCard.suit);
    
    // For online games, sync to Firebase first and wait for update
    if (window.isOnlineGame) {
        // Determine action type for online games
        let actionType;
        if (selectedTableCards.length > 0) {
            // Validate capture - check for valid capture types
            console.log('DEBUG: selectedTableCards indices:', selectedTableCards);
            console.log('DEBUG: tableCards array:', window.tableCards);
            console.log('DEBUG: tableCards length:', window.tableCards.length);
            
            const tableCardsToCapture = selectedTableCards.map(index => {
                console.log(`DEBUG: Getting card at index ${index}:`, window.tableCards[index]);
                return window.tableCards[index];
            }).filter(card => card); // Filter out undefined cards
            
            console.log('DEBUG: tableCardsToCapture after filter:', tableCardsToCapture);
            
            if (tableCardsToCapture.length === 0) {
                console.log('Invalid capture: no valid table cards found');
                return;
            }
            
            let isValidCapture = false;
            
            // Check for Jack capture (captures all table cards)
            if (playedCard.value === 'J') {
                isValidCapture = true;
            } else {
                // Check for exact rank matches
                const hasExactMatch = tableCardsToCapture.some(tableCard => tableCard && tableCard.value === playedCard.value);
                
                // Check for sum capture (only for number cards)
                let hasSumMatch = false;
                if (playedCard.numericValue > 0) {
                    const totalValue = tableCardsToCapture.reduce((sum, card) => sum + (card ? card.numericValue : 0), 0);
                    hasSumMatch = (totalValue === playedCard.numericValue);
                }
                
                isValidCapture = hasExactMatch || hasSumMatch;
            }
            
            if (isValidCapture) {
                actionType = 'capture';
            } else {
                console.log('Invalid capture: no valid capture type found');
                return;
            }
        } else {
            actionType = 'lay';
        }
        
        syncMoveToFirebase(actionType, playedCard, selectedTableCards);
        return; // Don't execute locally, wait for Firebase update
    }
    
    // Execute locally for single player games (original working logic)
    if (action === 'capture') {
        console.log('Taking CAPTURE branch');
        lastAction = 'capture'; // Track that this was a capture
        
        // Execute capture with throwing animation
        const capturedCards = selectedTableCards.map(index => window.tableCards[index]);
        capturedCards.push(playedCard); // Add played card to captured pile
        
        // Show player throwing card to center and capturing
        showPlayerCaptureMove(selectedPlayerCard, selectedTableCards, () => {
            console.log('Capture animation complete, executing capture logic...');
            playerCapturedCards.push(...capturedCards);
            lastCapturer = 0; // Player is the last capturer
            
            // Remove captured cards from table
            selectedTableCards.sort((a, b) => b - a); // Sort descending to remove from end first
            selectedTableCards.forEach(index => {
                window.tableCards.splice(index, 1);
            });
            
            // Remove played card from hand
            window.playerHand.splice(selectedPlayerCard, 1);
            
            console.log(`Player captured: ${capturedCards.map(c => c.value + c.suit).join(', ')}`);
            
            // Clear selections and continue
            finishAction();
        });
    } else if (action === 'lay') {
        console.log('Taking LAY branch');
        lastAction = 'lay'; // Track that this was a lay
        
        // Show player throwing card to center and laying
        showPlayerLayMove(selectedPlayerCard, () => {
            console.log('Lay animation complete, executing lay logic...');
            window.tableCards.push(playedCard);
            window.playerHand.splice(selectedPlayerCard, 1);
            
            console.log(`Player laid: ${playedCard.value}${playedCard.suit}`);
            
            // Clear selections and continue
            finishAction();
        });
    } else {
        console.log('Unknown action:', action);
    }
};

// executeLocalAction function removed - logic now directly in executeAction for better single/multiplayer handling

async function syncMoveToFirebase(action, playedCard, tableCardsSelected) {
    if (!currentGameRoom || !window.db) return;
    
    try {
        const roomRef = window.doc(window.db, 'gameRooms', currentGameRoom);
        const roomDoc = await window.getDoc(roomRef);
        
        if (!roomDoc.exists()) return;
        
        const roomData = roomDoc.data();
        const gameState = roomData.gameState;
        const currentPlayerId = currentUser.uid;
        
        // Create updated game state
        const updatedGameState = { ...gameState };
        
        if (action === 'capture') {
            // Handle capture
            const capturedCards = tableCardsSelected.map(index => gameState.tableCards[index]);
            
            // Add to captured cards
            if (!updatedGameState.capturedCards[currentPlayerId]) {
                updatedGameState.capturedCards[currentPlayerId] = [];
            }
            updatedGameState.capturedCards[currentPlayerId].push(playedCard, ...capturedCards);
            
            // Remove from player hand by finding the exact card, not by index
            const playerHandArray = updatedGameState.playerHands[currentPlayerId];
            const cardIndex = playerHandArray.findIndex(card => 
                card.suit === playedCard.suit && card.value === playedCard.value
            );
            if (cardIndex !== -1) {
                playerHandArray.splice(cardIndex, 1);
            } else {
                console.warn('Could not find played card in hand:', playedCard);
            }
            
            // Remove from table (in reverse order)
            const sortedIndices = [...tableCardsSelected].sort((a, b) => b - a);
            sortedIndices.forEach(index => {
                updatedGameState.tableCards.splice(index, 1);
            });
            
            updatedGameState.lastCapturer = currentPlayerId;
            updatedGameState.lastAction = 'capture';
            
        } else {
            // Handle lay
            updatedGameState.tableCards.push(playedCard);
            
            // Remove from player hand by finding the exact card, not by index
            const playerHandArray = updatedGameState.playerHands[currentPlayerId];
            const cardIndex = playerHandArray.findIndex(card => 
                card.suit === playedCard.suit && card.value === playedCard.value
            );
            if (cardIndex !== -1) {
                playerHandArray.splice(cardIndex, 1);
            } else {
                console.warn('Could not find played card in hand:', playedCard);
            }
            
            updatedGameState.lastAction = 'lay';
        }
        
        // Switch turn
        const playerIds = Object.keys(roomData.players);
        const currentIndex = playerIds.indexOf(currentPlayerId);
        const nextIndex = (currentIndex + 1) % playerIds.length;
        updatedGameState.currentPlayer = nextIndex;
        
        // Update scores if needed
        // (Score calculation would happen here)
        
        // Update in Firebase
        await window.updateDoc(roomRef, {
            gameState: updatedGameState
        });
        
        console.log('Move synced to Firebase:', action, 'Card:', playedCard.value + playedCard.suit);
        
    } catch (error) {
        console.error('Error syncing move to Firebase:', error);
    }
}

function finishAction() {
    // Clear selections
    selectedPlayerCard = null;
    selectedTableCards = [];
    
    console.log('=== FINISH ACTION CALLED ===');
    console.log('About to call updateGameDisplay...');
    
    // Update visuals
    updateGameDisplay();
    
    console.log('About to call nextTurn...');
    console.log('Current player before nextTurn:', currentPlayer);
    
    // For online games, don't call nextTurn here - it will be handled by Firebase listener
    if (!window.isOnlineGame) {
        // Next turn
        nextTurn();
    }
}

function findSumCombinations(tableCards, targetSum) {
    const combinations = [];
    
    // Generate all possible combinations
    for (let i = 1; i < (1 << tableCards.length); i++) {
        const combination = [];
        let sum = 0;
        
        for (let j = 0; j < tableCards.length; j++) {
            if (i & (1 << j)) {
                combination.push(j);
                sum += tableCards[j].numericValue;
            }
        }
        
        if (sum === targetSum && combination.length > 1) {
            combinations.push(combination);
        }
    }
    
    return combinations;
}

function animateCapture(playerCardIndex, tableCardIndices, callback) {
    const playerCardElement = document.querySelectorAll('#player-cards .card')[playerCardIndex];
    const tableCardElements = tableCardIndices.map(index => 
        document.querySelectorAll('#table-cards .card')[index]
    ).filter(element => element !== null && element !== undefined);
    
    // Safety check - if no player card element, just execute callback
    if (!playerCardElement) {
        console.log('No player card element found, skipping animation');
        callback();
        return;
    }
    
    // Additional safety checks for DOM properties
    if (playerCardElement.offsetLeft === undefined || playerCardElement.offsetWidth === undefined) {
        console.log('Player card element missing offset properties, skipping animation');
        callback();
        return;
    }
    
    // Get center position for dramatic capture effect
    const centerArea = document.querySelector('.center-area');
    if (!centerArea) {
        console.log('Center area not found, skipping animation');
        callback();
        return;
    }
    
    const centerRect = centerArea.getBoundingClientRect();
    const gameAreaRect = document.getElementById('game-area').getBoundingClientRect();
    
    const centerX = (centerRect.left - gameAreaRect.left) + centerRect.width / 2;
    const centerY = (centerRect.top - gameAreaRect.top) + centerRect.height / 2;
    
    // Create capture animation timeline with error handling
    try {
        const captureTimeline = gsap.timeline({
            onComplete: callback
        });
        
        // Step 1: Player card flies to center with dramatic entrance
        captureTimeline.to(playerCardElement, {
            duration: 0.4,
            x: centerX - playerCardElement.offsetLeft - playerCardElement.offsetWidth / 2,
            y: centerY - playerCardElement.offsetTop - playerCardElement.offsetHeight / 2,
            scale: 1.3,
            rotation: 0,
            zIndex: 999,
            ease: "power2.out",
            transformOrigin: "center"
        });
        
        // Step 2: Add dramatic glow effect to player card
        captureTimeline.set(playerCardElement, {
            boxShadow: '0 0 40px rgba(59, 130, 246, 0.8), 0 0 80px rgba(59, 130, 246, 0.4)'
        }, 0.2);
        
        // Step 3: Table cards fly to center in sequence
        tableCardElements.forEach((element, index) => {
            if (element && element.offsetLeft !== undefined && element.offsetTop !== undefined) {
                captureTimeline.to(element, {
                    duration: 0.3,
                    x: centerX - element.offsetLeft - element.offsetWidth / 2 + index * 5,
                    y: centerY - element.offsetTop - element.offsetHeight / 2 + index * 5,
                    scale: 1.2,
                    rotation: (Math.random() - 0.5) * 30,
                    zIndex: 998 - index,
                    ease: "power2.out"
                }, 0.1 + index * 0.05);
            }
        });
        
        // Step 4: All cards disappear with spiral effect
        const allCardsToAnimate = [playerCardElement, ...tableCardElements].filter(el => el);
        if (allCardsToAnimate.length > 0) {
            captureTimeline.to(allCardsToAnimate, {
                duration: 0.4,
                x: '+=50',
                y: '+=100',
                rotation: '+=360',
                scale: 0.3,
                opacity: 0,
                ease: "power2.in",
                stagger: 0.03
            }, 1.0);
        }
        
    } catch (error) {
        console.error('Animation error in animateCapture:', error);
        callback(); // Still call callback to continue game flow
    }
}



function nextTurn() {
    console.log('=== NEXT TURN CALLED ===');
    console.log('Current player before switch:', currentPlayer);
    console.log('Last action was:', lastAction);
    console.log('Player hand length:', playerHand.length);
    console.log('Opponent hand length:', opponentHand.length);
    
    // Check if deal is over BEFORE switching turns
    if (playerHand.length === 0 && opponentHand.length === 0) {
        if (currentDeal < 6) {
            // Deal new cards (deals 2-6)
            currentDeal++;
            dealNewHand();
            return; // Exit early, don't change turns
        } else {
            // All 6 deals complete - round is over
            endRound();
            return; // Exit early
        }
    }
    
    // KONCHINA RULE: Turn switches after EVERY action (both capture and lay)
    currentPlayer = (currentPlayer + 1) % 2;
    console.log(`=== TURN SWITCH (after ${lastAction.toUpperCase()}): Now player ${currentPlayer} (${currentPlayer === 0 ? 'Human' : 'AI'}) ===`);
    
    updateGameUI();
    
    if (currentPlayer === 0) {
        // Player's turn
        console.log('Player turn - enabling card selection');
        updateCardVisuals();
    } else {
        // AI turn - execute with short delay for better UX
        console.log('AI turn - executing AI move');
        updateCardVisuals(); // Gray out player cards during AI turn
        setTimeout(() => {
            executeAITurn();
        }, 500);
    }
}

// Placeholder functions that may be called
function dealNewHand() {
    console.log('dealNewHand called - placeholder');
}

function endRound() {
    console.log('endRound called - placeholder');
}

function executeAITurn() {
    console.log('executeAITurn called - placeholder');
}
 
// Duplicate createAndAnimateCards function removed - now defined at top of file

    // Game flow functions - SIMPLIFIED (no longer used)
    function selectPlayerCount(count) {
        // This function is no longer used - game starts directly from dashboard
        console.log('selectPlayerCount called but disabled - game starts from dashboard now');
    }
    
    function selectDifficulty(difficulty) {
        // This function is no longer used - using default medium difficulty
        console.log('selectDifficulty called but disabled - using default medium difficulty');
    }
    
    function startLoadingSequence() {
        showLoadingScreen();
        const loadingBar = document.getElementById('loading-bar');
        const loadingText = document.getElementById('loading-text');
        
        const loadingSteps = [
            'Loading graphics...',
            'Shuffling cards...',
            'Preparing game...',
            'Ready to play!'
        ];
        
        let currentStep = 0;
        
        // Update loading text every 800ms
        const textInterval = setInterval(() => {
            if (currentStep < loadingSteps.length - 1) {
                currentStep++;
                if (loadingText) {
                    loadingText.textContent = loadingSteps[currentStep];
                }
            }
        }, 800);
        
        // Start the game after 3.5 seconds (matching CSS animation duration)
        setTimeout(() => {
            clearInterval(textInterval);
            startGame();
        }, 3500);
    }
    
    // Function to start game directly (moved inside DOMContentLoaded for access to startCountdown)
    function startGameDirectly(mode = 'practice') {
        // Store game mode for reward calculation
        window.currentGameMode = mode;
        
        // Set defaults for removed menus
        selectedOpponents = 1; // Always 1 opponent for Konchina
        selectedDifficulty = 'medium'; // Default to medium difficulty
        
        // Hide the dashboard before starting countdown
        document.getElementById('user-dashboard').style.display = 'none';
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('main-menu').style.display = 'none';
        
        // Skip menus and start loading sequence immediately
        startLoadingSequence();
    }
    
    // Make startGameDirectly globally accessible
    window.startGameDirectly = startGameDirectly;
    
    function startGame() {
        console.log('=== START GAME CALLED ===');
        console.log('About to call showGameArea...');
        showGameArea();
        
        // Setup page unload protection when game starts
        setupPageUnloadProtection();
        
        // Show loading message
        const gameArea = document.getElementById('game-area');
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'loading-screen';
        loadingDiv.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            color: white;
            font-family: 'Inter', sans-serif;
        `;
        loadingDiv.innerHTML = `
            <div style="font-size: 1.5rem; margin-bottom: 20px;">Loading Card Graphics...</div>
            <div style="width: 200px; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; overflow: hidden;">
                <div id="loading-progress" style="width: 0%; height: 100%; background: #3b82f6; transition: width 0.3s ease;"></div>
            </div>
            <div id="loading-text" style="margin-top: 10px; font-size: 0.9rem; opacity: 0.8;">Preparing game...</div>
        `;
        gameArea.appendChild(loadingDiv);
        
        console.log('showGameArea called, preloading images...');
        
        // Preload all card images before starting the game
        preloadAllCardImages()
            .then(() => {
                console.log('All images preloaded successfully!');
                // Remove loading screen
                if (loadingDiv.parentNode) {
                    loadingDiv.remove();
                }
                
                // Now start the actual game
                console.log('Creating deck and starting game...');
                createDeck(); // Create deck ONCE at game start
                initializeGame();
                dealInitialCards();
            })
            .catch((error) => {
                console.error('Failed to preload images:', error);
                // Remove loading screen and show error
                if (loadingDiv.parentNode) {
                    loadingDiv.remove();
                }
                
                // Start game anyway with fallback text cards
                console.log('Starting game with fallback cards...');
                createDeck();
                initializeGame();
                dealInitialCards();
            });
    }
    
    function initializeGame() {
        // Initialize game state for 1v1 Konchina
        currentRound = 1;
        currentDeal = 1;
        currentPlayer = 0;
        playerHand = [];
        opponentHand = []; // Single opponent
        tableCards = [];
        playerCapturedCards = [];
        opponentCapturedCards = [];
        lastCapturer = 0;
        gameScore = { player: 0, opponent: 0 };
        
        // Create the game UI
        createGameUI();
        
        console.log('=== KONCHINA GAME INITIALIZED ===');
        console.log('1v1 gameplay with single persistent 52-card deck');
        console.log('Selected difficulty:', selectedDifficulty);
    }
    
    function dealInitialCards() {
        console.log(`=== DEAL ${currentDeal} - ROUND ${currentRound} ===`);
        console.log(`Cards remaining in deck: ${deck.length}`);
        
        const playerCardsContainer = document.getElementById('player-cards');
        const opponentCardsContainer = document.getElementById('opponent-cards');
        const tableCardsContainer = document.querySelector('.center-area');
        
        // Clear any existing cards
        playerCardsContainer.innerHTML = '';
        opponentCardsContainer.innerHTML = '';
        
        // Clear table cards container and create new one
        tableCardsContainer.innerHTML = '<div class="table-cards" id="table-cards"></div>';
        const tableCardsDiv = document.getElementById('table-cards');
        
        // FIRST DEAL OF EACH ROUND: Deal table cards first (4 cards, no Jacks allowed)
        if (currentDeal === 1) {
            console.log(`Round ${currentRound} initial deal: Setting up table cards...`);
            for (let i = 0; i < 4; i++) {
                let card = drawCard();
                // If Jack is dealt to table, reshuffle and redraw
                while (card && card.value === 'J') {
                    console.log(`Jack ${card.suit} drawn for table - reshuffling...`);
                    deck.push(card); // Put Jack back in deck
                    shuffleDeck(); // Reshuffle entire deck
                    card = drawCard();
                }
                if (card) {
                    tableCards.push(card);
                    console.log(`Table card ${i + 1}: ${card.value}${card.suit}`);
                }
            }
        }
        
        // Deal hand cards (4 to each player)
        console.log('Dealing hand cards...');
        
        // Deal 4 cards to player
        for (let i = 0; i < 4; i++) {
            const card = drawCard();
            if (card) {
                playerHand.push(card);
                console.log(`Player card ${i + 1}: ${card.value}${card.suit}`);
            }
        }
        
        // Deal 4 cards to opponent
        for (let i = 0; i < 4; i++) {
            const card = drawCard();
            if (card) {
                opponentHand.push(card);
                console.log(`Opponent card ${i + 1}: ${card.value}${card.suit}`);
            }
        }
        
        console.log(`Cards remaining in deck after deal: ${deck.length}`);
        console.log(`Expected remaining: ${52 - (tableCards.length + playerHand.length + opponentHand.length)}`);
        
        // Verify deck integrity
        const totalDealt = tableCards.length + playerHand.length + opponentHand.length;
        const expectedTotal = currentDeal === 1 ? 12 : (12 + (currentDeal - 1) * 8);
        console.log(`Total cards dealt: ${totalDealt}, Expected: ${expectedTotal}`);
        
        // Create visual elements and animate
        createAndAnimateCards();
    }
    
    // createAndAnimateCards function moved to top of file for online multiplayer access
    // createCardElement function moved to top of file for online multiplayer access
    
    // Image cache to prevent duplicate network requests
    const imageCache = new Map();
    
    // Preload all card images at game start
    function preloadAllCardImages() {
        return new Promise((resolve, reject) => {
            const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
            const values = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];
            const totalImages = suits.length * values.length; // 52 cards
            let loadedImages = 0;
            let failedImages = 0;
            
            console.log('Preloading all card images...');
            
            const loadPromises = [];
            
            suits.forEach(suit => {
                values.forEach(value => {
                    const promise = new Promise((imageResolve) => {
                        const img = new Image();
                        const cacheKey = `${value}_of_${suit}`;
                        const timestamp = Date.now();
                        const imageUrl = `assets/cards/${value}_of_${suit}.png?v=${timestamp}`;
                        
                        img.onload = () => {
                            // Cache the successfully loaded image URL
                            imageCache.set(cacheKey, imageUrl);
                            loadedImages++;
                            console.log(`Loaded: ${cacheKey} (${loadedImages}/${totalImages})`);
                            imageResolve();
                        };
                        
                        img.onerror = () => {
                            failedImages++;
                            console.warn(`Failed to load: ${cacheKey}`);
                            // Still resolve so we don't block the game
                            imageResolve();
                        };
                        
                        img.src = imageUrl;
                    });
                    
                    loadPromises.push(promise);
                });
            });
            
            Promise.all(loadPromises).then(() => {
                console.log(`Image preloading complete! Loaded: ${loadedImages}, Failed: ${failedImages}`);
                if (loadedImages > 0) {
                    resolve();
                } else {
                    reject(new Error('No card images could be loaded'));
                }
            });
        });
    }
    
    // getCardImagePath function moved to top of file for online multiplayer access
    // getCardFallbackHTML function moved to top of file for online multiplayer access
    
    function getCardRotation(index, totalCards) {
        // Calculate rotation for truly stacked effect
        const maxRotation = 2; // Minimal rotation - just enough to see it's fanned
        const center = (totalCards - 1) / 2;
        const rotationStep = maxRotation / Math.max(1, center);
        return (index - center) * rotationStep;
    }
    
    function positionCardsInHand(cards, isPlayer) {
        const totalCards = cards.length;
        if (totalCards === 0) return;
        
        // Responsive card positioning
        const screenWidth = window.innerWidth;
        const isMobile = screenWidth < 768;
        const isSmallMobile = screenWidth < 480;
        
        // Cards touching edges - no gap between cards
        const cardWidth = 140; // Card width
        const baseSpacing = isSmallMobile ? 5 : isMobile ? 8 : 10; // Minimal spacing so cards touch edges
        const overlapAmount = baseSpacing; // Use the minimal spacing directly
        const centerOffset = (totalCards - 1) * overlapAmount / 2;
        
        cards.forEach((card, index) => {
            // Calculate positions for tight, straight alignment
            const x = (index * overlapAmount) - centerOffset;
            
            // No curve - keep cards perfectly straight
            const y = 0;
            
            // No rotation - keep all cards perfectly straight
            const rotation = 0;
            
            // Store original transform values WITHOUT random offsets
            const originalTransform = {
                x: x,
                y: y,
                rotation: rotation,
                scale: 1,
                zIndex: index + 1
            };
            
            // Store original transform on the element for reference
            card._originalTransform = originalTransform;
            
            // Clear any existing GSAP animations first
            gsap.killTweensOf(card);
            
            // Apply initial positioning using GSAP
            gsap.set(card, {
                x: originalTransform.x,
                y: originalTransform.y,
                rotation: originalTransform.rotation,
                scale: originalTransform.scale,
                zIndex: originalTransform.zIndex,
                transformOrigin: "bottom center"
            });
           
            // Enhanced hover effects for player cards with proper position restoration
            if (isPlayer) {
                // Remove any existing event listeners to prevent duplicates
                if (card._mouseEnterHandler) {
                    card.removeEventListener('mouseenter', card._mouseEnterHandler);
                }
                if (card._mouseLeaveHandler) {
                    card.removeEventListener('mouseleave', card._mouseLeaveHandler);
                }
                
                // Create new event handlers that capture the current originalTransform
                const currentOriginalTransform = { ...originalTransform };
                
                card._mouseEnterHandler = () => {
                    // Kill any existing animations before starting new one
                    gsap.killTweensOf(card);
                    gsap.to(card, {
                        duration: 0.05, // Ultra fast hover response
                        x: currentOriginalTransform.x, // Keep X position fixed
                        y: currentOriginalTransform.y - 15, // Move up slightly
                        rotation: currentOriginalTransform.rotation, // Keep original rotation
                        scale: currentOriginalTransform.scale, // Keep original scale - no scaling
                        // Don't change zIndex at all
                        ease: "power2.out"
                    });
                    
                    // Much more subtle glow effect
                    card.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.15), 0 0 0 1px rgba(59, 130, 246, 0.08)';
                };
                
                card._mouseLeaveHandler = () => {
                    // Kill any existing animations before starting new one
                    gsap.killTweensOf(card);
                    gsap.to(card, {
                        duration: 0.02, // Ultra ultra fast return
                        x: currentOriginalTransform.x, // Return to exact original X position
                        y: currentOriginalTransform.y, // Return to exact original Y position  
                        rotation: currentOriginalTransform.rotation, // Return to exact original rotation
                        scale: currentOriginalTransform.scale, // Return to exact original scale
                        // Don't change zIndex back - keep original layering
                        ease: "power2.out"
                    });
                    
                    // Remove glow effect
                    card.style.boxShadow = '';
                };
                
                // Add the new event listeners
                card.addEventListener('mouseenter', card._mouseEnterHandler);
                card.addEventListener('mouseleave', card._mouseLeaveHandler);
            }
        });
    }

    // Game logic functions
    function selectTableCard(cardIndex) {
        if (selectedPlayerCard === null) return; // Must select hand card first
        
        const tableCardIndex = selectedTableCards.indexOf(cardIndex);
        if (tableCardIndex > -1) {
            // Deselect table card
            selectedTableCards.splice(tableCardIndex, 1);
        } else {
            // Select table card
            selectedTableCards.push(cardIndex);
            
            // Check if current selection is a valid capture and auto-execute
            const playedCard = playerHand[selectedPlayerCard];
            const isValidCapture = isValidCaptureSelection(playedCard, selectedTableCards);
            
            if (isValidCapture) {
                console.log('Auto-executing capture with valid selection');
                executeAction('capture');
                return; // Exit early since capture is executed
            }
        }
        
        updateCardVisuals();
            updateActionButtons();
}
    
              function updateActionButtons() {
         // No buttons needed anymore - everything is auto-executed!
         // Cards auto-execute when:
         // - Only one capture option exists
         // - No captures possible (auto-lay)
         // - Valid capture selection is completed
         
         // Clear any existing buttons
         const actionButtonsContainer = document.querySelector('.action-buttons');
         if (actionButtonsContainer) {
             actionButtonsContainer.innerHTML = '';
         }
     }
    
         function isValidCaptureSelection(playedCard, selectedIndices) {
         if (selectedIndices.length === 0) return false;
         
         // Jack captures ALL table cards
         if (playedCard.value === 'J') {
             return selectedIndices.length === tableCards.length;
         }
         
         // Check rank capture (single card, exact match)
         if (selectedIndices.length === 1) {
             const tableCard = tableCards[selectedIndices[0]];
             return tableCard.value === playedCard.value;
         }
         
         // Check sum capture (multiple cards, must be number cards)
         if (playedCard.numericValue === 0) return false; // Face cards (except Jack) can't do sum captures
         
         const selectedCards = selectedIndices.map(index => tableCards[index]);
         const allAreNumbers = selectedCards.every(card => card.numericValue > 0);
         if (!allAreNumbers) return false;
         
         const sum = selectedCards.reduce((total, card) => total + card.numericValue, 0);
         return sum === playedCard.numericValue;
     }
    
        // Duplicate function removed - using the first executeAction function for both single and multiplayer
     
     function finishAction() {
         // Clear selections
         selectedPlayerCard = null;
         selectedTableCards = [];
         
         console.log('=== FINISH ACTION CALLED ===');
         console.log('About to call updateGameDisplay...');
         
         // Update visuals
         updateGameDisplay();
         
         console.log('About to call nextTurn...');
         console.log('Current player before nextTurn:', currentPlayer);
         
         // For online games, don't call nextTurn here - it will be handled by Firebase listener
         if (!window.isOnlineGame) {
         // Next turn
         nextTurn();
         }
     }
     
     function animateCapture(playerCardIndex, tableCardIndices, callback) {
         const playerCardElement = document.querySelectorAll('#player-cards .card')[playerCardIndex];
         const tableCardElements = tableCardIndices.map(index => 
             document.querySelectorAll('#table-cards .card')[index]
         ).filter(element => element !== null && element !== undefined);
         
         // Safety check - if no player card element, just execute callback
         if (!playerCardElement) {
             console.log('No player card element found, skipping animation');
             callback();
             return;
         }
         
                   // Additional safety checks for DOM properties
          if (playerCardElement.offsetLeft === undefined || playerCardElement.offsetWidth === undefined) {
              console.log('Player card element missing offset properties, skipping animation');
              callback();
              return;
          }
         
         // Get center position for dramatic capture effect
         const centerArea = document.querySelector('.center-area');
         if (!centerArea) {
             console.log('Center area not found, skipping animation');
             callback();
             return;
         }
         
         const centerRect = centerArea.getBoundingClientRect();
         const gameAreaRect = document.getElementById('game-area').getBoundingClientRect();
         
         const centerX = (centerRect.left - gameAreaRect.left) + centerRect.width / 2;
         const centerY = (centerRect.top - gameAreaRect.top) + centerRect.height / 2;
         
                 // Create capture animation timeline with error handling
        try {
            const captureTimeline = gsap.timeline({
                onComplete: callback
            });
            
            // Step 1: Player card flies to center with dramatic entrance
            captureTimeline.to(playerCardElement, {
                duration: 0.4,
                x: centerX - playerCardElement.offsetLeft - playerCardElement.offsetWidth / 2,
                y: centerY - playerCardElement.offsetTop - playerCardElement.offsetHeight / 2,
                scale: 1.3,
                rotation: 0,
                zIndex: 999,
                ease: "power2.out",
                transformOrigin: "center"
            });
         
         // Step 2: Add dramatic glow effect to player card
         captureTimeline.set(playerCardElement, {
             boxShadow: '0 0 40px rgba(59, 130, 246, 0.8), 0 0 80px rgba(59, 130, 246, 0.4)'
         }, 0.2);
         
         // Step 3: Table cards fly to center in sequence
         tableCardElements.forEach((element, index) => {
             if (element && element.offsetLeft !== undefined && element.offsetTop !== undefined) {
                 captureTimeline.to(element, {
                     duration: 0.3,
                     x: centerX - element.offsetLeft - element.offsetWidth / 2 + (index * 3),
                     y: centerY - element.offsetTop - element.offsetHeight / 2 + (index * 3),
                     scale: 1.1,
                     rotation: (Math.random() - 0.5) * 30,
                     zIndex: 998 - index,
                     ease: "power2.out",
                     delay: index * 0.05
                 }, 0.3);
                 
                 // Add trail effect
                 captureTimeline.set(element, {
                     boxShadow: '0 0 20px rgba(34, 197, 94, 0.6)'
                 }, 0.3 + index * 0.05);
             }
         });
         
         // Step 4: Brief pause for dramatic effect
         captureTimeline.to({}, { duration: 0.15 });
         
         // Step 5: Create capture burst effect
         captureTimeline.call(() => {
             // Create capture text
             const captureText = document.createElement('div');
             captureText.style.cssText = `
                 position: absolute;
                 left: ${centerX}px;
                 top: ${centerY - 40}px;
                 transform: translate(-50%, -50%);
                 color: #3b82f6;
                 font-size: 24px;
                 font-weight: bold;
                 z-index: 1001;
                 pointer-events: none;
                 text-shadow: 0 0 10px rgba(59, 130, 246, 0.8);
             `;
             captureText.textContent = tableCardIndices.length > 1 ? '🔥 COMBO!' : '✨ CAPTURED!';
             document.getElementById('game-area').appendChild(captureText);
             
             // Animate capture text
             gsap.fromTo(captureText, 
                 { opacity: 0, scale: 0.5, y: 20 },
                 { 
                     duration: 0.3, 
                     opacity: 1, 
                     scale: 1, 
                     y: 0,
                     ease: "back.out(1.7)" 
                 }
             );
             
             // Remove text after animation
             setTimeout(() => {
                 if (captureText.parentNode) {
                     gsap.to(captureText, {
                         duration: 0.2,
                         opacity: 0,
                         scale: 0.5,
                         y: -20,
                         ease: "power2.in",
                         onComplete: () => {
                             if (captureText.parentNode) {
                                 captureText.parentNode.removeChild(captureText);
                             }
                         }
                     });
                 }
             }, 400);
         }, 0.8);
         
         // Step 6: Cards spiral into player's capture pile
         const allCardsToAnimate = [playerCardElement, ...tableCardElements].filter(el => el);
         if (allCardsToAnimate.length > 0) {
             captureTimeline.to(allCardsToAnimate, {
                 duration: 0.4,
                 x: '+=50',
                 y: '+=100',
                 rotation: '+=360',
                 scale: 0.3,
                 opacity: 0,
                 ease: "power2.in",
                 stagger: 0.03
             }, 1.0);
         }
         
         // Step 7: Confetti explosion for big captures
         captureTimeline.call(() => {
             if (window.confetti && tableCardIndices.length >= 2) {
                 confetti({
                     particleCount: 100,
                     spread: 70,
                     origin: { x: 0.5, y: 0.6 },
                     colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444']
                 });
             }
         }, 1.1);
         
     } catch (error) {
         console.error('Animation error in animateCapture:', error);
         callback(); // Still call callback to continue game flow
     }
 }
     

    
             // Removed unused helper functions:
    // - cancelSelection() - no cancel button needed
    // - selectAllTableCards() - no select all button needed  
    // - showCaptureHints() - no hints button needed
    // All functionality is now automatic!
    
    function nextTurn() {
        console.log('=== NEXT TURN CALLED ===');
        console.log('Current player before switch:', currentPlayer);
        console.log('Last action was:', lastAction);
        console.log('Player hand length:', playerHand.length);
        console.log('Opponent hand length:', opponentHand.length);
        
        // Check if deal is over BEFORE switching turns
        if (playerHand.length === 0 && opponentHand.length === 0) {
            if (currentDeal < 6) {
                // Deal new cards (deals 2-6)
                currentDeal++;
                dealNewHand();
                return; // Exit early, don't change turns
            } else {
                // All 6 deals complete - round is over
                endRound();
                return; // Exit early
            }
        }
        
        // KONCHINA RULE: Turn switches after EVERY action (both capture and lay)
        // "Turns rotate clockwise, and after each trick, the player who took the trick plays next"
        currentPlayer = (currentPlayer + 1) % 2;
        console.log(`=== TURN SWITCH (after ${lastAction.toUpperCase()}): Now player ${currentPlayer} (${currentPlayer === 0 ? 'Human' : 'AI'}) ===`);
        
        updateGameUI();
        
        if (currentPlayer === 0) {
            // Player's turn
            console.log('Player turn - enabling card selection');
            updateCardVisuals();
        } else {
            // AI turn - execute with short delay for better UX
            console.log('AI turn - executing AI move');
            updateCardVisuals(); // Gray out player cards during AI turn
            setTimeout(() => {
                executeAITurn();
            }, 500);
        }
    }
    
    function dealNewHand() {
        console.log(`=== DEALING NEW HAND - DEAL ${currentDeal} ===`);
        console.log(`Cards in deck before new deal: ${deck.length}`);
        
        // Deal 4 new cards to each player (no new table cards after first deal)
        // Jacks are now ALLOWED in hands (only table restriction was in first deal)
        for (let i = 0; i < 4; i++) {
            const playerCard = drawCard();
            const opponentCard = drawCard();
            
            if (playerCard) {
                playerHand.push(playerCard);
                console.log(`Player new card ${i + 1}: ${playerCard.value}${playerCard.suit}`);
            }
            if (opponentCard) {
                opponentHand.push(opponentCard);
                console.log(`Opponent new card ${i + 1}: ${opponentCard.value}${opponentCard.suit}`);
            }
        }
        
        console.log(`Cards in deck after new deal: ${deck.length}`);
        
        // Verify deck integrity after each deal
        const totalCardsInPlay = deck.length + tableCards.length + playerHand.length + opponentHand.length;
        const totalCaptured = playerCapturedCards.length + opponentCapturedCards.length;
        const grandTotal = totalCardsInPlay + totalCaptured;
        
        console.log(`=== DECK VERIFICATION DEAL ${currentDeal} ===`);
        console.log(`In deck: ${deck.length}`);
        console.log(`On table: ${tableCards.length}`);
        console.log(`Player hand: ${playerHand.length}`);
        console.log(`Opponent hand: ${opponentHand.length}`);
        console.log(`Player captured: ${playerCapturedCards.length}`);
        console.log(`Opponent captured: ${opponentCapturedCards.length}`);
        console.log(`Total in play: ${totalCardsInPlay}`);
        console.log(`Total captured: ${totalCaptured}`);
        console.log(`Grand total: ${grandTotal}/52`);
        
        if (grandTotal !== 52) {
            console.error(`DECK ERROR: ${grandTotal} cards total, should be 52!`);
        }
        
        // RESET TURN: After dealing new cards, turn goes back to starting player (player 0)
        currentPlayer = 0;
        console.log(`=== NEW DEAL: Turn reset to starting player (Human) ===`);
        
        // Update visual display for new cards
        updateGameDisplay();
        
        // Update UI to reflect it's the player's turn
        updateGameUI();
        updateCardVisuals();
        
        console.log(`=== DEAL ${currentDeal} COMPLETE - Jacks allowed in hands ===`);
    }
    
    function endRound() {
        // Any remaining table cards go to last capturer
        if (tableCards.length > 0) {
            if (lastCapturer === 0) {
                playerCapturedCards.push(...tableCards);
                console.log(`Remaining ${tableCards.length} table cards go to player (last capturer)`);
            } else {
                opponentCapturedCards.push(...tableCards);
                console.log(`Remaining ${tableCards.length} table cards go to opponent (last capturer)`);
            }
            tableCards = [];
        }
        
        // Verify all 52 cards are accounted for
        const totalCards = playerCapturedCards.length + opponentCapturedCards.length;
        console.log(`=== ROUND ${currentRound} COMPLETE ===`);
        console.log(`Player captured: ${playerCapturedCards.length} cards`);
        console.log(`Opponent captured: ${opponentCapturedCards.length} cards`);
        console.log(`Total captured: ${totalCards} (should be 52)`);
        
        if (totalCards !== 52) {
            console.error(`ERROR: Only ${totalCards} cards captured, missing ${52 - totalCards} cards!`);
        }
        
        // Calculate scores
        calculateRoundScore();
        
        // Check if game is over
        if (gameScore.player >= targetScore || gameScore.opponent >= targetScore) {
            endGame();
        } else {
            // Start new round
            startNewRound();
        }
    }
    
    function calculateRoundScore() {
        // Count captured cards
        const playerCardCount = playerCapturedCards.length;
        const opponentCardCount = opponentCapturedCards.length;
        
        console.log(`Scoring: Player ${playerCardCount} vs Opponent ${opponentCardCount} cards`);
        
        // Track round scoring details for popup
        const roundScoring = {
            playerPoints: 0,
            opponentPoints: 0,
            details: []
        };
        
        // Most cards (2 points, or 1 each if tied)
        if (playerCardCount > opponentCardCount) {
            gameScore.player += 2;
            roundScoring.playerPoints += 2;
            roundScoring.details.push(`Most Cards: You get 2 points (${playerCardCount} vs ${opponentCardCount})`);
            console.log('Player gets 2 points for most cards');
        } else if (opponentCardCount > playerCardCount) {
            gameScore.opponent += 2;
            roundScoring.opponentPoints += 2;
            roundScoring.details.push(`Most Cards: AI gets 2 points (${opponentCardCount} vs ${playerCardCount})`);
            console.log('Opponent gets 2 points for most cards');
        } else {
            gameScore.player += 1;
            gameScore.opponent += 1;
            roundScoring.playerPoints += 1;
            roundScoring.opponentPoints += 1;
            roundScoring.details.push(`Most Cards: Tied - both get 1 point (${playerCardCount} each)`);
            console.log('Tied for cards - each gets 1 point');
        }
        
        // Most clubs (1 point)
        const playerClubs = playerCapturedCards.filter(card => card.suit === '♣').length;
        const opponentClubs = opponentCapturedCards.filter(card => card.suit === '♣').length;
        
        if (playerClubs > opponentClubs) {
            gameScore.player += 1;
            roundScoring.playerPoints += 1;
            roundScoring.details.push(`Most Clubs: You get 1 point (${playerClubs} vs ${opponentClubs})`);
            console.log(`Player gets 1 point for most clubs (${playerClubs} vs ${opponentClubs})`);
        } else if (opponentClubs > playerClubs) {
            gameScore.opponent += 1;
            roundScoring.opponentPoints += 1;
            roundScoring.details.push(`Most Clubs: AI gets 1 point (${opponentClubs} vs ${playerClubs})`);
            console.log(`Opponent gets 1 point for most clubs (${opponentClubs} vs ${playerClubs})`);
        } else if (playerClubs === opponentClubs && playerClubs > 0) {
            roundScoring.details.push(`Most Clubs: Tied - no points (${playerClubs} each)`);
        }
        
        // 2 of Clubs (1 point)
        if (playerCapturedCards.some(card => card.value === '2' && card.suit === '♣')) {
            gameScore.player += 1;
            roundScoring.playerPoints += 1;
            roundScoring.details.push(`2 of Clubs: You get 1 point`);
            console.log('Player gets 1 point for 2 of Clubs');
        } else if (opponentCapturedCards.some(card => card.value === '2' && card.suit === '♣')) {
            gameScore.opponent += 1;
            roundScoring.opponentPoints += 1;
            roundScoring.details.push(`2 of Clubs: AI gets 1 point`);
            console.log('Opponent gets 1 point for 2 of Clubs');
        }
        
        // 10 of Diamonds (1 point)
        if (playerCapturedCards.some(card => card.value === '10' && card.suit === '♦')) {
            gameScore.player += 1;
            roundScoring.playerPoints += 1;
            roundScoring.details.push(`10 of Diamonds: You get 1 point`);
            console.log('Player gets 1 point for 10 of Diamonds');
        } else if (opponentCapturedCards.some(card => card.value === '10' && card.suit === '♦')) {
            gameScore.opponent += 1;
            roundScoring.opponentPoints += 1;
            roundScoring.details.push(`10 of Diamonds: AI gets 1 point`);
            console.log('Opponent gets 1 point for 10 of Diamonds');
        }
        
        console.log(`Round ${currentRound} Score: Player ${gameScore.player} - Opponent ${gameScore.opponent}`);
        
        // Show round score popup
        showRoundScorePopup(roundScoring);
    }
    
    function showRoundScorePopup(roundScoring) {
        // Create popup overlay
        const popupOverlay = document.createElement('div');
        popupOverlay.className = 'round-score-popup-overlay';
        popupOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(10px);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            animation: fadeIn 0.3s ease-out;
        `;
        
        // Create popup content
        const popupContent = document.createElement('div');
        popupContent.className = 'round-score-popup-content';
        popupContent.style.cssText = `
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
            backdrop-filter: blur(20px);
            border-radius: 20px;
            padding: 30px 40px;
            text-align: center;
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.2);
            max-width: 500px;
            width: 90%;
            margin: 20px;
            animation: slideInUp 0.4s ease-out;
        `;
        
        // Create content HTML
        const totalPlayer = gameScore.player;
        const totalOpponent = gameScore.opponent;
        const isGameOver = totalPlayer >= targetScore || totalOpponent >= targetScore;
        
        popupContent.innerHTML = `
            <div style="margin-bottom: 25px;">
                <h2 style="color: white; font-size: 1.8rem; font-weight: 700; margin-bottom: 10px;">
                    Round ${currentRound} ${isGameOver ? 'Final' : 'Complete'}!
                </h2>
                <p style="color: #64748b; font-size: 1rem;" id="round-countdown-text">
                    ${isGameOver ? 'Game Over!' : 'Starting next round in 5...'}
                </p>
            </div>
            
            <div style="background: rgba(255, 255, 255, 0.05); border-radius: 15px; padding: 20px; margin-bottom: 25px;">
                <h3 style="color: white; font-size: 1.2rem; margin-bottom: 15px;">Round Scoring</h3>
                
                                 <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 20px; align-items: center; margin-bottom: 20px;">
                     <div style="text-align: center;">
                         <div style="width: 80px; height: 80px; margin: 0 auto 15px auto; border-radius: 50%; overflow: hidden; border: 3px solid #10b981; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); display: flex; align-items: center; justify-content: center; font-size: 2rem; color: white; ${window.currentUserData?.profilePicture ? `background-image: url(${window.currentUserData.profilePicture}); background-size: cover; background-position: center; font-size: 0;` : ''}">${window.currentUserData?.profilePicture ? '' : '👤'}</div>
                         <div style="color: white; font-size: 1rem; font-weight: 600; margin-bottom: 8px;">${currentUser?.displayName || 'You'}</div>
                         <div style="color: #10b981; font-size: 1.6rem; font-weight: 700;">+${roundScoring.playerPoints}</div>
                     </div>
                     <div style="color: #64748b; font-size: 1.2rem; font-weight: 600;">VS</div>
                     <div style="text-align: center;">
                         <div style="width: 80px; height: 80px; margin: 0 auto 15px auto; border-radius: 50%; overflow: hidden; border: 3px solid #ef4444; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); display: flex; align-items: center; justify-content: center; color: white;">
                             <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 36px; height: 36px;" stroke="currentColor">
                                 <path d="M9 15C8.44771 15 8 15.4477 8 16C8 16.5523 8.44771 17 9 17C9.55229 17 10 16.5523 10 16C10 15.4477 9.55229 15 9 15Z" fill="currentColor"></path>
                                 <path d="M14 16C14 15.4477 14.4477 15 15 15C15.5523 15 16 15.4477 16 16C16 16.5523 15.5523 17 15 17C14.4477 17 14 16.5523 14 16Z" fill="currentColor"></path>
                                 <path fill-rule="evenodd" clip-rule="evenodd" d="M12 1C10.8954 1 10 1.89543 10 3C10 3.74028 10.4022 4.38663 11 4.73244V7H6C4.34315 7 3 8.34315 3 10V20C3 21.6569 4.34315 23 6 23H18C19.6569 23 21 21.6569 21 20V10C21 8.34315 19.6569 7 18 7H13V4.73244C13.5978 4.38663 14 3.74028 14 3C14 1.89543 13.1046 1 12 1ZM5 10C5 9.44772 5.44772 9 6 9H7.38197L8.82918 11.8944C9.16796 12.572 9.86049 13 10.618 13H13.382C14.1395 13 14.832 12.572 15.1708 11.8944L16.618 9H18C18.5523 9 19 9.44772 19 10V20C19 20.5523 18.5523 21 18 21H6C5.44772 21 5 20.5523 5 20V10ZM13.382 11L14.382 9H9.61803L10.618 11H13.382Z" fill="currentColor"></path>
                                 <path d="M1 14C0.447715 14 0 14.4477 0 15V17C0 17.5523 0.447715 18 1 18C1.55228 18 2 17.5523 2 17V15C2 14.4477 1.55228 14 1 14Z" fill="currentColor"></path>
                                 <path d="M22 15C22 14.4477 22.4477 14 23 14C23.5523 14 24 14.4477 24 15V17C24 17.5523 23.5523 18 23 18C22.4477 18 22 17.5523 22 17V15Z" fill="currentColor"></path>
                             </svg>
                         </div>
                         <div style="color: white; font-size: 1rem; font-weight: 600; margin-bottom: 8px;">AI Opponent</div>
                         <div style="color: #ef4444; font-size: 1.6rem; font-weight: 700;">+${roundScoring.opponentPoints}</div>
                     </div>
                 </div>
                
                <div style="border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 15px;">
                    ${roundScoring.details.map(detail => 
                        `<div style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 8px; text-align: left;">${detail}</div>`
                    ).join('')}
                </div>
            </div>
            
                         <div style="background: rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 15px; margin-bottom: 25px;">
                 <h4 style="color: white; font-size: 1rem; margin-bottom: 15px;">Total Score</h4>
                 
                 <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                     <div style="color: white; font-size: 1.3rem; font-weight: 600;">You: ${totalPlayer}</div>
                     <div style="color: white; font-size: 1.3rem; font-weight: 600;">AI: ${totalOpponent}</div>
                 </div>
                 
                 <div style="position: relative; margin-bottom: 10px;">
                     <div style="width: 100%; height: 12px; background: rgba(255, 255, 255, 0.1); border-radius: 6px; overflow: hidden; position: relative;">
                         <div style="
                             position: absolute;
                             top: 0;
                             left: 0;
                             height: 100%;
                             width: ${Math.min((totalPlayer / targetScore) * 50, 50)}%;
                             background: linear-gradient(90deg, #10b981 0%, #10b981 100%);
                             border-radius: 6px 0 0 6px;
                             transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
                         "></div>
                         <div style="
                             position: absolute;
                             top: 0;
                             right: 0;
                             height: 100%;
                             width: ${Math.min((totalOpponent / targetScore) * 50, 50)}%;
                             background: linear-gradient(90deg, #ef4444 0%, #ef4444 100%);
                             border-radius: 0 6px 6px 0;
                             transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
                         "></div>
                         <div style="
                             position: absolute;
                             top: 50%;
                             left: 50%;
                             transform: translate(-50%, -50%);
                             width: 3px;
                             height: 16px;
                             background: white;
                             border-radius: 2px;
                             box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
                         "></div>
                     </div>
                 </div>
                 
                 <div style="color: #64748b; font-size: 0.8rem; text-align: center;">
                     ${isGameOver ? 'Final Score' : `Playing to ${targetScore} points`}
                 </div>
             </div>
        `;
        
        popupOverlay.appendChild(popupContent);
        document.body.appendChild(popupOverlay);
        
                 // Auto-close after 5 seconds with dynamic countdown
         let countdown = 5;
         const countdownText = document.getElementById('round-countdown-text');
        
                 const countdownInterval = setInterval(() => {
             countdown--;
             if (countdownText && countdown > 0 && !isGameOver) {
                 countdownText.textContent = `Starting next round in ${countdown}...`;
             }
            
            if (countdown <= 0) {
                clearInterval(countdownInterval);
                if (popupOverlay && popupOverlay.parentNode) {
                    popupOverlay.style.animation = 'fadeOut 0.3s ease-out';
                    setTimeout(() => {
                        if (popupOverlay.parentNode) {
                            popupOverlay.remove();
                        }
                    }, 300);
                }
            }
        }, 1000);
        
        // Allow manual close by clicking overlay
        popupOverlay.addEventListener('click', (e) => {
            if (e.target === popupOverlay) {
                popupOverlay.style.animation = 'fadeOut 0.3s ease-out';
                setTimeout(() => {
                    if (popupOverlay.parentNode) {
                        popupOverlay.remove();
                    }
                }, 300);
            }
        });
    }
    
    function startNewRound() {
        // Reset for new round
        currentRound++;
        currentDeal = 1;
        currentPlayer = 0;
        playerCapturedCards = [];
        opponentCapturedCards = [];
        lastCapturer = 0;
        
        // Create NEW deck for new round
        createDeck();
        dealInitialCards();
        
        console.log(`=== NEW ROUND ${currentRound} STARTED ===`);
    }
    
    function endGame() {
        const playerWon = gameScore.player >= targetScore;
        const winner = playerWon ? 'You' : 'AI Opponent';
        
        console.log('Final Score:', gameScore);
        console.log(`Game Over! ${winner} wins!`);
        
        // Handle rewards first if user is logged in
        if (currentUser) {
            handleGameRewards(playerWon);
        }
        
        // Always show winning screen
        showWinningScreen(playerWon, gameScore.player, gameScore.opponent);
    }
    

    
    function showWinningScreen(playerWon, playerScore, opponentScore) {
        // Update winning popup content
        const winningTitle = document.getElementById('winning-title');
        const winningMessage = document.getElementById('winning-message');
        const playerFinalScore = document.getElementById('player-final-score');
        const opponentFinalScore = document.getElementById('opponent-final-score');
        
        if (playerWon) {
            winningTitle.textContent = 'You Win!';
            winningTitle.style.color = 'white';
            winningMessage.textContent = 'Congratulations! You\'ve mastered Konchina!';
        } else {
            winningTitle.textContent = 'AI Wins!';
            winningTitle.style.color = 'white';
            winningMessage.textContent = 'Better luck next time! Practice makes perfect.';
        }
        
        playerFinalScore.textContent = playerScore;
        opponentFinalScore.textContent = opponentScore;
        
        // Show winning popup overlay with animation (keeps game visible but dimmed)
        const winningPopupOverlay = document.getElementById('winning-popup-overlay');
        if (winningPopupOverlay) {
            winningPopupOverlay.style.display = 'flex';
        } else {
            // Fallback to full screen if popup doesn't exist
            const winningScreen = document.getElementById('winning-screen');
            if (winningScreen) {
                winningScreen.style.display = 'flex';
            }
        }
        
        // Trigger coin confetti for player wins
        if (playerWon) {
            setTimeout(() => {
                createCoinConfetti();
                
                // Additional coin bursts
                setTimeout(() => {
                    createCoinConfetti();
                }, 800);
                
                setTimeout(() => {
                    createCoinConfetti();
                }, 1600);
            }, 500);
        }
    }
    
         // Custom coin confetti animation
     function createCoinConfetti() {
         const coinCount = 50;
         const container = document.body;
         
         for (let i = 0; i < coinCount; i++) {
             setTimeout(() => {
                 const coin = document.createElement('div');
                                 coin.innerHTML = `
                    <svg version="1.1" id="_x32_" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" xml:space="preserve" fill="#000000">
                        <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
                        <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
                        <g id="SVGRepo_iconCarrier">
                            <style type="text/css">.st0{fill:#f59e0b;}</style>
                            <g>
                                <path class="st0" d="M145.46,54.401l1.984,9.344c0.844-0.375,1.703-0.75,2.547-1.094c0.844-0.359,1.672-0.688,2.5-0.984 c0.813-0.313,1.609-0.609,2.422-0.875c0.797-0.266,1.578-0.5,2.359-0.734c1.313-0.359,2.688-0.594,3.969-0.719 c1.297-0.125,2.531-0.172,3.594-0.141c1.078,0.016,1.984,0.078,2.641,0.141c0.672,0.063,1.094,0.125,1.188,0.125l0.484,0.047 l0.453,0.172l0.359,0.297l0.25,0.406l0.125,0.5v0.563l-0.141,0.578l-0.234,0.578l-5.422,10.016l-0.328,0.5l-0.375,0.438 l-0.406,0.375l-0.484,0.297l-0.25,0.141l-0.297,0.109l-0.25,0.047l-0.297,0.047c-0.063,0-0.359-0.047-0.844-0.063 c-0.5-0.031-1.188-0.031-1.969-0.031s-1.641,0.063-2.578,0.188c-0.922,0.109-1.875,0.281-2.781,0.547 c-0.906,0.25-1.797,0.563-2.719,0.891c-0.906,0.344-1.828,0.703-2.766,1.078c-0.922,0.406-1.844,0.813-2.797,1.297 c-0.922,0.438-1.891,0.938-2.828,1.453c-1.25,0.688-2.406,1.359-3.469,2.078s-2,1.438-2.891,2.156 c-0.859,0.719-1.656,1.453-2.344,2.203c-0.703,0.75-1.281,1.5-1.797,2.25c-0.5,0.781-0.922,1.547-1.281,2.297 c-0.313,0.766-0.594,1.516-0.766,2.25c-0.172,0.75-0.281,1.484-0.313,2.203c0,0.719,0.063,1.438,0.203,2.141 c0.156,0.625,0.297,1.219,0.547,1.719c0.219,0.5,0.484,0.938,0.781,1.313c0.328,0.359,0.672,0.688,1.078,0.938 c0.406,0.219,0.844,0.391,1.344,0.5s1.078,0.141,1.703,0.109s1.313-0.125,2.094-0.281c0.75-0.172,1.578-0.453,2.453-0.75 c0.922-0.313,1.875-0.703,2.906-1.188l11.438-5.281c2.141-0.984,4.172-1.813,6.094-2.469c1.906-0.672,3.688-1.188,5.391-1.547 c1.688-0.359,3.266-0.563,4.719-0.609c1.5-0.031,2.859,0.078,4.125,0.344c1.25,0.266,2.391,0.703,3.406,1.313 c1.047,0.609,1.953,1.406,2.75,2.359s1.469,2.063,2.063,3.375c0.547,1.297,1.016,2.766,1.359,4.406 c0.203,0.984,0.359,1.969,0.438,2.938c0.063,0.984,0.094,1.953,0.078,2.938c-0.047,0.969-0.125,1.938-0.297,2.922 c-0.156,0.953-0.344,1.938-0.609,2.875c-0.266,1-0.594,1.969-0.953,2.922c-0.359,0.969-0.781,1.906-1.234,2.844 c-0.453,0.953-0.953,1.859-1.5,2.797c-0.547,0.922-1.156,1.844-1.781,2.75c-0.641,0.906-1.328,1.813-2.031,2.703 c-0.734,0.891-1.5,1.766-2.313,2.625c-0.813,0.875-1.672,1.719-2.563,2.563c-0.906,0.844-1.828,1.672-2.828,2.484 c-0.438,0.344-0.875,0.688-1.313,1.047c-0.438,0.328-0.891,0.672-1.328,1c-0.453,0.344-0.906,0.672-1.391,1.016 c-0.469,0.328-0.922,0.641-1.391,0.969l2.313,11.141l-14.375,7.891l-2.266-10.906c-1.047,0.484-2.078,0.922-3.078,1.375 c-1.031,0.438-2.047,0.828-3.063,1.219c-0.984,0.375-2,0.734-2.984,1.047c-1,0.328-1.969,0.625-2.938,0.906 c-1.484,0.438-3.094,0.641-4.703,0.719c-1.594,0.078-3.172,0.031-4.609-0.078c-1.391-0.109-2.625-0.266-3.547-0.406 c-0.906-0.141-1.484-0.266-1.594-0.281l-0.516-0.078l-0.406-0.188l-0.344-0.297l-0.219-0.422l-0.094-0.5l0.016-0.531l0.125-0.578 l0.234-0.578l5.828-10.609l0.313-0.484l0.375-0.422l0.406-0.359l0.438-0.297l0.328-0.156l0.313-0.109l0.359-0.063l0.313-0.016 c0.078,0.016,0.516,0.109,1.188,0.203c0.656,0.109,1.563,0.25,2.609,0.328c1.031,0.109,2.203,0.156,3.359,0.109 c1.172-0.063,2.344-0.203,3.438-0.484c1.063-0.313,2.109-0.641,3.172-1c1.063-0.375,2.094-0.766,3.141-1.188 c1.031-0.438,2.063-0.875,3.109-1.391c1.031-0.484,2.016-1.016,3.031-1.547c1.281-0.703,2.5-1.422,3.625-2.172 c1.156-0.75,2.25-1.5,3.234-2.297c1.031-0.781,1.984-1.609,2.859-2.438s1.688-1.672,2.438-2.563 c0.75-0.875,1.391-1.766,1.906-2.641c0.516-0.859,0.922-1.75,1.203-2.625c0.281-0.891,0.438-1.781,0.484-2.656 c0.063-0.875,0-1.781-0.203-2.656c-0.109-0.625-0.297-1.203-0.531-1.703c-0.219-0.531-0.469-0.969-0.797-1.359 c-0.313-0.391-0.656-0.734-1.078-0.969c-0.406-0.266-0.844-0.469-1.328-0.625c-0.469-0.141-1.031-0.203-1.641-0.203 c-0.625,0-1.297,0.078-2.063,0.219c-0.734,0.172-1.547,0.391-2.422,0.688c-0.875,0.281-1.813,0.656-2.813,1.094l-13.094,6.047 c-1.938,0.891-3.797,1.625-5.547,2.219c-1.766,0.609-3.422,1.063-5.016,1.375c-1.547,0.313-3.031,0.5-4.422,0.547 c-1.391,0.031-2.672-0.063-3.875-0.328c-1.203-0.219-2.297-0.641-3.281-1.25c-0.984-0.563-1.844-1.328-2.625-2.281 c-0.766-0.938-1.422-2.063-1.969-3.344c-0.563-1.297-1-2.766-1.359-4.406c-0.172-0.906-0.328-1.797-0.375-2.719 c-0.094-0.906-0.109-1.797-0.094-2.734c0.047-0.906,0.141-1.813,0.266-2.75c0.156-0.922,0.344-1.828,0.594-2.766 s0.531-1.844,0.875-2.766c0.328-0.922,0.703-1.844,1.125-2.719c0.422-0.906,0.859-1.781,1.375-2.656 c0.484-0.891,1.047-1.766,1.625-2.625c0.594-0.875,1.203-1.719,1.875-2.547c0.656-0.844,1.344-1.672,2.063-2.469 c0.734-0.813,1.484-1.625,2.281-2.391c0.813-0.781,1.625-1.531,2.484-2.281c0.344-0.313,0.734-0.625,1.109-0.922 s0.75-0.609,1.109-0.891c0.406-0.297,0.781-0.578,1.172-0.859c0.391-0.297,0.797-0.578,1.172-0.859l-1.984-9.547L145.46,54.401z"></path>
                                <path class="st0" d="M272.289,126.417c2.328-6.234,4.156-12.391,5.5-18.453l-42.766-38.938c-0.734,6.25-2.172,12.813-4.297,19.531 L272.289,126.417z"></path>
                                <path class="st0" d="M258.367,154.713c3.188-5.203,6.031-10.422,8.547-15.672l-41.141-37.438 c-2.328,5.313-5.063,10.672-8.172,15.984L258.367,154.713z"></path>
                                <path class="st0" d="M139.648,187.12c-6.641,2.672-13.172,4.609-19.453,5.734l42.984,39.141c5.984-1.781,12.063-4.094,18.156-6.938 L139.648,187.12z"></path>
                                <path class="st0" d="M193.554,218.651c5.047-2.922,10.047-6.188,14.984-9.797l-40.828-37.172 c-5.078,3.578-10.203,6.734-15.344,9.484L193.554,218.651z"></path>
                                <path class="st0" d="M93.429,52.885c-45.922,50.453-57.359,114.797-25.563,143.75l28.172,25.656 c13.063,11.891,31.391,15.938,51.641,13.109l-45.734-41.625c-8.938-0.891-16.766-3.969-22.844-9.484 c-24.484-22.328-12.281-77.344,26.688-120.156c38.969-42.797,92.609-60.109,117.125-37.781 c6.781,6.172,10.766,14.891,12.125,25.156l45.016,40.984c1.563-21.531-4.094-40.453-17.734-52.859l-28.156-25.641 C202.367-14.958,139.367,2.463,93.429,52.885z"></path>
                                <path class="st0" d="M218.867,200.698c4.328-3.672,8.578-7.641,12.719-11.859l-40.547-36.891 c-4.156,4.203-8.438,8.109-12.828,11.75L218.867,200.698z"></path>
                                <path class="st0" d="M240.351,179.307c3.844-4.469,7.438-9.031,10.766-13.672l-40.625-36.984c-3.25,4.672-6.797,9.281-10.641,13.75 L240.351,179.307z"></path>
                                <path class="st0" d="M180.507,398.385l-7.781,1.813c0.344,0.703,0.672,1.422,0.969,2.125c0.313,0.688,0.609,1.375,0.875,2.078 c0.281,0.672,0.531,1.344,0.781,2.016c0.219,0.672,0.438,1.313,0.672,1.968c0.313,1.094,0.531,2.219,0.672,3.297 c0.125,1.094,0.188,2.109,0.188,3.016c0.016,0.891-0.031,1.672-0.078,2.219c-0.031,0.563-0.063,0.906-0.078,0.984l-0.031,0.422 l-0.125,0.375l-0.25,0.313l-0.344,0.234l-0.422,0.094l-0.469,0.016l-0.469-0.109l-0.484-0.188l-8.516-4.344l-0.438-0.266 l-0.359-0.297l-0.328-0.359l-0.25-0.375l-0.125-0.234l-0.078-0.234l-0.063-0.219l-0.031-0.234c0,0,0.016-0.297,0.031-0.719 c0-0.406,0.016-0.969-0.016-1.625c-0.016-0.672-0.094-1.391-0.188-2.171c-0.125-0.766-0.313-1.563-0.547-2.297 c-0.234-0.75-0.484-1.531-0.797-2.297c-0.297-0.75-0.594-1.516-0.953-2.281c-0.344-0.766-0.734-1.547-1.125-2.313 c-0.391-0.781-0.828-1.563-1.281-2.359c-0.594-1.016-1.203-1.984-1.813-2.859c-0.625-0.859-1.25-1.656-1.859-2.375 c-0.625-0.734-1.266-1.375-1.906-1.922c-0.625-0.563-1.281-1.047-1.922-1.469c-0.656-0.406-1.297-0.75-1.953-1 c-0.641-0.281-1.266-0.484-1.891-0.625c-0.625-0.125-1.25-0.203-1.859-0.203s-1.188,0.078-1.797,0.203 c-0.531,0.125-1,0.281-1.422,0.469c-0.422,0.203-0.797,0.438-1.078,0.719c-0.297,0.25-0.563,0.547-0.766,0.891 c-0.172,0.359-0.313,0.719-0.391,1.156c-0.094,0.422-0.125,0.906-0.078,1.422c0.047,0.531,0.141,1.094,0.313,1.734 c0.141,0.641,0.375,1.344,0.656,2.078c0.297,0.734,0.641,1.531,1.047,2.391l4.656,9.484c0.875,1.765,1.594,3.437,2.203,5.046 c0.594,1.578,1.063,3.078,1.391,4.484c0.328,1.422,0.531,2.75,0.578,3.969c0.094,1.25,0,2.391-0.203,3.453 c-0.172,1.047-0.516,2.016-1.016,2.891c-0.516,0.859-1.141,1.641-1.906,2.344c-0.797,0.672-1.734,1.266-2.813,1.766 c-1.078,0.516-2.281,0.922-3.656,1.234c-0.828,0.203-1.656,0.344-2.469,0.422c-0.797,0.094-1.625,0.141-2.438,0.141 c-0.828-0.031-1.656-0.078-2.469-0.172c-0.797-0.125-1.625-0.297-2.422-0.469c-0.844-0.234-1.656-0.469-2.469-0.766 c-0.813-0.266-1.609-0.609-2.406-0.969s-1.578-0.766-2.375-1.203c-0.781-0.438-1.578-0.922-2.328-1.422 c-0.797-0.516-1.547-1.094-2.313-1.672c-0.766-0.594-1.5-1.219-2.25-1.875c-0.734-0.656-1.469-1.375-2.188-2.109 c-0.734-0.719-1.453-1.5-2.125-2.297c-0.328-0.375-0.609-0.719-0.906-1.094c-0.297-0.359-0.578-0.734-0.891-1.094 c-0.281-0.391-0.563-0.75-0.859-1.141c-0.281-0.391-0.563-0.766-0.859-1.156l-9.297,2.141l-6.875-11.875l9.109-2.109 c-0.438-0.859-0.828-1.719-1.219-2.563s-0.734-1.688-1.078-2.531s-0.656-1.656-0.938-2.484c-0.313-0.828-0.578-1.641-0.813-2.438 c-0.391-1.25-0.609-2.578-0.688-3.922c-0.125-1.359-0.109-2.672-0.047-3.875c0.078-1.188,0.172-2.219,0.281-2.984 c0.094-0.766,0.188-1.25,0.203-1.359l0.047-0.406l0.156-0.344l0.266-0.313l0.313-0.188l0.406-0.078h0.469l0.5,0.094l0.469,0.219 l9.016,4.641l0.391,0.266l0.375,0.281l0.313,0.344l0.25,0.359l0.125,0.266l0.125,0.281l0.047,0.281l0.031,0.281 c-0.031,0.047-0.078,0.406-0.156,0.984c-0.094,0.563-0.188,1.344-0.219,2.188c-0.078,0.875-0.094,1.859-0.031,2.844 c0.063,0.953,0.203,1.953,0.484,2.844c0.266,0.906,0.563,1.781,0.906,2.656c0.328,0.875,0.656,1.75,1.047,2.609 c0.375,0.859,0.781,1.703,1.219,2.547c0.422,0.859,0.891,1.703,1.359,2.531c0.609,1.063,1.234,2.046,1.891,3 c0.641,0.953,1.313,1.844,1.984,2.688c0.688,0.813,1.375,1.609,2.094,2.328s1.453,1.375,2.203,2 c0.75,0.609,1.516,1.125,2.234,1.547c0.766,0.406,1.5,0.734,2.234,0.938c0.75,0.234,1.5,0.344,2.234,0.375 c0.734,0.016,1.484-0.047,2.234-0.25c0.516-0.094,1-0.266,1.422-0.453c0.438-0.203,0.781-0.422,1.109-0.703 c0.313-0.266,0.594-0.578,0.813-0.922c0.203-0.344,0.359-0.703,0.484-1.125c0.094-0.406,0.141-0.859,0.109-1.391 c0-0.516-0.078-1.063-0.219-1.703c-0.125-0.625-0.328-1.313-0.594-2.031s-0.594-1.5-0.969-2.328l-5.344-10.859 c-0.766-1.609-1.422-3.156-1.953-4.609c-0.531-1.469-0.953-2.844-1.25-4.172c-0.313-1.297-0.5-2.547-0.547-3.703 c-0.063-1.156,0-2.25,0.188-3.234c0.172-1.031,0.484-1.953,0.969-2.797c0.469-0.828,1.109-1.563,1.875-2.234 c0.781-0.656,1.688-1.234,2.766-1.719c1.078-0.5,2.297-0.891,3.688-1.203c0.734-0.188,1.5-0.313,2.266-0.391 c0.75-0.078,1.516-0.125,2.281-0.125c0.766,0.016,1.516,0.063,2.297,0.188c0.781,0.078,1.547,0.234,2.344,0.422 c0.781,0.188,1.578,0.422,2.328,0.688c0.781,0.25,1.563,0.547,2.313,0.875c0.766,0.344,1.5,0.703,2.25,1.109s1.5,0.844,2.219,1.313 c0.75,0.484,1.469,0.969,2.203,1.531c0.688,0.516,1.391,1.078,2.078,1.688c0.703,0.563,1.391,1.203,2.063,1.844 c0.656,0.656,1.313,1.328,1.953,2.031c0.281,0.297,0.531,0.625,0.797,0.922c0.25,0.313,0.5,0.609,0.766,0.938 c0.25,0.313,0.5,0.625,0.75,0.953c0.234,0.297,0.5,0.625,0.734,0.969l7.969-1.859L180.507,398.385z"></path>
                                <path class="st0" d="M122.648,506.057c5.266,1.828,10.469,3.266,15.547,4.25l31.797-36.594c-5.25-0.5-10.766-1.578-16.422-3.234 L122.648,506.057z"></path>
                                <path class="st0" d="M98.664,494.932c4.406,2.578,8.828,4.875,13.281,6.875l30.594-35.219c-4.516-1.844-9.047-4.031-13.563-6.531 L98.664,494.932z"></path>
                                <path class="st0" d="M69.164,396.073c-2.359-5.5-4.109-10.938-5.172-16.172l-31.953,36.781c1.609,4.969,3.656,10.031,6.141,15.078 L69.164,396.073z"></path>
                                <path class="st0" d="M43.789,441.869c2.563,4.172,5.391,8.297,8.531,12.375l30.328-34.938c-3.063-4.188-5.828-8.422-8.234-12.671 L43.789,441.869z"></path>
                                <path class="st0" d="M180.757,354.729c-43.172-37.5-97.313-45.828-120.969-18.594l-20.906,24.094 c-9.734,11.172-12.781,26.609-10.016,43.531l34-39.141c0.563-7.516,3-14.141,7.5-19.313c18.234-20.984,64.578-11.828,101.219,20 c36.625,31.813,52.188,76.437,33.953,97.421c-5.063,5.813-12.281,9.313-20.859,10.641L151.226,511.9 c18.078,0.891,33.813-4.219,43.953-15.891l20.938-24.109C239.742,444.697,223.945,392.229,180.757,354.729z"></path>
                                <path class="st0" d="M59.335,462.729c3.172,3.563,6.578,7.047,10.188,10.438l30.125-34.688c-3.594-3.406-6.969-6.938-10.078-10.531 L59.335,462.729z"></path>
                                <path class="st0" d="M77.695,480.322c3.828,3.156,7.719,6.063,11.672,8.734l30.188-34.734c-3.984-2.641-7.906-5.516-11.734-8.656 L77.695,480.322z"></path>
                                <path class="st0" d="M362.82,414.041c6.609,1.688,13.125,2.906,19.469,3.609l35.172-47.984c-6.469-0.078-13.344-0.844-20.438-2.281 L362.82,414.041z"></path>
                                <path class="st0" d="M332.351,402.854c5.656,2.719,11.297,5.063,16.953,7.046l33.844-46.156c-5.703-1.797-11.469-4-17.266-6.641 L332.351,402.854z"></path>
                                <path class="st0" d="M286.273,284.948c-3.453-6.516-6.141-12.969-7.969-19.266l-35.359,48.234c2.484,5.922,5.5,11.875,9.047,17.797 L286.273,284.948z"></path>
                                <path class="st0" d="M259.882,343.51c3.563,4.844,7.422,9.609,11.672,14.266l33.578-45.781c-4.203-4.813-8-9.719-11.375-14.688 L259.882,343.51z"></path>
                                <path class="st0" d="M418.57,223.073c-56.594-41.5-123.672-46.188-149.828-10.516l-23.172,31.609 c-10.734,14.656-12.891,33.844-7.797,54.234l37.594-51.281c-0.047-9.25,2.266-17.594,7.234-24.422 c20.188-27.484,77.766-20.984,125.813,14.234c48,35.219,71.546,88.203,51.375,115.703c-5.578,7.625-14.047,12.625-24.406,15.141 l-37.031,50.5c22.188-0.734,40.921-8.578,52.14-23.89l23.172-31.594C499.819,327.12,475.163,264.557,418.57,223.073z"></path>
                                <path class="st0" d="M281.007,367.448c4.234,4.031,8.75,7.953,13.516,11.734l33.344-45.469c-4.766-3.813-9.25-7.781-13.422-11.859 L281.007,367.448z"></path>
                                <path class="st0" d="M305.242,387.12c5,3.438,10.047,6.609,15.156,9.5l33.406-45.563c-5.141-2.828-10.25-5.938-15.25-9.375 L305.242,387.12z"></path>
                                <path class="st0" d="M363.71,244.495l0.219,0.125l0.25,0.125l0.219,0.141l0.219,0.156l0.531,0.453l0.438,0.516l0.328,0.547 l0.219,0.531l2.938,9.906l0.094,0.734l-0.234,0.547l-0.516,0.328l-0.75,0.063c-0.094-0.016-0.641-0.109-1.453-0.25 c-0.813-0.125-1.906-0.297-3.094-0.406c-1.188-0.125-2.484-0.219-3.672-0.234c-1.219,0.016-2.344,0.109-3.219,0.344l-2.609,0.828 l-2.344,1.016l-2.125,1.188l-1.922,1.375c-0.75,0.625-1.406,1.266-1.984,1.922c-0.594,0.656-1.078,1.359-1.484,2.078 c-0.406,0.703-0.75,1.438-0.969,2.219c-0.234,0.75-0.359,1.547-0.422,2.344c-0.047,0.813,0.031,1.625,0.25,2.438 c0.188,0.813,0.531,1.625,1,2.469c0.453,0.813,1.031,1.656,1.734,2.484c0.719,0.828,1.547,1.672,2.5,2.516l1.281,1.094l1.281,0.938 l1.281,0.828l1.25,0.703l0.75,0.344l0.734,0.297l0.734,0.25l0.734,0.188l1.953,0.25l2-0.156l2.031-0.547l2.063-0.938l8.844-5.234 c1.313-0.766,2.656-1.375,4.031-1.891c1.359-0.5,2.75-0.859,4.156-1.094c1.406-0.25,2.859-0.375,4.313-0.344 c1.453,0.016,2.922,0.172,4.422,0.438l1.859,0.422l1.891,0.594l1.938,0.75c0.656,0.281,1.313,0.594,1.984,0.922 c0.938,0.484,1.922,1.016,2.891,1.609c0.984,0.594,1.969,1.219,2.969,1.938c1.016,0.703,2.031,1.469,3.063,2.281 s2.063,1.688,3.125,2.594c0.984,0.875,1.938,1.766,2.813,2.641c0.875,0.891,1.688,1.766,2.438,2.641 c0.781,0.891,1.469,1.781,2.109,2.656s1.234,1.766,1.781,2.641c0.547,0.859,1.031,1.719,1.469,2.578 c0.422,0.859,0.797,1.703,1.125,2.547l0.813,2.484l0.516,2.422l0.219,2.391l-0.094,2.281c-0.063,0.766-0.203,1.484-0.375,2.188 c-0.172,0.734-0.391,1.422-0.656,2.094l-0.391,0.844l-0.453,0.813l-0.516,0.781l-0.547,0.766l10.453,9.219l-8.593,7l-10.203-9.094 l-1.797,0.969l-1.797,0.844l-1.891,0.734l-1.906,0.609c-1.109,0.297-2.344,0.469-3.625,0.531c-1.281,0.078-2.563,0.063-3.734-0.016 c-1.156-0.047-2.203-0.156-2.984-0.25c-0.766-0.094-1.281-0.172-1.359-0.188l-0.375-0.016l-0.391-0.078l-0.422-0.125l-0.422-0.188 l-0.219-0.109l-0.219-0.141l-0.219-0.156l-0.219-0.125l-0.578-0.484l-0.469-0.531l-0.359-0.531l-0.234-0.578l-2.906-9.406 l-0.063-0.672l0.188-0.531l0.453-0.344l0.672-0.125l0.984,0.078c0.531,0.047,1.281,0.078,2.094,0.109 c0.844,0.016,1.734,0,2.625-0.078c0.891-0.063,1.781-0.203,2.516-0.422l2.156-0.719l2.047-0.938l1.875-1.109l1.781-1.297 c0.766-0.594,1.406-1.219,1.938-1.844c0.547-0.625,0.969-1.266,1.266-1.922c0.328-0.656,0.531-1.328,0.609-2.016l-0.031-2.109 l-0.641-2.156l-1.109-2.109c-0.438-0.703-0.969-1.406-1.578-2.078s-1.297-1.359-2.031-2.031l-1.234-1.031l-1.188-0.891 l-1.172-0.781l-1.172-0.641l-0.828-0.375l-0.781-0.313l-0.813-0.25l-0.797-0.203l-1.891-0.156l-1.984,0.203l-2.031,0.594 l-2.078,0.984l-7.734,4.609c-1.438,0.859-2.906,1.563-4.375,2.141c-1.484,0.563-2.969,0.984-4.484,1.25 c-1.5,0.297-3.016,0.406-4.547,0.391c-1.563-0.016-3.109-0.172-4.703-0.484l-1.953-0.453l-1.984-0.641 c-0.672-0.234-1.359-0.484-2.031-0.781c-0.688-0.297-1.359-0.609-2.031-0.953c-0.984-0.484-1.984-1.031-2.969-1.625 c-1-0.609-2-1.266-3-1.969c-1.031-0.719-2.047-1.484-3.094-2.297c-1.016-0.828-2.063-1.688-3.109-2.641 c-1.063-0.922-2.047-1.859-3-2.797c-0.922-0.953-1.797-1.875-2.594-2.813c-0.813-0.906-1.547-1.844-2.234-2.766 c-0.672-0.906-1.281-1.828-1.813-2.766c-0.563-0.906-1.047-1.813-1.5-2.719c-0.422-0.891-0.797-1.781-1.125-2.672l-0.797-2.594 l-0.469-2.563c-0.109-0.844-0.156-1.672-0.156-2.484c0.016-0.797,0.078-1.594,0.203-2.391s0.313-1.563,0.547-2.328 s0.547-1.531,0.891-2.266l0.516-0.938l0.563-0.906l0.594-0.922l0.656-0.891l-12.109-10.719l8.609-6.922l11.875,10.531l2.125-1.219 l2.188-1.063l2.281-0.906l2.375-0.734c1.234-0.328,2.781-0.469,4.438-0.469c1.641-0.031,3.375,0.094,5,0.266 c1.594,0.156,3.047,0.344,4.156,0.531c1.109,0.156,1.828,0.297,1.969,0.313l0.359,0.031l0.375,0.094l0.406,0.125L363.71,244.495z"></path>
                            </g>
                        </g>
                    </svg>
                `;
                 
                                   // Styling for the coin - variable sizes for more visual interest
                  const coinSize = 80 + Math.random() * 40; // Random size between 80px and 120px
                 coin.style.cssText = `
                     position: fixed;
                     width: ${coinSize}px;
                     height: ${coinSize}px;
                     pointer-events: none;
                     z-index: 10000;
                     left: ${Math.random() * window.innerWidth}px;
                     top: -100px;
                     animation: coinFall ${2 + Math.random() * 2}s linear forwards;
                     transform: rotate(${Math.random() * 360}deg);
                 `;
                 
                 container.appendChild(coin);
                 
                 // Remove coin after animation
                 setTimeout(() => {
                     if (coin.parentNode) {
                         coin.remove();
                     }
                 }, 4000);
             }, i * 80); // Faster stagger for more coins
         }
     }
    
    function restartGame() {
        // Reset all game state
        currentRound = 1;
        currentDeal = 1;
        currentPlayer = 0;
        playerHand = [];
        opponentHand = [];
        tableCards = [];
        playerCapturedCards = [];
        opponentCapturedCards = [];
        lastCapturer = 0;
        lastAction = '';
        gameScore = { player: 0, opponent: 0 };
        selectedPlayerCard = null;
        selectedTableCards = [];
        
        // Hide winning popup overlay
        const winningPopupOverlay = document.getElementById('winning-popup-overlay');
        if (winningPopupOverlay) {
            winningPopupOverlay.style.display = 'none';
        }
        // Fallback to hide full screen
        const winningScreen = document.getElementById('winning-screen');
        if (winningScreen) {
            winningScreen.style.display = 'none';
        }
        
        // Start new game
        startGame();
        
        console.log('=== GAME RESTARTED ===');
    }
    
    function returnToMainMenu() {
        // Reset all game state
        currentRound = 1;
        currentDeal = 1;
        currentPlayer = 0;
        playerHand = [];
        opponentHand = [];
        tableCards = [];
        playerCapturedCards = [];
        opponentCapturedCards = [];
        lastCapturer = 0;
        lastAction = '';
        gameScore = { player: 0, opponent: 0 };
        selectedPlayerCard = null;
        selectedTableCards = [];
        
        // Hide all game screens first
        const winningPopupOverlay = document.getElementById('winning-popup-overlay');
        if (winningPopupOverlay) {
            winningPopupOverlay.style.display = 'none';
        }
        // Fallback to hide full screen
        const winningScreen = document.getElementById('winning-screen');
        if (winningScreen) {
            winningScreen.style.display = 'none';
        }
        document.getElementById('game-area').style.display = 'none';
        document.getElementById('difficulty-menu').style.display = 'none';
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('auth-screen').style.display = 'none';
        
        // Return to dashboard instead of main menu
        if (currentUser) {
            showUserDashboard();
        } else {
            showAuthScreen();
        }
        
        console.log('=== RETURNED TO DASHBOARD ===');
    }
    
         function updateGameDisplay() {
         // Get existing containers
         const playerCardsContainer = document.getElementById('player-cards');
         const opponentCardsContainer = document.getElementById('opponent-cards');
         const tableCardsContainer = document.getElementById('table-cards');
         
         // Only update if the number of cards has changed to avoid unnecessary DOM manipulation
         const currentPlayerCards = playerCardsContainer.children.length;
         const currentOpponentCards = opponentCardsContainer.children.length;
         const currentTableCards = tableCardsContainer.children.length;
         
         // Only recreate player cards if count changed
         if (currentPlayerCards !== playerHand.length) {
             playerCardsContainer.innerHTML = '';
             const playerCardElements = [];
             playerHand.forEach((card, index) => {
                 const cardElement = createCardElement(card, true, index, playerHand.length);
                 cardElement.addEventListener('click', () => playCard(index));
                 playerCardsContainer.appendChild(cardElement);
                 playerCardElements.push(cardElement);
             });
             positionCardsInHand(playerCardElements, true);
         }
         
         // Only recreate opponent cards if count changed
         if (currentOpponentCards !== opponentHand.length) {
             opponentCardsContainer.innerHTML = '';
             const opponentCardElements = [];
             opponentHand.forEach((card, index) => {
                 const cardElement = createCardElement(null, false, index, opponentHand.length);
                 opponentCardsContainer.appendChild(cardElement);
                 opponentCardElements.push(cardElement);
             });
             positionCardsInHand(opponentCardElements, false);
         }
         
         // Only recreate table cards if count changed
         if (currentTableCards !== tableCards.length) {
             tableCardsContainer.innerHTML = '';
             const tableCardElements = [];
             tableCards.forEach((card, index) => {
                 const cardElement = createCardElement(card, true, index, tableCards.length);
                 cardElement.classList.add('table-card');
                 cardElement.addEventListener('click', () => selectTableCard(index));
                 tableCardsContainer.appendChild(cardElement);
                 tableCardElements.push(cardElement);
             });
             positionTableCards(tableCardElements);
         }
         
         // Update visuals (this doesn't recreate cards, just updates their styling)
         updateCardVisuals();
         updateActionButtons();
     }
    
         // AI Logic Functions - Updated for single opponent
     function executeAITurn() {
        console.log('executeAITurn called, opponent hand length:', opponentHand.length);
        if (opponentHand.length === 0) {
            console.log('Opponent hand is empty, calling nextTurn');
            nextTurn();
            return;
        }
        
        console.log('Finding best AI move...');
        console.log('AI hand:', opponentHand.map(c => c.value + c.suit));
        console.log('Table cards:', tableCards.map(c => c.value + c.suit));
        const bestMove = findBestAIMove(opponentHand);
        console.log('AI chose:', bestMove.action, bestMove.description, 'Score:', bestMove.score);
        
        // Show AI move with visual feedback
        showAIMove(bestMove, () => {
            if (bestMove.action === 'capture') {
                lastAction = 'capture'; // Track AI capture
                
                // Execute AI capture
                const playedCard = opponentHand[bestMove.cardIndex];
                const capturedCards = bestMove.tableCards.map(index => tableCards[index]);
                capturedCards.push(playedCard);
                
                opponentCapturedCards.push(...capturedCards);
                lastCapturer = 1; // Opponent is last capturer
                
                // Remove captured cards from table (sort descending)
                bestMove.tableCards.sort((a, b) => b - a);
                bestMove.tableCards.forEach(index => {
                    tableCards.splice(index, 1);
                });
                
                console.log(`AI captured: ${capturedCards.map(c => c.value + c.suit).join(', ')}`);
            } else {
                lastAction = 'lay'; // Track AI lay
                
                // AI lays card
                const playedCard = opponentHand[bestMove.cardIndex];
                tableCards.push(playedCard);
                console.log(`AI laid: ${playedCard.value}${playedCard.suit}`);
            }
            
            // Remove played card from AI hand
            opponentHand.splice(bestMove.cardIndex, 1);
            
            // Update display and continue
            updateGameDisplay();
            nextTurn();
        });
    }
    
         function showAIMove(move, callback) {
         const playedCard = opponentHand[move.cardIndex];
         const opponentCardElements = document.querySelectorAll('#opponent-cards .card');
         const aiCardElement = opponentCardElements[move.cardIndex];
         
         if (!aiCardElement) {
             callback();
             return;
         }
         
         // Create a visual copy of the AI card to animate
         const cardCopy = createCardElement(playedCard, true, 0, 1);
         cardCopy.style.position = 'absolute';
         cardCopy.style.zIndex = '1000';
         cardCopy.style.pointerEvents = 'none';
         
         // Position it at the AI card location
         const aiCardRect = aiCardElement.getBoundingClientRect();
         const gameAreaRect = document.getElementById('game-area').getBoundingClientRect();
         
         cardCopy.style.left = (aiCardRect.left - gameAreaRect.left) + 'px';
         cardCopy.style.top = (aiCardRect.top - gameAreaRect.top) + 'px';
         cardCopy.style.width = aiCardRect.width + 'px';
         cardCopy.style.height = aiCardRect.height + 'px';
         
         document.getElementById('game-area').appendChild(cardCopy);
         
         // Hide the original AI card
         gsap.set(aiCardElement, { opacity: 0 });
         
         // Create animation timeline - ULTRA FAST
         const aiMoveTimeline = gsap.timeline({
             onComplete: () => {
                 // Clean up and execute the actual move
                 document.getElementById('game-area').removeChild(cardCopy);
                 clearHighlights();
                 callback();
             }
         });
         
         // Step 1: Move card to center very quickly
         const centerArea = document.querySelector('.center-area');
         const centerRect = centerArea.getBoundingClientRect();
         const targetX = (centerRect.left - gameAreaRect.left) + centerRect.width / 2 - aiCardRect.width / 2;
         const targetY = (centerRect.top - gameAreaRect.top) + centerRect.height / 2 - aiCardRect.height / 2;
         
         aiMoveTimeline.to(cardCopy, {
             duration: 0.15, // Ultra fast
             x: targetX - (aiCardRect.left - gameAreaRect.left),
             y: targetY - (aiCardRect.top - gameAreaRect.top),
             rotation: 0,
             scale: 1.1,
             ease: "power2.out"
         });
         
                            // Step 2: No text notification - just visual feedback
         
         // Step 3: If capturing, animate target cards quickly
         if (move.action === 'capture') {
             // Highlight target cards briefly
             highlightAICapture(move.tableCards);
             
             // Animate capture quickly
             aiMoveTimeline.call(() => {
                 const tableCardElements = document.querySelectorAll('#table-cards .card');
                 const targetCards = move.tableCards.map(index => tableCardElements[index]).filter(el => el);
                 
                 // Animate target cards flying to the AI card - ultra fast
                 targetCards.forEach((targetCard, index) => {
                     if (targetCard) {
                         gsap.to(targetCard, {
                             duration: 0.15, // Ultra fast
                             x: targetX - (aiCardRect.left - gameAreaRect.left) + index * 2,
                             y: targetY - (aiCardRect.top - gameAreaRect.top) + index * 2,
                             rotation: (Math.random() - 0.5) * 20,
                             scale: 0.8,
                             ease: "power2.in",
                             delay: index * 0.02 // Shorter stagger
                         });
                     }
                 });
                 
                 // Animate the AI card and captured cards disappearing
                 const allCardsToHide = [cardCopy, ...targetCards].filter(el => el);
                 if (allCardsToHide.length > 0) {
                     gsap.to(allCardsToHide, {
                         duration: 0.1, // Ultra fast
                         opacity: 0,
                         scale: 0.5,
                         ease: "power2.in",
                         delay: 0.2 // Much shorter delay
                     });
                 }
             }, 0.2); // Start capture animation sooner
             
             // Total timeline duration for capture - ULTRA SHORT
             aiMoveTimeline.to({}, { duration: 0.5 }); // Much shorter total time
         } else {
             // For lay action, just move card to table area quickly
             aiMoveTimeline.to(cardCopy, {
                 duration: 0.3,
                 y: targetY - (aiCardRect.top - gameAreaRect.top) + 20,
                 rotation: (Math.random() - 0.5) * 15,
                 scale: 1,
                 ease: "power2.out",
                 delay: 0.4
             });
             
             aiMoveTimeline.to(cardCopy, {
                 duration: 0.2,
                 opacity: 0,
                 delay: 0.2
             });
         }
     }

    function highlightAICapture(tableCardIndices) {
        const tableCardElements = document.querySelectorAll('#table-cards .card');
        tableCardIndices.forEach(index => {
            if (tableCardElements[index]) {
                tableCardElements[index].style.border = '3px solid #ff6b6b';
                tableCardElements[index].style.boxShadow = '0 0 20px rgba(255, 107, 107, 0.6)';
                tableCardElements[index].style.transform = 'translateY(-10px) scale(1.05)';
            }
        });
    }
    
    function clearHighlights() {
        const tableCardElements = document.querySelectorAll('#table-cards .card');
        tableCardElements.forEach(element => {
            element.style.border = '';
            element.style.boxShadow = '';
            element.style.transform = '';
        });
    }


    
    function findBestAIMove(aiHand) {
        const moves = [];
        let hasAnyCaptures = false;
        
        // FIRST PASS: Check if ANY captures are possible with ANY card
        aiHand.forEach((card, cardIndex) => {
            const captures = getValidCapturesForCard(card);
            if (captures.length > 0) {
                hasAnyCaptures = true;
            }
        });
        
        // Evaluate each card in AI hand
        aiHand.forEach((card, cardIndex) => {
            // Check for captures
            const captures = getValidCapturesForCard(card);
            
            captures.forEach(capture => {
                let score = evaluateCaptureMove(capture);
                
                // SPECIAL CARD PRIORITY: AI has special card and can use it
                if (card.value === '2' && card.suit === '♣') {
                    score += 500; // MASSIVE bonus for using 2♣ to capture
                }
                if (card.value === '10' && card.suit === '♦') {
                    score += 500; // MASSIVE bonus for using 10♦ to capture
                }
                if (card.value === 'J') {
                    score += 300; // High bonus for using Jack strategically
                }
                
                // If using special card to capture matching special card
                const capturedCards = capture.cards.map(index => tableCards[index]);
                capturedCards.forEach(capturedCard => {
                    if (card.value === '2' && card.suit === '♣' && 
                        capturedCard.value === '2' && capturedCard.suit === '♣') {
                        score += 1000; // ULTIMATE PRIORITY: 2♣ captures 2♣
                    }
                    if (card.value === '10' && card.suit === '♦' && 
                        capturedCard.value === '10' && capturedCard.suit === '♦') {
                        score += 1000; // ULTIMATE PRIORITY: 10♦ captures 10♦
                    }
                    if (card.value === capturedCard.value && 
                        (card.value === '2' || card.value === '10')) {
                        score += 600; // High bonus for special card rank matches
                    }
                });
                
                moves.push({
                    action: 'capture',
                    cardIndex: cardIndex,
                    tableCards: capture.cards,
                    score: score,
                    description: capture.description
                });
            });
            
            // CRITICAL RULE: Only allow laying if NO captures are possible with ANY card
            if (!hasAnyCaptures) {
                let layScore = evaluateLayMove(card);
                
                moves.push({
                    action: 'lay',
                    cardIndex: cardIndex,
                    tableCards: [],
                    score: layScore,
                    description: `Lay ${card.value}${card.suit}`
                });
            }
        });
        
        // Debug: Log all move options
        console.log('AI move options:');
        console.log(`Any captures possible: ${hasAnyCaptures}`);
        moves.forEach((move, index) => {
            console.log(`  ${index + 1}. ${move.description} (Score: ${move.score})`);
        });
        
        // Safety check: If no moves generated, force a lay (shouldn't happen)
        if (moves.length === 0) {
            console.log('ERROR: No moves generated, forcing lay of first card');
            moves.push({
                action: 'lay',
                cardIndex: 0,
                tableCards: [],
                score: 0,
                description: `Emergency lay ${aiHand[0].value}${aiHand[0].suit}`
            });
        }
        
        // Choose best move based on difficulty
        const chosenMove = chooseMoveByDifficulty(moves);
        console.log(`AI selected: ${chosenMove.description} (Score: ${chosenMove.score})`);
        return chosenMove;
    }
    
    function getValidCapturesForCard(card) {
        const captures = [];
        
        // Jack captures ALL table cards
        if (card.value === 'J') {
            if (tableCards.length > 0) {
                captures.push({
                    type: 'jack',
                    cards: tableCards.map((_, index) => index),
                    description: `Jack captures all ${tableCards.length} table cards`
                });
            }
            return captures; // Jack can only capture all or nothing
        }
        
        // Capture by rank (exact match)
        tableCards.forEach((tableCard, index) => {
            if (tableCard.value === card.value) {
                captures.push({
                    type: 'rank',
                    cards: [index],
                    description: `Capture ${tableCard.value} with ${card.value}`
                });
            }
        });
        
        // Capture by sum (only for number cards)
        if (card.numericValue > 0) {
            const sumCaptures = findSumCapturesForCard(card.numericValue);
            captures.push(...sumCaptures);
        }
        
        return captures;
    }
    
    function findSumCapturesForCard(targetSum) {
        const captures = [];
        const numericTableCards = tableCards.map((card, index) => ({
            index,
            value: card.numericValue,
            card
        })).filter(item => item.value > 0);
        
        // Find all combinations that sum to target
        function findCombinations(cards, target, current = [], start = 0) {
            if (target === 0 && current.length > 1) {
                captures.push({
                    type: 'sum',
                    cards: current.map(item => item.index),
                    description: `Capture ${current.map(item => item.card.value).join(' + ')} = ${targetSum}`
                });
                return;
            }
            
            for (let i = start; i < cards.length; i++) {
                if (cards[i].value <= target) {
                    findCombinations(cards, target - cards[i].value, [...current, cards[i]], i + 1);
                }
            }
        }
        
        findCombinations(numericTableCards, targetSum);
        return captures;
    }
    
    function evaluateCaptureMove(capture) {
        let score = 0;
        const capturedCards = capture.cards.map(index => tableCards[index]);
        
        // HUGE base bonus for ANY capture - captures should always beat laying
        score += 200; // Base capture bonus
        
        // Jack capture bonus - extremely valuable
        if (capture.type === 'jack') {
            score += capturedCards.length * 25; // Even higher multiplier for Jack captures
            score += 100; // Huge bonus for clearing the table
        } else {
            // Base score for number of cards captured
            score += capturedCards.length * 15; // Increased from 10
        }
        
        // Bonus for special cards
        capturedCards.forEach(card => {
            if (card.value === '2' && card.suit === '♣') {
                score += 200; // 2 of Clubs is extremely valuable - HIGHEST PRIORITY
            }
            if (card.value === '10' && card.suit === '♦') {
                score += 200; // 10 of Diamonds is extremely valuable - HIGHEST PRIORITY
            }
            if (card.suit === '♣') {
                score += 15; // Clubs are valuable for majority
            }
        });
        
                 // STRATEGIC PRIORITY: Prioritize special cards on table (fair game knowledge)
         capturedCards.forEach(card => {
             // Extra bonus for capturing special cards from table (AI can see table)
             if (card.value === '2' && card.suit === '♣') {
                 score += 300; // MASSIVE bonus for securing 2♣ from table
             }
             if (card.value === '10' && card.suit === '♦') {
                 score += 300; // MASSIVE bonus for securing 10♦ from table
             }
             
             // General priority for valuable cards on table
             if (card.suit === '♣') {
                 score += 25; // Clubs are valuable for majority
             }
         });
        
        // Bonus for capturing many cards at once
        if (capturedCards.length >= 3) {
            score += 50; // Increased bonus
        }
        if (capturedCards.length >= 5) {
            score += 100; // Massive bonus for big captures
        }
        
        return score;
    }
    
    function evaluateLayMove(card) {
        let score = 0;
        
        // Jacks should NEVER be laid if there are table cards to capture
        if (card.value === 'J') {
            if (tableCards.length > 0) {
                score = -1000; // Extremely negative score - Jack should ALWAYS capture when possible
            } else {
                score = -50; // Still negative when no table cards
            }
            return score;
        }
        
        // Before laying any card, check if ANY captures are possible with ANY card in hand
        const hasAnyCaptures = opponentHand.some(handCard => {
            return getValidCapturesForCard(handCard).length > 0;
        });
        
        // If ANY captures are possible with other cards, heavily penalize laying
        if (hasAnyCaptures) {
            score -= 100; // Heavy penalty for laying when captures are available
        }
        
        // Prefer to lay low-value cards
        if (card.numericValue > 0) {
            score += (5 - card.numericValue); // Lower cards get higher score
        } else {
            score += 2; // Face cards get medium score
        }
        
        // Heavily avoid laying special cards
        if (card.value === '2' && card.suit === '♣') {
            score -= 100; // Much higher penalty
        }
        if (card.value === '10' && card.suit === '♦') {
            score -= 100; // Much higher penalty
        }
        
        // Avoid laying clubs in general (needed for majority)
        if (card.suit === '♣') {
            score -= 20;
        }
        
        return score;
    }
    
    function chooseMoveByDifficulty(moves) {
        if (moves.length === 0) {
            // Fallback - shouldn't happen
            return { action: 'lay', cardIndex: 0, tableCards: [], score: 0 };
        }
        
        // Sort moves by score (descending)
        moves.sort((a, b) => b.score - a.score);
        
        switch (selectedDifficulty) {
            case 'easy':
                // Easy: 60% chance of best move, 40% random
                if (Math.random() < 0.6) {
                    return moves[0];
                } else {
                    return moves[Math.floor(Math.random() * moves.length)];
                }
                
            case 'medium':
                // Medium: 80% chance of top 3 moves, 20% random
                if (Math.random() < 0.8) {
                    const topMoves = moves.slice(0, Math.min(3, moves.length));
                    return topMoves[Math.floor(Math.random() * topMoves.length)];
                } else {
                    return moves[Math.floor(Math.random() * moves.length)];
                }
                
            case 'hard':
                // Hard: 90% chance of best move, 10% top 2 moves
                if (Math.random() < 0.9) {
                    return moves[0];
                } else {
                    const topMoves = moves.slice(0, Math.min(2, moves.length));
                    return topMoves[Math.floor(Math.random() * topMoves.length)];
                }
                
            case 'expert':
                // Expert: Always best move
                return moves[0];
                
            default:
                return moves[0];
        }
    }

    // Placeholder functions
    function showSettings() {
        alert('Settings menu coming soon!');
    }

    function showRules() {
        alert('Game rules coming soon!');
    }

    // Keyboard navigation
    document.addEventListener('keydown', function(event) {
        if (mainMenu.style.display !== 'none') {
            switch(event.key) {
                case '1':
                    selectPlayerCount(1);
                    break;
                case '2':
                    selectPlayerCount(2);
                    break;
                case '3':
                    selectPlayerCount(3);
                    break;
                case '4':
                    selectPlayerCount(4);
                    break;
            }
        } else if (difficultyMenu.style.display !== 'none') {
            switch(event.key) {
                case 'Escape':
                    showMainMenu();
                    break;
            }
        }
    });

    // Floating animations removed for cleaner gameplay experience
});

// Add enhanced animations to CSS dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
    }
    
    @keyframes cardGlow {
        0%, 100% { 
            box-shadow: 0 0 5px rgba(59, 130, 246, 0.3);
        }
        50% { 
            box-shadow: 0 0 20px rgba(59, 130, 246, 0.6), 0 0 30px rgba(59, 130, 246, 0.3);
        }
    }
    
    @keyframes shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
    }
    
    .card {
        position: relative;
        overflow: hidden;
        transition: all 0.3s ease;
    }
    
    .card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
        transform: translateX(-100%);
        transition: transform 0.6s ease;
    }
    
    .card:hover::before {
        transform: translateX(100%);
    }
    
    .card.selected {
        animation: cardGlow 2s infinite;
    }
    
    .card.capturable {
        animation: pulse 2s infinite;
    }
    
    .card-flip {
        transform-style: preserve-3d;
        transition: transform 0.6s ease;
    }
    
    .card-flip.flipped {
        transform: rotateY(180deg);
    }
    
    .card-face {
        position: absolute;
        width: 100%;
        height: 100%;
        backface-visibility: hidden;
        border-radius: 8px;
    }
    
    .card-face.back {
        transform: rotateY(180deg);
    }
    
    @keyframes dealCard {
        0% {
            transform: translateY(-300px) rotate(180deg) scale(0.5);
            opacity: 0;
        }
        50% {
            transform: translateY(-50px) rotate(90deg) scale(0.8);
            opacity: 0.7;
        }
        100% {
            transform: translateY(0) rotate(0deg) scale(1);
            opacity: 1;
        }
    }
    
    .card.dealing {
        animation: dealCard 0.8s ease-out forwards;
    }
    
    @keyframes captureGlow {
        0% { 
            box-shadow: 0 0 10px rgba(34, 197, 94, 0.5);
            transform: scale(1);
        }
        50% { 
            box-shadow: 0 0 30px rgba(34, 197, 94, 0.8), 0 0 50px rgba(34, 197, 94, 0.4);
            transform: scale(1.1);
        }
        100% { 
            box-shadow: 0 0 10px rgba(34, 197, 94, 0.5);
            transform: scale(1);
        }
    }
    
    .card.capturing {
        animation: captureGlow 0.5s ease-in-out;
    }
`;
document.head.appendChild(style); 

// Exit game function
function exitGame() {
    // Show confirmation dialog
    showExitConfirmation();
}

// Prevent accidental page refresh/close during game
function setupPageUnloadProtection() {
    // Record game abandonment as loss when user leaves during active game
    window.addEventListener('beforeunload', function(e) {
        const gameArea = document.getElementById('game-area');
        if (gameArea && gameArea.style.display !== 'none') {
            // Record the abandonment as a loss before user leaves
            if (currentUser) {
                // Use sendBeacon for reliable data sending during page unload
                const lossData = {
                    uid: currentUser.uid,
                    gameAbandoned: true,
                    timestamp: new Date().toISOString()
                };
                
                // Record loss immediately
                recordGameAbandonmentLoss();
                
                console.log('Game abandoned - loss recorded');
            }
            
            // Show browser's native warning dialog
            const message = 'Are you sure you want to leave? Your game progress will be lost and count as a loss.';
            e.returnValue = message;
            return message;
        }
    });
}

// Record game abandonment as a loss
function recordGameAbandonmentLoss() {
    if (!currentUser) return;
    
    try {
        // Deduct coins for ranked games immediately
        if (window.currentGameMode === 'ranked') {
            // Coins were already deducted when game started, so no additional deduction needed
            console.log('Ranked game abandoned - coins already deducted');
        }
        
        // Record loss in user stats
        updateUserStats(false); // false = player lost
        
        // Store abandonment flag in localStorage for immediate effect
        const abandonmentData = {
            uid: currentUser.uid,
            abandoned: true,
            timestamp: Date.now(),
            gameMode: window.currentGameMode || 'practice'
        };
        localStorage.setItem('gameAbandonment', JSON.stringify(abandonmentData));
        
    } catch (error) {
        console.error('Error recording game abandonment:', error);
    }
}

// Remove the complex blocking functions that don't work reliably
// Block page reload and navigation during game
function blockPageReload() {
    // Simplified approach - just show a warning message about consequences
    const gameArea = document.getElementById('game-area');
    if (gameArea && gameArea.style.display !== 'none') {
        showGameAbandonmentWarning();
    }
}

// Show warning about game abandonment consequences
function showGameAbandonmentWarning() {
    const warningDiv = document.createElement('div');
    warningDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #dc2626, #b91c1c);
        color: white;
        padding: 15px 25px;
        border-radius: 8px;
        font-size: 1rem;
        font-weight: 600;
        z-index: 10001;
        box-shadow: 0 10px 25px rgba(220, 38, 38, 0.3);
        animation: slideDown 0.3s ease-out;
        max-width: 400px;
        text-align: center;
    `;
    warningDiv.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 1.2rem;">⚠️</span>
                <span>Game in Progress!</span>
            </div>
            <div style="font-size: 0.85rem; opacity: 0.9;">
                Leaving now will count as a loss and forfeit any wagered coins.
            </div>
            <div style="font-size: 0.8rem; opacity: 0.8;">
                Use the exit button to leave properly.
            </div>
        </div>
    `;
    
    document.body.appendChild(warningDiv);
    
    setTimeout(() => {
        if (warningDiv.parentNode) {
            warningDiv.style.animation = 'slideUp 0.3s ease-out forwards';
            setTimeout(() => {
                if (warningDiv.parentNode) {
                    warningDiv.remove();
                }
            }, 300);
        }
    }, 4000);
}

// Show reload warning message
function showReloadWarning() {
    showGameAbandonmentWarning();
}

// Remove page unload protection when game ends
function removePageUnloadProtection() {
    // Note: We can't actually remove the specific listener, but the condition inside will prevent the prompt
    // when the game area is hidden
}

// Show exit confirmation dialog
function showExitConfirmation() {
    const confirmationHtml = `
        <div id="exit-confirmation" class="screen">
            <div class="auth-container">
                <div class="auth-header">
                     <h1>Are you sure you want to exit the game?</h1>
                </div>
                <div class="confirmation-buttons">
                    <button id="confirm-exit" class="auth-btn outline-danger">
                        <span class="btn-text">Quit</span>
                    </button>
                    <button id="cancel-exit" class="auth-btn primary">
                        <span class="btn-text">Continue Playing</span>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', confirmationHtml);
    
    // Add event listeners
    document.getElementById('confirm-exit').addEventListener('click', confirmExitGame);
    document.getElementById('cancel-exit').addEventListener('click', cancelExitGame);
    
    // Close on overlay click
    document.getElementById('exit-confirmation').addEventListener('click', function(e) {
        if (e.target === this) {
            cancelExitGame();
        }
    });
}

// Confirm exit and actually exit the game
function confirmExitGame() {
    // Remove confirmation dialog
    const confirmation = document.getElementById('exit-confirmation');
    if (confirmation) {
        confirmation.remove();
    }
    
    // Handle online game forfeit
    if (window.isOnlineGame && currentGameRoom) {
        forfeitOnlineGame();
        return;
    }
    
    // Record the forfeit as a loss if user is logged in
    if (currentUser) {
        updateUserStats(false); // false = player lost
        console.log('Game forfeited - loss recorded');
    }
    
    // Stop any ongoing game timers or animations
    if (window.gameTimer) {
        clearTimeout(window.gameTimer);
        window.gameTimer = null;
    }
    
    // Reset game state
    gameState = {
        playerCards: [],
        opponentCards: [],
        tableCards: [],
        currentPlayer: 'player',
        gameStarted: false,
        selectedCard: null,
        gameEnded: false
    };
    
    // Clear any card animations or effects
    const allCards = document.querySelectorAll('.card');
    allCards.forEach(card => {
        card.remove();
    });
    
    // Clear table cards
    const tableCardsContainer = document.querySelector('.table-cards');
    if (tableCardsContainer) {
        tableCardsContainer.innerHTML = '';
    }
    
    // Re-enable scrolling when exiting game
    document.body.classList.remove('game-active');
    
    // Hide game area and show dashboard
    showUserDashboard();
    
    console.log('Game exited, returning to dashboard');
}

async function forfeitOnlineGame() {
    try {
        // Record forfeit as loss
        if (currentUser) {
            updateUserStats(false);
        }
        
        // Mark game as finished with opponent as winner
        if (isHost && currentGameRoom) {
            const roomRef = window.doc(window.db, 'gameRooms', currentGameRoom);
            const roomDoc = await window.getDoc(roomRef);
            
            if (roomDoc.exists()) {
                const roomData = roomDoc.data();
                const playerIds = Object.keys(roomData.players);
                const opponentId = playerIds.find(id => id !== currentUser.uid);
                
                await window.updateDoc(roomRef, {
                    status: 'finished',
                    winner: opponentId,
                    finishedAt: new Date()
                });
            }
        }
        
        // Clean up
        cleanupOnlineGame();
        
        // Show message and return to dashboard
        showGameEndMessage('Game forfeited. Returning to dashboard.', 'info');
        showUserDashboard();
        
    } catch (error) {
        console.error('Error forfeiting online game:', error);
        // Clean up anyway
        cleanupOnlineGame();
        showUserDashboard();
    }
}

// Cancel exit and continue playing
function cancelExitGame() {
    const confirmation = document.getElementById('exit-confirmation');
    if (confirmation) {
        confirmation.remove();
    }
}

 // Show ranked game confirmation dialog
 function showRankedConfirmation() {
     const confirmationHtml = `
         <div id="ranked-confirmation" class="screen">
             <div class="auth-container">
                 <div class="auth-header">
                     <h1>Start Ranked Game?</h1>
                 </div>
                 <div class="confirmation-buttons">
                     <button id="confirm-ranked" class="auth-btn primary">
                         <span class="btn-text">Start Game</span>
                     </button>
                     <button id="cancel-ranked" class="auth-btn outline-danger">
                         <span class="btn-text">Cancel</span>
                     </button>
                 </div>
             </div>
         </div>
     `;
    
    document.body.insertAdjacentHTML('beforeend', confirmationHtml);
    
    // Add event listeners
    document.getElementById('confirm-ranked').addEventListener('click', confirmRankedGame);
    document.getElementById('cancel-ranked').addEventListener('click', cancelRankedGame);
    
    // Close on overlay click
    document.getElementById('ranked-confirmation').addEventListener('click', function(e) {
        if (e.target === this) {
            cancelRankedGame();
        }
    });
}

// Confirm ranked game and deduct coins
function confirmRankedGame() {
    // Remove confirmation dialog
    const confirmation = document.getElementById('ranked-confirmation');
    if (confirmation) {
        confirmation.remove();
    }
    
    // Show coin deduction animation before starting game
    showCoinDeductionAnimation(2500);
    
    // Deduct coins and start game with a delay to show the animation
    deductCoins(2500).then(success => {
        if (success) {
            // Wait 1 second to let users see the coin deduction animation
            setTimeout(() => {
                startGameDirectly('ranked');
            }, 1000);
        } else {
            showInsufficientCoinsMessage();
        }
    });
}

// Show coin deduction animation with counting effect
function showCoinDeductionAnimation(amount) {
    const coinCountElement = document.getElementById('user-coin-count');
    if (!coinCountElement) return;
    
    // Get the coin icon element
    const coinIcon = document.querySelector('.coin-icon');
    if (!coinIcon) return;
    
    // Store original balance and calculate new balance
    const currentBalance = userCoins;
    const newBalance = currentBalance - amount;
    
    // Create animated coin deduction element
    const animationElement = document.createElement('div');
    animationElement.style.cssText = `
        position: absolute;
        top: 50%;
        left: 100%;
        transform: translateY(-50%);
        color: #dc2626;
        font-weight: 700;
        font-size: 1.1rem;
        z-index: 1000;
        pointer-events: none;
        display: flex;
        align-items: center;
        gap: 4px;
        opacity: 0;
        margin-left: 8px;
    `;
    
    // Add coin icon and amount
    const coinSvg = coinIcon.cloneNode(true);
    coinSvg.style.filter = 'hue-rotate(0deg) brightness(0.8)';
    animationElement.appendChild(coinSvg);
    
    const amountText = document.createElement('span');
    amountText.textContent = `-${amount.toLocaleString()}`;
    animationElement.appendChild(amountText);
    
    // Position relative to coin count
    const coinContainer = coinCountElement.parentElement;
    coinContainer.style.position = 'relative';
    coinContainer.appendChild(animationElement);
    
    // Animate the balance counting down
    const countDownDuration = 0.8; // 800ms for counting animation
    const startTime = Date.now();
    
    function updateBalance() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / (countDownDuration * 1000), 1);
        
        // Use easing function for smooth deceleration
        const easedProgress = 1 - Math.pow(1 - progress, 3); // Cubic ease-out
        
        const currentDisplayBalance = Math.round(currentBalance - (amount * easedProgress));
        coinCountElement.textContent = currentDisplayBalance.toLocaleString();
        
        if (progress < 1) {
            requestAnimationFrame(updateBalance);
        } else {
            // Ensure final balance is exact
            coinCountElement.textContent = newBalance.toLocaleString();
        }
    }
    
    // Start the counting animation after a brief delay
    setTimeout(updateBalance, 200);
    
    // Animate the deduction indicator
    if (window.gsap) {
        // Use GSAP if available
        gsap.fromTo(animationElement, {
            opacity: 0,
            x: 0,
            y: 0
        }, {
            opacity: 1,
            x: 10,
            y: -5,
            duration: 0.3,
            ease: "power2.out"
        });
        
        gsap.to(animationElement, {
            opacity: 0,
            y: -15,
            duration: 0.5,
            delay: 1.2,
            ease: "power2.in",
            onComplete: () => {
                if (animationElement.parentNode) {
                    animationElement.remove();
                }
            }
        });
    } else {
        // Fallback CSS animation
        animationElement.style.animation = 'coinDeduct 1.8s ease-out forwards';
        setTimeout(() => {
            if (animationElement.parentNode) {
                animationElement.remove();
            }
        }, 1800);
    }
}

// Show coin addition animation with counting effect (for wins)
function showCoinAdditionAnimation(amount) {
    const coinCountElement = document.getElementById('user-coin-count');
    if (!coinCountElement) return;
    
    // Get the coin icon element
    const coinIcon = document.querySelector('.coin-icon');
    if (!coinIcon) return;
    
    // Store original balance (coins already added to userCoins, so animate from previous balance)
    const currentBalance = userCoins; // This already includes the reward
    const previousBalance = currentBalance - amount; // Calculate what it was before the reward
    
    // Create animated coin addition element
    const animationElement = document.createElement('div');
    animationElement.style.cssText = `
        position: absolute;
        top: 50%;
        left: 100%;
        transform: translateY(-50%);
        color: #10b981;
        font-weight: 700;
        font-size: 1.1rem;
        z-index: 1000;
        pointer-events: none;
        display: flex;
        align-items: center;
        gap: 4px;
        opacity: 0;
        margin-left: 8px;
    `;
    
    // Add coin icon and amount
    const coinSvg = coinIcon.cloneNode(true);
    coinSvg.style.filter = 'hue-rotate(100deg) brightness(1.2)'; // Make it more green/golden
    animationElement.appendChild(coinSvg);
    
    const amountText = document.createElement('span');
    amountText.textContent = `+${amount.toLocaleString()}`;
    animationElement.appendChild(amountText);
    
    // Position relative to coin count
    const coinContainer = coinCountElement.parentElement;
    coinContainer.style.position = 'relative';
    coinContainer.appendChild(animationElement);
    
         // Animate the balance counting up from previous to current (visual only, coins already added)
     const countUpDuration = 0.8; // 800ms for counting animation
     const startTime = Date.now();
     
     function updateBalance() {
         const elapsed = Date.now() - startTime;
         const progress = Math.min(elapsed / (countUpDuration * 1000), 1);
         
         // Use easing function for smooth deceleration
         const easedProgress = 1 - Math.pow(1 - progress, 3); // Cubic ease-out
         
         const currentDisplayBalance = Math.round(previousBalance + (amount * easedProgress));
         coinCountElement.textContent = currentDisplayBalance.toLocaleString();
         
         if (progress < 1) {
             requestAnimationFrame(updateBalance);
         } else {
             // Ensure final balance is exact (should match current userCoins)
             coinCountElement.textContent = currentBalance.toLocaleString();
         }
     }
    
    // Start the counting animation after a brief delay
    setTimeout(updateBalance, 200);
    
    // Animate the addition indicator
    if (window.gsap) {
        // Use GSAP if available
        gsap.fromTo(animationElement, {
            opacity: 0,
            x: 0,
            y: 0
        }, {
            opacity: 1,
            x: 10,
            y: -5,
            duration: 0.3,
            ease: "power2.out"
        });
        
        gsap.to(animationElement, {
            opacity: 0,
            y: -15,
            duration: 0.5,
            delay: 1.2,
            ease: "power2.in",
            onComplete: () => {
                if (animationElement.parentNode) {
                    animationElement.remove();
                }
            }
        });
    } else {
        // Fallback CSS animation
        animationElement.style.animation = 'coinAdd 1.8s ease-out forwards';
        setTimeout(() => {
            if (animationElement.parentNode) {
                animationElement.remove();
            }
        }, 1800);
    }
}

// Cancel ranked game
function cancelRankedGame() {
    const confirmation = document.getElementById('ranked-confirmation');
    if (confirmation) {
        confirmation.remove();
    }
}

// Mobile dropdown menu functionality
document.addEventListener('DOMContentLoaded', function() {
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileDropdown = document.getElementById('mobile-dropdown');
    const mobileSettingsBtn = document.getElementById('mobile-settings-btn');
    const mobileLogoutBtn = document.getElementById('mobile-logout-btn');
    
    // Toggle dropdown on hamburger click
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            mobileDropdown.classList.toggle('show');
        });
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (mobileDropdown && !mobileDropdown.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
            mobileDropdown.classList.remove('show');
        }
    });
    
    // Handle mobile settings button click
    if (mobileSettingsBtn) {
        mobileSettingsBtn.addEventListener('click', function() {
            mobileDropdown.classList.remove('show');
            // Trigger the same functionality as desktop settings button
            const desktopSettingsBtn = document.getElementById('settings-btn');
            if (desktopSettingsBtn) {
                desktopSettingsBtn.click();
            }
        });
    }
    
    // Handle mobile logout button click
    if (mobileLogoutBtn) {
        mobileLogoutBtn.addEventListener('click', function() {
            mobileDropdown.classList.remove('show');
            // Trigger the same functionality as desktop logout button
            const desktopLogoutBtn = document.getElementById('logout-btn');
            if (desktopLogoutBtn) {
                desktopLogoutBtn.click();
            }
        });
    }
    
    // Close dropdown on escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && mobileDropdown && mobileDropdown.classList.contains('show')) {
            mobileDropdown.classList.remove('show');
        }
    });
});