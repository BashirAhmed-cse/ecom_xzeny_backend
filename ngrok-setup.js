// backend/ngrok-setup.js
import { connect } from 'ngrok';

async function setupNgrok() {
  try {
    const url = await connect(3009); // Your backend port
    console.log('🚀 Ngrok tunnel created:', url);
    console.log('📝 Use this webhook URL in Clerk Dashboard:');
    console.log(`${url}/api/webhooks/clerk`);
    
    return url;
  } catch (error) {
    console.error('❌ Ngrok error:', error);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  setupNgrok();
}

export default setupNgrok;