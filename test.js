const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Express is working!');
});

app.listen(3000, () => {
  console.log('Test server running on port 3000');
});
