const HEADERS = {
  'Authorization': `Bearer ${process.env.API_AUTH_TOKEN || 'i3c179msh3zyik4943d2cepu3l0hxezg'}`,
  'Content-Type': 'application/json'
};

const BASE_URL = 'https://www.experapps.xyz/rest';

module.exports = {
  HEADERS,
  BASE_URL,
};


