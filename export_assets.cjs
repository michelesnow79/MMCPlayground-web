
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const FIGMA_TOKEN = process.env.VITE_FIGMA_TOKEN;
const FILE_KEY = 'k46sWXkIYf1m7S42nBeUol';

const NODES_TO_EXPORT = {
    'hamburger': '15878:24241',
    'delete_btn': '15802:5769',
    'map_icon': '15930:2151',
    'browse_icon': '15930:2152',
    'messages_icon': '15930:2153',
    'account_icon': '15930:2154',
    'fab_add': '15930:5690'
};

async function exportSVGs() {
    try {
        const ids = Object.values(NODES_TO_EXPORT).join(',');
        console.log(`Requesting export for IDs: ${ids}`);

        const response = await axios.get(`https://api.figma.com/v1/images/${FILE_KEY}`, {
            params: { ids, format: 'svg' },
            headers: { 'X-Figma-Token': FIGMA_TOKEN }
        });

        const images = response.data.images;

        for (const [name, id] of Object.entries(NODES_TO_EXPORT)) {
            const url = images[id];
            if (url) {
                console.log(`Downloading ${name} from ${url}...`);
                const svgContent = await axios.get(url);
                const filePath = path.join(__dirname, 'src', 'assets', `${name}.svg`);
                fs.writeFileSync(filePath, svgContent.data);
                console.log(`Saved ${name}.svg to src/assets/`);
            } else {
                console.warn(`Could not find image for ${name} (${id})`);
            }
        }

    } catch (error) {
        console.error('Error exporting SVGs:', error.response ? error.response.data : error.message);
    }
}

exportSVGs();
