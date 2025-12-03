import axios from 'axios';

async function testCandidatesEndpoint() {
    try {
        // 1. Login to get token
        console.log('Logging in...');
        const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
            email: 'admin@xguard.ca',
            password: 'Admin123!'
        });

        const token = loginRes.data.accessToken;
        console.log('Login successful, token obtained.');

        // 2. Get candidates with params
        console.log('Fetching candidates with params...');
        const candidatesRes = await axios.get('http://localhost:5000/api/candidates', {
            headers: { Authorization: `Bearer ${token}` },
            params: {
                page: 1,
                limit: 20,
                sortBy: 'createdAt',
                sortOrder: 'desc',
                includeArchived: false
            }
        });

        console.log('Candidates fetched successfully!');
        console.log('Count:', candidatesRes.data.data.length);
    } catch (error: any) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testCandidatesEndpoint();
