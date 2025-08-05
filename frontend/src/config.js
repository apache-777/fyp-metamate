// Configuration for different environments
const config = {
  development: {
    BACKEND_URL: 'http://localhost:5000',
    WS_URL: 'ws://localhost:5000'
  },
  production: {
    BACKEND_URL: process.env.REACT_APP_BACKEND_URL || 'https://your-backend-url.railway.app',
    WS_URL: process.env.REACT_APP_WS_URL || 'wss://your-backend-url.railway.app'
  }
};

const environment = process.env.NODE_ENV || 'development';
export const { BACKEND_URL, WS_URL } = config[environment];

export default config[environment]; 