require('dotenv').config();

async function main() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  console.log('Phone ID:', phoneId);
  console.log('Token length:', token ? token.length : 0);
  console.log('Token prefix:', token ? token.slice(0, 15) : 'NONE');

  // Inspect token debug endpoint
  try {
    const debugUrl = `https://graph.facebook.com/debug_token?input_token=${token}&access_token=${token}`;
    const res = await fetch(debugUrl, { signal: AbortSignal.timeout(6000) });
    const data = await res.json();
    console.log('DEBUG_TOKEN HTTP STATUS:', res.status);
    console.log('DEBUG_TOKEN BODY:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('DEBUG_TOKEN FAILED:', err.name, err.message);
  }

  // Try phone number query
  try {
    const phoneUrl = `https://graph.facebook.com/v20.0/${phoneId}?fields=id,verified_name,code_verification_status,quality_rating`;
    const res = await fetch(phoneUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
    });
    const data = await res.json();
    console.log('PHONE_QUERY HTTP STATUS:', res.status);
    console.log('PHONE_QUERY BODY:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('PHONE_QUERY FAILED:', err.name, err.message);
  }
}

main();
