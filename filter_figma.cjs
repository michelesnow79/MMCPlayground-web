
const fs = require('fs');

const data = JSON.parse(fs.readFileSync('figma_file_info.json', 'utf8'));
const matches = [];

function findNodes(node, path = '') {
    const currentPath = path ? `${path} > ${node.name}` : node.name;
    const nameMatch = node.name && (
        node.name.toLowerCase().includes('hamburger') ||
        node.name.toLowerCase().includes('delete') ||
        node.name.toLowerCase().includes('account') ||
        node.name.toLowerCase().includes('nav')
    );

    if (nameMatch) {
        matches.push({
            id: node.id,
            name: node.name,
            path: currentPath,
            type: node.type
        });
    }

    if (node.children) {
        node.children.forEach(child => findNodes(child, currentPath));
    }
}

findNodes(data.document);
fs.writeFileSync('figma_matches.json', JSON.stringify(matches, null, 2));
console.log(`Found ${matches.length} matches. Saved to figma_matches.json`);
