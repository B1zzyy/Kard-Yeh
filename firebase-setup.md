# Firebase Setup Guide for Konchina Card Game

## Overview
This guide will help you set up Firebase Authentication and Firestore for the Konchina card game, enabling real user accounts and coin tracking.

## Prerequisites
- A Google account
- Basic understanding of web development

## Step 1: Create a Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or "Add project"
3. Enter project name: `konchina-game` (or your preferred name)
4. Enable Google Analytics (optional but recommended)
5. Click "Create project"

## Step 2: Set up Authentication

1. In the Firebase console, go to **Authentication**
2. Click "Get started"
3. Go to the **Sign-in method** tab
4. Enable **Email/Password** authentication:
   - Click on "Email/Password"
   - Toggle "Enable" to ON
   - Click "Save"

## Step 3: Set up Firestore Database

1. In the Firebase console, go to **Firestore Database**
2. Click "Create database"
3. Choose **Start in test mode** (for development)
4. Select a location closest to your users
5. Click "Done"

### Firestore Collections for Multiplayer

You'll need to create these collections in Firestore:

#### 1. `users` Collection (already exists)
```javascript
{
  username: "player123",
  email: "player@example.com",
  coins: 10000,
  gamesPlayed: 0,
  gamesWon: 0,
  gamesLost: 0,
  profilePicture: null,
  createdAt: "2024-01-01T00:00:00Z",
  lastLogin: "2024-01-01T00:00:00Z",
  // New fields for multiplayer
  currentGameId: null,
  isOnline: true,
  lastActivity: "2024-01-01T00:00:00Z"
}
```

#### 2. `gameRooms` Collection (new)
```javascript
{
  id: "game_123456",
  status: "waiting", // "waiting", "active", "finished"
  gameMode: "online", // "practice", "ranked", "online"
  maxPlayers: 2,
  currentPlayers: 1,
  createdBy: "user_id_123",
  createdAt: "2024-01-01T00:00:00Z",
  players: {
    "user_id_123": {
      userId: "user_id_123",
      username: "Player1",
      profilePicture: "url_or_null",
      joinedAt: "2024-01-01T00:00:00Z",
      isReady: false,
      coins: 10000
    }
  },
  gameState: {
    currentRound: 1,
    currentDeal: 1,
    currentPlayer: 0,
    deck: [], // Shuffled deck
    tableCards: [],
    playerHands: {
      "user_id_123": [],
      "user_id_456": []
    },
    capturedCards: {
      "user_id_123": [],
      "user_id_456": []
    },
    scores: {
      "user_id_123": 0,
      "user_id_456": 0
    },
    lastCapturer: null,
    lastAction: null
  },
  winner: null,
  finishedAt: null
}
```

#### 3. `gameMoves` Collection (new)
```javascript
{
  gameId: "game_123456",
  playerId: "user_id_123",
  moveType: "capture", // "capture", "lay"
  cardPlayed: {
    suit: "♠",
    value: "A",
    color: "black"
  },
  tableCardsSelected: [0, 1], // indices of table cards
  timestamp: "2024-01-01T00:00:00Z",
  moveNumber: 1
}
```

#### 4. `matchmaking` Collection (new)
```javascript
{
  userId: "user_id_123",
  gameMode: "online",
  preferredOpponents: 1,
  createdAt: "2024-01-01T00:00:00Z",
  status: "searching" // "searching", "matched", "cancelled"
}
```

### Firestore Security Rules for Multiplayer

Replace your current Firestore rules with these comprehensive rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own user document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      // Allow reading other users' basic info for game display
      allow read: if request.auth != null && 
        resource.data.keys().hasOnly(['username', 'profilePicture', 'isOnline']);
    }
    
    // Game rooms - players can read/write games they're part of
    match /gameRooms/{gameId} {
      allow read: if request.auth != null && 
        request.auth.uid in resource.data.players.keys();
      allow create: if request.auth != null && 
        request.auth.uid == request.resource.data.createdBy;
      allow update: if request.auth != null && 
        request.auth.uid in resource.data.players.keys();
    }
    
    // Game moves - players can create moves for their games
    match /gameMoves/{moveId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && 
        request.auth.uid == request.resource.data.playerId;
    }
    
    // Matchmaking - users can manage their own matchmaking entries
    match /matchmaking/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      // Allow reading all matchmaking entries for game matching
      allow read: if request.auth != null;
    }
  }
}
```

## Step 4: Set up Firebase Storage

1. In the Firebase console, go to **Storage**
2. Click "Get started"
3. Choose **Start in test mode** (for development)
4. Select the same location as your Firestore database
5. Click "Done"

### Firebase Storage Security Rules

After setting up Storage, you need to configure security rules:

1. In Firebase console, go to **Storage** > **Rules**
2. Replace the default rules with these rules for development:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Allow authenticated users to upload/read their own profile pictures
    match /profile-pictures/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // For development only - remove in production
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

3. Click "Publish" to save the rules

**Important**: The second rule (allowing all paths) is for development only. Remove it in production and only keep the specific profile-pictures rule.

## Step 5: Get Your Firebase Config

1. In the Firebase console, go to **Project Settings** (gear icon)
2. Scroll down to "Your apps"
3. Click "Add app" and select **Web** (</> icon)
4. Enter app nickname: "Konchina Game"
5. Click "Register app"
6. Copy the `firebaseConfig` object

## Step 6: Update Your Game

1. Open `index.html`
2. Find the Firebase configuration section
3. Replace the placeholder config with your actual config:

```javascript
const firebaseConfig = {
  apiKey: "your-actual-api-key",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

## Step 7: Deploy Your Game

### Option 1: Firebase Hosting (Recommended)

1. Install Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```

2. Login to Firebase:
   ```bash
   firebase login
   ```

3. Initialize Firebase in your project directory:
   ```bash
   firebase init
   ```
   - Select "Hosting"
   - Choose your existing project
   - Set public directory to current directory (`.`)
   - Configure as single-page app: No
   - Don't overwrite index.html

4. Deploy:
   ```bash
   firebase deploy
   ```

### Option 2: Other Hosting Services

You can also deploy to:
- **Netlify**: Drag and drop your files
- **Vercel**: Connect your GitHub repository
- **GitHub Pages**: Push to a GitHub repository

## Step 8: Test Your Setup

1. Open your deployed game
2. Try creating a new account
3. Verify the user appears in Firebase Authentication
4. Check that user data is created in Firestore
5. Test login/logout functionality

## Demo Mode

If you don't want to set up Firebase right away, the game includes a demo mode that:
- Stores user data in localStorage
- Simulates authentication
- Works offline

The demo mode automatically activates if Firebase isn't properly configured.

## Security Considerations

### For Production:
1. **Enable App Check** to prevent abuse
2. **Set up proper Firestore security rules**
3. **Use environment variables** for sensitive config
4. **Enable CORS** if needed
5. **Set up monitoring** and alerts

### Environment Variables:
For production deployments, consider using environment variables:

```javascript
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};
```

## Troubleshooting

### Common Issues:

1. **"Firebase not initialized"**
   - Check your config values
   - Ensure all required fields are filled
   - Check browser console for errors

2. **Authentication errors**
   - Verify Email/Password is enabled
   - Check security rules
   - Ensure domain is authorized

3. **Firestore permission denied**
   - Check security rules
   - Ensure user is authenticated
   - Verify document paths

4. **CORS errors**
   - Add your domain to Firebase authorized domains
   - Check hosting configuration

5. **Firebase Storage CORS/Upload Issues**
   - Ensure Firebase Storage is enabled in your project
   - Check that Storage security rules are properly configured
   - Verify your domain is in the authorized domains list:
     - Go to Firebase Console > Authentication > Settings > Authorized domains
     - Add your domain (e.g., `localhost` for local development)
   - For local development, try accessing via `127.0.0.1` instead of `localhost`
   - If still having issues, the app will automatically fall back to demo mode (base64 storage)

6. **Profile picture not updating**
   - Check browser console for detailed error messages
   - Verify you're logged in before uploading
   - Ensure image file is under 5MB and is a valid image format
   - Check Firebase Storage rules allow read/write for authenticated users

### Getting Help:

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firebase Support](https://firebase.google.com/support)
- Check browser developer console for detailed error messages

## Next Steps

Once your basic setup is working, you can enhance the game with:

1. **Email verification** for new accounts
2. **Password reset** functionality  
3. **Social login** (Google, Facebook, etc.)
4. **Real-time multiplayer** using Firestore
5. **Leaderboards** and statistics
6. **In-app purchases** for coins
7. **Push notifications** for game invites

## Cost Considerations

Firebase has generous free tiers:
- **Authentication**: 50,000 MAU free
- **Firestore**: 50,000 reads, 20,000 writes per day free
- **Hosting**: 10GB storage, 360MB/day transfer free

For a card game, you'll likely stay within free limits unless you have thousands of active users. 