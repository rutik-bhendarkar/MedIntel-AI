(function (window) {
    const API_BASE_URL = "https://medintel-ai-dw5w.onrender.com";

    window.API_BASE_URL = API_BASE_URL;
    window.API_ENDPOINTS = {
        auth: `${API_BASE_URL}/api/auth`,
        chat: `${API_BASE_URL}/api/chat`,
        report: `${API_BASE_URL}/api/report`
    };
})(window);
