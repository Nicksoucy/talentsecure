import axios from 'axios';
const GHL_BASE = 'https://services.leadconnectorhq.com';
const TOKEN = 'pit-7de455ab-c46e-47a4-af9e-0b07a6c3a1ee';
const LOC = 'dfkLurZY2ADWAUZl4zYc';
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
