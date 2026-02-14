
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const FIGMA_TOKEN = process.env.VITE_FIGMA_TOKEN;
const FILE_KEY = 'k46sWXkIYf1m7S42nBeUol';

async function fetchFigmaFile() {
    try {
        console.log('Fetching Figma file info...');
        const response = await axios.get(`https://api.figma.com/v1/files/${FILE_KEY}`, {
            headers: { 'X-Figma-Token': FIGMA_TOKEN }
        });

        fs.writeFileSync('figma_file_info.json', JSON.stringify(response.data, null, 2));
        console.log('Figma file info saved to figma_file_info.json');

        // Let's also look for components or specific nodes related to Account/Hamburger
        findNodes(response.data.document);

    } catch (error) {
        console.error('Error fetching Figma file:', error.response ? error.response.data : error.message);
    }
}

function findNodes(node, path = '') {
    if (!node.children) return;

    node.children.forEach(child => {
        const currentPath = path ? `${path} > ${child.name}` : child.name;
        if (child.name.toLowerCase().includes('hamburger') ||
            child.name.toLowerCase().includes('delete') ||
            child.name.toLowerCase().includes('account')) {
            console.log(`Found: [${child.id}] ${currentPath} (${child.type})`);
        }
        findNodes(child, currentPath);
    });
}

fetchFigmaFile();
