const { app } = require('electron');
const { resolve } = require('node:path');
if (!process.env.COUNCIL_TEST_DATA) throw Error('Test data directory required');
app.setPath('userData', resolve(process.env.COUNCIL_TEST_DATA));
require(process.env.COUNCIL_TEST_APP ? resolve(process.env.COUNCIL_TEST_APP, 'out/main/index.js') : '../out/main/index.js');
