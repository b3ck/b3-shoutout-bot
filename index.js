const fs = require('fs').promises;
const tmi = require('tmi.js');
const axios = require('axios');
require('dotenv').config(); // Load environment variables from .env file

const config = {
  identity: {
    username: process.env.TWITCH_BOT_USERNAME,
    password: process.env.TWITCH_OAUTH_TOKEN,
  },
  channels: [process.env.TWITCH_CHANNEL_NAME],
};

const client = new tmi.Client(config);

let seenUsers = [];
let accessToken = null; // Variable to store the access token

client.connect();

// Fetch the access token when the script starts
getAccessToken()
  .then((token) => {
    accessToken = token;
    console.log('Access token fetched.');
    return saveAccessTokenToFile(token);
  })
  .then(() => {
    console.log('Access token saved to "accessToken.json".');
  })
  .catch((error) => {
    console.error('Error fetching/accessing access token:', error);
    process.exit(1); // Exit the script if there's an issue fetching the token
  });

client.on('message', async (channel, tags, message, self) => {
  // Log all chat messages to the console
  console.log(`[${new Date().toLocaleTimeString()}] ${tags.username}: ${message}`);

  // Ignore messages from the bot itself
  if (self) return;

  const username = tags['username'];

  // Check if it's the user's first message since the script started
  if (!seenUsers.includes(username)) {
    seenUsers.push(username);

    // Check if the user has streamed in the last 7 days
    console.log(`Checking stream status for ${username}...`);
    try {
      const hasStreamed = await checkHasStreamed(username);
      console.log(`Result for ${username}: ${hasStreamed}`);
      if (hasStreamed) {
        // Give them a shoutout
        console.log(`Shoutout to ${username}! They've been streaming recently.`);
        client.say(config.channels[0], `Check out ${username} @ https://twitch.tv/${username}! They've been streaming recently.`);
      } else {
        console.log(`${username} hasn't streamed in the last 7 days.`);
      }
    } catch (error) {
      console.error(`Error checking stream status for ${username}:`, error);
    }
  }
});

function checkHasStreamed(username) {
  return getUserId(username)
    .then((userId) => {
      if (!userId) {
        return false;
      }

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      return axios
        .get(`https://api.twitch.tv/helix/videos`, {
          params: {
            user_id: userId,
            first: 1,
            sort: 'time',
          },
          headers: {
            'Client-ID': process.env.TWITCH_CLIENT_ID,
            Authorization: `Bearer ${accessToken}`,
          },
        })
        .then((response) => {
          const videos = response.data.data;
          if (videos.length > 0) {
            const lastBroadcastDate = new Date(videos[0].created_at);
            return lastBroadcastDate >= sevenDaysAgo;
          } else {
            return false;
          }
        })
        .catch((error) => {
          throw error;
        });
    });
}

function getUserId(username) {
  return axios
    .get(`https://api.twitch.tv/helix/users`, {
      params: {
        login: username,
      },
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${accessToken}`,
      },
    })
    .then((response) => {
      const user = response.data.data[0];
      return user ? user.id : null;
    })
    .catch((error) => {
      throw error;
    });
}

function getAccessToken() {
  return axios
    .post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
        grant_type: 'client_credentials',
      },
    })
    .then((response) => response.data.access_token)
    .catch((error) => {
      throw error;
    });
}

function saveAccessTokenToFile(token) {
  const data = JSON.stringify({ access_token: token });
  return fs.writeFile('accessToken.json', data);
}
