const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Serves everything in /public (index.html, style.css, app.js)
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Aura Studio live on port ${PORT}`);
});