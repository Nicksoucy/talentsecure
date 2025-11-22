import axios from 'axios';

const API_URL = 'http://localhost:5000/api';
const EMAIL = 'testclient@example.com';
const PASSWORD = 'password123';

async function main() {
    try {
        // 1. Login
        console.log('Logging in...');
        const loginRes = await axios.post(`${API_URL}/client-auth/login`, {
            email: EMAIL,
            password: PASSWORD,
        });
        const { accessToken } = loginRes.data;
        console.log('Login successful. Token obtained.');

        // 2. Add Item with INVALID quantity
        console.log('Adding item to wishlist with invalid quantity...');
        const item = {
            city: 'Montréal',
            province: 'QC',
            type: 'EVALUATED',
            quantity: "5", // Invalid: string instead of number
            notes: 'Test debug',
        };

        // @ts-ignore
        const addRes = await axios.post(`${API_URL}/wishlist/items`, item, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        console.log('Add item successful:', addRes.data);

    } catch (error: any) {
        console.error('Error occurred:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
    }
}

main();
