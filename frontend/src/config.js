// Configuration for different environments
const config = {
  development: {
    BACKEND_URL: "http://localhost:5000",
    WS_URL: "ws://localhost:5000",
  },
  production: {
    BACKEND_URL:
      process.env.REACT_APP_BACKEND_URL ||
      "https://fyp-metamate-production.up.railway.app",
    WS_URL:
      process.env.REACT_APP_WS_URL ||
      "wss://fyp-metamate-production.up.railway.app",
    AGORA_APP_ID:
      process.env.REACT_APP_AGORA_APP_ID || "351aac62ef584247ae1b29ba21a82624",
  },
};

const environment = process.env.NODE_ENV || "development";
export const { BACKEND_URL, WS_URL } = config[environment];

export default config[environment];
