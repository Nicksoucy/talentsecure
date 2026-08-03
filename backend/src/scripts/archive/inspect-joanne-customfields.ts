import 'dotenv/config';
import axios from 'axios';
import { getGhlLocationId, getGhlToken } from '../../services/ghl.client';
const GHL_BASE = 'https://services.leadconnectorhq.com';
const TOKEN = getGhlToken();
const LOC = getGhlLocationId();
const H = { Authorization: `Bearer ${TOKEN}`, Version: '2021-07-28' };

(async () => {
  const search = await axios.get(`${GHL_BASE}/contacts/search/duplicate`, {
    params: { locationId: LOC, email: 'joannekinal@gmail.com' },
    headers: H,
  });
  const contactId = search.data?.contact?.id;
  console.log('Contact id:', contactId);
  const full = await axios.get(`${GHL_BASE}/contacts/${contactId}`, { headers: H });
  for (const f of (full.data?.contact?.customFields || [])) {
    console.log('\nfield id:', f.id);
    console.log('value:', JSON.stringify(f.value, null, 2));
  }
})();
