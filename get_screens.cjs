
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const FIGMA_TOKEN = process.env.VITE_FIGMA_TOKEN;
const FILE_KEY = 'k46sWXkIYf1m7S42nBeUol';

const SCREENS = {
    'Landing': '15835:9243', // Hero button belongs to this
    'Map': '15802:5583', // Top bar belongs to this
    'Account': '15802:5614',
    'Login': '15802:5834'
};

async function getDetailedNodes() {
    try {
        // Need to find the parent frame IDs for the pages.
        // My previous filter found instances, let's find the frames.
        const matches = JSON.parse(fs.readFileSync('figma_matches.json', 'utf8'));
        const screenFrames = matches.filter(m =>
            m.type === 'FRAME' &&
            ['Landing Page', 'Connections Map', 'Account', 'Connections List', 'Messages'].includes(m.name)
        );

        console.log('Main Screen Frames:', JSON.stringify(screenFrames, null, 2));

        const ids = screenFrames.map(s => s.id).join(',');
        const response = await axios.get(`https://api.figma.com/v1/files/${FILE_KEY}/nodes?ids=${ids}`, {
            headers: { 'X-Figma-Token': FIGMA_TOKEN }
        });

        fs.writeFileSync('figma_screens_detail.json', JSON.stringify(response.data, null, 2));
        console.log('Saved screen details to figma_screens_detail.json');

    } catch (error) {
        console.error('Error:', error.message);
    }
}

getDetailedNodes();
