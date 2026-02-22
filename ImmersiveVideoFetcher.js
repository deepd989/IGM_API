const videoData = require('./swipeAndShopVideo.json');

/**
 * Returns the respective URL for a given video file name.
 * @param {string} fileName - The name of the video file (e.g., 'Moonlight1.mp4').
 * @returns {string|null} - The URL of the video or null if not found.
 */
function getVideoUrlByName(fileName) {
    const entry = videoData.find(item => item.fileName === fileName);
    return entry ? entry.url : null;
}

module.exports = {
    getVideoUrlByName
};